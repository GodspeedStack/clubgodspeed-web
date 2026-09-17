// ============================================================================
// comms-webhook  —  delivery events from Resend and Twilio
// ----------------------------------------------------------------------------
// Every event this endpoint receives is recorded. There is no path that drops
// one.
//
//   1. Verify the provider signature. Unsigned traffic is rejected 401.
//   2. Resolve the event to a parent_message_log row, in order:
//        a. log_id tag (Resend) or ?log_id= query param (Twilio)
//        b. provider_message_id (Resend email_id / Twilio MessageSid)
//      An event that matches neither means a sender skipped the chokepoint
//      helper, so we open a ledger row flagged bypassed = true rather than
//      losing the record.
//   3. Append to parent_message_events. The log row's status rolls up by
//      trigger, forward-only.
//   4. Broadcast campaigns additionally keep their campaign_events row.
//
// Deployed with verify_jwt = false: providers sign with their own scheme, not
// a Supabase JWT.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const RESEND_WEBHOOK_SECRET = Deno.env.get("RESEND_WEBHOOK_SECRET") ?? "";
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
// Set only if the public URL Twilio signs differs from what req.url reports.
const TWILIO_WEBHOOK_URL = Deno.env.get("TWILIO_WEBHOOK_URL") ?? "";
// Comma-separated from-addresses that Supabase Auth uses (magic links, password
// resets). Auth mail never passes through our senders, so without this it would
// be flagged as a bypass forever. Listing the address records it as auth mail.
//
// Note: Auth shares noreply@clubgodspeed.com with our own senders, so the
// address alone does not identify auth mail. It only counts as auth mail when
// the event ALSO carries none of the tags every chokepoint send attaches.
const AUTH_FROM_ADDRESSES = (Deno.env.get("AUTH_EMAIL_FROM") ?? "")
  .split(",").map((v) => v.trim().toLowerCase()).filter(Boolean);

const SIGNATURE_TOLERANCE_SECONDS = 300;

// ─── helpers ────────────────────────────────────────────────────────────────

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let bin = "";
  for (let i = 0; i < view.length; i++) bin += String.fromCharCode(view[i]);
  return btoa(bin);
}

/** Constant-time string compare, so a signature cannot be probed byte by byte. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmac(algo: "SHA-256" | "SHA-1", key: Uint8Array, data: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key as unknown as BufferSource,
    { name: "HMAC", hash: algo },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
  return bytesToB64(sig);
}

// ─── signature verification ─────────────────────────────────────────────────

/** Resend signs with Svix: HMAC-SHA256 over "<id>.<timestamp>.<body>". */
async function verifyResend(req: Request, body: string): Promise<boolean> {
  if (!RESEND_WEBHOOK_SECRET) return false;

  const id = req.headers.get("svix-id");
  const ts = req.headers.get("svix-timestamp");
  const sigHeader = req.headers.get("svix-signature");
  if (!id || !ts || !sigHeader) return false;

  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(ts));
  if (!Number.isFinite(age) || age > SIGNATURE_TOLERANCE_SECONDS) return false;

  const secret = RESEND_WEBHOOK_SECRET.startsWith("whsec_")
    ? RESEND_WEBHOOK_SECRET.slice(6)
    : RESEND_WEBHOOK_SECRET;

  const expected = await hmac("SHA-256", b64ToBytes(secret), `${id}.${ts}.${body}`);

  // header is a space-separated list of "v1,<base64sig>"
  for (const part of sigHeader.split(" ")) {
    const [version, value] = part.split(",");
    if (version === "v1" && value && timingSafeEqual(value, expected)) return true;
  }
  return false;
}

/** Twilio signs with HMAC-SHA1 over url + sorted(key + value) of POST params. */
async function verifyTwilio(req: Request, params: Record<string, string>): Promise<boolean> {
  if (!TWILIO_AUTH_TOKEN) return false;

  const provided = req.headers.get("x-twilio-signature");
  if (!provided) return false;

  const url = TWILIO_WEBHOOK_URL
    ? TWILIO_WEBHOOK_URL + new URL(req.url).search
    : req.url;

  let data = url;
  for (const key of Object.keys(params).sort()) data += key + params[key];

  const expected = await hmac("SHA-1", new TextEncoder().encode(TWILIO_AUTH_TOKEN), data);
  return timingSafeEqual(provided, expected);
}

// ─── ledger resolution ──────────────────────────────────────────────────────

interface Parsed {
  provider: "resend" | "twilio";
  eventType: string;
  providerEventId: string | null;
  providerMessageId: string | null;
  logId: string | null;
  recipient: string;
  channel: "email" | "sms";
  campaignId: string | null;
  occurredAt: string;
  errorText: string | null;
  /** true when this came from a Supabase Auth from-address we recognise */
  isAuthMail: boolean;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asUuid(v: string | null | undefined): string | null {
  return v && UUID_RE.test(v) ? v : null;
}

/** Resolve the event to a ledger row id, opening a flagged row if unmatched. */
async function resolveMessageId(ev: Parsed): Promise<string> {
  if (ev.logId) {
    const { data } = await supabase
      .from("parent_message_log")
      .select("id")
      .eq("id", ev.logId)
      .maybeSingle();
    if (data?.id) return data.id;
  }

  if (ev.providerMessageId) {
    const { data } = await supabase
      .from("parent_message_log")
      .select("id")
      .eq("provider", ev.provider)
      .eq("provider_message_id", ev.providerMessageId)
      .order("occurred_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.id) return data.id;
  }

  // Nothing matched. Either Supabase Auth sent it (expected: auth mail never
  // passes through our senders) or a code path skipped the chokepoint helper.
  // Either way, record it rather than drop it.
  const profileId = await lookupProfile(ev.recipient, ev.channel);

  const { data, error } = await supabase
    .from("parent_message_log")
    .insert({
      channel: ev.channel,
      direction: "outbound",
      source: ev.isAuthMail ? "supabase_auth" : "UNLOGGED",
      purpose: ev.isAuthMail ? "auth" : "unknown",
      trigger_type: "system",
      recipient_email: ev.channel === "email" ? ev.recipient : null,
      recipient_phone: ev.channel === "sms" ? ev.recipient : null,
      recipient_profile_id: profileId,
      subject: null,
      status: "unknown",
      provider: ev.provider,
      provider_message_id: ev.providerMessageId,
      // Auth mail is expected to arrive this way; anything else is a bypass.
      bypassed: !ev.isAuthMail,
      occurred_at: ev.occurredAt,
      metadata: {
        note: ev.isAuthMail
          ? "Supabase Auth mail, recorded by comms-webhook"
          : "opened by comms-webhook: no sender had logged this message",
      },
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(`could not open bypass ledger row: ${error?.message ?? "no id"}`);
  }
  return data.id as string;
}

/**
 * Look the recipient up without interpolating it into a PostgREST filter
 * string. The previous implementation built an .or() from the payload, which
 * let a crafted recipient rewrite the query.
 */
async function lookupProfile(recipient: string, channel: "email" | "sms"): Promise<string | null> {
  if (!recipient || recipient === "unknown") return null;
  const column = channel === "email" ? "email" : "phone";
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .eq(column, recipient)
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

// ─── parsing ────────────────────────────────────────────────────────────────

const RESEND_TYPE_MAP: Record<string, string> = {
  "email.sent": "sent",
  "email.delivered": "delivered",
  "email.delivery_delayed": "sent",
  "email.opened": "opened",
  "email.clicked": "clicked",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.failed": "failed",
};

const TWILIO_STATUS_MAP: Record<string, string> = {
  queued: "queued",
  accepted: "queued",
  scheduled: "queued",
  sending: "sent",
  sent: "sent",
  delivered: "delivered",
  read: "opened",
  undelivered: "failed",
  failed: "failed",
};

function parseResend(req: Request, payload: any): Parsed {
  const tags: Array<{ name: string; value: string }> = payload?.data?.tags ?? [];
  const tag = (n: string) => tags.find((t) => t?.name === n)?.value ?? null;

  return {
    provider: "resend",
    eventType: RESEND_TYPE_MAP[payload?.type] ?? "unknown",
    providerEventId: req.headers.get("svix-id"),
    providerMessageId: payload?.data?.email_id ?? null,
    logId: asUuid(tag("log_id")),
    recipient: payload?.data?.to?.[0] ?? "unknown",
    channel: "email",
    campaignId: asUuid(tag("campaign_id")),
    occurredAt: payload?.created_at ?? payload?.data?.created_at ?? new Date().toISOString(),
    errorText: payload?.data?.bounce?.message ?? payload?.data?.reason ?? null,
    isAuthMail: isAuthMail(payload?.data?.from, tags),
  };
}

/**
 * Auth mail is mail from a known Auth sender address that carries none of the
 * tags our chokepoint attaches. Requiring both matters because Supabase Auth
 * and several of our senders share noreply@clubgodspeed.com: on the address
 * alone, a genuine bypass from one of those senders would be waved through as
 * auth mail and never show up in red.
 */
function isAuthMail(
  from: string | null | undefined,
  tags: Array<{ name: string; value: string }>,
): boolean {
  if (!from || AUTH_FROM_ADDRESSES.length === 0) return false;

  const ours = new Set(["log_id", "source", "purpose"]);
  if (tags.some((t) => t?.name && ours.has(t.name))) return false;

  const lower = from.toLowerCase();
  return AUTH_FROM_ADDRESSES.some((a) => lower.includes(a));
}

function parseTwilio(req: Request, params: Record<string, string>): Parsed {
  const url = new URL(req.url);
  const status = (params.MessageStatus ?? "").toLowerCase();

  return {
    provider: "twilio",
    eventType: TWILIO_STATUS_MAP[status] ?? "unknown",
    providerEventId: params.MessageSid ? `${params.MessageSid}:${status}` : null,
    providerMessageId: params.MessageSid ?? null,
    logId: asUuid(url.searchParams.get("log_id")),
    recipient: params.To ?? "unknown",
    channel: "sms",
    campaignId: asUuid(url.searchParams.get("campaign_id")),
    occurredAt: new Date().toISOString(),
    errorText: params.ErrorMessage ?? params.ErrorCode ?? null,
    isAuthMail: false,
  };
}

// ─── handler ────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), { status: 405 });
  }

  let body: string;
  try {
    body = await req.text();
  } catch {
    return new Response(JSON.stringify({ error: "unreadable body" }), { status: 400 });
  }

  // ── identify the provider and verify its signature ────────────────────────
  let ev: Parsed;
  let rawPayload: unknown;

  const looksLikeResend = !!req.headers.get("svix-id");

  try {
    if (looksLikeResend) {
      if (!(await verifyResend(req, body))) {
        // Presence only, never the value. Without this an unset secret and a
        // genuinely bad signature are indistinguishable from outside, which is
        // correct for an attacker and useless for an operator.
        console.warn(
          "comms-webhook: rejected Resend event with an invalid signature " +
          `(RESEND_WEBHOOK_SECRET configured: ${RESEND_WEBHOOK_SECRET ? "yes" : "NO"})`,
        );
        return new Response(JSON.stringify({ error: "invalid signature" }), { status: 401 });
      }
      const payload = JSON.parse(body);
      rawPayload = payload;
      ev = parseResend(req, payload);
    } else {
      const params = Object.fromEntries(new URLSearchParams(body));
      if (!params.MessageStatus && !params.MessageSid) {
        console.warn("comms-webhook: unrecognised payload shape");
        return new Response(JSON.stringify({ error: "unrecognised payload" }), { status: 400 });
      }
      if (!(await verifyTwilio(req, params))) {
        console.warn(
          "comms-webhook: rejected Twilio event with an invalid signature " +
          `(TWILIO_AUTH_TOKEN configured: ${TWILIO_AUTH_TOKEN ? "yes" : "NO"})`,
        );
        return new Response(JSON.stringify({ error: "invalid signature" }), { status: 401 });
      }
      rawPayload = params;
      ev = parseTwilio(req, params);
    }
  } catch (e) {
    console.error("comms-webhook: parse failure", e instanceof Error ? e.message : e);
    return new Response(JSON.stringify({ error: "malformed payload" }), { status: 400 });
  }

  // ── record it ─────────────────────────────────────────────────────────────
  try {
    const messageId = await resolveMessageId(ev);

    const { error: evErr } = await supabase.from("parent_message_events").insert({
      message_id: messageId,
      event_type: ev.eventType,
      occurred_at: ev.occurredAt,
      provider: ev.provider,
      provider_event_id: ev.providerEventId,
      payload: rawPayload as Record<string, unknown>,
    });

    // 23505 is the idempotency index doing its job on a provider retry.
    if (evErr && evErr.code !== "23505") throw evErr;

    if (ev.errorText) {
      await supabase
        .from("parent_message_log")
        .update({ error_text: String(ev.errorText).slice(0, 2000) })
        .eq("id", messageId);
    }

    // ── legacy: keep broadcast campaign analytics working ───────────────────
    if (ev.campaignId) {
      const campaignEventType =
        ev.eventType === "complained" || ev.eventType === "failed" ? "failed" : ev.eventType;
      const profileId = await lookupProfile(ev.recipient, ev.channel);
      const { error: ceErr } = await supabase.from("campaign_events").insert({
        campaign_id: ev.campaignId,
        profile_id: profileId,
        recipient: ev.recipient,
        event_type: campaignEventType,
        metadata: rawPayload as Record<string, unknown>,
      });
      if (ceErr) console.error("comms-webhook: campaign_events insert failed", ceErr.message);
    }

    return new Response(JSON.stringify({ success: true, message_id: messageId }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    // 500 so the provider retries; the idempotency index makes that safe.
    const msg = e instanceof Error ? e.message : String(e);
    console.error("comms-webhook: fatal", msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
});
