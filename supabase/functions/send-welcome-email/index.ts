import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL')!
const PORTAL_URL = 'https://www.clubgodspeed.com/parent-portal.html'

function welcomeHtml(name: string): string {
  const firstName = (name || 'Parent').split(' ')[0]
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f5f5f7;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#111;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f7;">
<tr><td align="center" style="padding:40px 16px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid rgba(0,0,0,0.05);box-shadow:0 4px 6px rgba(0,0,0,0.02);">
    <!-- Header -->
    <tr><td style="background-color:#111111;padding:32px 20px;text-align:center;">
      <span style="font-size:22px;font-weight:900;color:#ffffff;letter-spacing:-0.5px;">GODSPEED</span><span style="font-size:22px;font-weight:900;color:#2563eb;letter-spacing:-0.5px;">BASKETBALL</span>
    </td></tr>
    <!-- Body -->
    <tr><td style="padding:36px 40px;">
      <h1 style="font-size:20px;font-weight:800;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 24px;color:#111;">Welcome to the Family</h1>
      <p style="font-size:16px;color:#4b5563;margin:0 0 16px;">${firstName},</p>
      <p style="font-size:16px;color:#4b5563;margin:0 0 16px;">Your Godspeed Basketball account has been approved and is ready to go. You now have full access to the Parent Portal where you can:</p>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:16px 0 24px;">
        <tr><td style="padding:6px 0;font-size:15px;color:#4b5563;">&#10003; &nbsp;View your player's schedule, stats, and evaluations</td></tr>
        <tr><td style="padding:6px 0;font-size:15px;color:#4b5563;">&#10003; &nbsp;Track and manage season dues payments</td></tr>
        <tr><td style="padding:6px 0;font-size:15px;color:#4b5563;">&#10003; &nbsp;Access and sign team documents</td></tr>
        <tr><td style="padding:6px 0;font-size:15px;color:#4b5563;">&#10003; &nbsp;Stay up to date on practices, games, and events</td></tr>
      </table>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:30px auto 10px;">
        <tr><td style="background-color:#2563eb;border-radius:8px;">
          <a href="${PORTAL_URL}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:'Inter',Helvetica,Arial,sans-serif;font-size:14px;font-weight:800;color:#ffffff;text-decoration:none;text-transform:uppercase;letter-spacing:0.1em;">Open Parent Portal</a>
        </td></tr>
      </table>
      <p style="font-size:15px;color:#4b5563;margin:24px 0 0;">Brotherhood. Habits. Success.</p>
      <p style="font-size:14px;color:#6b7280;margin:16px 0 0;">Coach Scott<br>Godspeed Basketball</p>
    </td></tr>
    <!-- Footer -->
    <tr><td style="background-color:#fafafa;padding:20px;text-align:center;font-size:12px;color:#9ca3af;border-top:1px solid #f3f4f6;">
      &copy; ${new Date().getFullYear()} Godspeed Basketball &middot; Denver, CO
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`
}

async function sendViaResend(email: string, fullName: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: email,
      subject: 'Your Godspeed Basketball Account is Ready',
      html: welcomeHtml(fullName),
    }),
  })
  if (res.ok) return { ok: true }
  const errBody = await res.text()
  return { ok: false, error: errBody }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Direct on-demand send: body contains { email, full_name }
  // Used by the admin portal when approving a single account.
  if (req.method === 'POST') {
    let body: { email?: string; full_name?: string } = {}
    try { body = await req.json() } catch (_) { /* no body — fall through to queue */ }

    if (body.email) {
      const result = await sendViaResend(body.email, body.full_name || '')
      return new Response(
        JSON.stringify({ sent: result.ok ? 1 : 0, failed: result.ok ? 0 : 1, error: result.error }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: result.ok ? 200 : 502 }
      )
    }
  }

  // Queue processing — processes pending rows from welcome_email_queue.
  // Used by scheduled cron runs.
  const { data: pending, error: fetchErr } = await supabase
    .from('welcome_email_queue')
    .select('*')
    .eq('status', 'pending')
    .limit(20)

  if (fetchErr || !pending || pending.length === 0) {
    return new Response(JSON.stringify({ processed: 0, error: fetchErr?.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  let sent = 0
  let failed = 0

  for (const item of pending) {
    try {
      const result = await sendViaResend(item.email, item.full_name || '')
      if (result.ok) {
        await supabase
          .from('welcome_email_queue')
          .update({ status: 'sent', sent_at: new Date().toISOString() })
          .eq('id', item.id)
        sent++
      } else {
        console.error(`Resend error for ${item.email}: ${result.error}`)
        await supabase.from('welcome_email_queue').update({ status: 'failed' }).eq('id', item.id)
        failed++
      }
    } catch (err) {
      console.error(`Exception sending to ${item.email}:`, err)
      await supabase.from('welcome_email_queue').update({ status: 'failed' }).eq('id', item.id)
      failed++
    }
  }

  return new Response(JSON.stringify({ processed: pending.length, sent, failed }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
})
