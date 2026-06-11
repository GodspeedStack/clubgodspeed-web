// fundraiser-engine
// The Godspeed Raise campaign agent. One function owns all
// fundraiser email logic:
//
//   POST {action:'cron'}                      -- daily: cadence emails + admin digest + impact emails
//   POST {action:'donation_receipt', donationId} -- instant thank-you + receipt (called by stripe-webhook)
//   GET  ?action=unsubscribe&token=...        -- one-click contact unsubscribe
//
// Contracts:
//   - fundraiser_email_log is insert-only; it is the idempotency ledger.
//   - A contact never receives more than one email per 48 hours.
//   - Contacts who already donated to a participant leave the ask track.
//   - Receipts make no tax-deductibility claims (LLC, not 501(c)(3)).
//   - Cadence: launch, 14 days left, 7 days left, 2 days left.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const FROM_EMAIL = 'Godspeed Basketball <noreply@clubgodspeed.com>'
const ADMIN_EMAIL = Deno.env.get('ADMIN_EMAIL') || 'jewellsco@gmail.com'
const SITE = 'https://www.clubgodspeed.com'
const MAX_SENDS_PER_RUN = 200
const RATE_LIMIT_HOURS = 48

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ---------------- Email shell (Helvetica Neue, no logo, no emojis) ----------------
function shell(body: string, unsubscribeUrl?: string): string {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f5f7;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;">
<tr><td style="background:#111111;padding:20px 32px;">
  <span style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;letter-spacing:2px;color:#ffffff;">GODSPEED</span>
  <span style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;letter-spacing:2px;color:#3b82f6;">BASKETBALL</span>
</td></tr>
<tr><td style="padding:32px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1d1d1f;">
${body}
</td></tr>
<tr><td style="padding:20px 32px;border-top:1px solid #e5e5ea;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;color:#86868b;letter-spacing:1px;">
BROTHERHOOD. HABITS. SUCCESS.
${unsubscribeUrl ? `<br><br><a href="${unsubscribeUrl}" style="color:#86868b;">Unsubscribe from these updates</a>` : ''}
</td></tr>
</table></td></tr></table></body></html>`
}

function progressBar(raised: number, goal: number): string {
  const pct = Math.min(Math.round((raised / goal) * 100), 100)
  return `<div style="background:#e5e5ea;border-radius:999px;height:10px;margin:8px 0;">
    <div style="background:#2563eb;border-radius:999px;height:10px;width:${pct}%;"></div></div>
    <p style="margin:4px 0 16px;font-size:13px;color:#6e6e73;">$${Number(raised).toLocaleString()} raised of $${Number(goal).toLocaleString()} goal (${pct}%)</p>`
}

const usd = (n: number) => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
const esc = (s: string) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

async function sendEmail(to: string, subject: string, html: string): Promise<string | null> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RESEND_API_KEY}` },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  })
  if (!res.ok) { console.error('resend failed', to, await res.text()); return null }
  const data = await res.json()
  return data.id ?? null
}

async function logEmail(row: Record<string, unknown>) {
  const { error } = await supabase.from('fundraiser_email_log').insert(row)
  if (error) console.error('email log insert failed', error)
}

// ---------------- Ask cadence copy ----------------
function askEmail(opts: {
  contactName: string; athleteName: string; campaignTitle: string;
  raised: number; goal: number; daysLeft: number; pageUrl: string;
  emailType: string; unsubscribeUrl: string;
}): { subject: string; html: string } {
  const first = esc(opts.contactName.split(' ')[0])
  const athlete = esc(opts.athleteName)
  const urgency: Record<string, { subject: string; lead: string }> = {
    launch: {
      subject: `${athlete} is fundraising for the Godspeed season`,
      lead: `${athlete} just launched a fundraising page for the ${esc(opts.campaignTitle)}. You are one of a small group of people ${athlete} is counting on.`,
    },
    day14: {
      subject: `Two weeks left: help ${athlete} reach the goal`,
      lead: `${athlete}'s fundraiser has two weeks left. Every gift moves the whole team forward.`,
    },
    day7: {
      subject: `One week left for ${athlete}'s season fund`,
      lead: `One week remains in ${athlete}'s fundraiser. This is the stretch where most goals are won or lost.`,
    },
    day2: {
      subject: `Final 48 hours: ${athlete}'s fundraiser closes soon`,
      lead: `${athlete}'s fundraiser closes in 48 hours. If you have been meaning to give, now is the moment.`,
    },
  }
  const u = urgency[opts.emailType] ?? urgency.launch
  const html = shell(`
    <p>Hi ${first},</p>
    <p>${u.lead}</p>
    ${progressBar(opts.raised, opts.goal)}
    <p>Unlike the big fundraising platforms that keep up to 24 percent of every donation, Godspeed runs its own platform. Your gift, minus only card processing, goes directly to the kids.</p>
    <p style="text-align:center;margin:28px 0;">
      <a href="${opts.pageUrl}" style="background:#2563eb;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:999px;font-weight:600;display:inline-block;">Support ${athlete}</a>
    </p>
    <p style="font-size:13px;color:#6e6e73;">Thank you for being part of ${athlete}'s corner.</p>
  `, opts.unsubscribeUrl)
  return { subject: u.subject, html }
}

// ---------------- Actions ----------------
async function handleDonationReceipt(donationId: string): Promise<Response> {
  const { data: d } = await supabase
    .from('donations')
    .select('id, donor_name, donor_email, amount, completed_at, campaign_id, participant_id, campaign_participants(athlete_name, slug), fundraising_campaigns(title, slug)')
    .eq('id', donationId).eq('status', 'completed').single()
  if (!d) return new Response(JSON.stringify({ error: 'donation not found' }), { status: 404, headers: corsHeaders })

  // Idempotency: one receipt per donation
  const { data: existing } = await supabase.from('fundraiser_email_log')
    .select('id').eq('donation_id', donationId).eq('email_type', 'receipt').limit(1)
  if (existing && existing.length > 0) return new Response('already sent', { headers: corsHeaders })

  const athlete = (d as any).campaign_participants?.athlete_name
  const campaign = (d as any).fundraising_campaigns
  const first = esc(d.donor_name.split(' ')[0])
  const html = shell(`
    <p>Hi ${first},</p>
    <p>Thank you. Your donation of <strong>${usd(d.amount)}</strong> to ${athlete ? `<strong>${esc(athlete)}</strong> and ` : ''}the ${esc(campaign?.title ?? 'Godspeed season fund')} went through successfully.</p>
    <p>One hundred percent of your gift, minus only card processing, goes directly to the program. No platform fees. No middlemen.</p>
    <table role="presentation" width="100%" style="background:#f5f5f7;border-radius:12px;margin:16px 0;"><tr><td style="padding:16px 20px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;color:#1d1d1f;">
      <strong>Receipt</strong><br>
      Amount: ${usd(d.amount)}<br>
      Date: ${new Date(d.completed_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}<br>
      Reference: ${d.id.slice(0, 8).toUpperCase()}<br>
      Paid to: Godspeed Basketball
    </td></tr></table>
    <p style="font-size:12px;color:#86868b;">Please keep this receipt for your records.</p>
    <p>From all of us, and especially from the kids: thank you.</p>
  `)
  const resendId = await sendEmail(d.donor_email, 'Your Godspeed Basketball donation receipt', html)
  await logEmail({ donation_id: d.id, participant_id: d.participant_id, email_type: 'receipt', recipient: d.donor_email, resend_id: resendId })
  return new Response('ok', { headers: corsHeaders })
}

async function handleUnsubscribe(token: string): Promise<Response> {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return new Response('Invalid link', { status: 400 })
  await supabase.from('fundraiser_contacts').update({ unsubscribed: true }).eq('unsubscribe_token', token)
  return new Response(
    `<!DOCTYPE html><html><body style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;display:flex;justify-content:center;padding:80px 24px;"><div style="max-width:420px;text-align:center;"><h2 style="color:#1d1d1f;">You are unsubscribed</h2><p style="color:#6e6e73;">You will not receive any more fundraiser emails from Godspeed Basketball.</p></div></body></html>`,
    { headers: { 'Content-Type': 'text/html' } }
  )
}

async function handleCron(): Promise<Response> {
  const summary = { cadence_sent: 0, impact_sent: 0, skipped: 0, errors: 0 }

  // ---- Live campaigns ----
  const { data: campaigns } = await supabase
    .from('fundraising_campaigns')
    .select('id, slug, title, goal_amount, starts_at, ends_at, status')
    .in('status', ['live', 'ended'])
  if (!campaigns || campaigns.length === 0) {
    return new Response(JSON.stringify({ ...summary, note: 'no active campaigns' }), { headers: corsHeaders })
  }

  for (const c of campaigns) {
    const { data: board } = await supabase
      .from('participant_leaderboard').select('*').eq('campaign_id', c.id)
    const participants = board ?? []
    const campaignRaised = participants.reduce((s, p) => s + Number(p.raised), 0)

    // ---- Cadence (live campaigns only) ----
    if (c.status === 'live') {
      const daysLeft = Math.ceil((new Date(c.ends_at).getTime() - Date.now()) / 86400000)
      let emailType: string | null = null
      if (daysLeft <= 2) emailType = 'day2'
      else if (daysLeft <= 7) emailType = 'day7'
      else if (daysLeft <= 14) emailType = 'day14'
      else emailType = 'launch'

      for (const p of participants) {
        if (summary.cadence_sent >= MAX_SENDS_PER_RUN) break

        const { data: contacts } = await supabase
          .from('fundraiser_contacts')
          .select('id, full_name, email, unsubscribed, unsubscribe_token')
          .eq('participant_id', p.participant_id).eq('unsubscribed', false)
        if (!contacts) continue

        // Donor emails for this participant leave the ask track
        const { data: donors } = await supabase
          .from('donations').select('donor_email')
          .eq('participant_id', p.participant_id).eq('status', 'completed')
        const donorEmails = new Set((donors ?? []).map(x => x.donor_email.toLowerCase()))

        for (const contact of contacts) {
          if (summary.cadence_sent >= MAX_SENDS_PER_RUN) break
          if (donorEmails.has(contact.email.toLowerCase())) { summary.skipped++; continue }

          // Already received this cadence step?
          const { data: dup } = await supabase.from('fundraiser_email_log')
            .select('id').eq('contact_id', contact.id).eq('email_type', emailType).limit(1)
          if (dup && dup.length > 0) { summary.skipped++; continue }

          // 48-hour rate limit
          const { data: recent } = await supabase.from('fundraiser_email_log')
            .select('sent_at').eq('contact_id', contact.id)
            .gte('sent_at', new Date(Date.now() - RATE_LIMIT_HOURS * 3600000).toISOString()).limit(1)
          if (recent && recent.length > 0) { summary.skipped++; continue }

          const pageUrl = `${SITE}/fundraise-player.html?p=${encodeURIComponent(p.slug)}&c=${encodeURIComponent(c.slug)}`
          const unsubscribeUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/fundraiser-engine?action=unsubscribe&token=${contact.unsubscribe_token}`
          const { subject, html } = askEmail({
            contactName: contact.full_name, athleteName: p.athlete_name,
            campaignTitle: c.title, raised: Number(p.raised), goal: Number(p.personal_goal),
            daysLeft, pageUrl, emailType, unsubscribeUrl,
          })
          const resendId = await sendEmail(contact.email, subject, html)
          if (resendId === null) { summary.errors++; continue }
          await logEmail({ participant_id: p.participant_id, contact_id: contact.id, email_type: emailType, recipient: contact.email, resend_id: resendId })
          summary.cadence_sent++
        }
      }
    }

    // ---- Impact email (campaign just ended; once per donor) ----
    if (c.status === 'ended') {
      const { data: donors } = await supabase
        .from('donations').select('id, donor_name, donor_email, participant_id')
        .eq('campaign_id', c.id).eq('status', 'completed')
      for (const d of donors ?? []) {
        const { data: dup } = await supabase.from('fundraiser_email_log')
          .select('id').eq('donation_id', d.id).eq('email_type', 'impact').limit(1)
        if (dup && dup.length > 0) continue
        const html = shell(`
          <p>Hi ${esc(d.donor_name.split(' ')[0])},</p>
          <p>The ${esc(c.title)} fundraiser is complete. Together, supporters raised <strong>${usd(campaignRaised)}</strong> toward our ${usd(Number(c.goal_amount))} goal.</p>
          <p>Because Godspeed runs its own platform, every dollar you gave, minus only card processing, went straight to the program: tournaments, training, travel, and gear for 12 young athletes.</p>
          <p>Thank you for standing in their corner.</p>
        `)
        const resendId = await sendEmail(d.donor_email, `What your gift did: ${c.title}`, html)
        if (resendId === null) { summary.errors++; continue }
        await logEmail({ donation_id: d.id, participant_id: d.participant_id, email_type: 'impact', recipient: d.donor_email, resend_id: resendId })
        summary.impact_sent++
      }
    }

    // ---- Daily admin digest (idempotent: max one per 20h) ----
    const { data: recentDigest } = await supabase.from('fundraiser_email_log')
      .select('id').eq('email_type', 'digest')
      .gte('sent_at', new Date(Date.now() - 20 * 3600000).toISOString()).limit(1)
    if (c.status === 'live' && (!recentDigest || recentDigest.length === 0)) {
      const sorted = [...participants].sort((a, b) => Number(b.raised) - Number(a.raised))
      const stalled = sorted.filter(p => Number(p.raised) === 0)
      const rows = sorted.map(p =>
        `<tr><td style="padding:6px 12px;border-bottom:1px solid #e5e5ea;">${esc(p.athlete_name)}</td>
         <td style="padding:6px 12px;border-bottom:1px solid #e5e5ea;text-align:right;">${usd(Number(p.raised))}</td>
         <td style="padding:6px 12px;border-bottom:1px solid #e5e5ea;text-align:right;">${p.donor_count}</td></tr>`).join('')
      const html = shell(`
        <p><strong>${esc(c.title)}</strong>: daily digest</p>
        ${progressBar(campaignRaised, Number(c.goal_amount))}
        <table role="presentation" width="100%" style="font-size:13px;border-collapse:collapse;">
          <tr><th style="text-align:left;padding:6px 12px;">Athlete</th><th style="text-align:right;padding:6px 12px;">Raised</th><th style="text-align:right;padding:6px 12px;">Donors</th></tr>
          ${rows}
        </table>
        ${stalled.length > 0 ? `<p style="margin-top:16px;"><strong>Needs attention (zero raised):</strong> ${stalled.map(p => esc(p.athlete_name)).join(', ')}. Consider a parent nudge.</p>` : ''}
        <p style="margin-top:16px;font-size:13px;color:#6e6e73;">Cadence sent today: ${summary.cadence_sent}. Skipped (rate limit/donors): ${summary.skipped}.</p>
      `)
      const resendId = await sendEmail(ADMIN_EMAIL, `Raise digest: ${usd(campaignRaised)} of ${usd(Number(c.goal_amount))} (${c.title})`, html)
      await logEmail({ email_type: 'digest', recipient: ADMIN_EMAIL, resend_id: resendId })
    }
  }

  return new Response(JSON.stringify(summary), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

// ---------------- Router ----------------
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const url = new URL(req.url)
  if (req.method === 'GET' && url.searchParams.get('action') === 'unsubscribe') {
    return handleUnsubscribe(url.searchParams.get('token') ?? '')
  }

  // House pattern: cron jobs call edge functions without bearer tokens
  // (verify_jwt=false). Abuse resistance comes from the immutable email
  // ledger instead of caller auth: every send path (cadence, receipt,
  // impact, digest) dedupes against fundraiser_email_log, so repeated
  // invocations are no-ops beyond what the daily cron already does.

  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* cron may send empty body */ }
  const action = String(body.action ?? 'cron')

  try {
    if (action === 'donation_receipt') return await handleDonationReceipt(String(body.donationId ?? ''))
    return await handleCron()
  } catch (e) {
    console.error('fundraiser-engine error', e)
    return new Response(JSON.stringify({ error: 'internal error' }), { status: 500, headers: corsHeaders })
  }
})
