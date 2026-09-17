// ============================================================================
// parent-comms.ts  —  the single way a message reaches a parent
// ----------------------------------------------------------------------------
// Every edge function that emails or texts a family calls sendParentEmail() or
// sendParentSms() instead of hitting Resend/Twilio directly. The helper opens a
// row in parent_message_log BEFORE the send and stamps the log id onto the
// provider payload, so the delivery webhook can attach every later event to the
// same row.
//
// Log-first, fail-closed: if the ledger row cannot be written, the message is
// NOT sent. An unrecorded message to a family is worse than a late one.
//
// Usage:
//   import { sendParentEmail } from "../_shared/parent-comms.ts";
//
//   await sendParentEmail({
//     source:  "send-document-notification",
//     purpose: "document_ready",
//     trigger: "automated",
//     to:      parentEmail,
//     recipientName: parentName,
//     profileId: parentProfileId,
//     athleteId: athlete.id,
//     subject: email.subject,
//     html:    email.html,
//     relatedTable: "documents",
//     relatedId: documentId,
//   });
// ============================================================================

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─── types ──────────────────────────────────────────────────────────────────

export type TriggerType = "manual" | "automated" | "cron" | "system";

export interface ParentEmailInput {
  /** edge function name, e.g. "send-welcome-email" */
  source: string;
  /** what this message is for, e.g. "dues_reminder" */
  purpose: string;
  trigger?: TriggerType;
  to: string;
  recipientName?: string | null;
  profileId?: string | null;
  athleteId?: string | null;
  subject: string;
  html: string;
  /** plain-text alternative; derived from html when omitted */
  text?: string | null;
  from?: string;
  replyTo?: string;
  /** staff user id when a person clicked send */
  sentBy?: string | null;
  /** passed to Resend as Idempotency-Key, for senders that must not double-send */
  idempotencyKey?: string | null;
  relatedTable?: string | null;
  relatedId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ParentSmsInput {
  source: string;
  purpose: string;
  trigger?: TriggerType;
  to: string;
  recipientName?: string | null;
  profileId?: string | null;
  athleteId?: string | null;
  body: string;
  sentBy?: string | null;
  relatedTable?: string | null;
  relatedId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface SendResult {
  ok: boolean;
  /** parent_message_log.id — always present once the ledger row is open */
  logId: string | null;
  providerMessageId: string | null;
  error: string | null;
}

// ─── constants ──────────────────────────────────────────────────────────────

const DEFAULT_FROM = "Godspeed Basketball <noreply@clubgodspeed.com>";
const BODY_CAP = 20000;   // matches parent_message_log_body_capped
const SUBJECT_CAP = 500;  // matches parent_message_log_subject_capped

// ─── internals ──────────────────────────────────────────────────────────────

let _client: SupabaseClient | null = null;

function admin(): SupabaseClient {
  if (_client) return _client;
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error("parent-comms: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured");
  }
  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}

/** Rough but dependable html -> text, so the ledger stores what a parent read. */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function cap(s: string | null | undefined, n: number): string | null {
  if (s === null || s === undefined) return null;
  return s.length > n ? s.slice(0, n - 3) + "..." : s;
}

/**
 * Resend tag values accept ASCII letters, numbers, underscores and dashes only.
 * A uuid already satisfies that; this guards against anything else slipping in.
 */
function safeTag(v: string): string {
  return v.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 256);
}

/**
 * Fill in the parent's profile id when the caller did not have it to hand, so
 * every sender links its message to a family without each one doing the lookup.
 * Uses .eq() with a bound value: never build a PostgREST filter from input.
 */
async function resolveProfileId(
  given: string | null | undefined,
  email: string | null | undefined,
  phone: string | null | undefined,
): Promise<string | null> {
  if (given) return given;
  try {
    if (email) {
      const { data } = await admin().from("profiles").select("id").eq("email", email).limit(1).maybeSingle();
      if (data?.id) return data.id as string;
    }
    if (phone) {
      const { data } = await admin().from("profiles").select("id").eq("phone", phone).limit(1).maybeSingle();
      if (data?.id) return data.id as string;
    }
  } catch (e) {
    console.warn("parent-comms: profile lookup failed", e instanceof Error ? e.message : e);
  }
  return null;
}

async function openLedgerRow(row: Record<string, unknown>): Promise<string> {
  const { data, error } = await admin()
    .from("parent_message_log")
    .insert(row)
    .select("id")
    .single();

  if (error || !data?.id) {
    // Fail-closed. The caller must not send an unrecorded message.
    throw new Error(`parent-comms: could not open ledger row: ${error?.message ?? "no id returned"}`);
  }
  return data.id as string;
}

async function closeLedgerRow(
  logId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { error } = await admin().from("parent_message_log").update(patch).eq("id", logId);
  if (error) {
    // The message already went out; losing the status update must not throw
    // away the send. Surface it loudly instead.
    console.error("parent-comms: ledger status update failed", logId, error.message);
  }
}

// ─── email ──────────────────────────────────────────────────────────────────

export async function sendParentEmail(input: ParentEmailInput): Promise<SendResult> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    return { ok: false, logId: null, providerMessageId: null, error: "RESEND_API_KEY not configured" };
  }

  const text = input.text ?? htmlToText(input.html);
  const bodyHash = await sha256Hex(input.html);

  let logId: string;
  try {
    logId = await openLedgerRow({
      channel: "email",
      direction: "outbound",
      source: input.source,
      purpose: input.purpose,
      trigger_type: input.trigger ?? "automated",
      recipient_email: input.to,
      recipient_name: input.recipientName ?? null,
      recipient_profile_id: await resolveProfileId(input.profileId, input.to, null),
      athlete_id: input.athleteId ?? null,
      subject: cap(input.subject, SUBJECT_CAP),
      body_text: cap(text, BODY_CAP),
      body_hash: bodyHash,
      status: "queued",
      provider: "resend",
      sent_by: input.sentBy ?? null,
      related_table: input.relatedTable ?? null,
      related_id: input.relatedId ?? null,
      metadata: input.metadata ?? {},
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("parent-comms: refusing to send an unlogged email", input.source, msg);
    return { ok: false, logId: null, providerMessageId: null, error: msg };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        // Resend echoes this back on webhook events and also dedupes on it
        "X-Entity-Ref-ID": logId,
        ...(input.idempotencyKey ? { "Idempotency-Key": input.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from: input.from ?? DEFAULT_FROM,
        to: [input.to],
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
        subject: input.subject,
        html: input.html,
        text,
        tags: [
          { name: "log_id", value: safeTag(logId) },
          { name: "source", value: safeTag(input.source) },
          { name: "purpose", value: safeTag(input.purpose) },
        ],
      }),
    });

    const result = await res.json().catch(() => ({}));

    if (!res.ok) {
      const err = result?.message ?? result?.error ?? `Resend returned ${res.status}`;
      await closeLedgerRow(logId, { status: "failed", status_at: new Date().toISOString(), error_text: String(err).slice(0, 2000) });
      return { ok: false, logId, providerMessageId: null, error: String(err) };
    }

    await closeLedgerRow(logId, {
      status: "sent",
      status_at: new Date().toISOString(),
      provider_message_id: result?.id ?? null,
    });

    return { ok: true, logId, providerMessageId: result?.id ?? null, error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await closeLedgerRow(logId, { status: "failed", status_at: new Date().toISOString(), error_text: msg.slice(0, 2000) });
    return { ok: false, logId, providerMessageId: null, error: msg };
  }
}

// ─── sms ────────────────────────────────────────────────────────────────────

export async function sendParentSms(input: ParentSmsInput): Promise<SendResult> {
  const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const token = Deno.env.get("TWILIO_AUTH_TOKEN");
  const from = Deno.env.get("TWILIO_FROM_NUMBER") ?? Deno.env.get("TWILIO_PHONE_NUMBER");
  if (!sid || !token || !from) {
    return { ok: false, logId: null, providerMessageId: null, error: "Twilio credentials not configured" };
  }

  let logId: string;
  try {
    logId = await openLedgerRow({
      channel: "sms",
      direction: "outbound",
      source: input.source,
      purpose: input.purpose,
      trigger_type: input.trigger ?? "automated",
      recipient_phone: input.to,
      recipient_name: input.recipientName ?? null,
      recipient_profile_id: await resolveProfileId(input.profileId, null, input.to),
      athlete_id: input.athleteId ?? null,
      body_text: cap(input.body, BODY_CAP),
      body_hash: await sha256Hex(input.body),
      status: "queued",
      provider: "twilio",
      sent_by: input.sentBy ?? null,
      related_table: input.relatedTable ?? null,
      related_id: input.relatedId ?? null,
      metadata: input.metadata ?? {},
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("parent-comms: refusing to send an unlogged sms", input.source, msg);
    return { ok: false, logId: null, providerMessageId: null, error: msg };
  }

  try {
    const statusCallback =
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/comms-webhook?log_id=${encodeURIComponent(logId)}`;

    const form = new URLSearchParams({
      To: input.to,
      From: from,
      Body: input.body,
      StatusCallback: statusCallback,
    });

    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });

    const result = await res.json().catch(() => ({}));

    if (!res.ok) {
      const err = result?.message ?? `Twilio returned ${res.status}`;
      await closeLedgerRow(logId, { status: "failed", status_at: new Date().toISOString(), error_text: String(err).slice(0, 2000) });
      return { ok: false, logId, providerMessageId: null, error: String(err) };
    }

    await closeLedgerRow(logId, {
      status: "sent",
      status_at: new Date().toISOString(),
      provider_message_id: result?.sid ?? null,
    });

    return { ok: true, logId, providerMessageId: result?.sid ?? null, error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await closeLedgerRow(logId, { status: "failed", status_at: new Date().toISOString(), error_text: msg.slice(0, 2000) });
    return { ok: false, logId, providerMessageId: null, error: msg };
  }
}

// ─── in-app / no-provider messages ──────────────────────────────────────────

/**
 * Record a message that reaches a parent without a provider: an in-portal
 * notice, a push, or an email sent by something outside our control that we
 * want on the record anyway.
 */
export async function logParentMessage(input: {
  channel: "internal" | "push" | "email" | "sms";
  source: string;
  purpose: string;
  trigger?: TriggerType;
  to?: string | null;
  phone?: string | null;
  recipientName?: string | null;
  profileId?: string | null;
  athleteId?: string | null;
  subject?: string | null;
  body?: string | null;
  sentBy?: string | null;
  provider?: "resend" | "twilio" | "supabase_auth" | "internal";
  providerMessageId?: string | null;
  relatedTable?: string | null;
  relatedId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<string | null> {
  try {
    return await openLedgerRow({
      channel: input.channel,
      direction: "outbound",
      source: input.source,
      purpose: input.purpose,
      trigger_type: input.trigger ?? "system",
      recipient_email: input.to ?? null,
      recipient_phone: input.phone ?? null,
      recipient_name: input.recipientName ?? null,
      recipient_profile_id: await resolveProfileId(input.profileId, input.to, input.phone),
      athlete_id: input.athleteId ?? null,
      subject: cap(input.subject, SUBJECT_CAP),
      body_text: cap(input.body, BODY_CAP),
      body_hash: input.body ? await sha256Hex(input.body) : null,
      status: "sent",
      provider: input.provider ?? "internal",
      provider_message_id: input.providerMessageId ?? null,
      sent_by: input.sentBy ?? null,
      related_table: input.relatedTable ?? null,
      related_id: input.relatedId ?? null,
      metadata: input.metadata ?? {},
    });
  } catch (e) {
    console.error("parent-comms: logParentMessage failed", input.source, e instanceof Error ? e.message : e);
    return null;
  }
}
