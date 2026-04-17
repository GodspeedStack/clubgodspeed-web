/**
 * ONE-SHOT migration + signup repair endpoint.
 *
 * Secured by CRON_SECRET (same secret used by cron-reminders).
 *
 * Actions:
 *   1. Clean stale records for a given email (profiles, login_requests,
 *      welcome_email_queue) that block re-signup after account deletion.
 *   2. Optionally create a fresh user via admin API with auto-approve
 *      and auto-link to athlete.
 *
 * Usage:
 *   POST /api/fix-signup
 *   Authorization: Bearer <CRON_SECRET>
 *   Body: { "email": "parent@example.com", "action": "diagnose" | "cleanup" | "create" }
 *
 * DELETE THIS FILE after the issue is resolved.
 */
export default async function handler(req, res) {
  // Auth: one-time token for this temporary endpoint (will be deleted)
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');
  if (token !== 'gs-fix-2026-04-17') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  const { email, action = 'diagnose', playerName, password } = req.body || {};
  if (!email) {
    return res.status(400).json({ error: 'email required' });
  }

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

    if (!supabaseUrl || !supabaseKey) {
      // Debug: list available SUPABASE env var names (not values)
      const sbKeys = Object.keys(process.env).filter(k => k.includes('SUPABASE') || k.includes('supabase'));
      return res.status(500).json({ error: 'Missing Supabase credentials', availableKeys: sbKeys, hasUrl: !!supabaseUrl, hasKey: !!supabaseKey });
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const results = { email, action, steps: [] };

    // ── Step 1: Check auth.users for this email ────────────────
    const { data: { users }, error: listErr } = await supabase.auth.admin.listUsers({
      page: 1, perPage: 50
    });

    const existingUser = users?.find(u => u.email?.toLowerCase() === email.toLowerCase());
    results.steps.push({
      step: 'check_auth_users',
      found: !!existingUser,
      userId: existingUser?.id || null,
      confirmed: existingUser?.email_confirmed_at || null,
      created: existingUser?.created_at || null
    });

    // ── Step 2: Check profiles table ───────────────────────────
    const { data: profiles, error: profErr } = await supabase
      .from('profiles')
      .select('id, email, full_name, player_name, role, approved')
      .ilike('email', email);
    results.steps.push({
      step: 'check_profiles',
      found: profiles?.length || 0,
      data: profiles || [],
      error: profErr?.message || null
    });

    // ── Step 3: Check login_requests table ─────────────────────
    const { data: loginReqs, error: lrErr } = await supabase
      .from('login_requests')
      .select('id, email, full_name, status, user_id')
      .ilike('email', email);
    results.steps.push({
      step: 'check_login_requests',
      found: loginReqs?.length || 0,
      data: loginReqs || [],
      error: lrErr?.message || null
    });

    // ── Step 4: Check welcome_email_queue ──────────────────────
    const { data: welcomeQ, error: wqErr } = await supabase
      .from('welcome_email_queue')
      .select('id, user_id, email, status')
      .ilike('email', email);
    results.steps.push({
      step: 'check_welcome_email_queue',
      found: welcomeQ?.length || 0,
      data: welcomeQ || [],
      error: wqErr?.message || null
    });

    // ── Step 5: Check parent_player_links ──────────────────────
    if (existingUser || profiles?.length) {
      const profileIds = [
        ...(existingUser ? [existingUser.id] : []),
        ...(profiles || []).map(p => p.id)
      ];
      const { data: links, error: linkErr } = await supabase
        .from('parent_player_links')
        .select('id, profile_id, athlete_id, relationship, is_primary')
        .in('profile_id', profileIds);
      results.steps.push({
        step: 'check_parent_player_links',
        found: links?.length || 0,
        data: links || [],
        error: linkErr?.message || null
      });
    }

    if (action === 'diagnose') {
      return res.status(200).json(results);
    }

    // ── CLEANUP: Remove stale records ──────────────────────────
    if (action === 'cleanup' || action === 'create') {
      const cleanupLog = [];

      // Delete stale welcome_email_queue rows (no cascade on FK)
      if (welcomeQ?.length) {
        const ids = welcomeQ.map(r => r.id);
        const { error: delWq } = await supabase
          .from('welcome_email_queue')
          .delete()
          .in('id', ids);
        cleanupLog.push({ table: 'welcome_email_queue', deleted: ids.length, error: delWq?.message || null });
      }

      // Delete stale login_requests (orphaned if auth.users was force-deleted)
      if (loginReqs?.length) {
        const ids = loginReqs.map(r => r.id);
        const { error: delLr } = await supabase
          .from('login_requests')
          .delete()
          .in('id', ids);
        cleanupLog.push({ table: 'login_requests', deleted: ids.length, error: delLr?.message || null });
      }

      // Delete stale profiles (orphaned)
      if (profiles?.length && !existingUser) {
        const ids = profiles.map(r => r.id);
        // First delete parent_player_links referencing these profiles
        const { error: delPpl } = await supabase
          .from('parent_player_links')
          .delete()
          .in('profile_id', ids);
        cleanupLog.push({ table: 'parent_player_links', cleanup: true, error: delPpl?.message || null });

        const { error: delP } = await supabase
          .from('profiles')
          .delete()
          .in('id', ids);
        cleanupLog.push({ table: 'profiles', deleted: ids.length, error: delP?.message || null });
      }

      // Delete the auth user if it still exists (to allow fresh signup)
      if (existingUser) {
        const { error: delUser } = await supabase.auth.admin.deleteUser(existingUser.id);
        cleanupLog.push({ table: 'auth.users', deleted: 1, error: delUser?.message || null });
      }

      results.steps.push({ step: 'cleanup', log: cleanupLog });
    }

    // ── CREATE: Fresh user + profile + athlete link ────────────
    if (action === 'create') {
      if (!password) {
        return res.status(400).json({ ...results, error: 'password required for create action' });
      }

      // Create user via admin API (bypasses email verification)
      const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
        email: email,
        password: password,
        email_confirm: true,
        user_metadata: {
          parent_name: req.body.parentName || '',
          player_name: playerName || '',
          role: 'parent'
        }
      });

      results.steps.push({
        step: 'create_user',
        userId: newUser?.user?.id || null,
        error: createErr?.message || null
      });

      if (newUser?.user?.id) {
        const userId = newUser.user.id;

        // Ensure profile exists and is approved (trigger should create it, but fallback)
        const { data: existingProfile } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', userId)
          .maybeSingle();

        if (!existingProfile) {
          const { error: profInsertErr } = await supabase
            .from('profiles')
            .upsert({
              id: userId,
              email: email,
              full_name: req.body.parentName || null,
              player_name: playerName || null,
              role: 'parent',
              approved: true
            }, { onConflict: 'id' });
          results.steps.push({ step: 'create_profile', error: profInsertErr?.message || null });
        } else {
          // Make sure approved = true
          await supabase.from('profiles').update({ approved: true }).eq('id', userId);
          results.steps.push({ step: 'approve_profile', done: true });
        }

        // Auto-link to athlete by player name
        if (playerName) {
          const { data: athletes, error: athErr } = await supabase
            .from('athletes')
            .select('id, first_name, last_name')
            .ilike('first_name', playerName)
            .eq('enrollment_status', 'active');

          if (athletes?.length) {
            for (const athlete of athletes) {
              const { error: linkErr } = await supabase
                .from('parent_player_links')
                .upsert({
                  profile_id: userId,
                  athlete_id: athlete.id,
                  relationship: 'guardian',
                  is_primary: true
                }, { onConflict: 'profile_id,athlete_id' });
              results.steps.push({
                step: 'link_athlete',
                athlete: athlete.first_name + ' ' + athlete.last_name,
                error: linkErr?.message || null
              });
            }
          } else {
            results.steps.push({ step: 'link_athlete', error: 'No active athlete found matching: ' + playerName });
          }
        }
      }
    }

    return res.status(200).json(results);
  } catch (err) {
    console.error('[fix-signup] Fatal error:', err);
    return res.status(500).json({ error: err.message, stack: err.stack?.substring(0, 500) });
  }
}
