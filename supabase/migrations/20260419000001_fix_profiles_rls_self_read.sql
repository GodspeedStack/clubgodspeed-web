-- ============================================================
-- HOTFIX: profiles RLS self-read + SECURITY DEFINER role check
--
-- Problem: migration 20260414000004 applied sec_coach_director_all
-- to the profiles table itself, creating a circular dependency.
-- The policy's USING clause reads profiles to check the user's
-- role, but that inner read is also blocked by the same policy.
-- Result: no authenticated user can read profiles, breaking login.
--
-- Fix:
--   1. Add profiles_self_read: any authenticated user can SELECT
--      their own row (id = auth.uid()). This breaks the circular
--      dependency and restores login.
--   2. Create current_user_is_staff(): a SECURITY DEFINER function
--      that bypasses RLS to check if auth.uid() is coach/director.
--      This eliminates the self-referencing subquery entirely.
--   3. Rebuild sec_coach_director_all on ALL public tables to use
--      the new function instead of the subquery. This makes the
--      pattern structurally safe -- even if new tables are added.
--   4. Update _sec_apply_baseline to use the function going forward.
--
-- Run in Supabase SQL Editor as role: postgres.
-- Idempotent. Safe to re-run.
-- ============================================================

BEGIN;

-- ── 1. Immediate fix: let every authenticated user read their own profile ──
DROP POLICY IF EXISTS profiles_self_read ON public.profiles;
CREATE POLICY profiles_self_read ON public.profiles
    FOR SELECT TO authenticated
    USING (id = auth.uid());

-- Also let authenticated users update their own profile (name, phone, etc.)
DROP POLICY IF EXISTS profiles_self_update ON public.profiles;
CREATE POLICY profiles_self_update ON public.profiles
    FOR UPDATE TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- ── 2. SECURITY DEFINER function: bypasses RLS to check staff role ──
-- This function runs as the definer (postgres), so it can read
-- profiles regardless of RLS policies on that table.
CREATE OR REPLACE FUNCTION public.current_user_is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
         WHERE id = auth.uid()
           AND role IN ('coach', 'director')
    );
$$;

-- Lock down: only authenticated and service_role can call this
REVOKE ALL ON FUNCTION public.current_user_is_staff() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_is_staff() TO authenticated, service_role;

COMMENT ON FUNCTION public.current_user_is_staff() IS
    'SECURITY DEFINER: returns true if auth.uid() has coach or director role in profiles. '
    'Used in RLS policies to avoid circular self-referencing on the profiles table.';

-- ── 3. Rebuild _sec_apply_baseline to use the function ──
CREATE OR REPLACE FUNCTION public._sec_apply_baseline(p_table regclass)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
DECLARE
    v_ident text := p_table::text;
BEGIN
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', v_ident);
    EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY',  v_ident);

    -- Service role: full access
    EXECUTE format('DROP POLICY IF EXISTS sec_service_role_all ON %s', v_ident);
    EXECUTE format(
        'CREATE POLICY sec_service_role_all ON %s '
        || 'FOR ALL TO public USING (auth.role() = %L) WITH CHECK (auth.role() = %L)',
        v_ident, 'service_role', 'service_role'
    );

    -- Coach/director: full access via SECURITY DEFINER function (no self-reference)
    EXECUTE format('DROP POLICY IF EXISTS sec_coach_director_all ON %s', v_ident);
    EXECUTE format(
        'CREATE POLICY sec_coach_director_all ON %s '
        || 'FOR ALL TO authenticated '
        || 'USING (public.current_user_is_staff()) '
        || 'WITH CHECK (public.current_user_is_staff())',
        v_ident
    );

    RAISE NOTICE 'Security baseline applied to %', v_ident;
END;
$fn$;

-- ── 4. Rebuild sec_coach_director_all on every public table ──
-- This replaces the broken subquery version with the safe function version.
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN
        SELECT format('public.%I', tablename) AS ident
          FROM pg_tables
         WHERE schemaname = 'public'
           AND tablename NOT LIKE 'pg_%'
           AND tablename NOT LIKE '\_%' ESCAPE '\'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS sec_coach_director_all ON %s', r.ident);
        EXECUTE format(
            'CREATE POLICY sec_coach_director_all ON %s '
            || 'FOR ALL TO authenticated '
            || 'USING (public.current_user_is_staff()) '
            || 'WITH CHECK (public.current_user_is_staff())',
            r.ident
        );
    END LOOP;
END $$;

COMMIT;

-- Verification: confirm your profile is readable
SELECT id, role, approved, full_name
FROM public.profiles
WHERE id = auth.uid();
