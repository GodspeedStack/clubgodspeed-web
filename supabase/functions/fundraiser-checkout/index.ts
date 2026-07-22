// fundraiser-checkout
// Creates a pending donation row + Stripe Checkout session.
// Public endpoint (anon). Input-validated, rate-limit friendly
// (single insert + single Stripe call). If Stripe is not yet
// configured (EIN pending), returns 503 so the frontend shows
// the "launching soon" state.
import Stripe from 'https://esm.sh/stripe@14'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SITE = 'https://www.clubgodspeed.com'

function bad(msg: string, status = 400) {
  return new Response(JSON.stringify({ error: msg }), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return bad('Method not allowed', 405)

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
  if (!stripeKey) return bad('Donations open soon', 503)

  let payload: Record<string, unknown>
  try { payload = await req.json() } catch { return bad('Invalid JSON') }

  // ---- Validation ----
  const campaignSlug = String(payload.campaignSlug || '').slice(0, 80)
  const participantSlug = payload.participantSlug ? String(payload.participantSlug).slice(0, 80) : null
  const donorName = String(payload.donorName || '').trim().slice(0, 120)
  const donorEmail = String(payload.donorEmail || '').trim().toLowerCase().slice(0, 254)
  const displayName = payload.displayName ? String(payload.displayName).trim().slice(0, 120) : null
  const isAnonymous = payload.isAnonymous === true
  const message = payload.message ? String(payload.message).trim().slice(0, 280) : null
  const amount = Math.round(Number(payload.amount) * 100) / 100

  if (!campaignSlug) return bad('Missing campaign')
  if (!donorName) return bad('Name is required')
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(donorEmail)) return bad('Valid email is required')
  if (!Number.isFinite(amount) || amount < 5 || amount > 25000) return bad('Amount must be between $5 and $25,000')

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // ---- Resolve campaign + participant ----
  const { data: campaign } = await supabase
    .from('fundraising_campaigns')
    .select('id, slug, title, status, ends_at')
    .eq('slug', campaignSlug).single()
  if (!campaign) return bad('Campaign not found', 404)
  if (campaign.status !== 'live') return bad('This campaign is not accepting donations yet', 409)
  if (campaign.ends_at && new Date(campaign.ends_at).getTime() < Date.now()) {
    return bad('This campaign has closed', 409)
  }

  // ---- Lightweight per-email throttle (bounds pending-row / session spam) ----
  const { count: recentPending } = await supabase
    .from('donations')
    .select('id', { count: 'exact', head: true })
    .eq('donor_email', donorEmail)
    .eq('status', 'pending')
    .gte('created_at', new Date(Date.now() - 10 * 60000).toISOString())
  if ((recentPending ?? 0) >= 8) {
    return bad('Too many attempts. Please wait a few minutes and try again.', 429)
  }

  let participant: { id: string; athlete_name: string; slug: string } | null = null
  if (participantSlug) {
    const { data } = await supabase
      .from('campaign_participants')
      .select('id, athlete_name, slug')
      .eq('campaign_id', campaign.id).eq('slug', participantSlug).single()
    if (!data) return bad('Player not found', 404)
    participant = data
  }

  // ---- Stripe session ----
  const stripe = new Stripe(stripeKey)
  const forLabel = participant ? `${participant.athlete_name}'s season` : 'the team'
  const returnSlug = participant
    ? `fundraise-player.html?p=${encodeURIComponent(participant.slug)}&c=${encodeURIComponent(campaign.slug)}`
    : `fundraise.html?c=${encodeURIComponent(campaign.slug)}`

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'payment',
    customer_email: donorEmail,
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
    metadata: { paymentType: 'fundraiser_donation' },
    success_url: `${SITE}/${returnSlug}&thanks=1`,
    cancel_url: `${SITE}/${returnSlug}`,
  })

  // ---- Pending donation (webhook completes it; idempotent on session id) ----
  const { error: insErr } = await supabase.from('donations').insert({
    campaign_id: campaign.id,
    participant_id: participant?.id ?? null,
    donor_name: donorName,
    donor_email: donorEmail,
    display_name: displayName,
    is_anonymous: isAnonymous,
    amount,
    message,
    stripe_session_id: session.id,
    status: 'pending',
  })
  if (insErr) {
    console.error('donation insert failed', insErr)
    return bad('Could not start donation, please try again', 500)
  }

  return new Response(JSON.stringify({ url: session.url }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
