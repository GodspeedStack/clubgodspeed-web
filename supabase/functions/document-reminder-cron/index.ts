// ============================================================
// Supabase Edge Function: document-reminder-cron
// Automated document compliance reminders.
// Runs Tues & Thurs at 8:00 AM via pg_cron.
//
// Logic:
//   1. Scan for user_agreements with status != 'signed'
//   2. Check if athlete is on active roster
//   3. Escalate notification type based on days outstanding
//   4. Mint a one-tap sign-in link that lands on the document (v2)
//   5. Fire branded emails via Resend
//   6. Log everything to document_notification_log + document_events
//
// v2 (2026-09-03): the email button is a single-use magic link. Parents whose
// accounts were bulk-created never had a password; the old link dropped them on
// a password screen. Falls back to the plain portal link if minting fails.
//
// Secrets required:
//   RESEND_API_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL
// Optional: SITE_URL (default https://www.clubgodspeed.com)
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { documentDeepLink, linkHelpCopy, mintPortalLink, type PortalLink } from "../_shared/portal-signin-link.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ── Escalation ladder ─────────────────────────────────────
const ESCALATION_RULES = [
  { minDays: 0,  maxDays: 2,  type: "initial",       maxSends: 1, label: "New document" },
  { minDays: 3,  maxDays: 6,  type: "reminder",       maxSends: 1, label: "Friendly reminder" },
  { minDays: 7,  maxDays: 13, type: "escalation",     maxSends: 2, label: "Playing time warning" },
  { minDays: 14, maxDays: 20, type: "final_warning",  maxSends: 1, label: "Final notice" },
  // After 21 days: stop emailing, flag for manual admin action
] as const;

serve(async (_req: Request) => {
  console.log("[doc-cron] Starting document reminder run...");

  const now = new Date();
  let totalSent = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  let totalOneTap = 0;

  const { data: agreements, error } = await supabase
    .from("user_agreements")
    .select(`
      id, parent_user_id, parent_email, athlete_id, status,
      assigned_at, notification_count, last_notified_at,
      documents!inner(id, title, slug, category, season, is_mandatory),
      athletes!inner(id, display_name, enrollment_status, team_name)
    `)
    .neq("status", "signed")
    .eq("documents.is_mandatory", true)
    .eq("documents.is_active", true)
    .eq("athletes.enrollment_status", "active");

  if (error) {
    console.error("[doc-cron] Failed to fetch agreements:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  if (!agreements || agreements.length === 0) {
    console.log("[doc-cron] No unsigned mandatory documents for active athletes.");
    return new Response(
      JSON.stringify({ sent: 0, skipped: 0, message: "All clear" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  console.log(`[doc-cron] Found ${agreements.length} unsigned mandatory agreements.`);

  for (const agreement of agreements) {
    const doc = agreement.documents;
    const athlete = agreement.athletes;
    const daysOutstanding = Math.floor(
      (now.getTime() - new Date(agreement.assigned_at).getTime()) / (1000 * 60 * 60 * 24)
    );

    const rule = ESCALATION_RULES.find(
      (r) => daysOutstanding >= r.minDays && daysOutstanding <= r.maxDays
    );

    if (!rule) {
      if (daysOutstanding > 20) {
        console.log(`[doc-cron] ${athlete.display_name} / "${doc.title}" / ${daysOutstanding}d outstanding / MANUAL ACTION REQUIRED`);
      }
      totalSkipped++;
      continue;
    }

    const { count: existingCount } = await supabase
      .from("document_notification_log")
      .select("id", { count: "exact", head: true })
      .eq("agreement_id", agreement.id)
      .eq("notification_type", rule.type);

    if ((existingCount || 0) >= rule.maxSends) {
      totalSkipped++;
      continue;
    }

    // Rate-limit: never email the same parent more than once per 48 hours
    if (agreement.last_notified_at) {
      const hoursSinceLastNotify = Math.floor(
        (now.getTime() - new Date(agreement.last_notified_at).getTime()) / (1000 * 60 * 60)
      );
      if (hoursSinceLastNotify < 48) {
        totalSkipped++;
        continue;
      }
    }

    // ── Build link + email ──────────────────────────────
    const destination = documentDeepLink(doc.slug, agreement.id);
    const link = await mintPortalLink(supabase, agreement.parent_email, destination);
    if (link.oneTap) totalOneTap++;
    const parentFirstName = agreement.parent_email.split("@")[0];

    const email = buildCronEmail({
      type: rule.type,
      parentName: parentFirstName,
      athleteName: athlete.display_name,
      documentTitle: doc.title,
      daysOutstanding,
      link,
    });

    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
          // Idempotency: one send per agreement + type + calendar day.
          "Idempotency-Key": `doc-cron/${agreement.id}/${rule.type}/${now.toISOString().slice(0, 10)}`,
        },
        body: JSON.stringify({
          from: "Godspeed Basketball <documents@clubgodspeed.com>",
          to: [agreement.parent_email],
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
        notification_type: rule.type,
        recipient_email: agreement.parent_email,
        subject: email.subject,
        message_preview: email.preview,
        resend_message_id: result.id || null,
      });

      await supabase.from("document_events").insert({
        agreement_id: agreement.id,
        event_type: rule.type === "escalation" || rule.type === "final_warning"
          ? "escalation_sent"
          : "reminder_sent",
        actor_type: "cron",
        event_metadata: {
          notification_type: rule.type,
          days_outstanding: daysOutstanding,
          escalation_label: rule.label,
          resend_message_id: result.id || null,
          one_tap_link: link.oneTap,
        },
      });

      const updates: Record<string, unknown> = {
        last_notified_at: now.toISOString(),
        notification_count: agreement.notification_count + 1,
      };
      if (agreement.status === "pending") {
        updates.status = "notified";
        if (agreement.notification_count === 0) {
          updates.first_notified_at = now.toISOString();
        }
      }
      await supabase.from("user_agreements").update(updates).eq("id", agreement.id);

      totalSent++;
      console.log(
        `[doc-cron] Sent ${rule.type} for "${doc.title}" (${athlete.display_name}) ` +
        `${daysOutstanding}d outstanding, one_tap=${link.oneTap}`
      );
    } catch (err) {
      console.error(`[doc-cron] Failed to send for agreement ${agreement.id}:`, errMessage(err));
      totalErrors++;
    }
  }

  const summary = {
    sent: totalSent,
    one_tap: totalOneTap,
    skipped: totalSkipped,
    errors: totalErrors,
    total_unsigned: agreements.length,
    run_at: now.toISOString(),
  };

  console.log("[doc-cron] Complete:", JSON.stringify(summary));

  return new Response(JSON.stringify(summary), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

// ── Email builder ─────────────────────────────────────────
interface CronEmailContext {
  type: string;
  parentName: string;
  athleteName: string;
  documentTitle: string;
  daysOutstanding: number;
  link: PortalLink;
}

function buildCronEmail(ctx: CronEmailContext): { subject: string; html: string; preview: string } {
  const messages: Record<string, { subject: string; body: string; preview: string; cta: string }> = {
    initial: {
      subject: `New document for ${ctx.athleteName}: ${ctx.documentTitle}`,
      preview: `A new required document is ready for you to sign.`,
      cta: "OPEN AND SIGN",
      body: `
        <p>A new document, <strong>${ctx.documentTitle}</strong>, is ready in
        ${ctx.athleteName}'s Parent Portal. It needs your signature.</p>
        <p>Tap the button. It signs you in and opens the document. It takes about a minute.</p>
      `,
    },

    reminder: {
      subject: `Reminder: ${ctx.documentTitle} needs your signature`,
      preview: `${ctx.athleteName}'s ${ctx.documentTitle} is still waiting. ${ctx.daysOutstanding} days.`,
      cta: "SIGN NOW",
      body: `
        <p>Quick follow-up. <strong>${ctx.documentTitle}</strong> for
        ${ctx.athleteName} has been waiting ${ctx.daysOutstanding} days
        and still needs your signature.</p>
        <p>Tap the button below. It signs you in and opens the document. About 60 seconds.</p>
      `,
    },

    escalation: {
      subject: `Urgent: ${ctx.athleteName}'s Playing Time. Action Required`,
      preview: `${ctx.athleteName}'s playing time is at risk. Unsigned document: ${ctx.documentTitle}.`,
      cta: "SIGN NOW AND PROTECT PLAYING TIME",
      body: `
        <div style="background:#fef2f2;border:1px solid #fca5a5;padding:16px;border-radius:8px;margin-bottom:16px;">
          <strong style="color:#dc2626;">Playing Time at Risk</strong>
          <p style="margin:8px 0 0;">Per Godspeed Basketball policy, players with unsigned
          required documents may have <strong>limited or no playing time</strong> until
          all documents are signed.</p>
        </div>
        <p><strong>${ctx.documentTitle}</strong> for ${ctx.athleteName} has been waiting
        <strong>${ctx.daysOutstanding} days</strong>.</p>
        <p>We want ${ctx.athleteName} on the court. Tap the button to sign.</p>
      `,
    },

    final_warning: {
      subject: `FINAL NOTICE: ${ctx.athleteName}. Roster Eligibility at Risk`,
      preview: `Final notice: ${ctx.athleteName} faces roster removal without a signed ${ctx.documentTitle}.`,
      cta: "SIGN NOW",
      body: `
        <div style="background:#1f2937;color:#fff;padding:20px;border-radius:8px;margin-bottom:16px;">
          <strong style="font-size:16px;">FINAL NOTICE</strong>
          <p style="margin:8px 0 0;color:#d1d5db;">${ctx.athleteName} has an unsigned
          required document, <strong>${ctx.documentTitle}</strong>, waiting for
          <strong>${ctx.daysOutstanding} days</strong>.</p>
          <p style="margin:8px 0 0;color:#fca5a5;">Without action within 48 hours,
          ${ctx.athleteName} may be moved to inactive roster status.</p>
        </div>
        <p>If something is stopping you from signing, reply to this email or text
        Coach Scott. We want to keep ${ctx.athleteName} eligible.</p>
      `,
    },
  };

  const msg = messages[ctx.type] || messages.reminder;

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
