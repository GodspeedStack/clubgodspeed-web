import Stripe from 'https://esm.sh/stripe@14'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!)
    const payload = await req.json()
    const paymentType = payload.paymentType || 'aau_payment'

    let sessionData: Stripe.Checkout.SessionCreateParams;

    if (paymentType === 'training_package') {
      const { items, athleteId, parentEmail, userId, successUrl, cancelUrl } = payload

      const lineItems = items.map((item: any) => {
        const priceData: any = {
          currency: 'usd',
          product_data: { name: `Godspeed Training — ${item.name}` },
          unit_amount: Math.round(item.price * 100)
        }
        if (item.recurring) {
          priceData.recurring = { interval: 'month' }
        }
        return { price_data: priceData, quantity: item.quantity || 1 }
      })

      const hasRecurring = items.some((i: any) => i.recurring)

      const itemsJson = JSON.stringify(items.map((i: any) => ({
        p: i.price, h: i.hours, q: i.quantity
      }))).slice(0, 500)

      sessionData = {
        payment_method_types: ['card'],
        mode: hasRecurring ? 'subscription' : 'payment',
        customer_email: parentEmail,
        line_items: lineItems,
        metadata: {
          paymentType: 'training_package',
          itemsJson,
          athleteId: athleteId || '',
          parentId: userId || ''
        },
        success_url: successUrl,
        cancel_url: cancelUrl
      }
    } else {
      const { paymentId, amount, installmentNumber, parentEmail, playerName } = payload

      sessionData = {
        payment_method_types: ['card'],
        mode: 'payment',
        customer_email: parentEmail,
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Godspeed Basketball — ${playerName}`,
              description: `Spring/Summer 2026 — Payment ${installmentNumber}`
            },
            unit_amount: Math.round(amount * 100)
          },
          quantity: 1
        }],
        metadata: {
          paymentId,
          installmentNumber: installmentNumber ? installmentNumber.toString() : '',
          paymentType: 'aau_payment'
        },
        success_url: `${req.headers.get('origin')}/parent-portal?payment=success&id=${paymentId}`,
        cancel_url: `${req.headers.get('origin')}/parent-portal?payment=cancelled`
      }
    }

    const session = await stripe.checkout.sessions.create(sessionData)

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('Checkout error:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
