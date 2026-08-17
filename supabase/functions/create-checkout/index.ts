import Stripe from 'https://esm.sh/stripe@14'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PORTAL_URL = 'https://www.clubgodspeed.com/parent-portal.html'

// Stripe rejects charges under 50 cents.
const MIN_CHARGE = 0.5

// Server-side price list. The cart in training-cart.js shows these same numbers,
// but the browser is never trusted for money: name, price, hours and recurring all
// come from HERE, keyed by the item id the cart sends. Keep the two in sync.
type TrainingItem = {
  name: string
  price: number
  hours: number | 'unlimited'
  recurring: boolean
}

const TRAINING_CATALOG: Record<string, TrainingItem> = {
  '1-session': { name: '1 Session', price: 45.0, hours: 1, recurring: false },
  '5-pack': { name: '5 Pack', price: 200.0, hours: 5, recurring: false },
  '10-pack': { name: '10 Pack', price: 350.0, hours: 10, recurring: false },
  'unlimited': { name: 'Unlimited Monthly', price: 250.0, hours: 'unlimited', recurring: true },
}

const MAX_QTY = 20

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

/** Errors whose message is safe to show a parent verbatim. */
class PublicError extends Error {
  code: string
  status: number
  constructor(message: string, code: string, status = 400) {
    super(message)
    this.code = code
    this.status = status
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Find the dues enrollment this signed-in parent is actually paying against.
 *
 * Resolved server-side on purpose. The old version took enrollmentId, amount and
 * parentEmail straight from the request body, so anyone could aim a $1 charge at
 * another family's enrollment. Now the browser only asks "charge me N dollars" and
 * the server decides which row that lands on.
 *
 * parent_email is the canonical key (it is what admin-os and stripe-webhook join on),
 * so it is tried first; the athlete link is the fallback for enrollments created
 * before the email was set.
 */
async function resolveEnrollment(
  admin: any,
  userId: string,
  email: string,
  rawEmail: string
) {
  // Try the normalised address, then the address exactly as the account stores it —
  // enrollments typed in by hand are not reliably lower-cased. Deliberately not
  // ilike(): `_` is a wildcard there and a real wildcard in plenty of addresses.
  for (const candidate of [...new Set([email, rawEmail].filter(Boolean))]) {
    const { data } = await admin
      .from('parent_dues_enrollment')
      .select('id,total_owed,total_paid,status')
      .eq('parent_email', candidate)
      .order('total_paid', { ascending: false })
      .limit(1)
    if (data && data.length) return data[0]
  }

  // Fallback: enrollment attached to an athlete this parent is linked to.
  const { data: links } = await admin
    .from('parent_player_links')
    .select('athlete_id')
    .eq('profile_id', userId)
  const athleteIds = (links || []).map((l: any) => l.athlete_id).filter(Boolean)
  if (!athleteIds.length) return null

  const { data } = await admin
    .from('parent_dues_enrollment')
    .select('id,total_owed,total_paid,status')
    .in('athlete_id', athleteIds)
    .order('total_paid', { ascending: false })
    .limit(1)
  return data && data.length ? data[0] : null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // ── Authenticate ────────────────────────────────────────────────────────
    // supabase/config.toml sets verify_jwt = false on this function, so the API
    // gateway waves every request through. That makes this block the only thing
    // between the open internet and our Stripe account -- without it a stranger
    // can mint Checkout Sessions (card-testing fraud) and aim charges at any family.
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
    if (!token) {
      return json({ error: 'Please sign in before paying.', code: 'AUTH_REQUIRED' }, 401)
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Rejects the anon key too -- it carries no `sub` claim, so it is not a user.
    const { data: userData, error: userError } = await admin.auth.getUser(token)
    const user = userData?.user
    if (userError || !user) {
      return json(
        { error: 'Your session expired. Please sign in again and retry.', code: 'AUTH_REQUIRED' },
        401
      )
    }

    const userEmail = (user.email || '').toLowerCase()
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!)
    const payload = await req.json()
    const paymentType = payload.paymentType || ''

    let sessionData: Stripe.Checkout.SessionCreateParams

    if (paymentType === 'training_package') {
      const rawItems = Array.isArray(payload.items) ? payload.items : []
      if (!rawItems.length) throw new PublicError('Your cart is empty.', 'EMPTY_CART')

      // Price and hours come from TRAINING_CATALOG, never from the request.
      const items: Array<TrainingItem & { quantity: number }> = rawItems.map((raw: any) => {
        const cat = TRAINING_CATALOG[String(raw?.id ?? '')]
        if (!cat) {
          throw new PublicError(
            'One of the items in your cart is no longer available. Please refresh and try again.',
            'UNKNOWN_ITEM'
          )
        }
        const qty = Math.min(Math.max(parseInt(raw?.quantity, 10) || 1, 1), MAX_QTY)
        return { ...cat, quantity: qty }
      })

      // Only honour an athlete this parent is actually linked to.
      let athleteId: string | null = null
      if (payload.athleteId) {
        const { data: link } = await admin
          .from('parent_player_links')
          .select('athlete_id')
          .eq('profile_id', user.id)
          .eq('athlete_id', payload.athleteId)
          .limit(1)
        if (link && link.length) athleteId = payload.athleteId
      }

      const lineItems = items.map((item) => {
        const priceData: any = {
          currency: 'usd',
          product_data: { name: `Godspeed Training — ${item.name}` },
          unit_amount: Math.round(item.price * 100),
        }
        if (item.recurring) priceData.recurring = { interval: 'month' }
        return { price_data: priceData, quantity: item.quantity }
      })

      const hasRecurring = items.some((i) => i.recurring)

      // Webhook reads this to credit training hours -- server-priced values only.
      const itemsJson = JSON.stringify(
        items.map((i) => ({ p: i.price, h: i.hours, q: i.quantity }))
      ).slice(0, 500)

      sessionData = {
        payment_method_types: ['card'],
        mode: hasRecurring ? 'subscription' : 'payment',
        customer_email: userEmail,
        line_items: lineItems,
        metadata: {
          paymentType: 'training_package',
          itemsJson,
          athleteId: athleteId || '',
          parentId: user.id,
        },
        success_url: `${PORTAL_URL}?payment=success&type=training`,
        cancel_url: `${PORTAL_URL}?payment=cancelled`,
      }
    } else if (paymentType === 'aau_dues') {
      // Dues-aware card checkout. The webhook runs the full cascade
      // (dues_installments + parent_dues_enrollment + dues_payments) off this
      // metadata, so everything in it is server-derived.
      const enrollment = await resolveEnrollment(admin, user.id, userEmail, user.email || '')
      if (!enrollment) {
        // Failing here is deliberate: a charge we cannot attribute to an enrollment
        // would take a parent's money and settle nothing. Venmo still works meanwhile.
        throw new PublicError(
          "We could not find your dues account, so we did not charge you. Please contact Coach Scott and he'll get it set up.",
          'NO_ENROLLMENT'
        )
      }

      const owed = Number(enrollment.total_owed || 0)
      const paid = Number(enrollment.total_paid || 0)
      const outstanding = round2(owed - paid)

      if (outstanding <= 0) {
        throw new PublicError(
          'Your dues are already paid in full. Nothing to pay right now.',
          'ALREADY_PAID'
        )
      }

      const requested = Number(payload.amount)
      if (!Number.isFinite(requested) || requested <= 0) {
        throw new PublicError('That payment amount is not valid.', 'INVALID_AMOUNT')
      }

      // Clamp instead of reject: a tab left open since a Venmo payment landed will
      // ask for a stale, larger balance. Charging the real balance is the kind thing.
      // Partial (installment) payments are still allowed -- only the ceiling is enforced.
      const amount = round2(Math.min(requested, outstanding))
      if (amount < MIN_CHARGE) {
        throw new PublicError(
          `Card payments have to be at least $${MIN_CHARGE.toFixed(2)}.`,
          'AMOUNT_TOO_SMALL'
        )
      }

      const playerName = typeof payload.playerName === 'string' ? payload.playerName.slice(0, 80) : ''
      const label = typeof payload.label === 'string' ? payload.label.slice(0, 80) : ''

      sessionData = {
        payment_method_types: ['card'],
        mode: 'payment',
        customer_email: userEmail,
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: `Godspeed Basketball — ${playerName || 'Season Dues'}`,
                description: label || 'AAU Season Dues',
              },
              unit_amount: Math.round(amount * 100),
            },
            quantity: 1,
          },
        ],
        metadata: {
          paymentType: 'aau_dues',
          // Always set, so the webhook never has to guess which family paid.
          enrollmentId: enrollment.id,
          parentEmail: userEmail,
          amount: amount.toString(),
        },
        success_url: `${PORTAL_URL}?payment=success&type=dues`,
        cancel_url: `${PORTAL_URL}?payment=cancelled`,
      }
    } else {
      // The old catch-all branch settled a `payments` row using columns that do not
      // exist in that table (v2_03_payments.sql), and no page has sent this type
      // since. An unrecognised type must not be able to create a real charge.
      throw new PublicError('That payment type is not supported.', 'UNKNOWN_PAYMENT_TYPE')
    }

    const session = await stripe.checkout.sessions.create(sessionData)

    return json({ url: session.url })
  } catch (error) {
    if (error instanceof PublicError) {
      console.error('Checkout rejected:', error.code, error.message)
      return json({ error: error.message, code: error.code }, error.status)
    }
    // Anything else may carry Stripe/internal detail -- log it, don't echo it.
    console.error('Checkout error:', error instanceof Error ? error.message : String(error))
    return json(
      { error: 'We could not start checkout. Please try again in a moment.', code: 'CHECKOUT_FAILED' },
      400
    )
  }
})
