// ============================================================
// Supabase Edge Function: document-reminder-cron
// Automated document compliance reminders.
// Runs Tues & Thurs at 7:00 AM Denver via pg_cron.
//
// Contract (v3, 2026-09-15): ONE email per parent per PLAYER per run.
//   1. rpc reminder_candidates() (v21_01): unsigned, mandatory, active
//      athlete, parent still linked, not covered by a co-guardian's signature.
//   2. Per agreement: escalation rule by days outstanding, max sends per rule,
//      48-hour per-agreement quiet period. Agreements that fail any check are
//      skipped; the rest are grouped by parent_email + athlete_id.
//   3. Per parent: mint ONE sign-in link for the whole run (token_hash form,
//      verified by the portal page) and reuse it in every email to that
//      parent. Per group: one email listing every document due for THAT player
//      only, never another player, with the tone of the most urgent document.
//   4. Send via Resend; idempotent per parent + player + calendar day.
//   5. Log every agreement in the group to document_notification_log and
//      document_events with the shared Resend id, and bump user_agreements.
//
// Why v3: v2 sent one email per document and minted a fresh link for each.
// Supabase keeps only the newest link per user, so a parent with five
// documents received five emails and four dead buttons (seen 2026-09-15).
//
// Secrets required:
//   RESEND_API_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL
// Optional: SITE_URL (default https://www.clubgodspeed.com)
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { documentsTabLink, linkHelpCopy, mintPortalLink, type PortalLink } from "../_shared/portal-signin-link.ts";
import { sendParentEmail } from "../_shared/parent-comms.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function esc(s: string): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

// ── Escalation ladder ─────────────────────────────────────
const ESCALATION_RULES = [
  { minDays: 0,  maxDays: 2,  type: "initial",       maxSends: 1, label: "New document",        rank: 0 },
  { minDays: 3,  maxDays: 6,  type: "reminder",      maxSends: 1, label: "Friendly reminder",   rank: 1 },
  { minDays: 7,  maxDays: 13, type: "escalation",    maxSends: 2, label: "Playing time warning", rank: 2 },
  { minDays: 14, maxDays: 20, type: "final_warning", maxSends: 1, label: "Final notice",        rank: 3 },
  // After 21 days: stop emailing, flag for manual admin action
] as const;
type Rule = typeof ESCALATION_RULES[number];

interface DueItem {
  agreementId: string;
  documentId: string;
  documentTitle: string;
  documentSlug: string;
  athleteId: string;
  athleteName: string;
  daysOutstanding: number;
  rule: Rule;
  status: string;
  notificationCount: number;
}

serve(async (_req: Request) => {
  console.log("[doc-cron] Starting document reminder run (v3, one email per parent per player)...");

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  let totalSent = 0;        // emails sent (one per parent per player)
  let totalAgreements = 0;  // agreements covered by those emails
  let totalSkipped = 0;
  let totalErrors = 0;
  let totalOneTap = 0;

  // Who still has to sign is decided by Postgres (v21_01 reminder_candidates):
  // unsigned, mandatory, active athlete, parent still linked, and NOT already
  // covered by another guardian's signature (unless the document requires
  // each guardian). Same rule the portal uses, so a parent is never emailed
  // about a document the portal shows as done.
  const { data: rows, error } = await supabase.rpc("reminder_candidates");
  const agreements = (rows ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    parent_user_id: r.parent_user_id as string,
    parent_email: r.parent_email as string,
    athlete_id: r.athlete_id as string,
    status: r.status as string,
    assigned_at: r.assigned_at as string,
    notification_count: (r.notification_count as number) ?? 0,
    last_notified_at: r.last_notified_at as string | null,
    documents: { id: r.document_id as string, title: r.document_title as string, slug: r.document_slug as string },
    athletes: { id: r.athlete_id as string, display_name: r.athlete_name as string },
  }));

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

  console.log(`[doc-cron] Found ${agreements.length} agreements that still need this parent's signature.`);

  // ── Pass 1: decide per agreement, group by parent + player ─
  // Key is "<parent_email>|<athlete_id>" so an email is only ever about one
  // player. A parent with two players gets two emails (same link).
  const groups = new Map<string, DueItem[]>();

  for (const agreement of agreements) {
    const doc = agreement.documents;
    const athlete = agreement.athletes;
    const parentEmail = String(agreement.parent_email || "").trim().toLowerCase();
    if (!parentEmail) { totalSkipped++; continue; }

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

    // Quiet period: never nag about the same document more than once per 48 hours
    if (agreement.last_notified_at) {
      const hoursSinceLastNotify = Math.floor(
        (now.getTime() - new Date(agreement.last_notified_at).getTime()) / (1000 * 60 * 60)
      );
      if (hoursSinceLastNotify < 48) {
        totalSkipped++;
        continue;
      }
    }

    const key = `${parentEmail}|${athlete.id}`;
    const list = groups.get(key) ?? [];
    list.push({
      agreementId: agreement.id,
      documentId: doc.id,
      documentTitle: doc.title,
      documentSlug: doc.slug,
      athleteId: athlete.id,
      athleteName: athlete.display_name,
      daysOutstanding,
      rule,
      status: agreement.status,
      notificationCount: agreement.notification_count,
    });
    groups.set(key, list);
  }

  const parentCount = new Set(Array.from(groups.keys()).map((k) => k.split("|")[0])).size;
  console.log(`[doc-cron] ${groups.size} emails to send across ${parentCount} parents.`);

  // ── Pass 2: one email per parent + player ─────────────────
  // One sign-in link per parent for the whole run. Minting a second link for
  // the same parent would kill the first one (Supabase keeps only the newest).
  const linkByParent = new Map<string, PortalLink>();

  for (const [key, items] of groups) {
    const parentEmail = key.split("|")[0];
    // Most urgent document sets the tone. Ties: longest outstanding first.
    items.sort((a, b) => (b.rule.rank - a.rule.rank) || (b.daysOutstanding - a.daysOutstanding));
    const lead = items[0];

    let link = linkByParent.get(parentEmail);
    if (!link) {
      link = await mintPortalLink(supabase, parentEmail, documentsTabLink());
      linkByParent.set(parentEmail, link);
      if (link.oneTap) totalOneTap++;
    }

    const email = buildCronEmail({
      type: lead.rule.type,
      parentName: parentEmail.split("@")[0],
      items,
      link,
    });

    try {
      const result = await sendParentEmail({
        source: "document-reminder-cron",
        purpose: lead.rule.type,
        trigger: "cron",
        to: parentEmail,
        athleteId: lead.athleteId ?? null,
        subject: email.subject,
        html: email.html,
        from: "Godspeed Basketball <documents@clubgodspeed.com>",
        // Idempotency: one send per parent + player + calendar day.
        idempotencyKey: `doc-cron/v3/${parentEmail}/${lead.athleteId}/${today}`,
      });

      if (!result.ok) {
        throw new Error(`resend_send_failed: ${result.error ?? "send failed"}`);
      }

      for (const it of items) {
        await supabase.from("document_notification_log").insert({
          agreement_id: it.agreementId,
          document_id: it.documentId,
          notification_type: it.rule.type,
          recipient_email: parentEmail,
          subject: email.subject,
          message_preview: email.preview,
          resend_message_id: result.providerMessageId || null,
        });

        await supabase.from("document_events").insert({
          agreement_id: it.agreementId,
          event_type: it.rule.type === "escalation" || it.rule.type === "final_warning"
            ? "escalation_sent"
            : "reminder_sent",
          actor_type: "cron",
          event_metadata: {
            notification_type: it.rule.type,
            days_outstanding: it.daysOutstanding,
            escalation_label: it.rule.label,
            resend_message_id: result.providerMessageId || null,
            one_tap_link: link.oneTap,
            batched_documents: items.length,
          },
        });

        const updates: Record<string, unknown> = {
          last_notified_at: now.toISOString(),
          notification_count: it.notificationCount + 1,
        };
        if (it.status === "pending") {
          updates.status = "notified";
          if (it.notificationCount === 0) {
            updates.first_notified_at = now.toISOString();
          }
        }
        await supabase.from("user_agreements").update(updates).eq("id", it.agreementId);
      }

      totalSent++;
      totalAgreements += items.length;
      console.log(
        `[doc-cron] Sent ${lead.rule.type} for ${lead.athleteName}: ` +
        `${items.length} document(s), one_tap=${link.oneTap}`
      );
    } catch (err) {
      console.error(`[doc-cron] Failed to send to parent (${items.length} agreements):`, errMessage(err));
      totalErrors++;
    }
  }

  const summary = {
    sent: totalSent,
    parents: parentCount,
    agreements_covered: totalAgreements,
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
  items: DueItem[];
  link: PortalLink;
}

function buildCronEmail(ctx: CronEmailContext): { subject: string; html: string; preview: string } {
  const n = ctx.items.length;
  // Every item in ctx.items is for the same player (grouped upstream).
  const athleteText = ctx.items[0].athleteName;
  const oldest = Math.max(...ctx.items.map((i) => i.daysOutstanding));
  const docWord = n === 1 ? "document" : "documents";
  const countText = n === 1 ? `1 ${docWord}` : `${n} ${docWord}`;

  const listHtml = `
    <ul style="padding-left:20px;margin:12px 0 0;">
      ${ctx.items.map((i) => `<li style="margin:6px 0;"><strong>${esc(i.documentTitle)}</strong>${i.daysOutstanding >= 3 ? ` <span style="color:#6b7280;">(waiting ${i.daysOutstanding} days)</span>` : ""}</li>`).join("")}
    </ul>`;

  const messages: Record<string, { subject: string; body: string; preview: string; cta: string }> = {
    initial: {
      subject: n === 1 ? `New document for ${athleteText}: ${ctx.items[0].documentTitle}` : `${countText} to sign for ${athleteText}`,
      preview: n === 1 ? `A new required document is ready for you to sign.` : `${countText} are ready for your signature.`,
      cta: n === 1 ? "OPEN AND SIGN" : "SIGN MY DOCUMENTS",
      body: `
        <p>${n === 1 ? "A new document is" : `${countText} are`} ready in ${esc(athleteText)}'s Parent Portal and need${n === 1 ? "s" : ""} your signature:</p>
        ${listHtml}
        <p>Tap the button. It signs you in and opens your documents. Each one takes about a minute.</p>
      `,
    },

    reminder: {
      subject: n === 1 ? `Reminder: ${ctx.items[0].documentTitle} needs your signature` : `Reminder: ${countText} need your signature`,
      preview: `${athleteText}: ${countText} still waiting. ${oldest} days.`,
      cta: "SIGN NOW",
      body: `
        <p>Quick follow-up. ${n === 1 ? "This document for" : "These documents for"} ${esc(athleteText)} ${n === 1 ? "has" : "have"} been waiting and still need${n === 1 ? "s" : ""} your signature:</p>
        ${listHtml}
        <p>Tap the button below. It signs you in and opens your documents. About 60 seconds each.</p>
      `,
    },

    escalation: {
      subject: `Urgent: ${athleteText}'s Playing Time. Action Required`,
      preview: `${athleteText}'s playing time is at risk. ${countText} unsigned.`,
      cta: "SIGN NOW AND PROTECT PLAYING TIME",
      body: `
        <div style="background:#fef2f2;border:1px solid #fca5a5;padding:16px;border-radius:8px;margin-bottom:16px;">
          <strong style="color:#dc2626;">Playing Time at Risk</strong>
          <p style="margin:8px 0 0;">Per Godspeed Basketball policy, players with unsigned
          required documents may have <strong>limited or no playing time</strong> until
          all documents are signed.</p>
        </div>
        <p>Still unsigned for ${esc(athleteText)} (longest waiting: <strong>${oldest} days</strong>):</p>
        ${listHtml}
        <p>We want ${esc(athleteText)} on the court. Tap the button to sign.</p>
      `,
    },

    final_warning: {
      subject: `FINAL NOTICE: ${athleteText}. Roster Eligibility at Risk`,
      preview: `Final notice: ${athleteText} faces roster removal. ${countText} unsigned.`,
      cta: "SIGN NOW",
      body: `
        <div style="background:#1f2937;color:#fff;padding:20px;border-radius:8px;margin-bottom:16px;">
          <strong style="font-size:16px;">FINAL NOTICE</strong>
          <p style="margin:8px 0 0;color:#d1d5db;">${esc(athleteText)} has ${countText} unsigned,
          the oldest waiting <strong>${oldest} days</strong>.</p>
          <p style="margin:8px 0 0;color:#fca5a5;">Without action within 48 hours,
          ${esc(athleteText)} may be moved to inactive roster status.</p>
        </div>
        ${listHtml}
        <p>If something is stopping you from signing, reply to this email or text
        Coach Scott. We want to keep ${esc(athleteText)} eligible.</p>
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
        Hey ${esc(ctx.parentName)},
      </p>

      <div style="font-size:16px;line-height:1.6;color:#111;">
        ${msg.body}
      </div>

      <a href="${ctx.link.url}" style="display:inline-block;background:#000;color:#fff;padding:16px 32px;border-radius:6px;font-weight:700;font-size:14px;text-transform:uppercase;text-decoration:none;letter-spacing:0.05em;margin:24px 0;">
        ${msg.cta}
      </a>

      <p style="font-size:13px;line-height:1.5;color:#6b7280;margin-top:8px;">
        ${linkHelpCopy(ctx.link, athleteText)}
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
