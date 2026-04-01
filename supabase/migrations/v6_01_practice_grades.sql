-- ============================================================
-- GODSPEED BASKETBALL -- PRACTICE GRADING SYSTEM (V2)
-- Migration: v6_01_practice_grades
-- 7-category weighted evaluation per practice per athlete
-- ============================================================

BEGIN;

-- ============================================================
-- PRACTICE_GRADES TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.practice_grades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id uuid NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.training_sessions(id) ON DELETE CASCADE,
  season text,

  -- 7 Category Scores (1-10 scale)
  effort_energy numeric(4, 2) CHECK (effort_energy IS NULL OR (effort_energy >= 1 AND effort_energy <= 10)),
  competitiveness numeric(4, 2) CHECK (competitiveness IS NULL OR (competitiveness >= 1 AND competitiveness <= 10)),
  on_ball_defense numeric(4, 2) CHECK (on_ball_defense IS NULL OR (on_ball_defense >= 1 AND on_ball_defense <= 10)),
  help_side_rotations numeric(4, 2) CHECK (help_side_rotations IS NULL OR (help_side_rotations >= 1 AND help_side_rotations <= 10)),
  listening_coachability numeric(4, 2) CHECK (listening_coachability IS NULL OR (listening_coachability >= 1 AND listening_coachability <= 10)),
  communication_leadership numeric(4, 2) CHECK (communication_leadership IS NULL OR (communication_leadership >= 1 AND communication_leadership <= 10)),
  offense_shooting numeric(4, 2) CHECK (offense_shooting IS NULL OR (offense_shooting >= 1 AND offense_shooting <= 10)),

  -- Weighted Average (Weights: 0.20, 0.20, 0.15, 0.15, 0.15, 0.10, 0.05)
  weighted_average numeric(4, 2) GENERATED ALWAYS AS (
    COALESCE(
      effort_energy * 0.20 +
      competitiveness * 0.20 +
      on_ball_defense * 0.15 +
      help_side_rotations * 0.15 +
      listening_coachability * 0.15 +
      communication_leadership * 0.10 +
      offense_shooting * 0.05,
      NULL
    )
  ) STORED,

  -- Performance Tier (inlined formula -- cannot reference another GENERATED column)
  tier text GENERATED ALWAYS AS (
    CASE
      WHEN (effort_energy * 0.20 + competitiveness * 0.20 + on_ball_defense * 0.15 + help_side_rotations * 0.15 + listening_coachability * 0.15 + communication_leadership * 0.10 + offense_shooting * 0.05) >= 9.0 THEN 'Elite/Starter'
      WHEN (effort_energy * 0.20 + competitiveness * 0.20 + on_ball_defense * 0.15 + help_side_rotations * 0.15 + listening_coachability * 0.15 + communication_leadership * 0.10 + offense_shooting * 0.05) >= 8.0 THEN 'Rotation/Starter'
      WHEN (effort_energy * 0.20 + competitiveness * 0.20 + on_ball_defense * 0.15 + help_side_rotations * 0.15 + listening_coachability * 0.15 + communication_leadership * 0.10 + offense_shooting * 0.05) >= 7.0 THEN 'Development'
      WHEN (effort_energy * 0.20 + competitiveness * 0.20 + on_ball_defense * 0.15 + help_side_rotations * 0.15 + listening_coachability * 0.15 + communication_leadership * 0.10 + offense_shooting * 0.05) >= 6.0 THEN 'Limited'
      WHEN effort_energy IS NOT NULL THEN 'Below Standard'
      ELSE NULL
    END
  ) STORED,

  -- Coach Notes
  coach_narrative text,

  -- Audit Fields
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),

  -- Unique Constraint
  UNIQUE(session_id, athlete_id)
);

COMMENT ON TABLE public.practice_grades IS 'Per-athlete performance evaluation for each training session. 7 weighted categories feed into tier assignment.';
COMMENT ON COLUMN public.practice_grades.weighted_average IS 'Calculated: effort_energy(0.20) + competitiveness(0.20) + on_ball_defense(0.15) + help_side_rotations(0.15) + listening_coachability(0.15) + communication_leadership(0.10) + offense_shooting(0.05)';
COMMENT ON COLUMN public.practice_grades.tier IS 'Derived from weighted_average: Elite/Starter (>=9.0), Rotation/Starter (>=8.0), Development (>=7.0), Limited (>=6.0), Below Standard (<6.0).';

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_practice_grades_session_id ON public.practice_grades(session_id);
CREATE INDEX idx_practice_grades_athlete_id ON public.practice_grades(athlete_id);
CREATE INDEX idx_practice_grades_season ON public.practice_grades(season);
CREATE INDEX idx_practice_grades_weighted_avg_desc ON public.practice_grades(weighted_average DESC);

-- ============================================================
-- RLS: PRACTICE_GRADES
-- ============================================================

ALTER TABLE public.practice_grades ENABLE ROW LEVEL SECURITY;

-- Coach/Admin: full access
CREATE POLICY "Coaches full access to practice_grades" ON public.practice_grades
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('coach', 'director')
    )
  );

-- SECURITY DEFINER function to resolve athlete IDs for a parent.
-- Bypasses RLS on inner tables (athletes, parent_accounts) to avoid
-- recursive RLS cascade that silently returns empty results.
CREATE OR REPLACE FUNCTION public.get_my_athlete_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id
  FROM athletes a
  JOIN parent_accounts pa ON pa.id = a.parent_account_id
  WHERE pa.user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_my_athlete_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_athlete_ids() TO anon;

-- Parent: read-only access to their own athletes (uses SECURITY DEFINER function)
CREATE POLICY "Parents read own athlete practice_grades" ON public.practice_grades
  FOR SELECT
  USING (
    athlete_id IN (SELECT public.get_my_athlete_ids())
  );

-- Parents need to read training_sessions metadata (date, title) for the
-- practice_grades join. Session metadata is not sensitive.
CREATE POLICY "Authenticated users read training_sessions"
  ON public.training_sessions
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- ============================================================
-- VIEW: PRACTICE_GRADE_TEAM_AVERAGES
-- ============================================================

CREATE OR REPLACE VIEW practice_grade_team_averages AS
SELECT
  pg.session_id,
  ts.session_date,
  t.id AS team_id,
  t.name AS team_name,
  COUNT(pg.id) AS player_count,
  ROUND(AVG(pg.effort_energy), 2) AS avg_effort_energy,
  ROUND(AVG(pg.competitiveness), 2) AS avg_competitiveness,
  ROUND(AVG(pg.on_ball_defense), 2) AS avg_on_ball_defense,
  ROUND(AVG(pg.help_side_rotations), 2) AS avg_help_side_rotations,
  ROUND(AVG(pg.listening_coachability), 2) AS avg_listening_coachability,
  ROUND(AVG(pg.communication_leadership), 2) AS avg_communication_leadership,
  ROUND(AVG(pg.offense_shooting), 2) AS avg_offense_shooting,
  ROUND(AVG(pg.weighted_average), 2) AS avg_weighted_average,
  ts.title AS session_title
FROM public.practice_grades pg
INNER JOIN public.training_sessions ts ON pg.session_id = ts.id
INNER JOIN public.teams t ON ts.team_id = t.id
GROUP BY pg.session_id, ts.session_date, t.id, t.name, ts.title;

ALTER VIEW practice_grade_team_averages SET (security_invoker = on);

-- ============================================================
-- VIEW: ATHLETE_PRACTICE_SUMMARY
-- ============================================================

CREATE OR REPLACE VIEW athlete_practice_summary AS
WITH ranked_grades AS (
  SELECT
    pg.athlete_id,
    pg.season,
    pg.tier,
    pg.effort_energy,
    pg.competitiveness,
    pg.on_ball_defense,
    pg.help_side_rotations,
    pg.listening_coachability,
    pg.communication_leadership,
    pg.offense_shooting,
    pg.weighted_average,
    pg.created_at,
    ROW_NUMBER() OVER (PARTITION BY pg.athlete_id ORDER BY pg.created_at DESC) AS rn_desc,
    ROW_NUMBER() OVER (PARTITION BY pg.athlete_id ORDER BY pg.created_at ASC) AS rn_asc
  FROM practice_grades pg
),
latest_tier AS (
  SELECT
    athlete_id,
    season,
    tier
  FROM ranked_grades
  WHERE rn_desc = 1
),
trend_data AS (
  SELECT
    athlete_id,
    ROUND(
      COALESCE(
        (
          SELECT AVG(weighted_average)
          FROM ranked_grades rg2
          WHERE rg2.athlete_id = ranked_grades.athlete_id
            AND rg2.rn_desc <= 3
        ) -
        (
          SELECT AVG(weighted_average)
          FROM ranked_grades rg3
          WHERE rg3.athlete_id = ranked_grades.athlete_id
            AND rg3.rn_asc <= 3
        ),
        0
      ),
      2
    ) AS trend_direction
  FROM ranked_grades
  WHERE rn_desc = 1
)
SELECT
  a.id AS athlete_id,
  a.display_name,
  rg.season,
  COUNT(rg.athlete_id) AS practices_graded,
  ROUND(AVG(rg.effort_energy), 2) AS avg_effort_energy,
  ROUND(AVG(rg.competitiveness), 2) AS avg_competitiveness,
  ROUND(AVG(rg.on_ball_defense), 2) AS avg_on_ball_defense,
  ROUND(AVG(rg.help_side_rotations), 2) AS avg_help_side_rotations,
  ROUND(AVG(rg.listening_coachability), 2) AS avg_listening_coachability,
  ROUND(AVG(rg.communication_leadership), 2) AS avg_communication_leadership,
  ROUND(AVG(rg.offense_shooting), 2) AS avg_offense_shooting,
  ROUND(AVG(rg.weighted_average), 2) AS avg_weighted_average,
  lt.tier AS latest_tier,
  td.trend_direction
FROM ranked_grades rg
INNER JOIN public.athletes a ON rg.athlete_id = a.id
LEFT JOIN latest_tier lt ON rg.athlete_id = lt.athlete_id AND rg.season = lt.season
LEFT JOIN trend_data td ON rg.athlete_id = td.athlete_id
GROUP BY a.id, a.display_name, rg.season, lt.tier, td.trend_direction;

ALTER VIEW athlete_practice_summary SET (security_invoker = on);

COMMIT;
