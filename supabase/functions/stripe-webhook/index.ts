import Stripe from 'https://esm.sh/stripe@14'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!)
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

Deno.serve(async (req) => {
  const sig = req.headers.get('stripe-signature')!
  const body = await req.text()

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(
      body, sig, Deno.env.get('STRIPE_WEBHOOK_SECRET')!
    )
  } catch {
    return new Response('Webhook signature invalid', { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.CheckoutSession
    const metadata = session.metadata || {}
    const { paymentId, paymentType } = metadata

    if (paymentType === 'training_package') {
      const { itemsJson, athleteId, parentId } = metadata
      
      let items = []
      try { items = JSON.parse(itemsJson || '[]') } catch(e) {}

      for (const item of items) {
        // Parse hours correctly and apply quantity multipliers
        const parsedHours = (item.h === 'unlimited') ? 999 : (parseFloat(item.h) * item.q)
        
        await supabase.from('training_purchases').insert({
          parent_id: parentId,
          athlete_id: athleteId || null,
          hours_purchased: parsedHours,
          price_paid: parseFloat(item.p) * item.q,
          transaction_id: session.payment_intent as string,
          status: 'active'
        })
      }

    } else {
      // Standard AAU payment flow
      await supabase.from('payments').update({
        status: 'paid',
        paid_at: new Date().toISOString(),
        payment_method: 'card',
        stripe_payment_intent_id: session.payment_intent as string
      }).eq('id', paymentId)

      // Fire receipt
      await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
        },
        body: JSON.stringify({ paymentId, type: 'receipt' })
      })
    }
  }

  return new Response('ok')
})
