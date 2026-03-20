import Stripe from 'https://esm.sh/stripe@14'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!)

Deno.serve(async (req) => {
  const payload = await req.json()
  const paymentType = payload.paymentType || 'aau_payment'

  let sessionData: Stripe.Checkout.SessionCreateParams;

  if (paymentType === 'training_package') {
    const { items, athleteId, parentEmail, userId, successUrl, cancelUrl } = payload

    const lineItems = items.map((item: any) => {
      if (item.recurring) {
        return {
          price: item.stripePriceId || 'price_xxx', // recurring price
          quantity: 1
        }
      }
      return {
        price_data: {
          currency: 'usd',
          product_data: { name: `Godspeed Training Checkout — ${item.name}` },
          unit_amount: Math.round(item.price * 100)
        },
        quantity: item.quantity
      }
    })

    const hasRecurring = items.some((i: any) => i.recurring)
    
    // Store array mappings explicitly for the webhook
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
        itemsJson: itemsJson,
        athleteId: athleteId || '',
        parentId: userId || ''
      },
      success_url: successUrl,
      cancel_url: cancelUrl
    }
  } else {
    // Standard AAU Payment Plan Flow
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
    headers: { 'Content-Type': 'application/json' }
  })
})
