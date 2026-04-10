// =====================================================================
// admin-impersonate
// Edge function that mints a single-use magic link for a target user
// so a coach/director can see exactly what that user sees.
//
// Security:
// - JWT verification ON (Supabase dashboard)
// - Caller role is re-verified from profiles table (not trusted from JWT claims)
// - Cannot impersonate other admins
// - Hard rate limit: 10 impersonations per admin per hour
// - Minimum reason length enforced
// - Append-only audit log with IP + user agent
// - Link TTL: 15 minutes, single use (Supabase default for magiclink)
// =====================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ALLOWED_ADMIN_ROLES = new Set(['coach', 'director'])
const RATE_LIMIT_MAX = 10
const RATE_LIMIT_WINDOW_MIN = 60
const LINK_TTL_SECONDS = 900 // 15 minutes
const REASON_MIN_LEN = 3
const REASON_MAX_LEN = 500

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface ImpersonateRequest {
  target_user_id: string
  reason: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'method_not_allowed' })
  }

  // ------------------------------------------------------------------
  // 1. Authenticate caller
  // ------------------------------------------------------------------
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) {
    return jsonResponse(401, { error: 'missing_bearer_token' })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const siteUrl = Deno.env.get('SITE_URL') ?? 'https://www.clubgodspeed.com'

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  })

  const { data: userData, error: userErr } = await callerClient.auth.getUser()
  if (userErr || !userData?.user) {
    return jsonResponse(401, { error: 'invalid_token' })
  }
  const caller = userData.user

  // ------------------------------------------------------------------
  // 2. Re-verify caller role from profiles (don't trust JWT claims alone)
  // ------------------------------------------------------------------
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  })

  const { data: callerProfile, error: callerProfileErr } = await admin
    .from('profiles')
    .select('id, role, full_name, email')
    .eq('id', caller.id)
    .maybeSingle()

  if (callerProfileErr) {
    console.error('profile_lookup_error', callerProfileErr)
    return jsonResponse(500, { error: 'profile_lookup_failed' })
  }
  if (!callerProfile || !ALLOWED_ADMIN_ROLES.has(callerProfile.role)) {
    return jsonResponse(403, { error: 'forbidden_role' })
  }

  // ------------------------------------------------------------------
  // 3. Parse & validate request
  // ------------------------------------------------------------------
  let body: ImpersonateRequest
  try {
    body = await req.json()
  } catch {
    return jsonResponse(400, { error: 'invalid_json' })
  }

  const targetUserId = (body?.target_user_id ?? '').trim()
  const reason = (body?.reason ?? '').trim()

  if (!isUuid(targetUserId)) {
    return jsonResponse(400, { error: 'invalid_target_user_id' })
  }
  if (reason.length < REASON_MIN_LEN || reason.length > REASON_MAX_LEN) {
    return jsonResponse(400, { error: 'reason_length_invalid' })
  }
  if (targetUserId === caller.id) {
    return jsonResponse(400, { error: 'cannot_impersonate_self' })
  }

  // ------------------------------------------------------------------
  // 4. Rate limit
  // ------------------------------------------------------------------
  const { data: rateData, error: rateErr } = await admin.rpc(
    'recent_impersonation_count',
    { p_admin_id: caller.id, p_window_minutes: RATE_LIMIT_WINDOW_MIN },
  )
  if (rateErr) {
    console.error('rate_limit_check_failed', rateErr)
    return jsonResponse(500, { error: 'rate_limit_check_failed' })
  }
  if ((rateData ?? 0) >= RATE_LIMIT_MAX) {
    return jsonResponse(429, {
      error: 'rate_limited',
      detail: `max ${RATE_LIMIT_MAX} impersonations per ${RATE_LIMIT_WINDOW_MIN} minutes`,
    })
  }

  // ------------------------------------------------------------------
  // 5. Lookup target + block admin-on-admin impersonation
  // ------------------------------------------------------------------
  const { data: targetAuth, error: targetAuthErr } =
    await admin.auth.admin.getUserById(targetUserId)

  if (targetAuthErr || !targetAuth?.user?.email) {
    return jsonResponse(404, { error: 'target_not_found' })
  }
  const targetEmail = targetAuth.user.email

  const { data: targetProfile } = await admin
    .from('profiles')
    .select('id, role, full_name')
    .eq('id', targetUserId)
    .maybeSingle()

  if (targetProfile && ALLOWED_ADMIN_ROLES.has(targetProfile.role)) {
    return jsonResponse(403, { error: 'cannot_impersonate_admin' })
  }

  // ------------------------------------------------------------------
  // 6. Mint single-use magic link
  // ------------------------------------------------------------------
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: targetEmail,
    options: {
      redirectTo: `${siteUrl}/parent-portal.html?impersonated=1`,
    },
  })

  if (linkErr || !linkData?.properties?.action_link) {
    console.error('link_generation_failed', linkErr)
    return jsonResponse(500, { error: 'link_generation_failed' })
  }

  // ------------------------------------------------------------------
  // 7. Write immutable audit row (fail closed if audit fails)
  // ------------------------------------------------------------------
  const ipAddress =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    null
  const userAgent = req.headers.get('user-agent') ?? null

  const { error: auditErr } = await admin.from('impersonation_audit').insert({
    admin_user_id: caller.id,
    admin_name: callerProfile.full_name,
    admin_email: callerProfile.email,
    target_user_id: targetUserId,
    target_email: targetEmail,
    target_name: targetProfile?.full_name ?? null,
    reason,
    ip_address: ipAddress,
    user_agent: userAgent,
    link_expires_at: new Date(Date.now() + LINK_TTL_SECONDS * 1000).toISOString(),
  })

  if (auditErr) {
    console.error('audit_write_failed', auditErr)
    return jsonResponse(500, { error: 'audit_write_failed' })
  }

  // Structured log for Supabase log drain / alerting
  console.log(JSON.stringify({
    event: 'impersonation_link_issued',
    admin_user_id: caller.id,
    admin_email: callerProfile.email,
    target_user_id: targetUserId,
    target_email: targetEmail,
    reason_length: reason.length,
    ip: ipAddress,
    ttl_seconds: LINK_TTL_SECONDS,
  }))

  return jsonResponse(200, {
    action_link: linkData.properties.action_link,
    target_email: targetEmail,
    target_name: targetProfile?.full_name ?? null,
    expires_in_seconds: LINK_TTL_SECONDS,
    instructions:
      'Open this link in an incognito/private window. Close the tab when finished.',
  })
})

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
}
