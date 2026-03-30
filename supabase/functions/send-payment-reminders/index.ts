/**
 * send-payment-reminders
 *
 * Daily cron — finds pending installments with approaching or past due dates,
 * resolves ALL parents linked to the athlete (not just the plan creator),
 * enforces a 48-hour per-parent rate limit, then sends branded Resend emails.
 *
 * Reminder ladder:
 *   7 days before  → "Payment coming up"
 *   1 day before   → "Payment due tomorrow"
 *   Due today      → "Payment due today"
 *   3 days overdue → "Payment overdue"
 *   7 days overdue → "Final notice"
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY  = Deno.env.get('RESEND_API_KEY')!
const SUPABASE_URL    = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const FROM_EMAIL      = 'Godspeed Basketball <noreply@clubgodspeed.com>'
const RATE_LIMIT_HRS  = 48

type ReminderType = '7_day' | '1_day' | 'due_today' | '3_day_overdue' | '7_day_overdue'

interface PendingPayment {
  payment_id: string
  plan_id: string
  parent_id: string
  amount: number
  due_date: string
  installment_number: number
  player_name: string
  plan_type: string
}

interface LinkedParent {
  profile_id: string
  email: string
  full_name: string
}

function classifyReminder(dueDateStr: string): ReminderType | null {
  const due  = new Date(dueDateStr)
  const now  = new Date()
  // Compare calendar days only
  const msPerDay = 86_400_000
  const diffDays = Math.round((due.getTime() - now.getTime()) / msPerDay)

  if (diffDays === 7)  return '7_day'
  if (diffDays === 1)  return '1_day'
  if (diffDays === 0)  return 'due_today'
  if (diffDays === -3) return '3_day_overdue'
  if (diffDays === -7) return '7_day_overdue'
  return null
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric'
  })
}

function formatCurrency(amount: number): string {
  return '$' + amount.toFixed(2)
}

function buildEmailHTML(
  parentName: string,
  playerName: string,
  reminderType: ReminderType,
  amount: number,
  dueDate: string,
  installmentNumber: number,
  planType: string
): string {
  const amountStr  = formatCurrency(amount)
  const dateStr    = formatDate(dueDate)
  const planLabel  = planType === 'full' ? 'Pay in Full'
    : planType === '2-installment' ? '2-Installment Plan'
    : '3-Installment Plan'

  const subjects: Record<ReminderType, { headline: string; subline: string; urgency: string }> = {
    '7_day':         { headline: 'Payment Due in 7 Days',  subline: `Your upcoming payment of ${amountStr} is due on ${dateStr}.`,       urgency: '#2563eb' },
    '1_day':         { headline: 'Payment Due Tomorrow',   subline: `${amountStr} is due tomorrow, ${dateStr}.`,                          urgency: '#f59e0b' },
    'due_today':     { headline: 'Payment Due Today',      subline: `${amountStr} is due today. Pay now to stay current.`,                urgency: '#ef4444' },
    '3_day_overdue': { headline: 'Payment Overdue — 3 Days', subline: `${amountStr} was due on ${dateStr}. Please pay as soon as possible.`, urgency: '#dc2626' },
    '7_day_overdue': { headline: 'Final Notice — Payment Overdue', subline: `${amountStr} is 7 days past due. Please contact us immediately.`, urgency: '#991b1b' },
  }

  const { headline, subline, urgency } = subjects[reminderType]
  const firstName = (parentName || '').split(' ')[0] || 'Parent'

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Inter',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr><td style="background:#0a0a0a;padding:28px 32px;">
          <div style="font-size:11px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:#6b7280;">Godspeed Basketball</div>
          <div style="font-size:22px;font-weight:900;color:#ffffff;margin-top:6px;letter-spacing:-0.02em;">${headline}</div>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:32px;">
          <p style="margin:0 0 20px;font-size:15px;color:#374151;">Hi ${firstName},</p>
          <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6;">${subline}</p>

          <!-- Payment Details Card -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:12px;border:1px solid #e5e7eb;margin-bottom:28px;">
            <tr><td style="padding:20px 24px;">
              <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#9ca3af;margin-bottom:16px;">Payment Details</div>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-size:13px;color:#6b7280;padding-bottom:10px;">Athlete</td>
                  <td style="font-size:13px;font-weight:700;color:#111;text-align:right;padding-bottom:10px;">${playerName}</td>
                </tr>
                <tr>
                  <td style="font-size:13px;color:#6b7280;padding-bottom:10px;">Plan</td>
                  <td style="font-size:13px;font-weight:700;color:#111;text-align:right;padding-bottom:10px;">${planLabel}</td>
                </tr>
                <tr>
                  <td style="font-size:13px;color:#6b7280;padding-bottom:10px;">Installment</td>
                  <td style="font-size:13px;font-weight:700;color:#111;text-align:right;padding-bottom:10px;">#${installmentNumber}</td>
                </tr>
                <tr>
                  <td style="font-size:13px;color:#6b7280;padding-bottom:10px;">Due Date</td>
                  <td style="font-size:13px;font-weight:700;color:#111;text-align:right;padding-bottom:10px;">${dateStr}</td>
                </tr>
                <tr style="border-top:1px solid #e5e7eb;">
                  <td style="font-size:16px;font-weight:800;color:#111;padding-top:14px;">Amount Due</td>
                  <td style="font-size:20px;font-weight:900;color:${urgency};text-align:right;padding-top:14px;">${amountStr}</td>
                </tr>
              </table>
            </td></tr>
          </table>

          <!-- CTA -->
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center">
              <a href="https://www.clubgodspeed.com/parent-portal.html"
                 style="display:inline-block;background:#0a0a0a;color:#ffffff;text-decoration:none;
                        font-size:14px;font-weight:800;letter-spacing:0.05em;text-transform:uppercase;
                        padding:14px 36px;border-radius:10px;">
                Pay Now &rarr;
              </a>
            </td></tr>
          </table>

          <p style="margin:28px 0 0;font-size:13px;color:#9ca3af;line-height:1.6;">
            Questions? Reply to this email or visit your parent portal.<br>
            &mdash; Godspeed Basketball Coaching Staff
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 32px;text-align:center;">
          <p style="margin:0;font-size:11px;color:#9ca3af;">
            Godspeed Basketball &bull; clubgodspeed.com<br>
            You are receiving this because you are listed as a parent/guardian for ${playerName}.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}

function subjectLine(reminderType: ReminderType, playerName: string, amount: number): string {
  const amt = formatCurrency(amount)
  const map: Record<ReminderType, string> = {
    '7_day':         `Upcoming payment of ${amt} for ${playerName} — due in 7 days`,
    '1_day':         `${amt} due tomorrow for ${playerName}`,
    'due_today':     `Payment due today — ${amt} for ${playerName}`,
    '3_day_overdue': `Overdue: ${amt} for ${playerName} (3 days past due)`,
    '7_day_overdue': `FINAL NOTICE: ${amt} for ${playerName} is 7 days overdue`,
  }
  return map[reminderType]
}

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  })
  if (!res.ok) {
    const err = await res.text()
    console.error(`Resend error for ${to}:`, err)
    return false
  }
  return true
}

Deno.serve(async (req) => {
  // Allow manual POST trigger as well as cron
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
    auth: { persistSession: false }
  })

  const now = new Date().toISOString().split('T')[0] // YYYY-MM-DD

  try {
    // 1. Fetch all pending installments within the reminder window (-7..+7 days)
    const { data: payments, error: paymentsErr } = await supabase
      .from('payments')
      .select(`
        id,
        plan_id,
        parent_id,
        amount,
        due_date,
        installment_number,
        payment_plans ( player_name, plan_type )
      `)
      .eq('status', 'pending')
      .gte('due_date', new Date(Date.now() - 7 * 86_400_000).toISOString().split('T')[0])
      .lte('due_date', new Date(Date.now() + 7 * 86_400_000).toISOString().split('T')[0])

    if (paymentsErr) throw paymentsErr
    if (!payments?.length) {
      return new Response(JSON.stringify({ sent: 0, message: 'No payments in window' }), { status: 200 })
    }

    let totalSent = 0
    let totalSkipped = 0

    for (const payment of payments) {
      const reminderType = classifyReminder(payment.due_date)
      if (!reminderType) continue

      const plan = payment.payment_plans as { player_name: string; plan_type: string } | null
      if (!plan) continue

      // 2. Resolve all parents linked to this athlete via parent_player_links.
      //    Primary path: payment.parent_id → parent_player_links → athlete → all linked parents.
      //    Fallback: just the plan creator if no link table entry exists.
      const { data: linkedParents } = await supabase.rpc('get_all_parents_for_parent', {
        p_parent_id: payment.parent_id
      })

      // Build recipient list — deduplicated by email
      const recipients: LinkedParent[] = []
      const seen = new Set<string>()

      if (linkedParents?.length) {
        for (const lp of linkedParents) {
          if (lp.email && !seen.has(lp.email)) {
            seen.add(lp.email)
            recipients.push({ profile_id: lp.profile_id, email: lp.email, full_name: lp.full_name })
          }
        }
      }

      // Always include the plan creator as fallback
      if (!seen.size) {
        const { data: creator } = await supabase
          .from('profiles')
          .select('id, email, full_name')
          .eq('id', payment.parent_id)
          .single()
        if (creator?.email) {
          recipients.push({ profile_id: creator.id, email: creator.email, full_name: creator.full_name || '' })
        }
      }

      // 3. Send to each recipient, enforcing 48-hour rate limit per parent+payment
      for (const recipient of recipients) {
        // Rate limit check: was this parent notified about this payment in the last 48 hrs?
        const cutoff = new Date(Date.now() - RATE_LIMIT_HRS * 3_600_000).toISOString()
        const { data: recentLog } = await supabase
          .from('payment_reminders')
          .select('id')
          .eq('payment_id', payment.id)
          .eq('parent_id', recipient.profile_id)
          .gte('sent_at', cutoff)
          .limit(1)
          .maybeSingle()

        if (recentLog) {
          totalSkipped++
          continue
        }

        const html    = buildEmailHTML(
          recipient.full_name,
          plan.player_name,
          reminderType,
          payment.amount,
          payment.due_date,
          payment.installment_number,
          plan.plan_type
        )
        const subject = subjectLine(reminderType, plan.player_name, payment.amount)
        const ok      = await sendEmail(recipient.email, subject, html)

        if (ok) {
          // Log the send
          await supabase.from('payment_reminders').insert({
            payment_id:    payment.id,
            parent_id:     recipient.profile_id,
            reminder_type: reminderType,
            email_to:      recipient.email,
          })
          totalSent++
        }
      }
    }

    return new Response(
      JSON.stringify({ sent: totalSent, skipped: totalSkipped, payments_checked: payments.length }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('send-payment-reminders fatal:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})
