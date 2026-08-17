-- ============================================================
-- v14_03_readiness_oneshot.sql
-- READ-ONLY. Changes nothing.
--
-- The condensed version of v14_02. Returns ONE small table so it can be
-- copied out of the Supabase SQL Editor in a single go.
--
-- Paste the whole thing, click Run, send back the result.
-- If it errors instead, send the error text -- a missing table is itself
-- an answer, and the message names which one.
-- ============================================================

SELECT 'athletes'            AS metric, count(*)::text AS value FROM public.athletes
UNION ALL SELECT 'teams',              count(*)::text FROM public.teams
UNION ALL SELECT 'team_rosters',       count(*)::text FROM public.team_rosters
UNION ALL SELECT 'training_sessions',  count(*)::text FROM public.training_sessions
UNION ALL SELECT 'games',              count(*)::text FROM public.games
UNION ALL SELECT 'player_evaluations', count(*)::text FROM public.player_evaluations

-- Which of the two conflicting role schemas is actually deployed.
UNION ALL SELECT 'profiles.role type',
       COALESCE((SELECT udt_name FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'profiles'
                    AND column_name = 'role'), 'COLUMN NOT FOUND')

-- If it's the enum, these are its allowed values.
UNION ALL SELECT 'app_role values',
       COALESCE((SELECT string_agg(e.enumlabel, ' | ' ORDER BY e.enumsortorder)
                   FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
                  WHERE t.typname = 'app_role'), 'no app_role enum')

-- Which roles real people actually hold right now.
UNION ALL SELECT 'roles in use',
       COALESCE((SELECT string_agg(DISTINCT role::text, ' | ') FROM public.profiles),
                'no profiles')

-- Does Coach Wash exist yet, and is he set up correctly?
UNION ALL SELECT 'coach wash',
       COALESCE((SELECT role::text || ' / approved=' || approved::text
                   FROM public.profiles
                  WHERE lower(email) = 'brandonwash14@gmail.com'), 'NOT CREATED YET')

-- The rule that decides who can read the roster. Tells us whether 'director'
-- is covered, which is the open question about Scott's own account.
UNION ALL SELECT 'coach read policy on teams',
       COALESCE((SELECT qual FROM pg_policies
                  WHERE schemaname = 'public' AND tablename = 'teams'
                    AND policyname ILIKE '%oach%' LIMIT 1), 'no coach policy found')

ORDER BY 1;
