/**
 * send-onboarding-reminder
 *
 * Two modes:
 *   1. CRON (no body) -- scans for stale/at-risk sessions and sends reminders
 *   2. MANUAL (body: { session_id, email }) -- sends a single nudge from admin
 *
 * Enforces 48-hour rate limit per session to prevent spam.
 * Updates onboarding_sessions.reminder_count and last_reminder.
 * Logs every send to onboarding_events with event_type = 'reminder_sent'.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY   = Deno.env.get('RESEND_API_KEY')!
const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const FROM_EMAIL       = 'Godspeed Basketball <noreply@clubgodspeed.com>'
const RATE_LIMIT_HRS   = 48
const WELCOME_URL      = 'https://clubgodspeed.com/welcome.html'

interface OnboardingSession {
  id: string
  email: string
  parent_name: string | null
  athlete_name: string | null
  current_step: string
  started_at: string
  last_activity: string
  reminder_count: number
  last_reminder: string | null
}

const STEP_LABELS: Record<string, string> = {
  welcome: 'Welcome',
  account_created: 'Create Account',
  parent_guide: 'Season Guide',
  athletic_waiver: 'Athletic Waiver',
  medical_consent: 'Medical Consent',
  practice_consent: 'Practice Commitment',
  code_of_conduct: 'Code of Conduct',
  media_release: 'Media Release',
  payment_setup: 'Payment Info',
  complete: 'Complete',
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE)

  let sessions: OnboardingSession[] = []

  // Determine mode
  let body: any = null
  try { body = await req.json() } catch (_) {}

  if (body?.session_id) {
    // MANUAL MODE -- single session
    const { data } = await sb
      .from('onboarding_sessions')
      .select('*')
      .eq('id', body.session_id)
      .single()
    if (data) sessions = [data as OnboardingSession]
  } else {
    // CRON MODE -- all incomplete sessions idle > 48h
    const cutoff = new Date(Date.now() - RATE_LIMIT_HRS * 3600 * 1000).toISOString()
    const { data } = await sb
      .from('onboarding_sessions')
      .select('*')
      .is('completed_at', null)
      .lt('last_activity', cutoff)
      .or(`last_reminder.is.null,last_reminder.lt.${cutoff}`)
      .order('last_activity', { ascending: true })
    sessions = (data || []) as OnboardingSession[]
  }

  const results: { email: string; status: string }[] = []

  for (const session of sessions) {
    // Rate limit check (skip if manual mode override)
    if (!body?.session_id && session.last_reminder) {
      const since = Date.now() - new Date(session.last_reminder).getTime()
      if (since < RATE_LIMIT_HRS * 3600 * 1000) {
        results.push({ email: session.email, status: 'rate_limited' })
        continue
      }
    }

    const stepLabel = STEP_LABELS[session.current_step] || session.current_step
    const firstName = session.parent_name?.split(' ')[0] || 'Parent'
    const isAtRisk = (Date.now() - new Date(session.last_activity).getTime()) > 72 * 3600 * 1000

    const subject = isAtRisk
      ? `${firstName}, your Godspeed onboarding is incomplete`
      : `${firstName}, finish setting up your Godspeed account`

    const html = buildEmail(firstName, session.athlete_name || 'your athlete', stepLabel, isAtRisk, session.reminder_count)

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: [session.email],
          subject,
          html,
        }),
      })

      if (!res.ok) {
        const err = await res.text()
        results.push({ email: session.email, status: `send_failed: ${err}` })
        continue
      }

      // Update session
      await sb
        .from('onboarding_sessions')
        .update({
          reminder_count: (session.reminder_count || 0) + 1,
          last_reminder: new Date().toISOString(),
        })
        .eq('id', session.id)

      // Audit log
      await sb.from('onboarding_events').insert({
        session_id: session.id,
        step: session.current_step,
        event_type: 'reminder_sent',
        event_metadata: { reminder_number: (session.reminder_count || 0) + 1, is_manual: !!body?.session_id },
      })

      results.push({ email: session.email, status: 'sent' })
    } catch (e: any) {
      results.push({ email: session.email, status: `error: ${e.message}` })
    }
  }

  return new Response(JSON.stringify({ sent: results.filter(r => r.status === 'sent').length, total: sessions.length, results }), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
})

function buildEmail(firstName: string, athleteName: string, currentStep: string, isAtRisk: boolean, reminderCount: number): string {
  const urgency = isAtRisk
    ? `<p style="background:#fef2f2;border-left:4px solid #dc2626;padding:12px 16px;border-radius:4px;color:#7f1d1d;font-size:14px;margin:16px 0"><strong>Action needed:</strong> Your onboarding has been inactive for more than 72 hours. Please complete the remaining steps so ${athleteName} can participate in upcoming practices and tournaments.</p>`
    : ''

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px">
    <div style="background:#1d1d1f;padding:20px;text-align:center;border-radius:12px 12px 0 0">
      <span style="color:white;font-size:14px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase">GODSPEED BASKETBALL</span>
    </div>
    <div style="background:white;padding:32px 28px;border-radius:0 0 12px 12px;box-shadow:0 4px 20px rgba(0,0,0,0.06)">
      <h1 style="font-size:22px;font-weight:800;color:#1d1d1f;margin:0 0 8px">Hey ${firstName},</h1>
      <p style="font-size:15px;color:#424245;line-height:1.6;margin:0 0 16px">You started the Godspeed onboarding process for <strong>${athleteName}</strong> but haven't finished yet. You stopped at: <strong>${currentStep}</strong>.</p>
      ${urgency}
      <p style="font-size:15px;color:#424245;line-height:1.6;margin:0 0 24px">Pick up right where you left off. It only takes a few minutes to complete the remaining documents.</p>
      <div style="text-align:center;margin:24px 0">
        <a href="${WELCOME_URL}" style="display:inline-block;background:#1d1d1f;color:white;padding:14px 32px;border-radius:9999px;font-size:15px;font-weight:700;text-decoration:none">Continue Onboarding</a>
      </div>
      <p style="font-size:13px;color:#86868b;line-height:1.5;margin:24px 0 0;text-align:center">Questions? Reply to this email or reach out to Coach Scott directly.</p>
    </div>
    <div style="text-align:center;padding:20px;font-size:12px;color:#86868b">
      <p style="margin:0">BROTHERHOOD. HABITS. SUCCESS.</p>
      <p style="margin:4px 0 0">Godspeed Basketball | Denver, CO</p>
    </div>
  </div>
</body>
</html>`
}
