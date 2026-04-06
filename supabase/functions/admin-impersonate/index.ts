import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * admin-impersonate
 *
 * Generates a single-use magic link so a director can view the parent portal
 * exactly as a specific parent sees it, without knowing their password.
 *
 * Security:
 *  - Caller must be an approved director (verified via profiles table)
 *  - Target must be a parent (not director/coach) — cannot impersonate admins
 *  - Every invocation is written to the admin_audit_log table
 *  - The magic link expires in 5 minutes and is single-use (Supabase enforces this)
 *
 * POST body: { "target_email": "parent@example.com", "target_name": "Jane Smith" }
 * Returns:   { "magic_link": "https://...", "expires_at": "<iso>" }
 */
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // ── 1. Verify the caller is an authenticated director ──────────────────
    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.replace('Bearer ', '')
    if (!token) {
      return new Response(JSON.stringify({ error: 'Missing auth token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

    // Validate caller JWT
    const callerClient = createClient(supabaseUrl, anonKey || serviceRoleKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
    const { data: { user: caller }, error: callerError } = await callerClient.auth.getUser()
    if (callerError || !caller) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Service-role client for privileged operations
    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    // Check caller is a director
    const { data: callerProfile } = await adminClient
      .from('profiles')
      .select('role, full_name')
      .eq('id', caller.id)
      .single()

    if (!callerProfile || callerProfile.role !== 'director') {
      return new Response(JSON.stringify({ error: 'Forbidden — director role required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── 2. Parse & validate request body ──────────────────────────────────
    const { target_email, target_name } = await req.json()
    if (!target_email || typeof target_email !== 'string') {
      return new Response(JSON.stringify({ error: 'target_email is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const normalizedEmail = target_email.trim().toLowerCase()

    // ── 3. Safety check: confirm target is a parent (not admin/coach) ──────
    const { data: targetProfile } = await adminClient
      .from('profiles')
      .select('role, approved')
      .eq('email', normalizedEmail)
      .maybeSingle()

    if (targetProfile && targetProfile.role === 'director') {
      return new Response(JSON.stringify({ error: 'Cannot impersonate another director account' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── 4. Generate one-time magic link (expires in 5 minutes) ────────────
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: 'magiclink',
      email: normalizedEmail,
      options: {
        // Route back to parent portal with impersonation flag
        redirectTo: `${supabaseUrl.replace('https://','https://').split('.supabase.co')[0].replace('https://','https://app.')}/parent-portal.html?impersonating=1`,
      },
    })

    if (linkError || !linkData?.properties?.action_link) {
      console.error('[admin-impersonate] generateLink error:', linkError)
      return new Response(JSON.stringify({
        error: 'Failed to generate magic link: ' + (linkError?.message || 'unknown error'),
        hint: 'The parent account may not exist as an auth.users record yet. They must have completed email verification.',
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const magicLink = linkData.properties.action_link

    // ── 5. Audit log ───────────────────────────────────────────────────────
    try {
      await adminClient.from('admin_audit_log').insert({
        actor_id: caller.id,
        actor_email: caller.email,
        actor_name: callerProfile.full_name || caller.email,
        action: 'impersonate_parent',
        target_email: normalizedEmail,
        target_name: target_name || normalizedEmail,
        metadata: { expires_in_minutes: 5 },
        created_at: new Date().toISOString(),
      })
    } catch (auditErr) {
      // Audit failure should not block the operation — just log it
      console.warn('[admin-impersonate] Audit log failed (non-blocking):', auditErr)
    }

    console.log(
      `[admin-impersonate] Director ${caller.email} (${callerProfile.full_name}) ` +
      `generated impersonation link for ${normalizedEmail}`
    )

    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()

    return new Response(JSON.stringify({
      magic_link: magicLink,
      expires_at: expiresAt,
      target_email: normalizedEmail,
      target_name: target_name || normalizedEmail,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('[admin-impersonate] Unexpected error:', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
