// uniform-order-webhook
// -----------------------------------------------------------------------------
// Stripe webhook for uniform orders. On checkout.session.completed for a session
// whose metadata.order_type === 'uniform', marks the order paid, records the
// payment intent, and enqueues a fresh admin notification (so Scott gets a PAID
// confirmation on top of the order-placed email).
//
// Signature verification uses the Stripe SDK's async verifier (Deno-friendly).
// Requires secrets: STRIPE_SECRET_KEY, STRIPE_UNIFORM_WEBHOOK_SECRET.
// -----------------------------------------------------------------------------
import Stripe from 'https://esm.sh/stripe@14?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', { apiVersion: '2024-06-20' })
const WEBHOOK_SECRET = Deno.env.get('STRIPE_UNIFORM_WEBHOOK_SECRET') || ''

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })

  const sig = req.headers.get('stripe-signature')
  const raw = await req.text()

  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(raw, sig!, WEBHOOK_SECRET)
  } catch (e) {
    console.error('Signature verification failed:', (e as Error).message)
    return new Response('bad signature', { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const s = event.data.object as Stripe.Checkout.Session
    const orderId = s.metadata?.order_id || s.client_reference_id
    const isUniform = s.metadata?.order_type === 'uniform'

    if (isUniform && orderId && s.payment_status === 'paid') {
      const { data: updated, error } = await supabase
        .from('uniform_orders')
        .update({
          status: 'paid',
          stripe_payment_intent_id: (s.payment_intent as string) || null,
          paid_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', orderId)
        .neq('status', 'paid')          // idempotent: ignore duplicate webhook deliveries
        .select('id')

      if (error) { console.error('order update failed:', error.message); return new Response('db error', { status: 500 }) }

      // Enqueue a PAID confirmation email (durable + retried by the notifier).
      if (updated && updated.length) {
        await supabase.from('uniform_order_notifications').insert({ order_id: orderId })
      }
    }
  }

  return new Response(JSON.stringify({ received: true }), { headers: { 'Content-Type': 'application/json' } })
})
