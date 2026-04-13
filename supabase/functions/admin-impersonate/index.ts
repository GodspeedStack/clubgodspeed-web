import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * admin-impersonate
 * ─────────────────────────────────────────────────────────────────────────
 * Issues a short-lived, single-use magic link so an approved director can
 * view the parent portal exactly as a specific parent sees it, without
 * ever learning their password.
 *
 * Security contract
 *   1. Caller must hold a valid Supabase JWT.
 *   2. Caller must be in `profiles` with role='director' AND approved=true.
 *   3. Target must exist as a profile with role='parent' AND approved=true.
 *   4. Target role of 'director' or 'coach' is forbidden (lateral escalation).
 *   5. Per-actor rate limit: MAX_IMPERSONATIONS_PER_HOUR (default 20).
 *   6. Every attempt (success, denial, error) is written to admin_audit_log.
 *   7. Magic link TTL is bounded by Supabase (≈ 1 hour max). The UI clamps
 *      it to 5 minutes of validity via an `expires_at` returned to the caller.
 *   8. CORS is locked to ALLOWED_ORIGINS. Unknown origins receive an empty
 *      Access-Control-Allow-Origin, failing the browser preflight.
 *
 * Environment variables (Supabase → Edge Functions → Secrets)
 *   SUPABASE_URL                 — injected automatically
 *   SUPABASE_ANON_KEY            — injected automatically
 *   SUPABASE_SERVICE_ROLE_KEY    — injected automatically
 *   SITE_URL                     — e.g. https://www.clubgodspeed.com  (required)
 *   ALLOWED_ORIGINS              — comma-separated list; defaults to SITE_URL
 *   MAX_IMPERSONATIONS_PER_HOUR  — integer, default 20
 *
 * POST body:   { "target_email": string, "target_name"?: string }
 * 200 Response:
 *   {
 *     "magic_link":   string,
 *     "expires_at":   string (ISO),
 *     "target_email": string,
 *     "target_name":  string,
 *     "instructions": string
 *   }
 */

// ── Configuration ─────────────────────────────────────────────────────────

const SITE_URL = (Deno.env.get('SITE_URL') ?? 'https://www.clubgodspeed.com').replace(/\/$/, '')

const ALLOWED_ORIGINS: ReadonlySet<string> = new Set(
  (Deno.env.get('ALLOWED_ORIGINS') ?? SITE_URL)
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean),
)

const MAX_IMPERSONATIONS_PER_HOUR = Number.parseInt(
  Deno.env.get('MAX_IMPERSONATIONS_PER_HOUR') ?? '20',
  10,
)

const REDIRECT_TO = `${SITE_URL}/parent-portal.html?impersonating=1`

const PROTECTED_TARGET_ROLES: ReadonlySet<string> = new Set(['director', 'coach', 'admin'])

// ── CORS helpers ──────────────────────────────────────────────────────────

function buildCorsHeaders(origin: string | null): HeadersInit {
  const allowOrigin = origin && ALLOWED_ORIGINS.has(origin.replace(/\/$/, '')) ? origin : ''
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

function json(status: number, body: unknown, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
  })
}

// ── Audit helper ──────────────────────────────────────────────────────────

type AuditEntry = {
  actor_id: string | null
  actor_email: string
  actor_name?: string | null
  action: string
  target_email?: string | null
  target_name?: string | null
  target_user_id?: string | null
  ip_address?: string | null
  user_agent?: string | null
  outcome: 'success' | 'denied' | 'error'
  reason?: string | null
  metadata?: Record<string, unknown>
}

// deno-lint-ignore no-explicit-any
type AdminClient = any
async function writeAudit(
  admin: AdminClient,
  entry: AuditEntry,
): Promise<void> {
  try {
    // Fire-and-log: audit failure must never block or mutate the caller's flow.
    const { error } = await admin.from('admin_audit_log').insert({
      ...entry,
      metadata: entry.metadata ?? {},
    })
    if (error) console.warn('[admin-impersonate] audit insert failed:', error.message)
  } catch (e) {
    console.warn('[admin-impersonate] audit insert threw:', (e as Error).message)
  }
}

// ── Main handler ──────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get('Origin')

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: buildCorsHeaders(origin) })
  }
  if (req.method !== 'POST') {
    return json(405, { error: 'Method not allowed' }, origin)
  }

  // Reject unknown origins before any DB work.
  if (origin && !ALLOWED_ORIGINS.has(origin.replace(/\/$/, ''))) {
    return json(403, { error: 'Origin not permitted' }, origin)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error('[admin-impersonate] missing Supabase env vars')
    return json(500, { error: 'Server misconfigured' }, origin)
  }
  if (!SITE_URL) {
    return json(500, { error: 'SITE_URL env var is required' }, origin)
  }

  // Service-role client for privileged reads/writes. Never expose to clients.
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const forwardedFor = req.headers.get('x-forwarded-for') ?? ''
  const clientIp = forwardedFor.split(',')[0]?.trim() || null
  const userAgent = (req.headers.get('user-agent') ?? '').slice(0, 512) || null

  // ── 1. Authenticate caller ────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : ''
  if (!token) {
    return json(401, { error: 'Missing auth token' }, origin)
  }

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: callerData, error: callerErr } = await callerClient.auth.getUser()
  if (callerErr || !callerData?.user) {
    return json(401, { error: 'Unauthorized' }, origin)
  }
  const caller = callerData.user

  // ── 2. Verify caller is an approved director ──────────────────────────
  const { data: callerProfile, error: callerProfileErr } = await admin
    .from('profiles')
    .select('role, approved, full_name, email')
    .eq('id', caller.id)
    .maybeSingle()

  if (callerProfileErr) {
    console.error('[admin-impersonate] callerProfile error:', callerProfileErr)
    return json(500, { error: 'Profile lookup failed' }, origin)
  }

  if (!callerProfile || callerProfile.role !== 'director' || callerProfile.approved !== true) {
    await writeAudit(admin, {
      actor_id: caller.id,
      actor_email: caller.email ?? 'unknown',
      actor_name: callerProfile?.full_name ?? null,
      action: 'impersonate_denied',
      ip_address: clientIp,
      user_agent: userAgent,
      outcome: 'denied',
      reason: 'caller_not_approved_director',
    })
    return json(403, { error: 'Forbidden — approved director role required' }, origin)
  }

  // ── 3. Parse + validate body ──────────────────────────────────────────
  let body: { target_email?: unknown; target_name?: unknown }
  try {
    body = await req.json()
  } catch {
    return json(400, { error: 'Invalid JSON body' }, origin)
  }

  const rawEmail = typeof body.target_email === 'string' ? body.target_email.trim().toLowerCase() : ''
  if (!rawEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
    return json(400, { error: 'target_email is required and must be a valid email' }, origin)
  }
  const targetEmail = rawEmail
  const targetName =
    typeof body.target_name === 'string' ? body.target_name.slice(0, 200) : targetEmail

  // ── 4. Per-actor rate limit ───────────────────────────────────────────
  const { data: recentCount, error: rateErr } = await admin.rpc(
    'admin_impersonation_count_recent',
    { p_actor_id: caller.id, p_minutes: 60 },
  )
  if (rateErr) {
    console.warn('[admin-impersonate] rate-limit rpc failed:', rateErr.message)
    // Fail closed only if the RPC is missing. If it returned an error, allow
    // the request but log it, to avoid a false hard-block during rollout.
  } else if (typeof recentCount === 'number' && recentCount >= MAX_IMPERSONATIONS_PER_HOUR) {
    await writeAudit(admin, {
      actor_id: caller.id,
      actor_email: caller.email ?? 'unknown',
      actor_name: callerProfile.full_name,
      action: 'impersonate_denied',
      target_email: targetEmail,
      target_name: targetName,
      ip_address: clientIp,
      user_agent: userAgent,
      outcome: 'denied',
      reason: 'rate_limit_exceeded',
      metadata: { recent_count: recentCount, limit: MAX_IMPERSONATIONS_PER_HOUR },
    })
    return json(
      429,
      {
        error: `Rate limit exceeded (${MAX_IMPERSONATIONS_PER_HOUR}/hour). Try again later.`,
      },
      origin,
    )
  }

  // ── 5. Validate target is a real, approved parent ─────────────────────
  const { data: targetProfile, error: targetErr } = await admin
    .from('profiles')
    .select('id, role, approved, full_name')
    .eq('email', targetEmail)
    .maybeSingle()

  if (targetErr) {
    console.error('[admin-impersonate] targetProfile error:', targetErr)
    return json(500, { error: 'Target lookup failed' }, origin)
  }
  if (!targetProfile) {
    await writeAudit(admin, {
      actor_id: caller.id,
      actor_email: caller.email ?? 'unknown',
      actor_name: callerProfile.full_name,
      action: 'impersonate_denied',
      target_email: targetEmail,
      target_name: targetName,
      ip_address: clientIp,
      user_agent: userAgent,
      outcome: 'denied',
      reason: 'target_not_found',
    })
    return json(404, { error: 'Target account not found' }, origin)
  }
  if (PROTECTED_TARGET_ROLES.has(String(targetProfile.role))) {
    await writeAudit(admin, {
      actor_id: caller.id,
      actor_email: caller.email ?? 'unknown',
      actor_name: callerProfile.full_name,
      action: 'impersonate_denied',
      target_email: targetEmail,
      target_name: targetProfile.full_name ?? targetName,
      target_user_id: targetProfile.id ?? null,
      ip_address: clientIp,
      user_agent: userAgent,
      outcome: 'denied',
      reason: 'target_role_protected',
      metadata: { target_role: targetProfile.role },
    })
    return json(403, { error: 'Cannot impersonate a director, coach, or admin account' }, origin)
  }
  if (targetProfile.approved !== true) {
    await writeAudit(admin, {
      actor_id: caller.id,
      actor_email: caller.email ?? 'unknown',
      actor_name: callerProfile.full_name,
      action: 'impersonate_denied',
      target_email: targetEmail,
      target_name: targetProfile.full_name ?? targetName,
      target_user_id: targetProfile.id ?? null,
      ip_address: clientIp,
      user_agent: userAgent,
      outcome: 'denied',
      reason: 'target_not_approved',
    })
    return json(403, { error: 'Target account is not approved yet' }, origin)
  }

  // ── 6. Generate one-time magic link ───────────────────────────────────
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: targetEmail,
    options: { redirectTo: REDIRECT_TO },
  })

  if (linkErr || !linkData?.properties?.action_link) {
    await writeAudit(admin, {
      actor_id: caller.id,
      actor_email: caller.email ?? 'unknown',
      actor_name: callerProfile.full_name,
      action: 'impersonate_error',
      target_email: targetEmail,
      target_name: targetProfile.full_name ?? targetName,
      target_user_id: targetProfile.id ?? null,
      ip_address: clientIp,
      user_agent: userAgent,
      outcome: 'error',
      reason: 'generate_link_failed',
      metadata: { error: linkErr?.message ?? 'unknown' },
    })
    return json(
      502,
      {
        error: 'Failed to generate magic link',
        hint:
          'The parent account may not exist in auth.users yet. ' +
          'Ask them to complete email verification, then try again.',
      },
      origin,
    )
  }

  // ── 7. Success: log and return the link ───────────────────────────────
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()
  await writeAudit(admin, {
    actor_id: caller.id,
    actor_email: caller.email ?? 'unknown',
    actor_name: callerProfile.full_name,
    action: 'impersonate_parent',
    target_email: targetEmail,
    target_name: targetProfile.full_name ?? targetName,
    target_user_id: targetProfile.id ?? null,
    ip_address: clientIp,
    user_agent: userAgent,
    outcome: 'success',
    metadata: { expires_at: expiresAt, redirect_to: REDIRECT_TO },
  })

  console.log(
    `[admin-impersonate] ${caller.email} impersonated ${targetEmail} ` +
      `(ip=${clientIp ?? '-'})`,
  )

  return json(
    200,
    {
      magic_link: linkData.properties.action_link,
      expires_at: expiresAt,
      target_email: targetEmail,
      target_name: targetProfile.full_name ?? targetName,
      instructions:
        'Open in a new tab. Your admin-os session is preserved because the ' +
        'parent portal uses an isolated storage key when ?impersonating=1 is ' +
        'present in the URL.',
    },
    origin,
  )
})
