// create-uniform-checkout
// -----------------------------------------------------------------------------
// Creates a Stripe Checkout Session for an existing uniform order. Price and
// product come from the ORDER ROW (written server-side by create_uniform_order
// from uniform_config) — never from the browser. The session carries the
// order_id in metadata + client_reference_id so the webhook can mark it paid.
//
// Graceful degradation: if STRIPE_SECRET_KEY is not set (live keys pending),
// returns 200 { url:null, reason:'stripe_not_configured' } so the parent page
// keeps the reserved order and shows a follow-up-for-payment confirmation.
// Zero-dependency raw fetch to Stripe (mirrors create-checkout-session).
// -----------------------------------------------------------------------------
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') || ''
const PORTAL = 'https://www.clubgodspeed.com'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { order_id } = await req.json()
    if (!order_id) return json({ error: 'order_id required' }, 400)

    const { data: order, error } = await supabase
      .from('uniform_orders')
      .select('id,order_number,player_name,jersey_number,jersey_size,shorts_size,total_amount,status,customer_email,stripe_checkout_session_id')
      .eq('id', order_id)
      .single()

    if (error || !order) return json({ error: 'order not found' }, 404)
    if (order.status === 'paid') return json({ url: null, reason: 'already_paid' })

    // No live Stripe key yet: order stays reserved, parent sees follow-up message.
    if (!STRIPE_SECRET_KEY) return json({ url: null, reason: 'stripe_not_configured' })

    const amountCents = Math.round(Number(order.total_amount) * 100)
    const desc = `Godspeed uniform — ${order.player_name}, #${order.jersey_number} (Jersey ${order.jersey_size} / Shorts ${order.shorts_size})`

    const params: Record<string, string> = {
      'mode': 'payment',
      'success_url': `${PORTAL}/success.html?order=${encodeURIComponent(order.order_number)}`,
      'cancel_url': `${PORTAL}/order-uniform.html`,
      'client_reference_id': order.id,
      'metadata[order_id]': order.id,
      'metadata[order_type]': 'uniform',
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][product_data][name]': 'Godspeed Uniform Set (Jersey + Shorts)',
      'line_items[0][price_data][product_data][description]': desc,
      'line_items[0][price_data][unit_amount]': String(amountCents),
      'line_items[0][quantity]': '1',
    }
    if (order.customer_email) params['customer_email'] = order.customer_email

    const resp = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params),
    })
    const session = await resp.json()
    if (session.error) return json({ error: session.error.message }, 400)

    // Record the session id so the webhook can reconcile.
    await supabase.from('uniform_orders')
      .update({ stripe_checkout_session_id: session.id, updated_at: new Date().toISOString() })
      .eq('id', order.id)

    return json({ url: session.url, id: session.id })
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
