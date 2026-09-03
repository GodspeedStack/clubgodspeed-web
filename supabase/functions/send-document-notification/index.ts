// ============================================================
// Supabase Edge Function: send-document-notification
// Sends branded "Document Ready" emails via Resend.
// Called by admin dashboard, bulk-assign, and the portal (confirmation).
//
// v2 (2026-09-03): the email button is a single-use magic link that signs the
// parent in and opens the document (see _shared/portal-signin-link.ts).
// Confirmation emails keep a plain portal link (nothing to sign).
//
// Secrets required:
//   RESEND_API_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL
// Optional: SITE_URL (default https://www.clubgodspeed.com)
//
// Request body:
//   { agreement_ids: uuid[] }                       send to specific agreements
//   { document_id: uuid }                           send to ALL pending for a document
//   { agreement_ids: uuid[], type: "escalation" }   send playing-time warning
//
// Auth (v2.1, 2026-09-03). The function is deployed with verify_jwt=false so it
// can do its own checks. Every caller must present one of:
//   - the service role key            -> may send anything (cron, admin tools)
//   - a coach/director/founder JWT    -> may send anything (admin dashboard)
//   - a parent JWT                    -> may send ONLY type=confirmation for
//                                        agreements they own (portal, after signing)
// Anything else is 401/403 with { error: { code, message } }. No email is sent
// before the caller is resolved.
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { documentDeepLink, linkHelpCopy, mintPortalLink, portalBaseUrl, type PortalLink } from "../_shared/portal-signin-link.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
const MAX_BATCH = 200;

type NotificationType = "initial" | "reminder" | "escalation" | "final_warning" | "confirmation";
const VALID_TYPES: ReadonlySet<string> = new Set(["initial", "reminder", "escalation", "final_warning", "confirmation"]);

interface NotificationRequest {
  agreement_ids?: string[];
  document_id?: string;
  type?: NotificationType;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

type Caller =
  | { kind: "service" }
  | { kind: "staff"; userId: string }
  | { kind: "parent"; userId: string };

const STAFF_ROLES: ReadonlySet<string> = new Set(["director", "coach", "founder"]);
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function bearer(req: Request): string {
  const h = req.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

/** Resolve who is calling. Never trusts JWT claims for role; reads profiles. */
async function resolveCaller(req: Request): Promise<Caller | null> {
  const token = bearer(req);
  if (!token) return null;
  if (SERVICE_ROLE_KEY && token === SERVICE_ROLE_KEY) return { kind: "service" };

  const { data, error } = await supabase.auth.getUser(token);
  const user = data?.user;
  if (error || !user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const role = (profile?.role ?? "") as string;
  return STAFF_ROLES.has(role) ? { kind: "staff", userId: user.id } : { kind: "parent", userId: user.id };
}

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return jsonResponse(405, { error: { code: "method_not_allowed", message: "POST only" } });
  }

  const caller = await resolveCaller(req);
  if (!caller) {
    return jsonResponse(401, { error: { code: "unauthorized", message: "Sign in required" } });
  }

  let body: NotificationRequest;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: { code: "bad_json", message: "Body must be JSON" } });
  }

  const notificationType: NotificationType =
    body.type && VALID_TYPES.has(body.type) ? body.type : "initial";

  // Parents may only trigger their own confirmation email.
  if (caller.kind === "parent") {
    if (notificationType !== "confirmation" || !Array.isArray(body.agreement_ids) || !body.agreement_ids.length || body.document_id) {
      return jsonResponse(403, { error: { code: "forbidden", message: "Parents can only request a confirmation for their own signed documents" } });
    }
    const ids = body.agreement_ids.slice(0, MAX_BATCH);
    const { data: owned } = await supabase
      .from("user_agreements")
      .select("id")
      .eq("parent_user_id", caller.userId)
      .eq("status", "signed")
      .in("id", ids);
    const ownedIds = new Set((owned || []).map((a: { id: string }) => a.id));
    if (ids.some((id) => !ownedIds.has(id))) {
      return jsonResponse(403, { error: { code: "forbidden", message: "Agreement is not yours or is not signed" } });
    }
  }

  let agreementIds: string[] = [];

  if (Array.isArray(body.agreement_ids) && body.agreement_ids.length) {
    agreementIds = body.agreement_ids.slice(0, MAX_BATCH);
  } else if (body.document_id) {
    const { data } = await supabase
      .from("user_agreements")
      .select("id")
      .eq("document_id", body.document_id)
      .in("status", ["pending", "notified", "viewed", "downloaded"])
      .limit(MAX_BATCH);
    agreementIds = (data || []).map((a: { id: string }) => a.id);
  } else {
    return jsonResponse(400, { error: { code: "missing_target", message: "Provide agreement_ids or document_id" } });
  }

  if (agreementIds.length === 0) {
    return jsonResponse(200, { sent: 0, message: "No eligible agreements" });
  }

  const { data: agreements, error } = await supabase
    .from("user_agreements")
    .select(`
      id, parent_user_id, parent_email, athlete_id, status,
      notification_count,
      documents!inner(id, title, slug, category, season, is_mandatory),
      athletes!inner(display_name, enrollment_status)
    `)
    .in("id", agreementIds);

  if (error) {
    console.error("[doc-notify] Failed to fetch agreements:", error);
    return jsonResponse(500, { error: { code: "fetch_failed", message: error.message } });
  }

  let totalSent = 0;
  let totalFailed = 0;
  let totalOneTap = 0;

  for (const agreement of agreements || []) {
    const doc = agreement.documents;
    const athlete = agreement.athletes;
    const parentEmail = agreement.parent_email;
    const parentFirstName = parentEmail.split("@")[0];

    const destination = documentDeepLink(doc.slug, agreement.id);
    // Confirmation has nothing to sign: plain link, no credential in the email.
    const link: PortalLink = notificationType === "confirmation"
      ? { url: `${portalBaseUrl()}?tab=documents`, oneTap: false }
      : await mintPortalLink(supabase, parentEmail, destination);
    if (link.oneTap) totalOneTap++;

    const email = buildDocumentEmail({
      type: notificationType,
      parentName: parentFirstName,
      athleteName: athlete.display_name,
      documentTitle: doc.title,
      documentCategory: doc.category,
      season: doc.season,
      isMandatory: doc.is_mandatory,
      link,
    });

    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: "Godspeed Basketball <documents@clubgodspeed.com>",
          to: [parentEmail],
          subject: email.subject,
          html: email.html,
        }),
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(`resend_${res.status}: ${result?.message ?? "send failed"}`);
      }

      await supabase.from("document_notification_log").insert({
        agreement_id: agreement.id,
        document_id: doc.id,
        notification_type: notificationType,
        recipient_email: parentEmail,
        subject: email.subject,
        message_preview: email.preview,
        resend_message_id: result.id || null,
      });

      await supabase.from("document_events").insert({
        agreement_id: agreement.id,
        event_type: notificationType === "escalation" ? "escalation_sent" : "notification_sent",
        actor_type: "system",
        event_metadata: {
          notification_type: notificationType,
          resend_message_id: result.id || null,
          subject: email.subject,
          one_tap_link: link.oneTap,
        },
      });

      // Advance status forward only (pending -> notified). Never downgrade.
      const nowIso = new Date().toISOString();
      const updates: Record<string, unknown> = {
        last_notified_at: nowIso,
        notification_count: agreement.notification_count + 1,
      };
      if (agreement.status === "pending") {
        updates.status = "notified";
        if (agreement.notification_count === 0) updates.first_notified_at = nowIso;
      }
      await supabase.from("user_agreements").update(updates).eq("id", agreement.id);

      totalSent++;
      console.log(`[doc-notify] Sent ${notificationType} for "${doc.title}" (${athlete.display_name}), one_tap=${link.oneTap}`);
    } catch (err) {
      console.error(`[doc-notify] Failed to send for agreement ${agreement.id}:`, errMessage(err));
      totalFailed++;
    }
  }

  return jsonResponse(200, { sent: totalSent, one_tap: totalOneTap, failed: totalFailed });
});

// ── Email builder ─────────────────────────────────────────
interface DocEmailContext {
  type: string;
  parentName: string;
  athleteName: string;
  documentTitle: string;
  documentCategory: string;
  season: string;
  isMandatory: boolean;
  link: PortalLink;
}

function buildDocumentEmail(ctx: DocEmailContext): { subject: string; html: string; preview: string } {
  const categoryLabels: Record<string, string> = {
    waiver: "Liability Waiver",
    medical_release: "Medical Release",
    code_of_conduct: "Code of Conduct",
    financial_agreement: "Financial Agreement",
    handbook: "Parent Handbook",
    consent_form: "Consent Form",
    roster_commitment: "Roster Commitment",
    other: "Document",
  };

  const categoryLabel = categoryLabels[ctx.documentCategory] || "Document";
  const mandatoryBadge = ctx.isMandatory
    ? `<span style="display:inline-block;background:#dc2626;color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:4px;text-transform:uppercase;letter-spacing:0.05em;">Required</span>`
    : "";

  const messages: Record<string, { subject: string; body: string; preview: string; cta: string }> = {
    initial: {
      subject: `New document ready for ${ctx.athleteName}: ${ctx.documentTitle}`,
      preview: `A new ${categoryLabel} is ready for you to sign.`,
      cta: "OPEN AND SIGN",
      body: `
        <p>A new document is ready in ${ctx.athleteName}'s Parent Portal. It needs your signature.</p>
        <div style="background:#f0f9ff;border-left:4px solid #2563eb;padding:12px 16px;margin:16px 0;border-radius:0 6px 6px 0;">
          <strong>${ctx.documentTitle}</strong> ${mandatoryBadge}<br>
          <span style="color:#6b7280;font-size:14px;">${categoryLabel}. ${ctx.season}</span>
        </div>
        <p>Tap the button. It signs you in and opens the document. It takes about a minute.
        ${ctx.isMandatory ? "This document is <strong>required</strong> before " + ctx.athleteName + " can play, practice, or train." : ""}</p>
      `,
    },

    reminder: {
      subject: `Reminder: ${ctx.documentTitle} still needs your signature`,
      preview: `${ctx.athleteName}'s ${categoryLabel} is still waiting for your signature.`,
      cta: "SIGN NOW",
      body: `
        <p>Quick follow-up. <strong>${ctx.documentTitle}</strong> for
        ${ctx.athleteName} still needs your signature.</p>
        ${ctx.isMandatory ? `
        <div style="background:#fef2f2;border-left:4px solid #dc2626;padding:12px 16px;margin:16px 0;border-radius:0 6px 6px 0;">
          <strong>This is a required document.</strong> ${ctx.athleteName} may not be able
          to play, practice, or train until it is signed.
        </div>` : ""}
        <p>Tap the button. It signs you in and opens the document. About 60 seconds.</p>
      `,
    },

    escalation: {
      subject: `Urgent: Action Required for ${ctx.athleteName}. Playing Time at Risk`,
      preview: `${ctx.athleteName}'s playing time is at risk due to unsigned documents.`,
      cta: "SIGN NOW AND PROTECT PLAYING TIME",
      body: `
        <div style="background:#fef2f2;border:1px solid #fca5a5;padding:16px;border-radius:8px;margin-bottom:16px;">
          <strong style="color:#dc2626;font-size:16px;">Playing Time Notice</strong>
          <p style="margin:8px 0 0;">Our records show <strong>${ctx.documentTitle}</strong>
          has not been signed for ${ctx.athleteName}. Per Godspeed Basketball policy,
          players with unsigned required documents will have
          <strong>limited or no playing time</strong> until all documents are signed.</p>
        </div>
        <p>We know things get busy. Tap the button to sign. It takes under 60 seconds.</p>
      `,
    },

    final_warning: {
      subject: `Final Notice: ${ctx.athleteName}. Roster Eligibility`,
      preview: `Final notice about ${ctx.athleteName}'s roster eligibility.`,
      cta: "SIGN NOW",
      body: `
        <div style="background:#1f2937;color:#fff;padding:20px;border-radius:8px;margin-bottom:16px;">
          <strong style="font-size:16px;">FINAL NOTICE. ROSTER ELIGIBILITY</strong>
          <p style="margin:8px 0 0;color:#d1d5db;">${ctx.athleteName} will be moved to
          inactive roster status if <strong>${ctx.documentTitle}</strong> is not signed
          within the next 48 hours.</p>
        </div>
        <p>If something is stopping you from signing, reply to this email or text
        Coach Scott right away. We want to keep ${ctx.athleteName} on the active roster.</p>
      `,
    },

    confirmation: {
      subject: `Confirmed: ${ctx.documentTitle} signed for ${ctx.athleteName}`,
      preview: `Thank you. ${ctx.documentTitle} has been signed and recorded.`,
      cta: "VIEW YOUR DOCUMENTS",
      body: `
        <div style="background:#f0fdf4;border-left:4px solid #16a34a;padding:12px 16px;margin:16px 0;border-radius:0 6px 6px 0;">
          <strong style="color:#16a34a;">Signature Confirmed</strong><br>
          <span style="color:#6b7280;font-size:14px;">${ctx.documentTitle}. ${ctx.season}</span>
        </div>
        <p>Thank you for signing <strong>${ctx.documentTitle}</strong> for ${ctx.athleteName}.
        Your signature is recorded with a time stamp and audit trail.</p>
        <p>You can view all your signed documents any time in the Parent Portal.</p>
      `,
    },
  };

  const msg = messages[ctx.type] || messages.initial;

  const html = `
    <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;">
      <div style="font-size:20px;font-weight:700;margin-bottom:24px;">
        GODSPEED<span style="color:#2563eb;">BASKETBALL</span>
      </div>

      <p style="font-size:16px;line-height:1.6;color:#111;">
        Hey ${ctx.parentName},
      </p>

      <div style="font-size:16px;line-height:1.6;color:#111;">
        ${msg.body}
      </div>

      <a href="${ctx.link.url}" style="display:inline-block;background:#000;color:#fff;padding:16px 32px;border-radius:6px;font-weight:700;font-size:14px;text-transform:uppercase;text-decoration:none;letter-spacing:0.05em;margin:24px 0;">
        ${msg.cta}
      </a>

      <p style="font-size:13px;line-height:1.5;color:#6b7280;margin-top:8px;">
        ${linkHelpCopy(ctx.link, ctx.athleteName)}
      </p>

      <p style="font-size:14px;line-height:1.6;color:#6b7280;margin-top:24px;">
        Questions? Reply to this email or text Coach Scott.
      </p>

      <div style="border-top:1px solid #e5e7eb;margin-top:32px;padding-top:16px;font-size:12px;color:#9ca3af;">
        Godspeed Basketball. Brotherhood. Habits. Success.
      </div>
    </div>
  `;

  return { subject: msg.subject, html, preview: msg.preview };
}
