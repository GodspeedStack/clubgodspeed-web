/**
 * resend-verification
 *
 * Admin-invoked edge function that generates a new signup confirmation
 * link via the service-role admin API and sends it through Resend.
 * Bypasses GoTrue client-side rate limits and the anon-key SMTP path.
 *
 * Payload: { email: string }
 * Returns: { ok: true, status: 'sent'|'already_confirmed' }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY   = Deno.env.get('RESEND_API_KEY')!
const FROM_EMAIL       = 'Godspeed Basketball <noreply@clubgodspeed.com>'
const REDIRECT_URL     = 'https://www.clubgodspeed.com/parent-portal.html'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function buildVerificationHtml(confirmUrl: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:640px;margin:0 auto;padding:24px">
  <div style="background:#111827;border-radius:12px 12px 0 0;padding:24px;text-align:center">
    <h1 style="color:#fff;font-size:22px;margin:0;letter-spacing:0.05em">GODSPEED</h1>
    <p style="color:#60a5fa;font-size:12px;margin:4px 0 0;letter-spacing:0.1em">EMAIL VERIFICATION</p>
  </div>
  <div style="background:#fff;padding:32px 24px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;border-top:none;text-align:center">
    <p style="color:#374151;font-size:15px;margin:0 0 8px">Welcome to the Godspeed family.</p>
    <p style="color:#374151;font-size:15px;margin:0 0 24px">Please confirm your email address to activate your Parent Portal account.</p>
    <a href="${confirmUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;text-transform:uppercase;letter-spacing:0.05em">Verify My Email</a>
    <p style="color:#9ca3af;font-size:12px;margin:24px 0 0">If the button does not work, copy and paste this link into your browser:</p>
    <p style="color:#6b7280;font-size:11px;word-break:break-all;margin:8px 0 0">${confirmUrl}</p>
  </div>
  <p style="color:#9ca3af;font-size:11px;text-align:center;margin-top:16px">BROTHERHOOD. HABITS. SUCCESS.</p>
</div>
</body>
</html>`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { email } = await req.json()
    if (!email) {
      return new Response(JSON.stringify({ ok: false, error: 'email required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // Check if user exists and their confirmation status
    const { data: { users }, error: listErr } = await supabase.auth.admin.listUsers()
    if (listErr) throw new Error(`Admin listUsers failed: ${listErr.message}`)

    const user = users.find(u => u.email?.toLowerCase() === email.toLowerCase())
    if (!user) {
      return new Response(JSON.stringify({ ok: false, error: 'No account found for this email' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (user.email_confirmed_at) {
      return new Response(JSON.stringify({ ok: true, status: 'already_confirmed' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Generate a new signup confirmation link via admin API
    const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
      type: 'signup',
      email,
      options: { redirectTo: REDIRECT_URL }
    })

    if (linkErr) throw new Error(`generateLink failed: ${linkErr.message}`)

    const confirmUrl = linkData?.properties?.action_link
    if (!confirmUrl) throw new Error('No action_link returned from generateLink')

    // Send branded email via Resend
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [email],
        subject: 'Verify Your Email - Godspeed Basketball',
        html: buildVerificationHtml(confirmUrl)
      })
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`Resend send failed: ${errText}`)
    }

    return new Response(JSON.stringify({ ok: true, status: 'sent' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('resend-verification error:', err)
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
