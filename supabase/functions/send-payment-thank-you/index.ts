import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') || 'Godspeed Basketball <noreply@clubgodspeed.com>'

// ---------------------------------------------------------------------------
// Branded HTML email shell
// ---------------------------------------------------------------------------
function htmlWrap(heading: string, bodyHtml: string): string {
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
      <h1 style="font-size:20px;font-weight:800;margin:0 0 20px;letter-spacing:-0.3px;">${heading}</h1>
      ${bodyHtml}
    </td></tr>
    <!-- Footer -->
    <tr><td style="padding:20px 40px 32px;border-top:1px solid #f0f0f0;text-align:center;">
      <p style="font-size:12px;color:#999;margin:0;">BROTHERHOOD. HABITS. SUCCESS.</p>
      <p style="font-size:11px;color:#bbb;margin:8px 0 0;">Godspeed Basketball -- clubgodspeed.com</p>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { email, name, athlete, amount, method } = await req.json()

    if (!email || !amount) {
      return new Response(JSON.stringify({ error: 'email and amount required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const firstName = (name || '').split(' ')[0] || 'there'
    const amountStr = '$' + parseFloat(amount).toFixed(2)
    const methodLabel = (method || 'payment').charAt(0).toUpperCase() + (method || 'payment').slice(1)
    const athleteStr = athlete ? ` for ${athlete}` : ''

    const bodyHtml = `
      <p style="font-size:15px;color:#333;margin:0 0 16px;">
        Hi ${firstName},
      </p>
      <p style="font-size:15px;color:#333;margin:0 0 16px;">
        Thank you for your ${amountStr} ${methodLabel} payment${athleteStr}. Your payment has been received and recorded.
      </p>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px 20px;margin:20px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">
          <tr>
            <td style="font-size:13px;color:#666;padding:4px 0;">Amount</td>
            <td style="font-size:15px;font-weight:700;color:#111;text-align:right;padding:4px 0;">${amountStr}</td>
          </tr>
          <tr>
            <td style="font-size:13px;color:#666;padding:4px 0;">Method</td>
            <td style="font-size:15px;font-weight:600;color:#111;text-align:right;padding:4px 0;">${methodLabel}</td>
          </tr>
          <tr>
            <td style="font-size:13px;color:#666;padding:4px 0;">Date</td>
            <td style="font-size:15px;font-weight:600;color:#111;text-align:right;padding:4px 0;">${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</td>
          </tr>
        </table>
      </div>
      <p style="font-size:15px;color:#333;margin:16px 0 0;">
        You can view your account details anytime in the
        <a href="https://clubgodspeed.com/parent-portal.html#billing" style="color:#2563eb;text-decoration:none;font-weight:600;">Parent Portal</a>.
      </p>
      <p style="font-size:15px;color:#333;margin:16px 0 0;">
        You're helping us build brotherhood for boys in Northeast Denver and beyond. We appreciate your support.
      </p>
      <p style="font-size:15px;color:#333;margin:24px 0 0;">
        -- Coach Scott
      </p>
    `

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [email],
        subject: `Payment Received -- ${amountStr}${athleteStr}`,
        html: htmlWrap('Payment Received', bodyHtml),
      }),
    })

    const result = await res.json()

    if (!res.ok) {
      console.error('Resend error:', result)
      return new Response(JSON.stringify({ error: 'Email send failed', detail: result }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ success: true, id: result.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (e) {
    console.error('send-payment-thank-you error:', e)
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
