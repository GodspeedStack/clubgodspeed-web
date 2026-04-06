import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * admin-reset-signup
 *
 * Deletes a stuck/broken auth.users row so the person can re-register.
 * Also cleans up any orphaned profiles and login_requests rows.
 *
 * Requires: caller must be a director-role user (verified via profiles table).
 *
 * POST body: { "email": "someone@example.com" }
 * Returns:   { "success": true, "deleted_user_id": "uuid" }
 */
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // --- Auth: verify caller is a director ---
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

    // Verify caller identity via their JWT
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

    // Check caller is a director
    const adminClient = createClient(supabaseUrl, serviceRoleKey)
    const { data: callerProfile } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', caller.id)
      .single()

    if (!callerProfile || callerProfile.role !== 'director') {
      return new Response(JSON.stringify({ error: 'Forbidden — director role required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // --- Parse request ---
    const { email } = await req.json()
    if (!email || typeof email !== 'string') {
      return new Response(JSON.stringify({ error: 'email is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const normalizedEmail = email.trim().toLowerCase()

    // --- Find the user ---
    const { data: { users }, error: listError } = await adminClient.auth.admin.listUsers({
      page: 1,
      perPage: 50,
    })

    if (listError) {
      return new Response(JSON.stringify({ error: 'Failed to list users: ' + listError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const targetUser = (users || []).find(
      (u: any) => (u.email || '').toLowerCase() === normalizedEmail
    )

    if (!targetUser) {
      return new Response(JSON.stringify({ error: 'No auth user found with email: ' + normalizedEmail, suggestion: 'User may not exist — they can try signing up again.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // --- Delete orphaned rows first (cascade should handle this, but be explicit) ---
    await adminClient.from('login_requests').delete().eq('user_id', targetUser.id)
    await adminClient.from('profiles').delete().eq('id', targetUser.id)

    // --- Delete the auth user ---
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(targetUser.id)

    if (deleteError) {
      return new Response(JSON.stringify({ error: 'Failed to delete user: ' + deleteError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log(`[admin-reset-signup] Director ${caller.email} deleted stuck signup for ${normalizedEmail} (uid: ${targetUser.id})`)

    return new Response(JSON.stringify({
      success: true,
      deleted_user_id: targetUser.id,
      message: `Auth record for ${normalizedEmail} has been deleted. They can now sign up again.`,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[admin-reset-signup] Unexpected error:', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
