-- ============================================================
-- GODSPEED BASKETBALL -- DECEMBER 2025 PRACTICE & GAME DATA SEED
-- Migration: v6_02_seed_december_data
-- Seeds practice_grades (Practices 6-8) and game stats (Dec 7, Dec 20)
-- ============================================================
-- Run AFTER v6_01_practice_grades.sql
-- Idempotent: uses ON CONFLICT DO NOTHING
-- ============================================================

DO $$
DECLARE
  v_team_id uuid;
  v_session6_id uuid;
  v_session7_id uuid;
  v_session8_id uuid;
  v_game_dec7_1_id uuid;
  v_game_dec7_2_id uuid;
  v_game_dec7_3_id uuid;
  v_game_dec20_id uuid;

  -- Athlete IDs
  v_aiden uuid;
  v_quest uuid;
  v_cassius uuid;
  v_anton uuid;
  v_howard uuid;
  v_ashton uuid;
  v_emory uuid;
  v_junior uuid;
  v_kyrie uuid;
  v_oliver uuid;
  v_ad uuid;
BEGIN

  -- Look up team ID (10U Development Black)
  SELECT id INTO v_team_id FROM public.teams WHERE name ILIKE '%10U%' OR name ILIKE '%Development Black%' LIMIT 1;

  -- Look up athlete IDs by first_name
  SELECT id INTO v_aiden FROM public.athletes WHERE first_name = 'Aiden' LIMIT 1;
  SELECT id INTO v_quest FROM public.athletes WHERE first_name = 'Quest' LIMIT 1;
  SELECT id INTO v_cassius FROM public.athletes WHERE first_name = 'Cassius' LIMIT 1;
  SELECT id INTO v_anton FROM public.athletes WHERE first_name = 'Anton' LIMIT 1;
  SELECT id INTO v_howard FROM public.athletes WHERE first_name = 'Howard' LIMIT 1;
  SELECT id INTO v_ashton FROM public.athletes WHERE first_name = 'Ashton' LIMIT 1;
  SELECT id INTO v_emory FROM public.athletes WHERE first_name = 'Emory' LIMIT 1;
  SELECT id INTO v_junior FROM public.athletes WHERE first_name = 'Junior' LIMIT 1;
  SELECT id INTO v_kyrie FROM public.athletes WHERE first_name = 'Kyrie' LIMIT 1;
  SELECT id INTO v_oliver FROM public.athletes WHERE first_name = 'Oliver' LIMIT 1;
  SELECT id INTO v_ad FROM public.athletes WHERE first_name = 'A.D.' LIMIT 1;

  -- ============================================================
  -- CREATE TRAINING SESSIONS (if not exist)
  -- ============================================================

  -- Practice 6 (Dec 4) -- check if exists first, insert if not
  SELECT id INTO v_session6_id FROM public.training_sessions
    WHERE session_date = '2025-12-04' AND title = 'Practice 6' LIMIT 1;
  IF v_session6_id IS NULL THEN
    INSERT INTO public.training_sessions (session_date, session_type, title, season, team_id)
    VALUES ('2025-12-04', 'team_practice', 'Practice 6', 'Winter 2025-26', v_team_id)
    RETURNING id INTO v_session6_id;
  END IF;

  -- Practice 7 (Dec 11)
  SELECT id INTO v_session7_id FROM public.training_sessions
    WHERE session_date = '2025-12-11' AND title = 'Practice 7' LIMIT 1;
  IF v_session7_id IS NULL THEN
    INSERT INTO public.training_sessions (session_date, session_type, title, season, team_id)
    VALUES ('2025-12-11', 'team_practice', 'Practice 7', 'Winter 2025-26', v_team_id)
    RETURNING id INTO v_session7_id;
  END IF;

  -- Practice 8 (Dec 18)
  SELECT id INTO v_session8_id FROM public.training_sessions
    WHERE session_date = '2025-12-18' AND title = 'Practice 8' LIMIT 1;
  IF v_session8_id IS NULL THEN
    INSERT INTO public.training_sessions (session_date, session_type, title, season, team_id)
    VALUES ('2025-12-18', 'team_practice', 'Practice 8', 'Winter 2025-26', v_team_id)
    RETURNING id INTO v_session8_id;
  END IF;

  -- ============================================================
  -- PRACTICE 6 GRADES (Dec 4)
  -- ============================================================

  IF v_session6_id IS NOT NULL AND v_quest IS NOT NULL THEN
    INSERT INTO public.practice_grades (session_id, athlete_id, effort_energy, competitiveness, on_ball_defense, help_side_rotations, listening_coachability, communication_leadership, offense_shooting, season)
    VALUES (v_session6_id, v_quest, 9.0, 9.0, 9.0, 8.5, 8.5, 8.8, 8.0, 'Winter 2025-26')
    ON CONFLICT (session_id, athlete_id) DO NOTHING;
  END IF;

  IF v_session6_id IS NOT NULL AND v_aiden IS NOT NULL THEN
    INSERT INTO public.practice_grades (session_id, athlete_id, effort_energy, competitiveness, on_ball_defense, help_side_rotations, listening_coachability, communication_leadership, offense_shooting, season)
    VALUES (v_session6_id, v_aiden, 9.0, 9.0, 9.0, 8.5, 8.5, 9.0, 8.0, 'Winter 2025-26')
    ON CONFLICT (session_id, athlete_id) DO NOTHING;
  END IF;

  IF v_session6_id IS NOT NULL AND v_cassius IS NOT NULL THEN
    INSERT INTO public.practice_grades (session_id, athlete_id, effort_energy, competitiveness, on_ball_defense, help_side_rotations, listening_coachability, communication_leadership, offense_shooting, season)
    VALUES (v_session6_id, v_cassius, 8.5, 8.5, 8.0, 8.0, 8.0, 8.5, 7.5, 'Winter 2025-26')
    ON CONFLICT (session_id, athlete_id) DO NOTHING;
  END IF;

  IF v_session6_id IS NOT NULL AND v_anton IS NOT NULL THEN
    INSERT INTO public.practice_grades (session_id, athlete_id, effort_energy, competitiveness, on_ball_defense, help_side_rotations, listening_coachability, communication_leadership, offense_shooting, season)
    VALUES (v_session6_id, v_anton, 8.0, 8.0, 8.0, 8.0, 8.0, 7.0, 7.0, 'Winter 2025-26')
    ON CONFLICT (session_id, athlete_id) DO NOTHING;
  END IF;

  IF v_session6_id IS NOT NULL AND v_howard IS NOT NULL THEN
    INSERT INTO public.practice_grades (session_id, athlete_id, effort_energy, competitiveness, on_ball_defense, help_side_rotations, listening_coachability, communication_leadership, offense_shooting, season)
    VALUES (v_session6_id, v_howard, 8.0, 8.0, 7.5, 7.0, 7.5, 8.5, 7.5, 'Winter 2025-26')
    ON CONFLICT (session_id, athlete_id) DO NOTHING;
  END IF;

  IF v_session6_id IS NOT NULL AND v_ashton IS NOT NULL THEN
    INSERT INTO public.practice_grades (session_id, athlete_id, effort_energy, competitiveness, on_ball_defense, help_side_rotations, listening_coachability, communication_leadership, offense_shooting, season)
    VALUES (v_session6_id, v_ashton, 7.5, 7.5, 8.0, 7.0, 7.0, 7.5, 6.0, 'Winter 2025-26')
    ON CONFLICT (session_id, athlete_id) DO NOTHING;
  END IF;

  IF v_session6_id IS NOT NULL AND v_emory IS NOT NULL THEN
    INSERT INTO public.practice_grades (session_id, athlete_id, effort_energy, competitiveness, on_ball_defense, help_side_rotations, listening_coachability, communication_leadership, offense_shooting, season)
    VALUES (v_session6_id, v_emory, 7.5, 7.0, 7.0, 7.0, 7.5, 7.0, 7.5, 'Winter 2025-26')
    ON CONFLICT (session_id, athlete_id) DO NOTHING;
  END IF;

  IF v_session6_id IS NOT NULL AND v_junior IS NOT NULL THEN
    INSERT INTO public.practice_grades (session_id, athlete_id, effort_energy, competitiveness, on_ball_defense, help_side_rotations, listening_coachability, communication_leadership, offense_shooting, season)
    VALUES (v_session6_id, v_junior, 5.5, 6.0, 5.5, 6.0, 6.5, 7.0, 6.0, 'Winter 2025-26')
    ON CONFLICT (session_id, athlete_id) DO NOTHING;
  END IF;

  IF v_session6_id IS NOT NULL AND v_kyrie IS NOT NULL THEN
    INSERT INTO public.practice_grades (session_id, athlete_id, effort_energy, competitiveness, on_ball_defense, help_side_rotations, listening_coachability, communication_leadership, offense_shooting, season)
    VALUES (v_session6_id, v_kyrie, 5.0, 5.5, 5.5, 6.0, 6.5, 7.5, 7.0, 'Winter 2025-26')
    ON CONFLICT (session_id, athlete_id) DO NOTHING;
  END IF;

  IF v_session6_id IS NOT NULL AND v_oliver IS NOT NULL THEN
    INSERT INTO public.practice_grades (session_id, athlete_id, effort_energy, competitiveness, on_ball_defense, help_side_rotations, listening_coachability, communication_leadership, offense_shooting, season)
    VALUES (v_session6_id, v_oliver, 6.0, 5.5, 5.0, 4.0, 6.5, 5.0, 5.0, 'Winter 2025-26')
    ON CONFLICT (session_id, athlete_id) DO NOTHING;
  END IF;

  -- ============================================================
  -- PRACTICE 7 GRADES (Dec 11)
  -- ============================================================

  IF v_session7_id IS NOT NULL AND v_howard IS NOT NULL THEN
    INSERT INTO public.practice_grades (session_id, athlete_id, effort_energy, competitiveness, on_ball_defense, help_side_rotations, listening_coachability, communication_leadership, offense_shooting, season)
    VALUES (v_session7_id, v_howard, 8.8, 8.8, 8.5, 8.5, 9.0, 9.0, 8.0, 'Winter 2025-26')
    ON CONFLICT (session_id, athlete_id) DO NOTHING;
  END IF;

  IF v_session7_id IS NOT NULL AND v_aiden IS NOT NULL THEN
    INSERT INTO public.practice_grades (session_id, athlete_id, effort_energy, competitiveness, on_ball_defense, help_side_rotations, listening_coachability, communication_leadership, offense_shooting, season)
    VALUES (v_session7_id, v_aiden, 9.0, 8.8, 8.5, 8.0, 8.0, 9.0, 8.5, 'Winter 2025-26')
    ON CONFLICT (session_id, athlete_id) DO NOTHING;
  END IF;

  IF v_session7_id IS NOT NULL AND v_quest IS NOT NULL THEN
    INSERT INTO public.practice_grades (session_id, athlete_id, effort_energy, competitiveness, on_ball_defense, help_side_rotations, listening_coachability, communication_leadership, offense_shooting, season)
    VALUES (v_session7_id, v_quest, 8.5, 8.5, 8.5, 8.0, 8.0, 8.5, 8.5, 'Winter 2025-26')
    ON CONFLICT (session_id, athlete_id) DO NOTHING;
  END IF;

  IF v_session7_id IS NOT NULL AND v_anton IS NOT NULL THEN
    INSERT INTO public.practice_grades (session_id, athlete_id, effort_energy, competitiveness, on_ball_defense, help_side_rotations, listening_coachability, communication_leadership, offense_shooting, season)
    VALUES (v_session7_id, v_anton, 8.5, 8.5, 8.0, 8.0, 8.5, 7.5, 9.0, 'Winter 2025-26')
    ON CONFLICT (session_id, athlete_id) DO NOTHING;
  END IF;

  IF v_session7_id IS NOT NULL AND v_cassius IS NOT NULL THEN
    INSERT INTO public.practice_grades (session_id, athlete_id, effort_energy, competitiveness, on_ball_defense, help_side_rotations, listening_coachability, communication_leadership, offense_shooting, season)
    VALUES (v_session7_id, v_cassius, 8.5, 8.5, 8.0, 8.0, 8.0, 8.5, 7.5, 'Winter 2025-26')
    ON CONFLICT (session_id, athlete_id) DO NOTHING;
  END IF;

  IF v_session7_id IS NOT NULL AND v_kyrie IS NOT NULL THEN
    INSERT INTO public.practice_grades (session_id, athlete_id, effort_energy, competitiveness, on_ball_defense, help_side_rotations, listening_coachability, communication_leadership, offense_shooting, season)
    VALUES (v_session7_id, v_kyrie, 7.0, 7.5, 7.0, 7.0, 8.0, 8.5, 8.5, 'Winter 2025-26')
    ON CONFLICT (session_id, athlete_id) DO NOTHING;
  END IF;

  IF v_session7_id IS NOT NULL AND v_emory IS NOT NULL THEN
    INSERT INTO public.practice_grades (session_id, athlete_id, effort_energy, competitiveness, on_ball_defense, help_side_rotations, listening_coachability, communication_leadership, offense_shooting, season)
    VALUES (v_session7_id, v_emory, 7.8, 7.5, 7.0, 7.0, 7.5, 7.0, 7.5, 'Winter 2025-26')
    ON CONFLICT (session_id, athlete_id) DO NOTHING;
  END IF;

  IF v_session7_id IS NOT NULL AND v_oliver IS NOT NULL THEN
    INSERT INTO public.practice_grades (session_id, athlete_id, effort_energy, competitiveness, on_ball_defense, help_side_rotations, listening_coachability, communication_leadership, offense_shooting, season)
    VALUES (v_session7_id, v_oliver, 7.5, 7.0, 7.0, 6.5, 7.5, 7.0, 7.0, 'Winter 2025-26')
    ON CONFLICT (session_id, athlete_id) DO NOTHING;
  END IF;

  IF v_session7_id IS NOT NULL AND v_ashton IS NOT NULL THEN
    INSERT INTO public.practice_grades (session_id, athlete_id, effort_energy, competitiveness, on_ball_defense, help_side_rotations, listening_coachability, communication_leadership, offense_shooting, season)
    VALUES (v_session7_id, v_ashton, 7.5, 7.5, 7.0, 7.0, 7.5, 7.0, 6.5, 'Winter 2025-26')
    ON CONFLICT (session_id, athlete_id) DO NOTHING;
  END IF;

  IF v_session7_id IS NOT NULL AND v_junior IS NOT NULL THEN
    INSERT INTO public.practice_grades (session_id, athlete_id, effort_energy, competitiveness, on_ball_defense, help_side_rotations, listening_coachability, communication_leadership, offense_shooting, season)
    VALUES (v_session7_id, v_junior, 6.5, 7.0, 6.5, 6.5, 8.5, 7.0, 7.0, 'Winter 2025-26')
    ON CONFLICT (session_id, athlete_id) DO NOTHING;
  END IF;

  -- ============================================================
  -- PRACTICE 8 GRADES (Dec 18)
  -- ============================================================

  IF v_session8_id IS NOT NULL AND v_aiden IS NOT NULL THEN
    INSERT INTO public.practice_grades (session_id, athlete_id, effort_energy, competitiveness, on_ball_defense, help_side_rotations, listening_coachability, communication_leadership, offense_shooting, season)
    VALUES (v_session8_id, v_aiden, 9.2, 9.1, 9.0, 9.0, 9.5, 9.0, 8.5, 'Winter 2025-26')
    ON CONFLICT (session_id, athlete_id) DO NOTHING;
  END IF;

  IF v_session8_id IS NOT NULL AND v_howard IS NOT NULL THEN
    INSERT INTO public.practice_grades (session_id, athlete_id, effort_energy, competitiveness, on_ball_defense, help_side_rotations, listening_coachability, communication_leadership, offense_shooting, season)
    VALUES (v_session8_id, v_howard, 9.0, 9.0, 9.0, 8.5, 9.0, 8.5, 8.0, 'Winter 2025-26')
    ON CONFLICT (session_id, athlete_id) DO NOTHING;
  END IF;

  IF v_session8_id IS NOT NULL AND v_quest IS NOT NULL THEN
    INSERT INTO public.practice_grades (session_id, athlete_id, effort_energy, competitiveness, on_ball_defense, help_side_rotations, listening_coachability, communication_leadership, offense_shooting, season)
    VALUES (v_session8_id, v_quest, 8.5, 8.5, 9.0, 8.0, 8.0, 8.5, 8.5, 'Winter 2025-26')
    ON CONFLICT (session_id, athlete_id) DO NOTHING;
  END IF;

  IF v_session8_id IS NOT NULL AND v_anton IS NOT NULL THEN
    INSERT INTO public.practice_grades (session_id, athlete_id, effort_energy, competitiveness, on_ball_defense, help_side_rotations, listening_coachability, communication_leadership, offense_shooting, season)
    VALUES (v_session8_id, v_anton, 8.5, 8.5, 8.0, 8.0, 8.5, 7.5, 9.0, 'Winter 2025-26')
    ON CONFLICT (session_id, athlete_id) DO NOTHING;
  END IF;

  IF v_session8_id IS NOT NULL AND v_oliver IS NOT NULL THEN
    INSERT INTO public.practice_grades (session_id, athlete_id, effort_energy, competitiveness, on_ball_defense, help_side_rotations, listening_coachability, communication_leadership, offense_shooting, season)
    VALUES (v_session8_id, v_oliver, 9.0, 8.5, 8.5, 8.0, 7.5, 7.0, 6.0, 'Winter 2025-26')
    ON CONFLICT (session_id, athlete_id) DO NOTHING;
  END IF;

  IF v_session8_id IS NOT NULL AND v_ad IS NOT NULL THEN
    INSERT INTO public.practice_grades (session_id, athlete_id, effort_energy, competitiveness, on_ball_defense, help_side_rotations, listening_coachability, communication_leadership, offense_shooting, season)
    VALUES (v_session8_id, v_ad, 8.0, 8.0, 8.5, 8.0, 7.5, 8.0, 7.5, 'Winter 2025-26')
    ON CONFLICT (session_id, athlete_id) DO NOTHING;
  END IF;

  IF v_session8_id IS NOT NULL AND v_ashton IS NOT NULL THEN
    INSERT INTO public.practice_grades (session_id, athlete_id, effort_energy, competitiveness, on_ball_defense, help_side_rotations, listening_coachability, communication_leadership, offense_shooting, season)
    VALUES (v_session8_id, v_ashton, 8.0, 7.8, 7.0, 7.0, 7.5, 7.0, 6.5, 'Winter 2025-26')
    ON CONFLICT (session_id, athlete_id) DO NOTHING;
  END IF;

  IF v_session8_id IS NOT NULL AND v_kyrie IS NOT NULL THEN
    INSERT INTO public.practice_grades (session_id, athlete_id, effort_energy, competitiveness, on_ball_defense, help_side_rotations, listening_coachability, communication_leadership, offense_shooting, season)
    VALUES (v_session8_id, v_kyrie, 7.5, 7.5, 7.0, 7.0, 7.5, 8.0, 8.0, 'Winter 2025-26')
    ON CONFLICT (session_id, athlete_id) DO NOTHING;
  END IF;

  IF v_session8_id IS NOT NULL AND v_emory IS NOT NULL THEN
    INSERT INTO public.practice_grades (session_id, athlete_id, effort_energy, competitiveness, on_ball_defense, help_side_rotations, listening_coachability, communication_leadership, offense_shooting, season)
    VALUES (v_session8_id, v_emory, 7.8, 7.5, 7.0, 6.5, 7.5, 6.5, 7.5, 'Winter 2025-26')
    ON CONFLICT (session_id, athlete_id) DO NOTHING;
  END IF;

  IF v_session8_id IS NOT NULL AND v_junior IS NOT NULL THEN
    INSERT INTO public.practice_grades (session_id, athlete_id, effort_energy, competitiveness, on_ball_defense, help_side_rotations, listening_coachability, communication_leadership, offense_shooting, season)
    VALUES (v_session8_id, v_junior, 7.0, 7.0, 6.5, 5.5, 6.0, 7.0, 6.0, 'Winter 2025-26')
    ON CONFLICT (session_id, athlete_id) DO NOTHING;
  END IF;

  -- ============================================================
  -- DECEMBER 7 GAMES (Weeks Tournament - 3 games)
  -- ============================================================

  -- Game 1: W (result is GENERATED from scores, use placeholder scores for W/L)
  SELECT id INTO v_game_dec7_1_id FROM public.games
    WHERE game_date = '2025-12-07' AND opponent_name = 'Weeks Tournament Opp 1' LIMIT 1;
  IF v_game_dec7_1_id IS NULL THEN
    INSERT INTO public.games (game_date, team_id, opponent_name, game_type, tournament_name, season, team_score, opponent_score)
    VALUES ('2025-12-07', v_team_id, 'Weeks Tournament Opp 1', 'tournament', 'Weeks Tournament', 'Winter 2025-26', 1, 0)
    RETURNING id INTO v_game_dec7_1_id;
  END IF;

  -- Game 2: W
  SELECT id INTO v_game_dec7_2_id FROM public.games
    WHERE game_date = '2025-12-07' AND opponent_name = 'Weeks Tournament Opp 2' LIMIT 1;
  IF v_game_dec7_2_id IS NULL THEN
    INSERT INTO public.games (game_date, team_id, opponent_name, game_type, tournament_name, season, team_score, opponent_score)
    VALUES ('2025-12-07', v_team_id, 'Weeks Tournament Opp 2', 'tournament', 'Weeks Tournament', 'Winter 2025-26', 1, 0)
    RETURNING id INTO v_game_dec7_2_id;
  END IF;

  -- Game 3: L
  SELECT id INTO v_game_dec7_3_id FROM public.games
    WHERE game_date = '2025-12-07' AND opponent_name = 'Weeks Tournament Opp 3' LIMIT 1;
  IF v_game_dec7_3_id IS NULL THEN
    INSERT INTO public.games (game_date, team_id, opponent_name, game_type, tournament_name, season, team_score, opponent_score)
    VALUES ('2025-12-07', v_team_id, 'Weeks Tournament Opp 3', 'tournament', 'Weeks Tournament', 'Winter 2025-26', 0, 1)
    RETURNING id INTO v_game_dec7_3_id;
  END IF;

  -- ============================================================
  -- DECEMBER 20 GAMES (5 games, aggregated into 1 tournament record)
  -- ============================================================

  SELECT id INTO v_game_dec20_id FROM public.games
    WHERE game_date = '2025-12-20' AND opponent_name = 'Dec 20 Tournament Day' LIMIT 1;
  IF v_game_dec20_id IS NULL THEN
    INSERT INTO public.games (game_date, team_id, opponent_name, game_type, season, game_notes)
    VALUES ('2025-12-20', v_team_id, 'Dec 20 Tournament Day', 'tournament', 'Winter 2025-26', '5 games: 28-7 W, 22-14 W, 25-15 W, 47-3 W, Loss')
    RETURNING id INTO v_game_dec20_id;
  END IF;

  -- ============================================================
  -- PLAYER GAME STATS (Dec 20 Tournament Day)
  -- ============================================================

  IF v_game_dec20_id IS NOT NULL AND v_quest IS NOT NULL THEN
    INSERT INTO public.player_game_stats (game_id, athlete_id, points, assists, steals, defensive_rebounds, blocks, turnovers, deflections)
    VALUES (v_game_dec20_id, v_quest, 8, 7, 5, 0, 0, 4, 2)
    ON CONFLICT (game_id, athlete_id) DO NOTHING;
  END IF;

  IF v_game_dec20_id IS NOT NULL AND v_junior IS NOT NULL THEN
    INSERT INTO public.player_game_stats (game_id, athlete_id, points, assists, steals, defensive_rebounds, blocks, turnovers, deflections)
    VALUES (v_game_dec20_id, v_junior, 17, 5, 2, 2, 0, 0, 0)
    ON CONFLICT (game_id, athlete_id) DO NOTHING;
  END IF;

  IF v_game_dec20_id IS NOT NULL AND v_emory IS NOT NULL THEN
    INSERT INTO public.player_game_stats (game_id, athlete_id, points, assists, steals, defensive_rebounds, blocks, turnovers, deflections)
    VALUES (v_game_dec20_id, v_emory, 18, 3, 2, 3, 0, 0, 0)
    ON CONFLICT (game_id, athlete_id) DO NOTHING;
  END IF;

  IF v_game_dec20_id IS NOT NULL AND v_ad IS NOT NULL THEN
    INSERT INTO public.player_game_stats (game_id, athlete_id, points, assists, steals, defensive_rebounds, blocks, turnovers, deflections)
    VALUES (v_game_dec20_id, v_ad, 6, 2, 4, 7, 1, 0, 0)
    ON CONFLICT (game_id, athlete_id) DO NOTHING;
  END IF;

  IF v_game_dec20_id IS NOT NULL AND v_kyrie IS NOT NULL THEN
    INSERT INTO public.player_game_stats (game_id, athlete_id, points, assists, steals, defensive_rebounds, blocks, turnovers, deflections)
    VALUES (v_game_dec20_id, v_kyrie, 6, 3, 2, 0, 1, 0, 0)
    ON CONFLICT (game_id, athlete_id) DO NOTHING;
  END IF;

  IF v_game_dec20_id IS NOT NULL AND v_anton IS NOT NULL THEN
    INSERT INTO public.player_game_stats (game_id, athlete_id, points, assists, steals, defensive_rebounds, blocks, turnovers, deflections)
    VALUES (v_game_dec20_id, v_anton, 4, 1, 2, 0, 0, 0, 0)
    ON CONFLICT (game_id, athlete_id) DO NOTHING;
  END IF;

  IF v_game_dec20_id IS NOT NULL AND v_howard IS NOT NULL THEN
    INSERT INTO public.player_game_stats (game_id, athlete_id, points, assists, steals, defensive_rebounds, blocks, turnovers, deflections)
    VALUES (v_game_dec20_id, v_howard, 2, 0, 8, 3, 0, 0, 0)
    ON CONFLICT (game_id, athlete_id) DO NOTHING;
  END IF;

  IF v_game_dec20_id IS NOT NULL AND v_ashton IS NOT NULL THEN
    INSERT INTO public.player_game_stats (game_id, athlete_id, points, assists, steals, defensive_rebounds, blocks, turnovers, deflections)
    VALUES (v_game_dec20_id, v_ashton, 4, 0, 3, 3, 0, 0, 0)
    ON CONFLICT (game_id, athlete_id) DO NOTHING;
  END IF;

  IF v_game_dec20_id IS NOT NULL AND v_oliver IS NOT NULL THEN
    INSERT INTO public.player_game_stats (game_id, athlete_id, points, assists, steals, defensive_rebounds, blocks, turnovers, deflections)
    VALUES (v_game_dec20_id, v_oliver, 0, 0, 1, 3, 1, 0, 0)
    ON CONFLICT (game_id, athlete_id) DO NOTHING;
  END IF;

  IF v_game_dec20_id IS NOT NULL AND v_cassius IS NOT NULL THEN
    INSERT INTO public.player_game_stats (game_id, athlete_id, points, assists, steals, defensive_rebounds, blocks, turnovers, deflections)
    VALUES (v_game_dec20_id, v_cassius, 4, 0, 1, 0, 0, 0, 0)
    ON CONFLICT (game_id, athlete_id) DO NOTHING;
  END IF;

END $$;
