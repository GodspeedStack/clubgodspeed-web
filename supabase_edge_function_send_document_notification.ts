// ============================================================
// Supabase Edge Function: send-document-notification
// Sends branded "Document Ready" emails via Resend.
// Called by admin dashboard or by bulk-assign function.
//
// Deploy: supabase functions deploy send-document-notification
//
// Secrets required:
//   RESEND_API_KEY
//   SUPABASE_SERVICE_ROLE_KEY
//   SUPABASE_URL
//
// Request body:
//   { agreement_ids: uuid[] }          — send to specific agreements
//   { document_id: uuid }              — send to ALL pending for a document
//   { agreement_ids: uuid[], type: "escalation" } — send playing-time warning
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const PORTAL_BASE_URL = "https://clubgodspeed.com/parent-portal.html";

interface NotificationRequest {
  agreement_ids?: string[];
  document_id?: string;
  type?: "initial" | "reminder" | "escalation" | "final_warning" | "confirmation";
}

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const body: NotificationRequest = await req.json();
  const notificationType = body.type || "initial";

  let agreementIds: string[] = [];

  // ── Resolve target agreements ───────────────────────────
  if (body.agreement_ids?.length) {
    agreementIds = body.agreement_ids;
  } else if (body.document_id) {
    const { data } = await supabase
      .from("user_agreements")
      .select("id")
      .eq("document_id", body.document_id)
      .in("status", ["pending", "notified", "viewed", "downloaded"]);
    agreementIds = (data || []).map((a: { id: string }) => a.id);
  } else {
    return new Response(
      JSON.stringify({ error: "Provide agreement_ids or document_id" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  if (agreementIds.length === 0) {
    return new Response(
      JSON.stringify({ sent: 0, message: "No eligible agreements" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  // ── Fetch agreements with parent + document data ────────
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
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  let totalSent = 0;
  let totalFailed = 0;

  for (const agreement of agreements || []) {
    const doc = agreement.documents;
    const athlete = agreement.athletes;
    const parentEmail = agreement.parent_email;
    const parentFirstName = parentEmail.split("@")[0]; // fallback

    // Build document-specific portal link with tracking token
    const portalLink = `${PORTAL_BASE_URL}?tab=documents&doc=${doc.slug}&aid=${agreement.id}`;

    const email = buildDocumentEmail({
      type: notificationType,
      parentName: parentFirstName,
      athleteName: athlete.display_name,
      documentTitle: doc.title,
      documentCategory: doc.category,
      season: doc.season,
      isMandatory: doc.is_mandatory,
      portalLink,
      notificationCount: agreement.notification_count,
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

      // Log notification
      await supabase.from("document_notification_log").insert({
        agreement_id: agreement.id,
        document_id: doc.id,
        notification_type: notificationType,
        recipient_email: parentEmail,
        subject: email.subject,
        message_preview: email.preview,
        resend_message_id: result.id || null,
      });

      // Log event
      await supabase.from("document_events").insert({
        agreement_id: agreement.id,
        event_type: notificationType === "escalation" ? "escalation_sent" : "notification_sent",
        actor_type: "system",
        event_metadata: {
          notification_type: notificationType,
          resend_message_id: result.id || null,
          subject: email.subject,
        },
      });

      // Advance status from pending → notified (only forward)
      if (agreement.status === "pending") {
        await supabase
          .from("user_agreements")
          .update({
            status: "notified",
            first_notified_at: agreement.notification_count === 0 ? new Date().toISOString() : undefined,
            last_notified_at: new Date().toISOString(),
            notification_count: agreement.notification_count + 1,
          })
          .eq("id", agreement.id);
      } else {
        // Just update notification tracking
        await supabase
          .from("user_agreements")
          .update({
            last_notified_at: new Date().toISOString(),
            notification_count: agreement.notification_count + 1,
          })
          .eq("id", agreement.id);
      }

      totalSent++;
      console.log(`[doc-notify] Sent ${notificationType} to ${parentEmail} for "${doc.title}"`);
    } catch (err) {
      console.error(`[doc-notify] Failed to send to ${parentEmail}:`, err);
      totalFailed++;
    }
  }

  return new Response(
    JSON.stringify({ sent: totalSent, failed: totalFailed }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
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
  portalLink: string;
  notificationCount: number;
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
      preview: `A new ${categoryLabel} is ready for your review and signature.`,
      cta: "VIEW SECURE DOCUMENT",
      body: `
        <p>A new document has been posted to ${ctx.athleteName}'s Parent Portal
        and requires your attention.</p>
        <div style="background:#f0f9ff;border-left:4px solid #2563eb;padding:12px 16px;margin:16px 0;border-radius:0 6px 6px 0;">
          <strong>${ctx.documentTitle}</strong> ${mandatoryBadge}<br>
          <span style="color:#6b7280;font-size:14px;">${categoryLabel} — ${ctx.season}</span>
        </div>
        <p>Please review and sign this document at your earliest convenience.
        ${ctx.isMandatory ? "This document is <strong>required</strong> for " + ctx.athleteName + " to participate in team activities." : ""}</p>
      `,
    },

    reminder: {
      subject: `Reminder: ${ctx.documentTitle} still needs your signature`,
      preview: `${ctx.athleteName}'s ${categoryLabel} is still waiting for your signature.`,
      cta: "SIGN NOW",
      body: `
        <p>We wanted to follow up — <strong>${ctx.documentTitle}</strong> for
        ${ctx.athleteName} still needs your signature.</p>
        ${ctx.isMandatory ? `
        <div style="background:#fef2f2;border-left:4px solid #dc2626;padding:12px 16px;margin:16px 0;border-radius:0 6px 6px 0;">
          <strong>This is a required document.</strong> ${ctx.athleteName}'s participation
          in team activities may be affected until this document is signed.
        </div>` : ""}
        <p>It only takes a minute. Click below to review and sign in the Parent Portal.</p>
      `,
    },

    escalation: {
      subject: `Urgent: Action Required for ${ctx.athleteName} — Playing Time at Risk`,
      preview: `${ctx.athleteName}'s playing time is at risk due to unsigned documents.`,
      cta: "SIGN NOW — PROTECT PLAYING TIME",
      body: `
        <div style="background:#fef2f2;border:1px solid #fca5a5;padding:16px;border-radius:8px;margin-bottom:16px;">
          <strong style="color:#dc2626;font-size:16px;">Playing Time Notice</strong>
          <p style="margin:8px 0 0;">Our records show that <strong>${ctx.documentTitle}</strong>
          has not been signed for ${ctx.athleteName}. Per Godspeed Basketball policy,
          players with outstanding mandatory documents will have
          <strong>limited or no playing time</strong> until all required documents are completed.</p>
        </div>
        <p>We understand things get busy. This can be completed in under 60 seconds
        through the secure Parent Portal.</p>
      `,
    },

    final_warning: {
      subject: `Final Notice: ${ctx.athleteName} — Roster Eligibility`,
      preview: `Final notice regarding ${ctx.athleteName}'s roster eligibility.`,
      cta: "COMPLETE NOW",
      body: `
        <div style="background:#1f2937;color:#fff;padding:20px;border-radius:8px;margin-bottom:16px;">
          <strong style="font-size:16px;">FINAL NOTICE — ROSTER ELIGIBILITY</strong>
          <p style="margin:8px 0 0;color:#d1d5db;">${ctx.athleteName} will be moved to
          inactive roster status if <strong>${ctx.documentTitle}</strong> is not signed
          within the next 48 hours.</p>
        </div>
        <p>If there is an issue preventing you from completing this document,
        please contact Coach Scott immediately. We want to keep ${ctx.athleteName}
        on the active roster.</p>
      `,
    },

    confirmation: {
      subject: `Confirmed: ${ctx.documentTitle} signed for ${ctx.athleteName}`,
      preview: `Thank you — ${ctx.documentTitle} has been signed and recorded.`,
      cta: "VIEW YOUR DOCUMENTS",
      body: `
        <div style="background:#f0fdf4;border-left:4px solid #16a34a;padding:12px 16px;margin:16px 0;border-radius:0 6px 6px 0;">
          <strong style="color:#16a34a;">Signature Confirmed</strong><br>
          <span style="color:#6b7280;font-size:14px;">${ctx.documentTitle} — ${ctx.season}</span>
        </div>
        <p>Thank you for signing <strong>${ctx.documentTitle}</strong> for ${ctx.athleteName}.
        Your signature has been securely recorded with a timestamp and audit trail.</p>
        <p>You can view all your signed documents anytime in the Parent Portal.</p>
      `,
    },
  };

  const msg = messages[ctx.type] || messages.initial;

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;">
      <div style="font-size:20px;font-weight:700;margin-bottom:24px;">
        GODSPEED<span style="color:#2563eb;">BASKETBALL</span>
      </div>

      <p style="font-size:16px;line-height:1.6;color:#111;">
        Hey ${ctx.parentName},
      </p>

      <div style="font-size:16px;line-height:1.6;color:#111;">
        ${msg.body}
      </div>

      <a href="${ctx.portalLink}" style="display:inline-block;background:#000;color:#fff;padding:16px 32px;border-radius:6px;font-weight:700;font-size:14px;text-transform:uppercase;text-decoration:none;letter-spacing:0.05em;margin:24px 0;">
        ${msg.cta}
      </a>

      <p style="font-size:13px;color:#9ca3af;margin-top:8px;">
        This link takes you to ${ctx.athleteName}'s secure Parent Portal on clubgodspeed.com.
      </p>

      <p style="font-size:14px;line-height:1.6;color:#6b7280;margin-top:24px;">
        Questions? Just reply to this email or text Coach Scott.
      </p>

      <div style="border-top:1px solid #e5e7eb;margin-top:32px;padding-top:16px;font-size:12px;color:#9ca3af;">
        Godspeed Basketball Academy — Brotherhood. Habits. Success.
      </div>
    </div>
  `;

  return { subject: msg.subject, html, preview: msg.preview };
}
