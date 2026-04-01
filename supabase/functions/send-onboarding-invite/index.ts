/**
 * send-onboarding-invite
 *
 * Sends the initial onboarding invitation email to one or more parents.
 * Creates an onboarding_session via get_or_create_onboarding RPC,
 * then sends a branded invite email with the welcome.html link.
 *
 * Body:
 *   Single: { email, parent_name?, athlete_name? }
 *   Batch:  { invites: [{ email, parent_name?, athlete_name? }, ...] }
 *
 * Returns: { sent, failed, results: [{ email, status, session_id? }] }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY   = Deno.env.get('RESEND_API_KEY')!
const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const FROM_EMAIL       = 'Godspeed Basketball <noreply@clubgodspeed.com>'
const WELCOME_URL      = 'https://clubgodspeed.com/welcome.html'

interface InviteRequest {
  email: string
  parent_name?: string
  athlete_name?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE)

  let body: any = null
  try { body = await req.json() } catch (_) {}

  if (!body) {
    return new Response(JSON.stringify({ error: 'Request body required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }

  // Normalize to array
  const invites: InviteRequest[] = body.invites
    ? body.invites
    : [{ email: body.email, parent_name: body.parent_name, athlete_name: body.athlete_name }]

  if (!invites.length || !invites[0].email) {
    return new Response(JSON.stringify({ error: 'At least one email is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }

  const results: { email: string; status: string; session_id?: string }[] = []

  for (const invite of invites) {
    const email = invite.email.trim().toLowerCase()

    // Check for existing completed session
    const { data: existing } = await sb
      .from('onboarding_sessions')
      .select('id, completed_at')
      .eq('email', email)
      .not('completed_at', 'is', null)
      .limit(1)

    if (existing && existing.length > 0) {
      results.push({ email, status: 'already_completed', session_id: existing[0].id })
      continue
    }

    // Create or resume onboarding session
    const { data: sessionRaw, error: rpcError } = await sb.rpc('get_or_create_onboarding', {
      p_email: email,
      p_parent_name: invite.parent_name || null,
      p_athlete_name: invite.athlete_name || null,
    })

    // RPC via PostgREST may return array or object depending on function signature
    const session = Array.isArray(sessionRaw) ? sessionRaw[0] : sessionRaw

    if (rpcError || !session?.id) {
      results.push({ email, status: `session_error: ${rpcError?.message || 'no session returned'}` })
      continue
    }

    const sessionId = session.id
    const firstName = (invite.parent_name || 'Parent').split(' ')[0]
    const athleteName = invite.athlete_name || 'your athlete'

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: [email],
          subject: `${firstName}, complete your Godspeed Basketball onboarding`,
          html: buildInviteEmail(firstName, athleteName),
        }),
      })

      if (!res.ok) {
        const err = await res.text()
        results.push({ email, status: `send_failed: ${err}`, session_id: sessionId })
        continue
      }

      // Log invite_sent event
      await sb.from('onboarding_events').insert({
        session_id: sessionId,
        step: session.current_step || 'welcome',
        event_type: 'reminder_sent',
        event_metadata: { type: 'invite', is_manual: true },
      })

      results.push({ email, status: 'sent', session_id: sessionId })
    } catch (e: any) {
      results.push({ email, status: `error: ${e.message}`, session_id: sessionId })
    }
  }

  const sent = results.filter(r => r.status === 'sent').length
  const failed = results.filter(r => r.status !== 'sent' && r.status !== 'already_completed').length

  return new Response(JSON.stringify({ sent, failed, total: invites.length, results }), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
})

function buildInviteEmail(firstName: string, athleteName: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px">
    <div style="background:#1d1d1f;padding:20px;text-align:center;border-radius:12px 12px 0 0">
      <span style="color:white;font-size:14px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase">GODSPEED BASKETBALL</span>
    </div>
    <div style="background:white;padding:32px 28px;border-radius:0 0 12px 12px;box-shadow:0 4px 20px rgba(0,0,0,0.06)">
      <h1 style="font-size:22px;font-weight:800;color:#1d1d1f;margin:0 0 8px">Welcome, ${firstName}!</h1>
      <p style="font-size:15px;color:#424245;line-height:1.6;margin:0 0 16px">We're excited to have <strong>${athleteName}</strong> join the Godspeed family. To get started, we need you to complete a quick onboarding process that covers:</p>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:8px 0 20px">
        <tr><td style="padding:6px 0;font-size:14px;color:#424245"><span style="color:#2563eb;font-weight:700">&#10003;</span> &nbsp;Season guide and program overview</td></tr>
        <tr><td style="padding:6px 0;font-size:14px;color:#424245"><span style="color:#2563eb;font-weight:700">&#10003;</span> &nbsp;Required waivers and medical consent</td></tr>
        <tr><td style="padding:6px 0;font-size:14px;color:#424245"><span style="color:#2563eb;font-weight:700">&#10003;</span> &nbsp;Practice commitment and accountability policy</td></tr>
        <tr><td style="padding:6px 0;font-size:14px;color:#424245"><span style="color:#2563eb;font-weight:700">&#10003;</span> &nbsp;Code of conduct acknowledgment</td></tr>
        <tr><td style="padding:6px 0;font-size:14px;color:#424245"><span style="color:#2563eb;font-weight:700">&#10003;</span> &nbsp;Payment setup information</td></tr>
      </table>
      <div style="background:#eff6ff;border-left:4px solid #2563eb;padding:14px 16px;border-radius:6px;margin:0 0 20px">
        <p style="font-size:14px;color:#1e40af;line-height:1.5;margin:0"><strong>Accountability matters here.</strong> Godspeed tracks attendance at every session. If your son will miss practice, we expect a text to the coaching staff at least 2 hours before. Unexcused absences affect playing time. Details are covered during onboarding.</p>
      </div>
      <p style="font-size:15px;color:#424245;line-height:1.6;margin:0 0 24px">The entire process takes about 10 minutes. Everything is handled online -- no printing or scanning needed.</p>
      <div style="text-align:center;margin:24px 0">
        <a href="${WELCOME_URL}" style="display:inline-block;background:#2563eb;color:white;padding:14px 32px;border-radius:9999px;font-size:15px;font-weight:700;text-decoration:none">Start Onboarding</a>
      </div>
      <p style="font-size:13px;color:#86868b;line-height:1.5;margin:24px 0 0;text-align:center">Questions? Reply to this email or reach out to Coach Scott directly.</p>
    </div>
    <div style="text-align:center;padding:20px;font-size:12px;color:#86868b">
      <p style="margin:0;color:#2563eb;font-weight:600">BROTHERHOOD. HABITS. SUCCESS.</p>
      <p style="margin:4px 0 0">Godspeed Basketball | Denver, CO</p>
    </div>
  </div>
</body>
</html>`
}
