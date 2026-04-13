-- =====================================================================
-- Migration: v7_02_admin_audit_log
-- Purpose:   Immutable audit trail for privileged director actions,
--            starting with parent-portal impersonation.
-- Contract:
--   - Service role writes (never trust client)
--   - Directors may SELECT their own entries only
--   - Rows are append-only; no UPDATE/DELETE policies exposed
--   - Retain for minimum 365 days (enforced operationally, not by table)
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id        UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
    actor_email     TEXT         NOT NULL,
    actor_name      TEXT,
    action          TEXT         NOT NULL,                    -- e.g. 'impersonate_parent', 'impersonate_denied'
    target_email    TEXT,
    target_name     TEXT,
    target_user_id  UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
    ip_address      INET,
    user_agent      TEXT,
    outcome         TEXT         NOT NULL DEFAULT 'success',  -- 'success' | 'denied' | 'error'
    reason          TEXT,
    metadata        JSONB        NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.admin_audit_log IS
  'Append-only audit log of privileged director actions. Retain >= 365 days.';

-- Indices for the common query patterns:
--   * "show me my recent impersonations"  → (actor_id, created_at DESC)
--   * "who impersonated this parent?"      → (target_email, created_at DESC)
--   * "all denied attempts in last 24h"    → (outcome, created_at DESC) WHERE outcome != 'success'
--   * "what did actor do today?"           → (action, created_at DESC)
CREATE INDEX IF NOT EXISTS idx_admin_audit_actor_time
    ON public.admin_audit_log (actor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_audit_target_time
    ON public.admin_audit_log (target_email, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_audit_action_time
    ON public.admin_audit_log (action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_audit_denied
    ON public.admin_audit_log (created_at DESC)
    WHERE outcome <> 'success';

-- ---------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Directors can read their own audit entries (for self-review UI).
DROP POLICY IF EXISTS admin_audit_read_own ON public.admin_audit_log;
CREATE POLICY admin_audit_read_own
    ON public.admin_audit_log
    FOR SELECT
    TO authenticated
    USING (
        actor_id = auth.uid()
        AND EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.role = 'director'
              AND p.approved = TRUE
        )
    );

-- Directors explicitly cannot INSERT from the client. The edge function
-- uses the service role key, which bypasses RLS by design. Do not create
-- any INSERT / UPDATE / DELETE policies here — this keeps the table
-- append-only from any authenticated path.

-- ---------------------------------------------------------------------
-- Rate-limit helper: count impersonations a given actor has performed
-- in the last N minutes. Used by the admin-impersonate edge function
-- to enforce a per-director hourly cap without standing up Redis.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_impersonation_count_recent(
    p_actor_id UUID,
    p_minutes  INT DEFAULT 60
)
RETURNS INT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COUNT(*)::INT
    FROM public.admin_audit_log
    WHERE actor_id = p_actor_id
      AND action = 'impersonate_parent'
      AND outcome = 'success'
      AND created_at >= NOW() - (p_minutes || ' minutes')::INTERVAL;
$$;

REVOKE ALL ON FUNCTION public.admin_impersonation_count_recent(UUID, INT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_impersonation_count_recent(UUID, INT) TO service_role;
