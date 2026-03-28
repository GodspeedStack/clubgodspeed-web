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

// ---------------------------------------------------------------------------
// Branded HTML wrapper — matches clubgodspeed.com design system
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
      <h1 style="font-size:20px;font-weight:800;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 24px;color:#111;">${heading}</h1>
      ${bodyHtml}
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

// ---------------------------------------------------------------------------
// Handler — invoked per broadcast_message_id
// Reads pending recipients, sends via Resend, updates statuses.
// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { message_id } = await req.json()

    if (!message_id) {
      return new Response(JSON.stringify({ error: 'message_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 1. Fetch the broadcast message
    const { data: message, error: msgErr } = await supabase
      .from('broadcast_messages')
      .select('*')
      .eq('id', message_id)
      .single()

    if (msgErr || !message) {
      return new Response(JSON.stringify({ error: 'Message not found', detail: msgErr?.message }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 2. Fetch pending recipients (batch of 50)
    const { data: recipients, error: recErr } = await supabase
      .from('broadcast_recipients')
      .select('id, user_id, email')
      .eq('message_id', message_id)
      .eq('status', 'pending')
      .limit(50)

    if (recErr) {
      return new Response(JSON.stringify({ error: 'Failed to fetch recipients', detail: recErr.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!recipients || recipients.length === 0) {
      // Mark message as sent if no more pending
      await supabase
        .from('broadcast_messages')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', message_id)

      return new Response(JSON.stringify({ processed: 0, message: 'No pending recipients' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 3. Build email HTML from message body
    const bodyHtml = message.body
      .split('\n')
      .filter((line: string) => line.trim() !== '')
      .map((para: string) => `<p style="font-size:16px;color:#4b5563;margin:0 0 16px;">${para}</p>`)
      .join('')

    const html = htmlWrap(message.subject, bodyHtml)

    // 4. Send emails in parallel (batches of 10 for rate-limit safety)
    let sent = 0
    let failed = 0
    const batchSize = 10

    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize)

      const results = await Promise.allSettled(
        batch.map(async (recipient) => {
          const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${RESEND_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: FROM_EMAIL,
              to: recipient.email,
              subject: message.subject,
              html,
            }),
          })

          if (res.ok) {
            const resBody = await res.json()
            await supabase
              .from('broadcast_recipients')
              .update({
                status: 'sent',
                sent_at: new Date().toISOString(),
                resend_id: resBody.id || null,
              })
              .eq('id', recipient.id)
            return 'sent'
          } else {
            const errText = await res.text()
            console.error(`Resend error for ${recipient.email}: ${errText}`)
            await supabase
              .from('broadcast_recipients')
              .update({ status: 'failed' })
              .eq('id', recipient.id)
            throw new Error(errText)
          }
        })
      )

      for (const r of results) {
        if (r.status === 'fulfilled') sent++
        else failed++
      }
    }

    // 5. Update message delivered_count and status
    const { data: counts } = await supabase
      .from('broadcast_recipients')
      .select('status', { count: 'exact', head: true })
      .eq('message_id', message_id)
      .eq('status', 'pending')

    const stillPending = counts ? (counts as any).length : 0

    await supabase
      .from('broadcast_messages')
      .update({
        delivered_count: (message.delivered_count || 0) + sent,
        ...(stillPending === 0 ? { status: 'sent', sent_at: new Date().toISOString() } : {}),
      })
      .eq('id', message_id)

    return new Response(
      JSON.stringify({ processed: recipients.length, sent, failed, still_pending: stillPending }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('send-broadcast error:', err)
    return new Response(JSON.stringify({ error: 'Internal error', detail: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
