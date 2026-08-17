-- ============================================================
-- v14_02_portal_readiness_check.sql
-- READ-ONLY. Changes nothing. Answers two questions:
--   A. Will a coach see anything after logging in, or an empty portal?
--   B. Which of the two conflicting profiles.role schemas is actually live?
--
-- Run in the Supabase SQL Editor and send the output back.
-- ============================================================

-- ------------------------------------------------------------
-- A. IS THERE DATA?
--
-- coach-portal.js builds the sidebar from db.teams, which
-- supabase-data-bridge.js fills from these tables on sign-in. If teams or
-- athletes come back 0, Coach Wash logs in successfully and lands on an
-- empty dashboard -- a working door into an empty room.
-- ------------------------------------------------------------
SELECT 'athletes'            AS table_name, count(*) AS rows FROM public.athletes
UNION ALL SELECT 'teams',              count(*) FROM public.teams
UNION ALL SELECT 'team_rosters',       count(*) FROM public.team_rosters
UNION ALL SELECT 'training_sessions',  count(*) FROM public.training_sessions
UNION ALL SELECT 'training_attendance',count(*) FROM public.training_attendance
UNION ALL SELECT 'games',              count(*) FROM public.games
UNION ALL SELECT 'player_game_stats',  count(*) FROM public.player_game_stats
UNION ALL SELECT 'player_evaluations', count(*) FROM public.player_evaluations
ORDER BY table_name;

-- Which teams exist, and does anyone belong to them?
-- initDashboard() groups the sidebar by team.category, so a null category
-- lands the team in an "Other" bucket at the bottom.
SELECT t.id,
       t.name,
       t.category,
       count(r.athlete_id) AS players
  FROM public.teams t
  LEFT JOIN public.team_rosters r ON r.team_id = t.id
 GROUP BY t.id, t.name, t.category
 ORDER BY t.category NULLS LAST, t.name;


-- ------------------------------------------------------------
-- B. WHICH ROLE SCHEMA IS LIVE?
--
-- The migration history disagrees with itself:
--   v2_01_profiles.sql        -> role is an app_role ENUM (director|coach|parent)
--   011_unified_auth_roles.sql-> role is VARCHAR (admin|coach|parent|athlete|guest)
-- These imply different things about who can read what, so we need to know
-- which one the database actually has.
-- ------------------------------------------------------------
SELECT column_name,
       data_type,
       udt_name
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name   = 'profiles'
   AND column_name  = 'role';

-- If udt_name is 'app_role' it's the enum; these are its allowed values.
SELECT e.enumlabel AS allowed_role
  FROM pg_type t
  JOIN pg_enum e ON e.enumtypid = t.oid
 WHERE t.typname = 'app_role'
 ORDER BY e.enumsortorder;

-- Who currently holds which role.
SELECT role, approved, count(*) AS people
  FROM public.profiles
 GROUP BY role, approved
 ORDER BY role, approved;


-- ------------------------------------------------------------
-- C. THE POLICIES THAT DECIDE WHAT A COACH CAN READ
--
-- v2_08_athlete_data_layer.sql grants access with
--   p.role IN ('coach', 'admin')
-- 'coach' is valid under both schemas, so Coach Wash should be fine.
-- 'director' appears in NEITHER list -- so if the enum schema is live,
-- Scott's own director account may not satisfy these policies. This query
-- shows what is really installed, which settles it.
-- ------------------------------------------------------------
SELECT tablename,
       policyname,
       cmd,
       qual
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename IN ('athletes','teams','team_rosters','training_sessions',
                     'training_attendance','games','player_game_stats',
                     'player_evaluations')
 ORDER BY tablename, policyname;
