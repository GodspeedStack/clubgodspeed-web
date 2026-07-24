import Stripe from 'https://esm.sh/stripe@14'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PORTAL_URL = 'https://www.clubgodspeed.com/parent-portal.html'

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
        success_url: successUrl || PORTAL_URL,
        cancel_url: cancelUrl || PORTAL_URL
      }
    } else if (paymentType === 'aau_dues') {
      // Dues-aware card checkout. Carries enough metadata for the webhook to run
      // the full dues cascade (dues_installments + parent_dues_enrollment + dues_payments)
      // so the parent billing view AND admin tracker auto-update — no manual confirm.
      //   enrollmentId   — parent_dues_enrollment.id (drives totals + status)
      //   installmentIds — specific dues_installments being paid (empty = settle full balance)
      //   amount         — dollars being charged
      const { amount, enrollmentId, installmentIds, parentEmail, playerName, label } = payload

      if (!amount || amount <= 0) throw new Error('Invalid dues amount')

      // Stripe metadata values are strings ≤500 chars; a family's installment list fits easily.
      const instCsv = Array.isArray(installmentIds) ? installmentIds.join(',') : (installmentIds || '')

      sessionData = {
        payment_method_types: ['card'],
        mode: 'payment',
        customer_email: parentEmail,
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Godspeed Basketball — ${playerName || 'Season Dues'}`,
              description: label || 'AAU Season Dues'
            },
            unit_amount: Math.round(amount * 100)
          },
          quantity: 1
        }],
        metadata: {
          paymentType: 'aau_dues',
          enrollmentId: enrollmentId || '',
          installmentIds: instCsv.slice(0, 490),
          parentEmail: parentEmail || '',
          amount: amount.toString()
        },
        success_url: `${PORTAL_URL}?payment=success&type=dues`,
        cancel_url: `${PORTAL_URL}?payment=cancelled`
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
        success_url: `${PORTAL_URL}?payment=success&id=${paymentId}`,
        cancel_url: `${PORTAL_URL}?payment=cancelled`
      }
    }

    const session = await stripe.checkout.sessions.create(sessionData)

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('Checkout error:', message)
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
