-- ============================================================
-- FULL SETUP + SEED: Training Hours (Anton + Quest + Emory)
-- Run in Supabase SQL Editor as role: postgres (or service_role).
-- Idempotent. Safe to re-run.
-- ============================================================

BEGIN;

-- ── 1. Table ────────────────────────────────────────────────
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

CREATE INDEX IF NOT EXISTS idx_training_hour_packages_athlete
    ON public.training_hour_packages(athlete_id);

-- ── 2. RLS ──────────────────────────────────────────────────
ALTER TABLE public.training_hour_packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS training_hours_coach_full   ON public.training_hour_packages;
DROP POLICY IF EXISTS training_hours_parent_read  ON public.training_hour_packages;
DROP POLICY IF EXISTS training_hours_service      ON public.training_hour_packages;

CREATE POLICY training_hours_coach_full ON public.training_hour_packages
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role IN ('coach', 'director')
        )
    );

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

CREATE POLICY training_hours_service ON public.training_hour_packages
    FOR ALL
    USING (auth.role() = 'service_role');

-- ── 3. Summary view ─────────────────────────────────────────
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

COMMIT;

-- ── 4. Seed / Upsert ────────────────────────────────────────
BEGIN;

-- Anton
INSERT INTO public.training_hour_packages (
    athlete_id, season, hours_purchased, purchase_date, notes
) VALUES (
    'a1000000-0000-0000-0000-000000000006',
    '2025-2026',
    20.00,
    '2026-03-21',
    'Package 1 (COMPLETED): $400 / 5 sessions x 2hr = 10 hours. '
 || 'Package 2 (IN PROGRESS): $400 / 5 sessions x 2hr = 10 hours. '
 || '  - Package 2 used so far: 4 hrs (2026-03-21 + 2026-04-01, 2hr each). '
 || '  - Package 2 remaining: 6 hrs. '
 || 'Quest partnered on every Anton session. '
 || 'NOTE: historical Package 1 sessions still need to be backfilled into training_sessions.'
) ON CONFLICT (athlete_id, season) DO UPDATE SET
    hours_purchased = EXCLUDED.hours_purchased,
    purchase_date   = LEAST(public.training_hour_packages.purchase_date, EXCLUDED.purchase_date),
    notes           = EXCLUDED.notes,
    updated_at      = now();

-- Quest
INSERT INTO public.training_hour_packages (
    athlete_id, season, hours_purchased, purchase_date, notes
) VALUES (
    'a1000000-0000-0000-0000-000000000002',
    '2025-2026',
    20.00,
    '2026-03-21',
    'COMPLIMENTARY — no payment from Quest family. '
 || 'Quest partnered on every Anton individual session at no charge. '
 || 'Hours mirror Anton: Package 1 (10 hrs, completed) + Package 2 (10 hrs, in progress — 4 used / 6 remaining). '
 || 'Also attended Emory/Quest April sessions (Apr 7 + Apr 14, 1 hr each) separately.'
) ON CONFLICT (athlete_id, season) DO UPDATE SET
    hours_purchased = EXCLUDED.hours_purchased,
    purchase_date   = LEAST(public.training_hour_packages.purchase_date, EXCLUDED.purchase_date),
    notes           = EXCLUDED.notes,
    updated_at      = now();

-- Emory
INSERT INTO public.training_hour_packages (
    athlete_id, season, hours_purchased, purchase_date, notes
) VALUES (
    'a1000000-0000-0000-0000-000000000007',
    '2025-2026',
    4.00,
    '2026-04-07',
    'April package: $40 (1 hr first session) + $135 (3 hrs at $45/hr) = $175 total, 4 hours purchased. '
 || 'Point-guard training with Coach Scott. Quest partnered.'
) ON CONFLICT (athlete_id, season) DO UPDATE SET
    hours_purchased = EXCLUDED.hours_purchased,
    purchase_date   = LEAST(public.training_hour_packages.purchase_date, EXCLUDED.purchase_date),
    notes           = EXCLUDED.notes,
    updated_at      = now();

COMMIT;

-- ── 5. Verification ─────────────────────────────────────────
SELECT
    ath.first_name,
    thp.hours_purchased,
    thp.purchase_date,
    ths.hours_used,
    ths.hours_remaining,
    ths.sessions_attended
FROM public.training_hour_packages thp
JOIN public.athletes ath ON ath.id = thp.athlete_id
LEFT JOIN public.training_hours_summary ths
  ON ths.athlete_id = thp.athlete_id AND ths.season = thp.season
WHERE thp.athlete_id IN (
    'a1000000-0000-0000-0000-000000000006',  -- Anton
    'a1000000-0000-0000-0000-000000000002',  -- Quest
    'a1000000-0000-0000-0000-000000000007'   -- Emory
)
  AND thp.season = '2025-2026'
ORDER BY ath.first_name;
