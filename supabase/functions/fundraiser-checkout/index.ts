// fundraiser-checkout
// Creates a pending donation row + Stripe Checkout session.
// Public endpoint (anon). Input-validated, rate-limit friendly
// (single insert + single Stripe call). If Stripe is not yet
// configured (EIN pending), returns 503 so the frontend shows
// the "launching soon" state.
import Stripe from 'https://esm.sh/stripe@14'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ALLOWED_ORIGINS = new Set(['https://www.clubgodspeed.com', 'https://clubgodspeed.com'])
const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://www.clubgodspeed.com',
  'Vary': 'Origin',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SITE = 'https://www.clubgodspeed.com'

// Contract 4: every error is { error: { code, message, details } }.
// `message` is donor-facing (6th grade reading level); `code` is stable for clients.
function bad(code: string, message: string, status = 400, details: unknown = null) {
  return new Response(JSON.stringify({ error: { code, message, details } }), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  // Reflect the matching production origin (preview deploys are not donation surfaces).
  const origin = req.headers.get('origin') ?? ''
  if (ALLOWED_ORIGINS.has(origin)) corsHeaders['Access-Control-Allow-Origin'] = origin

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return bad('method_not_allowed', 'Method not allowed', 405)

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
  if (!stripeKey) return bad('stripe_not_configured', 'Donations open soon', 503)

  let payload: Record<string, unknown>
  try { payload = await req.json() } catch { return bad('invalid_json', 'Invalid request') }

  // ---- Validation ----
  const campaignSlug = String(payload.campaignSlug || '').slice(0, 80)
  const participantSlug = payload.participantSlug ? String(payload.participantSlug).slice(0, 80) : null
  const donorName = String(payload.donorName || '').trim().slice(0, 120)
  const donorEmail = String(payload.donorEmail || '').trim().toLowerCase().slice(0, 254)
  const displayName = payload.displayName ? String(payload.displayName).trim().slice(0, 120) : null
  const isAnonymous = payload.isAnonymous === true
  const message = payload.message ? String(payload.message).trim().slice(0, 280) : null
  const amount = Math.round(Number(payload.amount) * 100) / 100

  if (!campaignSlug) return bad('missing_campaign', 'Missing campaign')
  if (!donorName) return bad('missing_name', 'Name is required')
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(donorEmail)) return bad('invalid_email', 'Valid email is required')
  if (!Number.isFinite(amount) || amount < 5 || amount > 25000) return bad('invalid_amount', 'Amount must be between $5 and $25,000')

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // ---- Resolve campaign + participant ----
  const { data: campaign } = await supabase
    .from('fundraising_campaigns')
    .select('id, slug, title, status, ends_at')
    .eq('slug', campaignSlug).single()
  if (!campaign) return bad('campaign_not_found', 'Campaign not found', 404)
  if (campaign.status !== 'live') return bad('campaign_not_live', 'This campaign is not accepting donations yet', 409)
  if (campaign.ends_at && new Date(campaign.ends_at).getTime() < Date.now()) {
    return bad('campaign_closed', 'This campaign has closed', 409)
  }

  // ---- Lightweight per-email throttle (bounds pending-row / session spam) ----
  const { count: recentPending } = await supabase
    .from('donations')
    .select('id', { count: 'exact', head: true })
    .eq('donor_email', donorEmail)
    .eq('status', 'pending')
    .gte('created_at', new Date(Date.now() - 10 * 60000).toISOString())
  if ((recentPending ?? 0) >= 8) {
    return bad('rate_limited', 'Too many attempts. Please wait a few minutes and try again.', 429)
  }

  let participant: { id: string; athlete_name: string; slug: string } | null = null
  if (participantSlug) {
    const { data } = await supabase
      .from('campaign_participants')
      .select('id, athlete_name, slug')
      .eq('campaign_id', campaign.id).eq('slug', participantSlug).single()
    if (!data) return bad('player_not_found', 'Player not found', 404)
    participant = data
  }

  // ---- Pending donation FIRST (contract 3) ----
  // The row exists before Stripe does, so a completed checkout can never
  // arrive at the webhook without a row to complete. If Stripe fails after
  // this insert, the row expires via the engine (status -> expired), never deleted.
  const { data: pending, error: insErr } = await supabase.from('donations').insert({
    campaign_id: campaign.id,
    participant_id: participant?.id ?? null,
    donor_name: donorName,
    donor_email: donorEmail,
    display_name: displayName,
    is_anonymous: isAnonymous,
    amount,
    message,
    status: 'pending',
  }).select('id').single()
  if (insErr || !pending) {
    console.error('donation insert failed', insErr)
    return bad('donation_insert_failed', 'Could not start donation, please try again', 500)
  }

  // ---- Stripe session ----
  const stripe = new Stripe(stripeKey)
  const forLabel = participant ? `${participant.athlete_name}'s season` : 'the team'
  const returnSlug = participant
    ? `fundraise-player.html?p=${encodeURIComponent(participant.slug)}&c=${encodeURIComponent(campaign.slug)}`
    : `fundraise.html?c=${encodeURIComponent(campaign.slug)}`

  let session: Stripe.Checkout.Session
  try {
    session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: donorEmail,
      client_reference_id: pending.id,
      // Checkout expires in 1 hour; the engine expires the pending row only
      // after PENDING_TTL_HOURS (24), so a row can never be expired while
      // its checkout is still payable.
      expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `Godspeed Basketball: ${campaign.title}`,
            description: `Donation supporting ${forLabel}`,
          },
          unit_amount: Math.round(amount * 100),
        },
        quantity: 1,
      }],
      metadata: {
        paymentType: 'fundraiser_donation',
        donationId: pending.id,
        campaignId: campaign.id,
        participantId: participant?.id ?? '',
      },
      success_url: `${SITE}/${returnSlug}&thanks=1`,
      cancel_url: `${SITE}/${returnSlug}`,
    }, {
      // Stripe-side idempotency: a client retry for the same pending row
      // returns the same session instead of a second one.
      idempotencyKey: `donation-${pending.id}`,
    })
  } catch (e) {
    console.error('stripe session create failed', pending.id, e)
    return bad('stripe_unavailable', 'Checkout is unavailable right now. Please try again in a minute.', 502)
  }

  const { error: linkErr } = await supabase.from('donations')
    .update({ stripe_session_id: session.id })
    .eq('id', pending.id)
  if (linkErr) {
    // The webhook also carries metadata.donationId, so completion still reconciles.
    console.error('donation session link failed', pending.id, linkErr)
  }

  return new Response(JSON.stringify({ url: session.url }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
