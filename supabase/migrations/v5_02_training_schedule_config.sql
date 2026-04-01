-- ============================================================
-- v5_02: Monthly training schedule configuration
-- Stores sessions/week, weeks, total sessions, and cost
-- per month for parent-facing schedule & dues breakdown.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.training_schedule_config (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    season          text        NOT NULL,          -- e.g. 'Spring/Summer 2026'
    month_label     text        NOT NULL,          -- e.g. 'March 2026'
    month_index     smallint    NOT NULL,          -- 1-12 for sorting
    season_segment  text        NOT NULL,          -- e.g. 'Winter/Spring', 'Spring', 'Summer'
    sessions_per_week numeric(3,1) NOT NULL,       -- e.g. 2.5, 3.0
    weeks           smallint    NOT NULL,
    total_sessions  smallint    NOT NULL,
    cost            numeric(10,2) NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (season, month_index)
);

-- Index for season lookups
CREATE INDEX IF NOT EXISTS idx_tsc_season ON public.training_schedule_config(season);

-- RLS
ALTER TABLE public.training_schedule_config ENABLE ROW LEVEL SECURITY;

-- Coaches/directors: full access
CREATE POLICY tsc_admin_all ON public.training_schedule_config
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
              AND role IN ('coach', 'director')
        )
    );

-- Parents: read-only
CREATE POLICY tsc_parent_select ON public.training_schedule_config
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
              AND role = 'parent'
        )
    );

-- Service role bypass (edge functions)
CREATE POLICY tsc_service ON public.training_schedule_config
    FOR ALL
    USING (auth.role() = 'service_role');

-- ============================================================
-- Seed: Spring/Summer 2026 training schedule
-- ============================================================
INSERT INTO public.training_schedule_config
    (season, month_label, month_index, season_segment, sessions_per_week, weeks, total_sessions, cost)
VALUES
    ('Spring/Summer 2026', 'March 2026',  3,  'Winter/Spring', 2.5, 4, 10, 250.00),
    ('Spring/Summer 2026', 'April 2026',  4,  'Spring',        3.0, 4, 12, 300.00),
    ('Spring/Summer 2026', 'May 2026',    5,  'Spring',        3.0, 4, 12, 300.00),
    ('Spring/Summer 2026', 'June 2026',   6,  'Summer',        3.0, 4, 12, 300.00),
    ('Spring/Summer 2026', 'July 2026',   7,  'Summer',        3.0, 4, 12, 300.00)
ON CONFLICT (season, month_index) DO UPDATE SET
    season_segment    = EXCLUDED.season_segment,
    sessions_per_week = EXCLUDED.sessions_per_week,
    weeks             = EXCLUDED.weeks,
    total_sessions    = EXCLUDED.total_sessions,
    cost              = EXCLUDED.cost,
    updated_at        = now();

-- ============================================================
-- RPC: get_training_schedule(p_season text)
-- Returns schedule rows for a given season, ordered by month.
-- ============================================================
CREATE OR REPLACE FUNCTION get_training_schedule(p_season text DEFAULT 'Spring/Summer 2026')
RETURNS TABLE (
    month_label     text,
    season_segment  text,
    sessions_per_week numeric,
    weeks           smallint,
    total_sessions  smallint,
    cost            numeric
) LANGUAGE sql SECURITY DEFINER AS $$
    SELECT
        t.month_label,
        t.season_segment,
        t.sessions_per_week,
        t.weeks,
        t.total_sessions,
        t.cost
    FROM public.training_schedule_config t
    WHERE t.season = p_season
    ORDER BY t.month_index;
$$;
