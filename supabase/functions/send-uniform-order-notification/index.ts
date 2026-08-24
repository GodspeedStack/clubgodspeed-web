// send-uniform-order-notification
// -----------------------------------------------------------------------------
// The "email without fail" worker for uniform orders. Two modes:
//   * POST { order_id }  -> send that order's admin email now (called by the
//                           parent page right after an order is placed).
//   * POST {} or cron    -> drain ALL pending uniform_order_notifications,
//                           retrying each up to MAX_ATTEMPTS.
// Every send is backed by a durable row in uniform_order_notifications, so a
// transient Resend failure never loses the notification: it stays 'pending' and
// the scheduled cron retries it. The order itself is already saved and visible
// in the admin dashboard regardless of email state.
// -----------------------------------------------------------------------------
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
const FROM_EMAIL     = Deno.env.get('RESEND_FROM_EMAIL')!
const ADMIN_EMAIL    = Deno.env.get('ADMIN_NOTIFY_EMAIL') || 'jewellsco@gmail.com'
const ADMIN_URL      = 'https://www.clubgodspeed.com/admin-uniform-orders.html'
const MAX_ATTEMPTS   = 5

type Order = {
  order_number: string; player_name: string; jersey_number: number;
  jersey_size: string; shorts_size: string; total_amount: number;
  status: string; customer_name: string | null; customer_email: string | null;
  customer_phone: string | null; created_at: string;
}

function buildEmail(o: Order): { subject: string; html: string } {
  const paid = o.status === 'paid'
  const created = new Date(o.created_at).toLocaleString('en-US', {
    weekday:'short', month:'short', day:'numeric', hour:'numeric', minute:'2-digit'
  })
  const rows: [string,string][] = [
    ['Player', o.player_name],
    ['Jersey number', '#' + o.jersey_number],
    ['Jersey size', o.jersey_size],
    ['Shorts size', o.shorts_size],
    ['Amount', '$' + Number(o.total_amount).toFixed(2)],
    ['Payment', paid ? 'PAID' : 'Pending payment'],
    ['Parent', o.customer_name || '—'],
    ['Parent email', o.customer_email || '—'],
  ]
  if (o.customer_phone) rows.push(['Parent phone', o.customer_phone])
  rows.push(['Placed', created])

  const body = rows.map(([k,v]) =>
    `<tr><td style="padding:10px 14px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#6b7280;border-bottom:1px solid #f3f4f6;width:140px;">${k}</td>
      <td style="padding:10px 14px;font-size:14px;color:#111;border-bottom:1px solid #f3f4f6;">${v}</td></tr>`
  ).join('')

  const bandColor = paid ? '#1B7F3B' : '#FF5722'
  const bandText  = paid ? 'Uniform Order — PAID' : 'New Uniform Order'

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#111;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;">
<tr><td align="center" style="padding:40px 16px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:12px;overflow:hidden;border:1px solid rgba(0,0,0,.05);">
    <tr><td style="background:#0A0A0A;padding:30px 20px;text-align:center;">
      <span style="font-size:22px;font-weight:900;color:#fff;letter-spacing:-.5px;">GODSPEED</span><span style="font-size:22px;font-weight:900;color:#1A3A8F;letter-spacing:-.5px;">BASKETBALL</span>
    </td></tr>
    <tr><td style="background:${bandColor};padding:13px 20px;text-align:center;">
      <span style="font-size:13px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:.1em;">${bandText}</span>
    </td></tr>
    <tr><td style="padding:30px 34px;">
      <p style="font-size:15px;color:#4b5563;margin:0 0 18px;">Order <b>${o.order_number}</b> was just placed in the parent portal.</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin:0 0 24px;">
        ${body}
      </table>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
        <tr><td style="background:#1A3A8F;border-radius:8px;">
          <a href="${ADMIN_URL}" target="_blank" style="display:inline-block;padding:13px 30px;font-size:14px;font-weight:800;color:#fff;text-decoration:none;text-transform:uppercase;letter-spacing:.08em;">Open Orders Dashboard</a>
        </td></tr>
      </table>
    </td></tr>
    <tr><td style="background:#fafafa;padding:18px;text-align:center;font-size:12px;color:#9ca3af;border-top:1px solid #f3f4f6;">
      &copy; ${new Date().getFullYear()} Godspeed Basketball &middot; Uniform Order Notification
    </td></tr>
  </table>
</td></tr></table></body></html>`

  return { subject: `${paid ? 'PAID ' : ''}Uniform Order ${o.order_number} — ${o.player_name} #${o.jersey_number}`, html }
}

async function sendViaResend(subject: string, html: string): Promise<boolean> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_EMAIL, to: ADMIN_EMAIL, subject, html }),
  })
  if (!res.ok) console.error('Resend error:', await res.text())
  return res.ok
}

/** Send one notification row; update its status/attempts. Returns true if sent. */
async function processOne(notif: { id: string; order_id: string; attempts: number }): Promise<boolean> {
  const { data: order, error } = await supabase
    .from('uniform_orders')
    .select('order_number,player_name,jersey_number,jersey_size,shorts_size,total_amount,status,customer_name,customer_email,customer_phone,created_at')
    .eq('id', notif.order_id)
    .single()

  const attempts = (notif.attempts || 0) + 1
  if (error || !order) {
    const giveUp = attempts >= MAX_ATTEMPTS
    await supabase.from('uniform_order_notifications')
      .update({ status: giveUp ? 'failed' : 'pending', attempts, last_error: 'order not found', updated_at: new Date().toISOString() })
      .eq('id', notif.id)
    return false
  }

  const { subject, html } = buildEmail(order as Order)
  const ok = await sendViaResend(subject, html)

  if (ok) {
    await supabase.from('uniform_order_notifications')
      .update({ status: 'sent', sent_at: new Date().toISOString(), attempts, last_error: null, updated_at: new Date().toISOString() })
      .eq('id', notif.id)
    return true
  }
  const giveUp = attempts >= MAX_ATTEMPTS
  await supabase.from('uniform_order_notifications')
    .update({ status: giveUp ? 'failed' : 'pending', attempts, last_error: 'resend send failed', updated_at: new Date().toISOString() })
    .eq('id', notif.id)
  return false
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  let orderId: string | null = null
  try { const b = await req.json(); orderId = b?.order_id ?? null } catch { /* cron: no body */ }

  // Targeted mode: send this order's pending notification(s) immediately.
  let query = supabase
    .from('uniform_order_notifications')
    .select('id,order_id,attempts')
    .eq('status', 'pending')
    .lt('attempts', MAX_ATTEMPTS)
    .order('created_at', { ascending: true })
    .limit(50)
  if (orderId) query = query.eq('order_id', orderId)

  const { data: pending, error } = await query
  if (error) {
    return new Response(JSON.stringify({ ok:false, error: error.message }), { status:500, headers:{ ...corsHeaders, 'Content-Type':'application/json' } })
  }

  let sent = 0, failed = 0
  for (const n of (pending || [])) { (await processOne(n)) ? sent++ : failed++ }

  return new Response(JSON.stringify({ ok:true, processed:(pending||[]).length, sent, failed }), {
    headers: { ...corsHeaders, 'Content-Type':'application/json' }
  })
})
