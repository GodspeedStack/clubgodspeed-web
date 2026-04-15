-- ============================================================
-- SECURITY HARDENING: RLS baseline + permanent guardrail
--
-- Remediates the Supabase critical alert "rls_disabled_in_public"
-- and installs an event trigger so future tables created in the
-- public schema auto-receive RLS + baseline policies.
--
-- Run in Supabase SQL Editor as role: postgres.
-- Idempotent. Safe to re-run.
-- ============================================================

BEGIN;

-- ── 1. Helper: apply baseline RLS + policies to a public table
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

    EXECUTE format('DROP POLICY IF EXISTS sec_service_role_all ON %s', v_ident);
    EXECUTE format(
        'CREATE POLICY sec_service_role_all ON %s '
        || 'FOR ALL TO public USING (auth.role() = %L) WITH CHECK (auth.role() = %L)',
        v_ident, 'service_role', 'service_role'
    );

    EXECUTE format('DROP POLICY IF EXISTS sec_coach_director_all ON %s', v_ident);
    EXECUTE format(
        'CREATE POLICY sec_coach_director_all ON %s '
        || 'FOR ALL TO authenticated '
        || 'USING (EXISTS (SELECT 1 FROM public.profiles p '
        || '               WHERE p.id = auth.uid() AND p.role IN (%L, %L))) '
        || 'WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p '
        || '           WHERE p.id = auth.uid() AND p.role IN (%L, %L)))',
        v_ident, 'coach', 'director', 'coach', 'director'
    );

    RAISE NOTICE 'Security baseline applied to %', v_ident;
END;
$fn$;

-- ── 2. Bulk remediate every public table ───────────────────
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
        PERFORM public._sec_apply_baseline(r.ident::regclass);
    END LOOP;
END $$;

-- ── 3. Event-trigger guardrail ─────────────────────────────
CREATE OR REPLACE FUNCTION public._sec_enforce_rls_on_new_table()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
DECLARE obj RECORD;
BEGIN
    FOR obj IN
        SELECT * FROM pg_event_trigger_ddl_commands()
         WHERE command_tag  = 'CREATE TABLE'
           AND object_type  = 'table'
           AND schema_name  = 'public'
    LOOP
        PERFORM public._sec_apply_baseline(obj.object_identity::regclass);
    END LOOP;
END;
$fn$;

DROP EVENT TRIGGER IF EXISTS sec_enforce_rls_on_new_table_trg;
CREATE EVENT TRIGGER sec_enforce_rls_on_new_table_trg
    ON ddl_command_end
    WHEN TAG IN ('CREATE TABLE')
    EXECUTE FUNCTION public._sec_enforce_rls_on_new_table();

-- ── 4. Monitoring view ─────────────────────────────────────
CREATE OR REPLACE VIEW public.v_security_rls_audit AS
SELECT
    pt.schemaname,
    pt.tablename,
    pt.rowsecurity                AS rls_enabled,
    pc.relforcerowsecurity        AS rls_forced,
    (SELECT COUNT(*) FROM pg_policies
      WHERE schemaname = pt.schemaname AND tablename = pt.tablename) AS policy_count,
    (SELECT COALESCE(string_agg(policyname, ', ' ORDER BY policyname), '')
       FROM pg_policies
      WHERE schemaname = pt.schemaname AND tablename = pt.tablename) AS policies
FROM pg_tables pt
JOIN pg_class  pc ON pc.relname = pt.tablename
JOIN pg_namespace pn ON pn.oid = pc.relnamespace AND pn.nspname = pt.schemaname
WHERE pt.schemaname = 'public'
ORDER BY pt.rowsecurity ASC, pt.tablename;

COMMENT ON VIEW public.v_security_rls_audit IS
    'Security audit: every public table with RLS + policy state. rls_enabled=false means data is exposed.';

REVOKE ALL ON FUNCTION public._sec_apply_baseline(regclass)   FROM PUBLIC;
REVOKE ALL ON FUNCTION public._sec_enforce_rls_on_new_table() FROM PUBLIC;
GRANT  SELECT ON public.v_security_rls_audit TO authenticated, service_role;

COMMIT;

-- Verification
SELECT schemaname, tablename, rls_enabled, rls_forced, policy_count, policies
FROM public.v_security_rls_audit
ORDER BY rls_enabled ASC, tablename;
