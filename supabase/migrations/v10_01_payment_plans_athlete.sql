-- ============================================================
-- v10_01: tie a payment plan to one athlete, not just to a parent.
--
-- payment_plans already carried player_name, but the parent portal only ever
-- queried by parent_id and used plans[0]. A family with two athletes therefore
-- saw a single bill and had no way to reach — or pay — the other one.
--
-- athlete_id makes the per-athlete link explicit so the portal can scope a plan,
-- its installments and its dues enrollment to one kid at a time.
-- ============================================================

ALTER TABLE public.payment_plans
    ADD COLUMN IF NOT EXISTS athlete_id uuid REFERENCES public.athletes(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS payment_plans_athlete_idx
    ON public.payment_plans (athlete_id);

COMMENT ON COLUMN public.payment_plans.athlete_id IS
    'Which athlete this plan bills for. Null on legacy rows created before v10_01;
     the portal falls back to matching player_name for those.';

-- ------------------------------------------------------------
-- Backfill: attach existing plans to the athlete they already name.
--
-- Only fills a row when EXACTLY ONE of the parent's linked athletes matches the
-- stored player_name. An ambiguous name (two kids both matching, e.g. a plan that
-- just says "Jordan") is deliberately left NULL rather than guessed at — a wrong
-- guess here would point a bill at the wrong child. The portal's legacy fallback
-- handles NULLs, and an admin can set them by hand.
-- ------------------------------------------------------------
WITH matches AS (
    SELECT
        pp.id            AS plan_id,
        MIN(a.id::text)::uuid AS athlete_id,
        COUNT(*)         AS match_count
    FROM public.payment_plans pp
    JOIN public.parent_player_links ppl ON ppl.profile_id = pp.parent_id
    JOIN public.athletes a              ON a.id = ppl.athlete_id
    WHERE pp.athlete_id IS NULL
      AND pp.player_name IS NOT NULL
      AND (
            lower(btrim(a.display_name)) = lower(btrim(pp.player_name))
         OR lower(btrim(a.first_name))   = lower(btrim(pp.player_name))
      )
    GROUP BY pp.id
)
UPDATE public.payment_plans pp
SET athlete_id = m.athlete_id
FROM matches m
WHERE pp.id = m.plan_id
  AND m.match_count = 1;

-- Deliberately NO unique (parent_id, athlete_id, season) constraint: existing data
-- may already hold duplicate plans, and failing this migration on live data is worse
-- than the duplicates. The portal picks the newest plan per athlete.
