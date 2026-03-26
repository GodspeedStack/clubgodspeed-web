-- ============================================================
-- MIGRATION: Training Hours Tracking
-- Adds purchased/used hours tracking per athlete per season.
-- Run in Supabase SQL Editor as role: postgres
-- ============================================================

BEGIN;

-- ── 1. Training Hours Packages ─────────────────────────────
-- Tracks how many hours a parent purchased for an athlete.
-- One row per athlete per season (or per package purchase).
CREATE TABLE IF NOT EXISTS public.training_hour_packages (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    athlete_id      uuid NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
    season          text NOT NULL DEFAULT '2025-2026',
    hours_purchased numeric(6,2) NOT NULL DEFAULT 0,
    purchase_date   date,
    notes           text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),

    UNIQUE (athlete_id, season)
);

COMMENT ON TABLE public.training_hour_packages IS
    'Tracks purchased training hours per athlete per season. hours_purchased is the total bought.';

CREATE INDEX idx_training_hour_packages_athlete
    ON public.training_hour_packages(athlete_id);

-- ── 2. RLS ─────────────────────────────────────────────────
ALTER TABLE public.training_hour_packages ENABLE ROW LEVEL SECURITY;

-- Coaches/directors: full access
CREATE POLICY training_hours_coach_full ON public.training_hour_packages
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role IN ('coach', 'director')
        )
    );

-- Parents: read own athlete's packages
CREATE POLICY training_hours_parent_read ON public.training_hour_packages
    FOR SELECT
    USING (
        athlete_id IN (
            SELECT id FROM public.athletes
            WHERE parent_account_id IN (
                SELECT id FROM public.parent_accounts
                WHERE user_id = auth.uid()
            )
        )
    );

-- Service role: full access (for edge functions)
CREATE POLICY training_hours_service ON public.training_hour_packages
    FOR ALL
    USING (auth.role() = 'service_role');

-- ── 3. View: Training Hours Summary ───────────────────────
-- Computes hours_used from actual attendance + session durations.
CREATE OR REPLACE VIEW public.training_hours_summary AS
SELECT
    thp.athlete_id,
    thp.season,
    thp.hours_purchased,
    thp.purchase_date,
    COALESCE(used.total_minutes, 0) / 60.0 AS hours_used,
    thp.hours_purchased - COALESCE(used.total_minutes, 0) / 60.0 AS hours_remaining,
    COALESCE(used.sessions_attended, 0) AS sessions_attended
FROM public.training_hour_packages thp
LEFT JOIN LATERAL (
    SELECT
        SUM(COALESCE(ts.duration_minutes, 0)) AS total_minutes,
        COUNT(*) AS sessions_attended
    FROM public.training_attendance ta
    JOIN public.training_sessions ts ON ts.id = ta.session_id
    WHERE ta.athlete_id = thp.athlete_id
      AND ta.status IN ('present', 'late')
      AND ts.season = thp.season
) used ON true;

COMMENT ON VIEW public.training_hours_summary IS
    'Joins purchased hours with computed hours used from attendance. Read by report pages.';

COMMIT;
