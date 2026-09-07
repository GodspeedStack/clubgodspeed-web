-- ============================================================
-- v19_02_raise_fall_2026_campaign.sql
-- Godspeed Raise: reset the single program campaign for Fall 2026.
-- Decision (Scott, 2026-09-07): one program campaign across all three
-- current teams, 30-day window from launch day.
--
-- What this does (idempotent, re-runnable while the campaign is draft):
--   1. Renames campaign 10u-season-2026 -> fall-2026-season and rewrites
--      title/story/goal/dates. Row id is kept (no FK churn).
--   2. Rebuilds campaign_participants from the CURRENT rosters
--      (team_rosters.left_at IS NULL on active teams): 19 distinct
--      athletes (8 play on two teams; each appears once).
--      Public display name = first name + last initial (minors).
--      Parent link = primary parent_player_links row whose profile is role 'parent'.
--   3. Goal = $750 per athlete (existing decision) x 19 = $14,250.
--
-- Safety: refuses to run if the campaign is not 'draft' or if any
-- donation or contact exists (those would reference old participants).
--
-- LAUNCH DAY: re-run only the "dates" block at the bottom so the 30-day
-- window starts the day you flip the campaign live.
-- ============================================================

DO $$
DECLARE
  v_campaign_id UUID;
  v_status TEXT;
  v_donations INT;
  v_contacts INT;
  v_count INT;
BEGIN
  SELECT id, status INTO v_campaign_id, v_status
    FROM fundraising_campaigns WHERE slug IN ('10u-season-2026','fall-2026-season')
    ORDER BY (slug = 'fall-2026-season') DESC LIMIT 1;
  IF v_campaign_id IS NULL THEN RAISE EXCEPTION 'campaign row not found'; END IF;
  IF v_status <> 'draft' THEN RAISE EXCEPTION 'campaign is % (must be draft to reset)', v_status; END IF;

  SELECT count(*) INTO v_donations FROM donations WHERE campaign_id = v_campaign_id;
  SELECT count(*) INTO v_contacts FROM fundraiser_contacts fc
    JOIN campaign_participants cp ON cp.id = fc.participant_id WHERE cp.campaign_id = v_campaign_id;
  IF v_donations > 0 OR v_contacts > 0 THEN
    RAISE EXCEPTION 'refusing to reset: % donations and % contacts exist', v_donations, v_contacts;
  END IF;

  -- 2. Participants from current rosters
  DELETE FROM campaign_participants WHERE campaign_id = v_campaign_id;

  INSERT INTO campaign_participants (campaign_id, athlete_name, slug, photo_url, personal_goal, parent_id, display_order)
  WITH roster AS (
    SELECT DISTINCT ON (a.id) a.id AS athlete_id, a.first_name, a.last_name, a.photo_url
    FROM team_rosters tr
    JOIN athletes a ON a.id = tr.athlete_id
    JOIN teams t ON t.id = tr.team_id
    WHERE tr.left_at IS NULL AND t.is_active
    ORDER BY a.id
  ), named AS (
    SELECT r.athlete_id, r.photo_url,
      -- First name + last initial. Some first_name values already carry an
      -- initial ("Anton B"); only append when the last name adds one.
      CASE WHEN r.last_name IS NOT NULL AND trim(r.last_name) <> ''
             AND NOT (trim(r.first_name) ~* ('\m' || left(trim(r.last_name),1) || '\.?$'))
           THEN trim(r.first_name) || ' ' || upper(left(trim(r.last_name),1)) || '.'
           ELSE trim(r.first_name) END AS shown
    FROM roster r
  ), slugged AS (
    SELECT n.*, trim(both '-' from lower(regexp_replace(n.shown, '[^a-z0-9]+', '-', 'gi'))) AS base_slug
    FROM named n
  ), uniq AS (
    SELECT s.*, CASE WHEN count(*) OVER (PARTITION BY base_slug) > 1
      THEN base_slug || '-' || row_number() OVER (PARTITION BY base_slug ORDER BY athlete_id)
      ELSE base_slug END AS slug
    FROM slugged s
  ), parent AS (
    SELECT DISTINCT ON (ppl.athlete_id) ppl.athlete_id, ppl.profile_id
    FROM parent_player_links ppl
    JOIN profiles p ON p.id = ppl.profile_id AND p.role = 'parent'
    ORDER BY ppl.athlete_id, ppl.is_primary DESC NULLS LAST, ppl.created_at
  )
  SELECT v_campaign_id, u.shown, u.slug, u.photo_url, 750.00, pa.profile_id,
         row_number() OVER (ORDER BY u.shown)
  FROM uniq u LEFT JOIN parent pa ON pa.athlete_id = u.athlete_id;

  SELECT count(*) INTO v_count FROM campaign_participants WHERE campaign_id = v_campaign_id;
  IF v_count = 0 THEN RAISE EXCEPTION 'no participants built; rosters empty?'; END IF;

  -- 1 + 3. Campaign row
  UPDATE fundraising_campaigns SET
    slug = 'fall-2026-season',
    title = 'Godspeed Basketball: Fall 2026 Season Fund',
    subtitle = 'Every dollar goes to the kids. Zero platform fees.',
    story = 'Our ' || v_count || ' athletes across three teams are working toward a full fall season: tournaments, training, travel, and gear. Unlike traditional fundraising platforms that keep up to 24 percent of what you give, Godspeed runs its own platform. Your donation, minus only card processing, lands directly in the program.',
    goal_amount = v_count * 750.00,
    starts_at = date_trunc('day', now()),
    ends_at = date_trunc('day', now()) + interval '30 days',
    updated_at = now()
  WHERE id = v_campaign_id;

  RAISE NOTICE 'fall-2026-season reset: % participants, goal $%', v_count, v_count * 750;
END $$;

-- ---------- LAUNCH DAY: run just this block before flipping to live ----------
-- UPDATE fundraising_campaigns
--    SET starts_at = date_trunc('day', now()),
--        ends_at   = date_trunc('day', now()) + interval '30 days'
--  WHERE slug = 'fall-2026-season' AND status = 'draft';

-- ---------- PROOF ----------
-- SELECT slug, status, goal_amount, starts_at::date, ends_at::date,
--        (SELECT count(*) FROM campaign_participants p WHERE p.campaign_id = c.id) AS participants,
--        (SELECT count(*) FROM campaign_participants p WHERE p.campaign_id = c.id AND parent_id IS NOT NULL) AS linked
--   FROM fundraising_campaigns c WHERE slug = 'fall-2026-season';
-- Expect: draft | 14250 | today | today+30 | 19 | 15
-- SELECT slug, athlete_name FROM campaign_participants ORDER BY display_order;  -- no full last names
