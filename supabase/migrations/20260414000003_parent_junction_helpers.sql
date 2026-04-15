-- ============================================================
-- MIGRATION: junction-aware helpers + RLS updates
-- Required so secondary parents (like Melissa) actually see their
-- athlete's data via RLS, and so admin UI can list all parents.
-- Run in Supabase SQL Editor as role: postgres.
-- Idempotent.
-- ============================================================

BEGIN;

-- ── 1. Helper: athletes the current user is a parent of ────
CREATE OR REPLACE FUNCTION public.current_user_athlete_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    SELECT ap.athlete_id
      FROM public.athlete_parents ap
      JOIN public.parent_accounts pa ON pa.id = ap.parent_account_id
     WHERE pa.user_id = auth.uid()
    UNION
    SELECT a.id
      FROM public.athletes a
      JOIN public.parent_accounts pa ON pa.id = a.parent_account_id
     WHERE pa.user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.current_user_athlete_ids() TO authenticated, anon, service_role;

-- ── 2. Admin view: every athlete ↔ every parent ────────────
CREATE OR REPLACE VIEW public.v_athlete_parents_detail AS
SELECT
    ath.id                                   AS athlete_id,
    ath.first_name                           AS athlete_first_name,
    ath.last_name                            AS athlete_last_name,
    pa.id                                    AS parent_account_id,
    pa.email                                 AS parent_email,
    TRIM(CONCAT(COALESCE(pa.first_name,''),' ',COALESCE(pa.last_name,'')))
                                             AS parent_name,
    ap.relationship,
    ap.is_primary,
    ap.created_at                            AS linked_at
FROM public.athlete_parents ap
JOIN public.athletes         ath ON ath.id = ap.athlete_id
JOIN public.parent_accounts  pa  ON pa.id  = ap.parent_account_id;

COMMENT ON VIEW public.v_athlete_parents_detail IS
    'One row per (athlete, parent) pair. Admin/director UI source of truth for multi-parent display.';

-- ── 3. Refresh training_hour_packages parent_read to use junction
DROP POLICY IF EXISTS training_hours_parent_read ON public.training_hour_packages;

CREATE POLICY training_hours_parent_read ON public.training_hour_packages
    FOR SELECT
    USING (athlete_id IN (SELECT public.current_user_athlete_ids()));

COMMIT;

-- Verification
SELECT parent_name, parent_email, relationship, is_primary
FROM public.v_athlete_parents_detail
WHERE athlete_id = 'a1000000-0000-0000-0000-000000000008'
ORDER BY is_primary DESC;
