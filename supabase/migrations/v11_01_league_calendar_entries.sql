-- v11_01_league_calendar_entries.sql
-- Add Fall (JPS 5v5) and Winter (Gold Crown) league seasons to the parent calendar.
--
-- These insert rows into calendar_events, which BOTH the locked calendar embed
-- (calendar-embed.html) and the portal Schedule view (schedule-view.js) read from.
-- No front-end/embed code is touched.
--
-- event_type = 'season' (multi-week leagues, per the tournament-vs-season rule).
-- Rows are published (published_at set) and visibility = 'team_only' so they surface
-- on the parent-facing calendar (embed filter: published_at not null,
-- visibility in (public,team_only), event_type in (tournament,season,game,camp)).
--
-- Sources:
--   JPS Fall 5v5 League:  https://justplaysportscolorado.com/content/29449/fall-league-5on5
--   Gold Crown League:    https://www.goldcrownfoundation.com/events/competitive-league/
--
-- Idempotent: constraint update is safe to re-run; inserts guard on (title, start_date).

-- 1. Allow '6th' grade_level (teams aged up to 5th/6th). Keep 4th/5th for existing rows.
ALTER TABLE public.calendar_events
  DROP CONSTRAINT IF EXISTS chk_grade_level;
ALTER TABLE public.calendar_events
  ADD CONSTRAINT chk_grade_level
  CHECK (grade_level IS NULL OR grade_level IN ('4th','5th','6th','both'));

-- 2. Insert league seasons (one row per team). Guarded against duplicates.
INSERT INTO public.calendar_events
  (title, description, event_type, start_date, end_date, all_day,
   location, location_url, grade_level, visibility, is_cancelled, tags, published_at)
SELECT v.title, v.description, 'season', v.start_date, v.end_date, true,
       v.location, v.location_url, v.grade_level, 'team_only', false, '{registered}', now()
FROM (VALUES
  -- ── JPS Fall 5v5 League (Sat evenings, Sept 12 – Oct 24, 2026) ──
  ('JPS Fall 5v5 League (5th Grade)',
   'Just Play Sports 5-on-5 Fall League. Saturday evenings, Sept 12 - Oct 24, 2026. 8-game regular season across Denver-metro sites; single-elimination tournament Oct 23-24. HQ: Gold Crown Fieldhouse, Lakewood.',
   DATE '2026-09-12', DATE '2026-10-24',
   'Denver Metro (multiple sites; HQ Gold Crown Fieldhouse, Lakewood)',
   NULL, '5th'),
  ('JPS Fall 5v5 League (6th Grade)',
   'Just Play Sports 5-on-5 Fall League. Saturday evenings, Sept 12 - Oct 24, 2026. 8-game regular season across Denver-metro sites; single-elimination tournament Oct 23-24. HQ: Gold Crown Fieldhouse, Lakewood.',
   DATE '2026-09-12', DATE '2026-10-24',
   'Denver Metro (multiple sites; HQ Gold Crown Fieldhouse, Lakewood)',
   NULL, '6th'),
  -- ── Gold Crown Winter League (select play dates, Jan 7 – Feb 28, 2027) ──
  ('Gold Crown Winter League (5th Grade)',
   'Gold Crown Competitive League. Select play dates, Jan 7 - Feb 28, 2027. 12-game doubleheader regular season; championships Feb 25-28 (must qualify). HQ: Gold Crown Field House, 150 S Harlan St, Lakewood.',
   DATE '2027-01-07', DATE '2027-02-28',
   'Gold Crown Field House, 150 S Harlan St, Lakewood, CO 80226',
   'https://maps.google.com/?q=Gold+Crown+Field+House,+150+S+Harlan+St,+Lakewood,+CO+80226', '5th'),
  ('Gold Crown Winter League (6th Grade)',
   'Gold Crown Competitive League. Select play dates, Jan 7 - Feb 28, 2027. 12-game doubleheader regular season; championships Feb 25-28 (must qualify). HQ: Gold Crown Field House, 150 S Harlan St, Lakewood.',
   DATE '2027-01-07', DATE '2027-02-28',
   'Gold Crown Field House, 150 S Harlan St, Lakewood, CO 80226',
   'https://maps.google.com/?q=Gold+Crown+Field+House,+150+S+Harlan+St,+Lakewood,+CO+80226', '6th')
) AS v(title, description, start_date, end_date, location, location_url, grade_level)
WHERE NOT EXISTS (
  SELECT 1 FROM public.calendar_events c
  WHERE c.title = v.title AND c.start_date = v.start_date
);

-- 3. Verify
-- SELECT title, event_type, grade_level, start_date, end_date, visibility, published_at
--   FROM public.calendar_events
--  WHERE event_type = 'season' AND start_date >= DATE '2026-09-01'
--  ORDER BY start_date, grade_level;
