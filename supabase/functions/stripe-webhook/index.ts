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

    } else if (paymentType === 'fundraiser_donation') {
      // Godspeed Raise: complete pending donation (idempotent on session id).
      // The donations status trigger feeds fundraising_totals automatically.
      const { data: donation } = await supabase.from('donations')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          stripe_payment_intent_id: session.payment_intent as string
        })
        .eq('stripe_session_id', session.id)
        .eq('status', 'pending')
        .select('id')
        .single()

      // Instant thank-you + receipt to donor via fundraiser-engine
      if (donation) {
        await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/fundraiser-engine`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
          },
          body: JSON.stringify({ action: 'donation_receipt', donationId: donation.id })
        })
      }

    } else if (paymentType === 'aau_dues') {
      // Dues cascade — mirrors the proven admin markPaymentConfirmed flow so a card
      // payment shows the family as paid in BOTH the parent billing view and the admin
      // tracker with zero manual confirmation.
      const now = new Date().toISOString()
      const pi = session.payment_intent as string
      const enrollmentId = metadata.enrollmentId || ''
      const parentEmail  = metadata.parentEmail || ''
      const amt          = parseFloat(metadata.amount || '0')
      const instIds      = (metadata.installmentIds || '').split(',').map((s: string) => s.trim()).filter(Boolean)
      const receiptId    = 'stripe_' + pi

      // Idempotency: Stripe retries on any non-2xx. If we already recorded this
      // payment intent, skip the whole cascade so total_paid isn't double-counted.
      const { data: existing } = await supabase
        .from('dues_payments').select('id').eq('stripe_pi_id', pi).maybeSingle()

      if (!existing) {
        // 1. Mark installments paid — specific ones, or all outstanding on a full-balance settle.
        if (instIds.length) {
          await supabase.from('dues_installments')
            .update({ status: 'paid', paid_at: now }).in('id', instIds)
        } else if (enrollmentId) {
          await supabase.from('dues_installments')
            .update({ status: 'paid', paid_at: now })
            .eq('enrollment_id', enrollmentId).neq('status', 'paid')
        }

        // 2. Enrollment totals + status (cap at total_owed so it never overshoots).
        if (enrollmentId) {
          const { data: enr } = await supabase.from('parent_dues_enrollment')
            .select('id,total_owed,total_paid,status').eq('id', enrollmentId).maybeSingle()
          if (enr) {
            const owed = Number(enr.total_owed || 0)
            const newPaid = Math.min(Number(enr.total_paid || 0) + amt, owed)
            const newStatus = newPaid >= owed ? 'paid_in_full' : enr.status
            await supabase.from('parent_dues_enrollment')
              .update({ total_paid: newPaid, status: newStatus }).eq('id', enr.id)
          }
        }

        // 3. Audit/receipt row (unique on receipt_id = stripe_<pi>).
        await supabase.from('dues_payments').insert({
          parent_email: parentEmail,
          amount: amt,
          note: 'Card payment via Stripe',
          receipt_id: receiptId,
          status: 'completed',
          stripe_pi_id: pi
        })

        // 4. Receipt to parent (best-effort; matched by email).
        if (parentEmail) {
          await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
            },
            body: JSON.stringify({ type: 'dues_receipt', parentEmail, amount: amt, receiptId })
          }).catch(() => {})
        }
      }

    } else {
      // Standard AAU payment flow
      await supabase.from('payments').update({
        status: 'confirmed',
        paid_at: new Date().toISOString(),
        payment_method: 'card',
        stripe_payment_intent_id: session.payment_intent as string
      }).eq('id', paymentId)

      // Fire receipt to parent
      await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
        },
        body: JSON.stringify({ paymentId, type: 'receipt' })
      })

      // Notify admin
      await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
        },
        body: JSON.stringify({ paymentId, type: 'payment_admin_notify' })
      })
    }
  }

  // Godspeed Raise: reflect refunds (decrements fundraising_totals via trigger)
  if (event.type === 'charge.refunded') {
    const charge = event.data.object as Stripe.Charge
    if (charge.payment_intent) {
      await supabase.from('donations')
        .update({ status: 'refunded' })
        .eq('stripe_payment_intent_id', charge.payment_intent as string)
        .eq('status', 'completed')
    }
  }

  return new Response('ok')
})
