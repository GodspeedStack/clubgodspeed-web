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
      // Match on the session id, or on metadata.donationId when the checkout
      // function could not write the session id back (contract 3: no lost money).
      let donationQuery = supabase.from('donations')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          stripe_payment_intent_id: session.payment_intent as string,
          stripe_session_id: session.id
        })
        .eq('status', 'pending')
      donationQuery = metadata.donationId
        ? donationQuery.eq('id', metadata.donationId)
        : donationQuery.eq('stripe_session_id', session.id)
      const { data: donation, error: donErr } = await donationQuery.select('id').maybeSingle()

      if (donErr) console.error('[stripe-webhook] donation complete failed', session.id, donErr)
      if (!donation && !donErr) {
        // Either already completed (Stripe retry, idempotent no-op) or no row
        // at all. Only the second case is money without a record: say so.
        const { data: existing } = await supabase.from('donations')
          .select('id, status').eq('stripe_session_id', session.id).maybeSingle()
        if (!existing) {
          console.error(
            `[stripe-webhook] UNRECONCILED donation: session ${session.id} pi ${session.payment_intent} ` +
            `amount ${session.amount_total} has no donations row. Reconcile manually in admin-fundraising.`
          )
        }
      }

      // Instant thank-you + receipt to donor via fundraiser-engine
      if (donation) {
        const receiptHeaders: Record<string, string> = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
        }
        // Forward the shared secret when configured (engine enforces it).
        const cronSecret = Deno.env.get('CRON_SECRET')
        if (cronSecret) receiptHeaders['x-cron-secret'] = cronSecret
        await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/fundraiser-engine`, {
          method: 'POST',
          headers: receiptHeaders,
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
        // Resolve the enrollment by id (preferred) or by parent email — same join key
        // the admin markPaymentConfirmed flow uses to bridge portal + dues tables.
        // create-checkout now always stamps enrollmentId, so the email path only
        // covers sessions created before that change.
        //
        // limit(1), not maybeSingle(): maybeSingle() errors out when a family somehow
        // has two enrollment rows, and that error used to skip the whole cascade
        // silently — money in, balance untouched, nobody told.
        let enrQuery = supabase.from('parent_dues_enrollment')
          .select('id,total_owed,total_paid,status')
        enrQuery = enrollmentId
          ? enrQuery.eq('id', enrollmentId)
          : enrQuery.eq('parent_email', parentEmail)
        const { data: enrRows } = await enrQuery
          .order('total_paid', { ascending: false }).limit(1)
        const enr = enrRows && enrRows.length ? enrRows[0] : null

        if (!enr) {
          console.error(
            `[stripe-webhook] UNRECONCILED dues payment ${pi}: no enrollment for ` +
            `id="${enrollmentId}" email="${parentEmail}". Receipt row flagged for admin.`
          )
        }

        let paidInFull = false

        // 1. Enrollment totals + status (cap at total_owed so it never overshoots).
        if (enr) {
          const owed = Number(enr.total_owed || 0)
          const newPaid = Math.min(Number(enr.total_paid || 0) + amt, owed)
          paidInFull = newPaid >= owed
          await supabase.from('parent_dues_enrollment')
            .update({ total_paid: newPaid, status: paidInFull ? 'paid_in_full' : enr.status })
            .eq('id', enr.id)
        }

        // 2. Mark installments paid. Explicit ids win; otherwise mirror markPaymentConfirmed:
        //    full settle -> all outstanding; partial -> just the earliest outstanding one.
        if (instIds.length) {
          await supabase.from('dues_installments')
            .update({ status: 'paid', paid_at: now }).in('id', instIds)
        } else if (enr) {
          if (paidInFull) {
            await supabase.from('dues_installments')
              .update({ status: 'paid', paid_at: now })
              .eq('enrollment_id', enr.id).neq('status', 'paid')
          } else {
            const { data: nextInst } = await supabase.from('dues_installments')
              .select('id').eq('enrollment_id', enr.id).neq('status', 'paid')
              .order('installment_number', { ascending: true }).limit(1).maybeSingle()
            if (nextInst) {
              await supabase.from('dues_installments')
                .update({ status: 'paid', paid_at: now }).eq('id', nextInst.id)
            }
          }
        }

        // 3. Audit/receipt row (unique on receipt_id = stripe_<pi>).
        // When no enrollment matched, the money still arrived — say so loudly in the
        // note so it shows up in the admin payments list instead of vanishing.
        await supabase.from('dues_payments').insert({
          parent_email: parentEmail,
          amount: amt,
          note: enr
            ? 'Card payment via Stripe'
            : 'Card payment via Stripe — NOT auto-applied (no matching enrollment). Apply manually.',
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

  // Godspeed Raise: donor closed or abandoned checkout; Stripe says it is no
  // longer payable, so expire the pending row now instead of waiting for the cron.
  if (event.type === 'checkout.session.expired') {
    const session = event.data.object as Stripe.Checkout.Session
    if ((session.metadata || {}).paymentType === 'fundraiser_donation') {
      await supabase.from('donations')
        .update({ status: 'expired' })
        .eq('stripe_session_id', session.id)
        .eq('status', 'pending')
    }
  }

  // Godspeed Raise: reflect refunds (decrements fundraising_totals via trigger).
  // Only a FULL refund flips the donation to 'refunded' — the totals trigger
  // subtracts the whole amount, so a partial refund must not trigger it.
  if (event.type === 'charge.refunded') {
    const charge = event.data.object as Stripe.Charge
    const fullyRefunded = charge.amount_refunded >= charge.amount
    if (charge.payment_intent && fullyRefunded) {
      await supabase.from('donations')
        .update({ status: 'refunded' })
        .eq('stripe_payment_intent_id', charge.payment_intent as string)
        .eq('status', 'completed')
    }
  }

  return new Response('ok')
})
