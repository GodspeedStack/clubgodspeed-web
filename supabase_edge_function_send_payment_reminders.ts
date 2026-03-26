// ============================================================
// Supabase Edge Function: send-payment-reminders
// Cron-triggered (daily) — finds upcoming/overdue installments
// and sends humanized reminder emails via Resend.
//
// Deploy: supabase functions deploy send-payment-reminders
// Schedule: Run daily via Supabase cron or external scheduler
//   e.g. pg_cron: SELECT cron.schedule('payment-reminders', '0 10 * * *',
//     $$SELECT net.http_post(...)$$);
//
// Secrets required:
//   RESEND_API_KEY
//   SUPABASE_SERVICE_ROLE_KEY
//   SUPABASE_URL
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;

// ── Reminder schedule configuration ───────────────────────
// Controls when reminders fire relative to due_date.
// max_reminders prevents spamming — once hit, no more for that type.
const REMINDER_RULES = [
  { type: "upcoming",     daysFromDue: -5,  maxReminders: 1 },
  { type: "due_today",    daysFromDue: 0,   maxReminders: 1 },
  { type: "grace_period", daysFromDue: 3,   maxReminders: 1 },
  { type: "past_due",     daysFromDue: 7,   maxReminders: 2 },
  { type: "final_notice", daysFromDue: 14,  maxReminders: 1 },
] as const;

serve(async (req: Request) => {
  // Allow manual trigger via POST or cron via GET
  console.log("[reminders] Starting payment reminder run...");

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split("T")[0];

  let totalSent = 0;
  let totalSkipped = 0;

  // ── Fetch all pending/grace_period installments ─────────
  const { data: installments, error } = await supabase
    .from("dues_installments")
    .select(`
      id, enrollment_id, installment_number, amount, due_date, status,
      reminder_sent_at, reminder_count,
      parent_dues_enrollment!inner(
        id, parent_email, parent_name, athlete_name, total_owed, total_paid, status,
        season_dues_config!inner(season, program),
        payment_plan_templates!inner(plan_name, num_installments)
      )
    `)
    .in("status", ["pending", "grace_period", "past_due"])
    .eq("parent_dues_enrollment.status", "active");

  if (error) {
    console.error("[reminders] Failed to fetch installments:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  if (!installments || installments.length === 0) {
    console.log("[reminders] No pending installments found.");
    return new Response(JSON.stringify({ sent: 0, skipped: 0 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ── Process each installment against reminder rules ─────
  for (const inst of installments) {
    const dueDate = new Date(inst.due_date + "T00:00:00Z");
    const daysDiff = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
    const enrollment = inst.parent_dues_enrollment;

    // Find the applicable reminder rule
    const rule = findApplicableRule(daysDiff);
    if (!rule) {
      totalSkipped++;
      continue;
    }

    // Check if we already sent this reminder type for this installment
    const { count: existingCount } = await supabase
      .from("dues_reminder_log")
      .select("id", { count: "exact", head: true })
      .eq("installment_id", inst.id)
      .eq("reminder_type", rule.type);

    if ((existingCount || 0) >= rule.maxReminders) {
      totalSkipped++;
      continue;
    }

    // ── Build the reminder email ──────────────────────────
    const email = buildReminderEmail({
      type: rule.type,
      parentName: enrollment.parent_name || "Parent",
      athleteName: enrollment.athlete_name || "your athlete",
      amount: inst.amount,
      dueDate: inst.due_date,
      installmentNumber: inst.installment_number,
      totalInstallments: enrollment.payment_plan_templates.num_installments,
      planName: enrollment.payment_plan_templates.plan_name,
      season: enrollment.season_dues_config.season,
      program: enrollment.season_dues_config.program,
      totalOwed: enrollment.total_owed,
      totalPaid: enrollment.total_paid,
      daysPastDue: Math.max(0, daysDiff),
    });

    // ── Send via Resend ───────────────────────────────────
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: "Godspeed Basketball <dues@clubgodspeed.com>",
          to: [enrollment.parent_email],
          subject: email.subject,
          html: email.html,
        }),
      });

      const result = await res.json();

      // Log the reminder
      await supabase.from("dues_reminder_log").insert({
        enrollment_id: enrollment.id,
        installment_id: inst.id,
        reminder_type: rule.type,
        recipient_email: enrollment.parent_email,
        subject: email.subject,
        message_preview: email.preview,
        resend_message_id: result.id || null,
      });

      // Update installment reminder tracking
      // Only escalate status — never downgrade (e.g. past_due should not revert to grace_period)
      const STATUS_RANK: Record<string, number> = { pending: 0, grace_period: 1, past_due: 2 };
      const computedStatus = daysDiff > 3 ? "past_due" : daysDiff > 0 ? "grace_period" : inst.status;
      const newStatus = (STATUS_RANK[computedStatus] || 0) >= (STATUS_RANK[inst.status] || 0)
        ? computedStatus
        : inst.status;

      await supabase
        .from("dues_installments")
        .update({
          reminder_sent_at: new Date().toISOString(),
          reminder_count: inst.reminder_count + 1,
          status: newStatus,
        })
        .eq("id", inst.id);

      totalSent++;
      console.log(`[reminders] Sent ${rule.type} to ${enrollment.parent_email} for installment #${inst.installment_number}`);
    } catch (err) {
      console.error(`[reminders] Failed to send to ${enrollment.parent_email}:`, err);
    }
  }

  console.log(`[reminders] Complete — sent: ${totalSent}, skipped: ${totalSkipped}`);
  return new Response(
    JSON.stringify({ sent: totalSent, skipped: totalSkipped }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});

// ── Find the matching reminder rule for a given day offset ─
function findApplicableRule(daysDiff: number) {
  // daysDiff: negative = before due, 0 = due day, positive = past due
  if (daysDiff >= 14)  return REMINDER_RULES.find(r => r.type === "final_notice");
  if (daysDiff >= 7)   return REMINDER_RULES.find(r => r.type === "past_due");
  if (daysDiff >= 1 && daysDiff <= 3) return REMINDER_RULES.find(r => r.type === "grace_period");
  if (daysDiff === 0)  return REMINDER_RULES.find(r => r.type === "due_today");
  if (daysDiff === -5) return REMINDER_RULES.find(r => r.type === "upcoming");
  return null;
}

// ── Build humanized reminder email ─────────────────────────
interface ReminderContext {
  type: string;
  parentName: string;
  athleteName: string;
  amount: number;
  dueDate: string;
  installmentNumber: number;
  totalInstallments: number;
  planName: string;
  season: string;
  program: string;
  totalOwed: number;
  totalPaid: number;
  daysPastDue: number;
}

function buildReminderEmail(ctx: ReminderContext): { subject: string; html: string; preview: string } {
  const firstName = ctx.parentName.split(" ")[0];
  const dueDateFormatted = new Date(ctx.dueDate + "T00:00:00Z").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const remaining = Math.max(0, ctx.totalOwed - ctx.totalPaid);
  const payUrl = "https://clubgodspeed.com/season-dues.html";

  // ── Message variants by type ────────────────────────────
  // Written to feel like a real person, not an invoice bot.
  const messages: Record<string, { subject: string; body: string; preview: string }> = {
    upcoming: {
      subject: `Heads up — ${ctx.athleteName}'s next payment is coming up`,
      preview: `Payment #${ctx.installmentNumber} of $${ctx.amount.toFixed(2)} is due ${dueDateFormatted}.`,
      body: `
        <p>Just a quick heads up — ${ctx.athleteName}'s next payment of
        <strong>$${ctx.amount.toFixed(2)}</strong> is coming up on
        <strong>${dueDateFormatted}</strong>.</p>
        <p>This is installment ${ctx.installmentNumber} of ${ctx.totalInstallments}
        on the ${ctx.planName}. Nothing urgent, just wanted to make sure it's on your radar
        so there are no surprises.</p>
      `,
    },

    due_today: {
      subject: `${ctx.athleteName}'s payment is due today`,
      preview: `$${ctx.amount.toFixed(2)} due today for ${ctx.program} — ${ctx.season}.`,
      body: `
        <p>Today's the day — ${ctx.athleteName}'s installment of
        <strong>$${ctx.amount.toFixed(2)}</strong> for ${ctx.program} is due.</p>
        <p>You can take care of it in about 30 seconds through the link below.
        If you've already paid, just ignore this — it can take a moment to sync up.</p>
      `,
    },

    grace_period: {
      subject: `Friendly reminder — ${ctx.athleteName}'s payment was due recently`,
      preview: `$${ctx.amount.toFixed(2)} was due ${dueDateFormatted}. Just following up.`,
      body: `
        <p>Hey ${firstName} — just following up. ${ctx.athleteName}'s payment of
        <strong>$${ctx.amount.toFixed(2)}</strong> was due on ${dueDateFormatted}
        and we haven't seen it come through yet.</p>
        <p>No stress at all — things get busy. If you can take a minute to handle it
        through the link below, that would be great. And if there's anything going on
        that's making it tough, just let Coach Scott know. We'll figure it out together.</p>
      `,
    },

    past_due: {
      subject: `Action needed — ${ctx.athleteName}'s balance is past due`,
      preview: `$${ctx.amount.toFixed(2)} was due ${ctx.daysPastDue} days ago.`,
      body: `
        <p>${firstName}, we wanted to reach out because ${ctx.athleteName}'s payment of
        <strong>$${ctx.amount.toFixed(2)}</strong> is now ${ctx.daysPastDue} days past due.</p>
        <p>We want to make sure ${ctx.athleteName} can keep training and competing with
        the team without interruption. If there's a situation we should know about,
        please reach out to Coach Scott — we've worked with families on adjusted
        arrangements before, and we're happy to do the same for you.</p>
        <p>If you can get this taken care of, here's the link:</p>
      `,
    },

    final_notice: {
      subject: `Important — ${ctx.athleteName}'s season dues require attention`,
      preview: `Outstanding balance of $${remaining.toFixed(2)} for ${ctx.season}.`,
      body: `
        <p>${firstName}, this is a final notice regarding ${ctx.athleteName}'s
        outstanding balance of <strong>$${remaining.toFixed(2)}</strong> for the
        ${ctx.season} season.</p>
        <p>We genuinely value ${ctx.athleteName} being part of the Godspeed family,
        and we want to keep it that way. But we do need to get the dues current
        to keep everything running smoothly for the whole team.</p>
        <p>If you need to discuss a modified arrangement, Coach Scott is available
        and happy to talk. Otherwise, please take care of the balance as soon as possible:</p>
      `,
    },
  };

  const msg = messages[ctx.type] || messages.upcoming;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px;">
      <div style="font-size: 20px; font-weight: 700; margin-bottom: 24px;">
        GODSPEED<span style="color: #2563eb;">BASKETBALL</span>
      </div>

      <p style="font-size: 16px; line-height: 1.6; color: #111;">
        Hey ${firstName},
      </p>

      <div style="font-size: 16px; line-height: 1.6; color: #111;">
        ${msg.body}
      </div>

      <a href="${payUrl}" style="display: inline-block; background: #000; color: #fff; padding: 14px 28px; border-radius: 6px; font-weight: 700; font-size: 14px; text-transform: uppercase; text-decoration: none; letter-spacing: 0.05em; margin: 20px 0;">
        Make Payment
      </a>

      <div style="background: #f8fafc; border-radius: 8px; padding: 16px 20px; margin: 20px 0;">
        <table style="width: 100%; font-size: 14px; color: #374151; border-collapse: collapse;">
          <tr>
            <td style="padding: 4px 0; color: #6b7280;">Season</td>
            <td style="padding: 4px 0; text-align: right; font-weight: 600;">${ctx.season}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #6b7280;">Program</td>
            <td style="padding: 4px 0; text-align: right; font-weight: 600;">${ctx.program}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #6b7280;">This Payment</td>
            <td style="padding: 4px 0; text-align: right; font-weight: 600;">$${ctx.amount.toFixed(2)}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #6b7280;">Remaining Balance</td>
            <td style="padding: 4px 0; text-align: right; font-weight: 700; color: #111;">$${remaining.toFixed(2)}</td>
          </tr>
        </table>
      </div>

      <p style="font-size: 14px; line-height: 1.6; color: #6b7280; margin-top: 24px;">
        Questions? Just reply to this email or text Coach Scott.
      </p>

      <div style="border-top: 1px solid #e5e7eb; margin-top: 32px; padding-top: 16px; font-size: 12px; color: #9ca3af;">
        Godspeed Basketball Academy — Brotherhood. Habits. Success.
      </div>
    </div>
  `;

  return { subject: msg.subject, html, preview: msg.preview };
}
