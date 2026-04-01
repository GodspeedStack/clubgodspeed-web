-- ============================================================
-- GODSPEED BASKETBALL -- COMPREHENSIVE PLAYER EVALUATION DATA
-- Migration: v6_03_comprehensive_player_data
-- Sources: Coach Scott's detailed player breakdowns, film review,
--          practice grades through Practice 5, and game analysis.
-- ============================================================
-- Run AFTER v6_02_seed_december_data.sql
-- Idempotent: uses ON CONFLICT DO NOTHING / DO UPDATE
-- ============================================================

DO $$
DECLARE
  v_team_id uuid;
  v_session5_id uuid;

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
  v_kai uuid;

  -- Game IDs for coach_notes
  v_game_dec20_id uuid;
  v_game_dec7_id uuid;
BEGIN

  -- ── Resolve IDs ───────────────────────────────────────────
  SELECT id INTO v_team_id FROM public.teams WHERE name ILIKE '%10U%' OR name ILIKE '%Development Black%' LIMIT 1;

  SELECT id INTO v_aiden  FROM public.athletes WHERE first_name = 'Aiden'   LIMIT 1;
  SELECT id INTO v_quest  FROM public.athletes WHERE first_name = 'Quest'   LIMIT 1;
  SELECT id INTO v_cassius FROM public.athletes WHERE first_name = 'Cassius' LIMIT 1;
  SELECT id INTO v_anton  FROM public.athletes WHERE first_name = 'Anton'   LIMIT 1;
  SELECT id INTO v_howard FROM public.athletes WHERE first_name = 'Howard'  LIMIT 1;
  SELECT id INTO v_ashton FROM public.athletes WHERE first_name = 'Ashton'  LIMIT 1;
  SELECT id INTO v_emory  FROM public.athletes WHERE first_name = 'Emory'   LIMIT 1;
  SELECT id INTO v_junior FROM public.athletes WHERE first_name = 'Junior'  LIMIT 1;
  SELECT id INTO v_kyrie  FROM public.athletes WHERE first_name = 'Kyrie'   LIMIT 1;
  SELECT id INTO v_oliver FROM public.athletes WHERE first_name = 'Oliver'  LIMIT 1;
  SELECT id INTO v_ad     FROM public.athletes WHERE first_name = 'A.D.'    LIMIT 1;

  -- Kai West -- new player, insert if not exists
  SELECT id INTO v_kai FROM public.athletes WHERE first_name = 'Kai' LIMIT 1;
  IF v_kai IS NULL AND v_team_id IS NOT NULL THEN
    INSERT INTO public.athletes (first_name, last_name, team_name, position)
    VALUES ('Kai', 'West', '10U Development Black', 'G')
    RETURNING id INTO v_kai;
    -- Add to team roster
    INSERT INTO public.team_rosters (team_id, athlete_id, role)
    VALUES (v_team_id, v_kai, 'bench')
    ON CONFLICT DO NOTHING;
  END IF;

  -- ── Game IDs for coach_notes ──────────────────────────────
  SELECT id INTO v_game_dec20_id FROM public.games
    WHERE game_date = '2025-12-20' AND opponent_name = 'Dec 20 Tournament Day' LIMIT 1;
  SELECT id INTO v_game_dec7_id FROM public.games
    WHERE game_date = '2025-12-07' AND opponent_name = 'Weeks' LIMIT 1;
  IF v_game_dec7_id IS NULL THEN
    SELECT id INTO v_game_dec7_id FROM public.games
      WHERE game_date = '2025-12-07' LIMIT 1;
  END IF;

  -- ============================================================
  -- 1. PRACTICE 5 SESSION + GRADES (Nov 27, referenced in narrative)
  -- ============================================================

  SELECT id INTO v_session5_id FROM public.training_sessions
    WHERE session_date = '2025-11-27' AND title = 'Practice 5' LIMIT 1;
  IF v_session5_id IS NULL AND v_team_id IS NOT NULL THEN
    INSERT INTO public.training_sessions (session_date, session_type, title, season, team_id)
    VALUES ('2025-11-27', 'team_practice', 'Practice 5', 'Winter 2025-26', v_team_id)
    RETURNING id INTO v_session5_id;
  END IF;

  -- Practice 5 grades (from narrative: "5th Practice" scores)
  IF v_session5_id IS NOT NULL THEN
    -- Aiden: 8.78 weighted in 5th practice
    IF v_aiden IS NOT NULL THEN
      INSERT INTO public.practice_grades (session_id, athlete_id, effort_energy, competitiveness, on_ball_defense, help_side_rotations, listening_coachability, communication_leadership, offense_shooting, season, coach_narrative)
      VALUES (v_session5_id, v_aiden, 9.0, 9.0, 8.5, 8.5, 8.5, 9.0, 8.0, 'Winter 2025-26',
        'Won the conditioning segment. Named one of the team''s two best defenders. Good leader who consistently talks on defense. Applied coaching feedback immediately. Critical error: let a player beat him baseline -- this CANNOT happen and must be drilled repeatedly. Telegraphs passes by staring down targets. Passes out of fear and a desire to get rid of the ball.')
      ON CONFLICT (session_id, athlete_id) DO NOTHING;
    END IF;

    -- Quest: 8.76 weighted in 5th practice
    IF v_quest IS NOT NULL THEN
      INSERT INTO public.practice_grades (session_id, athlete_id, effort_energy, competitiveness, on_ball_defense, help_side_rotations, listening_coachability, communication_leadership, offense_shooting, season, coach_narrative)
      VALUES (v_session5_id, v_quest, 9.0, 9.0, 9.0, 8.0, 8.0, 9.0, 8.5, 'Winter 2025-26',
        'Primary facilitator and general of the team. One of the two best defenders. Naturally high effort and high physical commitment. Tallied 7+ assists in Dec 20 games. Scored via floaters and layups. Effort has fluctuated -- previously caused four extra team sprints for failing to push himself. Struggled with turnovers and missed layups in recent games. Wastes energy running in circles instead of running from spot to spot. Telegraphs passes.')
      ON CONFLICT (session_id, athlete_id) DO NOTHING;
    END IF;

    -- A.D.: 8.18 baseline
    IF v_ad IS NOT NULL THEN
      INSERT INTO public.practice_grades (session_id, athlete_id, effort_energy, competitiveness, on_ball_defense, help_side_rotations, listening_coachability, communication_leadership, offense_shooting, season, coach_narrative)
      VALUES (v_session5_id, v_ad, 8.5, 8.5, 8.0, 8.0, 7.5, 8.0, 8.0, 'Winter 2025-26',
        'Most physically dominant rebounder on the team. Credited with an incredible sequence of 83 good rebounds and scores. Sets beautiful screens. Highly active on defense with multiple steals and blocks. Can be rigid -- was previously uncoachable when asked to pound his dribbles, which could stunt progress. Prone to fouls and poor defensive angles. Runs in circles instead of moving efficiently to spots.')
      ON CONFLICT (session_id, athlete_id) DO NOTHING;
    END IF;

    -- Howard: 7.75 in 5th practice (but narrative says he has elevated to Elite since)
    IF v_howard IS NOT NULL THEN
      INSERT INTO public.practice_grades (session_id, athlete_id, effort_energy, competitiveness, on_ball_defense, help_side_rotations, listening_coachability, communication_leadership, offense_shooting, season, coach_narrative)
      VALUES (v_session5_id, v_howard, 8.0, 8.0, 7.5, 7.0, 7.5, 8.0, 7.5, 'Winter 2025-26',
        'Has raised his game since these numbers came out. Playing on a whole new level. Carved out a starting role by treating practice like a tryout. Best defender and best rebounder on the team. Leads team in sheer volume of steals. High IQ for the morphing Monster zone defense, capable of guarding multiple spots (top and block). Recognized as a leader. Changed to primary ball handler to grow confidence despite a 5-turnover game. Sometimes mistakes are not the priority -- building confidence is. Back pedals noted as too high. Occasionally misses the trap. Telegraphs passes like Aiden and Quest.')
      ON CONFLICT (session_id, athlete_id) DO NOTHING;
    END IF;

    -- Anton: inferred high scores
    IF v_anton IS NOT NULL THEN
      INSERT INTO public.practice_grades (session_id, athlete_id, effort_energy, competitiveness, on_ball_defense, help_side_rotations, listening_coachability, communication_leadership, offense_shooting, season, coach_narrative)
      VALUES (v_session5_id, v_anton, 8.5, 8.5, 7.5, 7.5, 8.5, 7.5, 9.0, 'Winter 2025-26',
        'A competitor who loves big clutch moments. Highly skilled addition to the team. Plays very, very well under control and makes smart plays. One of the team''s best shooters -- converting two-pointers, and-ones, and free throws. Actively growing as a guard. IQ on offense and situational defensive IQ are beyond his years. As a newer integration, needs to continue learning the defensive system. Developing activity with his feet on defense.')
      ON CONFLICT (session_id, athlete_id) DO NOTHING;
    END IF;

    -- Emory: 7.26 in 5th practice
    IF v_emory IS NOT NULL THEN
      INSERT INTO public.practice_grades (session_id, athlete_id, effort_energy, competitiveness, on_ball_defense, help_side_rotations, listening_coachability, communication_leadership, offense_shooting, season, coach_narrative)
      VALUES (v_session5_id, v_emory, 7.5, 7.5, 7.0, 7.0, 7.5, 7.0, 7.5, 'Winter 2025-26',
        'Becoming a confident offensive threat. Recently had his best game, hitting multiple three-pointers and driving confidently. Capable of securing back-to-back steals. Highly honest with coaches. Closeout speed is frequently lackluster. Noticeably slow going back on defense. Needs to be more vocal and disciplined in help-side positioning.')
      ON CONFLICT (session_id, athlete_id) DO NOTHING;
    END IF;

    -- Ashton: 7.53 in 5th practice
    IF v_ashton IS NOT NULL THEN
      INSERT INTO public.practice_grades (session_id, athlete_id, effort_energy, competitiveness, on_ball_defense, help_side_rotations, listening_coachability, communication_leadership, offense_shooting, season, coach_narrative)
      VALUES (v_session5_id, v_ashton, 7.5, 7.5, 7.5, 7.0, 7.5, 7.0, 7.5, 'Winter 2025-26',
        'Demonstrates high technical capability and immediate coachability. Did an amazing job on defensive slides and even helped a teammate do it. Playing strong and balancing his game with midrange shots. Shooting is developing -- given the green light to protect his confidence as a shooter. Inconsistent effort: tends to ease up when he thinks coaches are not looking. Tactical lapses -- forgets to trap corners during live play. Sometimes ends up in the way or in the wrong spot. Needs reminders on drill rules and positioning. Not yet a vocal presence on the floor.')
      ON CONFLICT (session_id, athlete_id) DO NOTHING;
    END IF;

    -- Kyrie: 7.35 in 5th practice (biggest jump +1.65 from 5.70 baseline)
    IF v_kyrie IS NOT NULL THEN
      INSERT INTO public.practice_grades (session_id, athlete_id, effort_energy, competitiveness, on_ball_defense, help_side_rotations, listening_coachability, communication_leadership, offense_shooting, season, coach_narrative)
      VALUES (v_session5_id, v_kyrie, 7.0, 7.5, 7.0, 7.0, 7.5, 8.0, 8.5, 'Winter 2025-26',
        'Achieved the biggest overall grade jump (+1.65) between baseline evaluations. Massive offensive ceiling with a scorer''s mentality -- highlighted for scoring 18 points in a prior game. Executes floaters, layups, draws fouls, and hits free throws. Provides positive vocal leadership when in a good headspace. Possesses elite speed but does not use it consistently. After closeouts were heavily critiqued, adjusted and executed them much faster. Primary obstacle is sustained effort and discipline -- repeatedly called out for minimal effort, being too slow in transition, and not getting up on defense. Coaches note he is faster than his output shows. Struggles with correct help-side position. Needs to transition from just a bucket getter to a floor reader -- recognize when to drive vs pass and improve spatial awareness.')
      ON CONFLICT (session_id, athlete_id) DO NOTHING;
    END IF;

    -- Kai West: 6.54 in 5th practice
    IF v_kai IS NOT NULL THEN
      INSERT INTO public.practice_grades (session_id, athlete_id, effort_energy, competitiveness, on_ball_defense, help_side_rotations, listening_coachability, communication_leadership, offense_shooting, season, coach_narrative)
      VALUES (v_session5_id, v_kai, 6.5, 6.5, 6.5, 6.0, 7.0, 6.0, 7.5, 'Winter 2025-26',
        'New player. Possesses great shooting touch with multiple clutch shots in shooting drill. Hit multiple threes. Mostly tries hard and is doing well but frequently second-guesses himself. Struggles immensely with basketball IQ and spacing. Notoriously clogs driving lanes by standing still. Struggles with help defense. Heavily critiqued for not committing to rebounding.')
      ON CONFLICT (session_id, athlete_id) DO NOTHING;
    END IF;

    -- Junior: estimated around 6.5 for 5th practice
    IF v_junior IS NOT NULL THEN
      INSERT INTO public.practice_grades (session_id, athlete_id, effort_energy, competitiveness, on_ball_defense, help_side_rotations, listening_coachability, communication_leadership, offense_shooting, season, coach_narrative)
      VALUES (v_session5_id, v_junior, 7.0, 7.0, 6.5, 6.0, 7.5, 7.0, 7.5, 'Winter 2025-26',
        'Great touch and shot especially in mid-range and around the rim. Excellent scorer and tenacious defender. Highly effective passer with great vision when he plays free -- makes beautiful passes. High basketball IQ: when his primary passing option was covered, he pivoted to create a new angle giving himself two places to pass. Capable outside threat, hitting multiple threes with good mechanics. Shot looks really good on the left side -- just needs to not dip it so low before shooting. Mostly tries hard with maximum effort in conditioning. Stays involved and keeps showing up after being subbed out. Does not fold. Earned a spot among the winners in competitive team defensive drill. Capable of beautiful defense and pressure with good traps and steals. Still developing help-side positioning.')
      ON CONFLICT (session_id, athlete_id) DO NOTHING;
    END IF;
  END IF;

  -- ============================================================
  -- 2. UPDATE EXISTING PRACTICE GRADES WITH COACH NARRATIVES
  --    (Practices 6, 7, 8 already have grades but no narratives)
  -- ============================================================

  -- We add narratives to key players on their most recent practice grades
  -- Practice 8 (Dec 18) narratives
  UPDATE public.practice_grades SET coach_narrative =
    'Elite-level consistency. Highest-rated player on the roster. Won conditioning. Immediate application of coaching feedback. Must drill baseline defense -- cannot let anyone beat him baseline. Working on not telegraphing passes.'
  WHERE session_id = (SELECT id FROM public.training_sessions WHERE title = 'Practice 8' AND session_date = '2025-12-18' LIMIT 1)
    AND athlete_id = v_aiden AND coach_narrative IS NULL;

  UPDATE public.practice_grades SET coach_narrative =
    'Team general and primary facilitator. Defensive anchor. Working on effort consistency and reducing turnovers. Must stop running in circles and move spot to spot. Addressing pass telegraphing.'
  WHERE session_id = (SELECT id FROM public.training_sessions WHERE title = 'Practice 8' AND session_date = '2025-12-18' LIMIT 1)
    AND athlete_id = v_quest AND coach_narrative IS NULL;

  UPDATE public.practice_grades SET coach_narrative =
    'Has elevated to elite level since baseline. Treating every practice like a tryout. Best defender and rebounder. Transitioned to primary ball handler to build confidence. Leading the team in steals.'
  WHERE session_id = (SELECT id FROM public.training_sessions WHERE title = 'Practice 8' AND session_date = '2025-12-18' LIMIT 1)
    AND athlete_id = v_howard AND coach_narrative IS NULL;

  UPDATE public.practice_grades SET coach_narrative =
    'Physically dominant rebounder. Beautiful screens. Active defense. Working on coachability when adjusting dribble technique. Must clean up foul tendencies and defensive angles.'
  WHERE session_id = (SELECT id FROM public.training_sessions WHERE title = 'Practice 8' AND session_date = '2025-12-18' LIMIT 1)
    AND athlete_id = v_ad AND coach_narrative IS NULL;

  UPDATE public.practice_grades SET coach_narrative =
    'Clutch competitor. Controlled and smart plays. One of the team''s best shooters. Growing as a guard. Offensive and defensive IQ beyond his years. Continuing to learn the defensive system.'
  WHERE session_id = (SELECT id FROM public.training_sessions WHERE title = 'Practice 8' AND session_date = '2025-12-18' LIMIT 1)
    AND athlete_id = v_anton AND coach_narrative IS NULL;

  UPDATE public.practice_grades SET coach_narrative =
    'Closeout speed improving. Had best game recently hitting threes and driving confidently. Must improve transition defense speed and help-side discipline. Needs more vocal presence.'
  WHERE session_id = (SELECT id FROM public.training_sessions WHERE title = 'Practice 8' AND session_date = '2025-12-18' LIMIT 1)
    AND athlete_id = v_emory AND coach_narrative IS NULL;

  UPDATE public.practice_grades SET coach_narrative =
    'Good defensive slides -- even coached a teammate through it. Balancing game with midrange shots. Shooting confidence being protected with green light. Must push effort when coaches are not looking. Forgets to trap corners. Positioning awareness needs work.'
  WHERE session_id = (SELECT id FROM public.training_sessions WHERE title = 'Practice 8' AND session_date = '2025-12-18' LIMIT 1)
    AND athlete_id = v_ashton AND coach_narrative IS NULL;

  UPDATE public.practice_grades SET coach_narrative =
    'Biggest grade jump on the team (+1.65 from baseline). Massive offensive ceiling. Closeouts improved after direct coaching. Must sustain effort -- physical output rarely matches athletic capability. Transitioning from bucket getter to floor reader.'
  WHERE session_id = (SELECT id FROM public.training_sessions WHERE title = 'Practice 8' AND session_date = '2025-12-18' LIMIT 1)
    AND athlete_id = v_kyrie AND coach_narrative IS NULL;

  UPDATE public.practice_grades SET coach_narrative =
    'Great touch in mid-range and at the rim. Excellent scorer with developing passing vision. Beautiful passes when playing free. Good mechanics -- just needs to not dip the ball before shooting. Maximum effort in conditioning. Resilient -- keeps showing up after being subbed out.'
  WHERE session_id = (SELECT id FROM public.training_sessions WHERE title = 'Practice 8' AND session_date = '2025-12-18' LIMIT 1)
    AND athlete_id = v_junior AND coach_narrative IS NULL;

  -- ============================================================
  -- 3. GAME STATS COACH NOTES (Dec 20 tournament)
  -- ============================================================

  IF v_game_dec20_id IS NOT NULL THEN
    UPDATE public.player_game_stats SET coach_notes = 'High disruptive energy. 7+ assists as primary facilitator. Scored via floaters and layups. Struggled with turnovers.'
    WHERE game_id = v_game_dec20_id AND athlete_id = v_quest AND coach_notes IS NULL;

    UPDATE public.player_game_stats SET coach_notes = 'Led team in steals with 8. Dominant on the glass with 3 defensive rebounds. Defensive anchor.'
    WHERE game_id = v_game_dec20_id AND athlete_id = v_howard AND coach_notes IS NULL;

    UPDATE public.player_game_stats SET coach_notes = 'Incredible sequence of rebounds and scores. 7 defensive rebounds and a block. Active on both ends.'
    WHERE game_id = v_game_dec20_id AND athlete_id = v_ad AND coach_notes IS NULL;

    UPDATE public.player_game_stats SET coach_notes = 'Best game to date. 18 points hitting multiple threes. Growing confidence as a scorer.'
    WHERE game_id = v_game_dec20_id AND athlete_id = v_emory AND coach_notes IS NULL;

    UPDATE public.player_game_stats SET coach_notes = '17 points. Beautiful passes and multiple three-pointers. Excellent scoring touch around the rim.'
    WHERE game_id = v_game_dec20_id AND athlete_id = v_junior AND coach_notes IS NULL;

    UPDATE public.player_game_stats SET coach_notes = 'Capable scorer with floaters and layups. Drew fouls and hit free throws. Scored 6 with 3 assists.'
    WHERE game_id = v_game_dec20_id AND athlete_id = v_kyrie AND coach_notes IS NULL;

    UPDATE public.player_game_stats SET coach_notes = 'Smart, controlled plays. Hit key shots including and-ones and free throws.'
    WHERE game_id = v_game_dec20_id AND athlete_id = v_anton AND coach_notes IS NULL;

    UPDATE public.player_game_stats SET coach_notes = '3 steals and 3 defensive rebounds. Active hustle plays. Working on offensive consistency.'
    WHERE game_id = v_game_dec20_id AND athlete_id = v_ashton AND coach_notes IS NULL;
  END IF;

  -- ============================================================
  -- 4. PLAYER EVALUATIONS (Comprehensive skill assessments)
  --    15-skill ratings based on coaching narrative analysis
  -- ============================================================

  -- Aiden: Elite/Starter
  IF v_aiden IS NOT NULL THEN
    INSERT INTO public.player_evaluations (athlete_id, evaluation_date, season,
      ball_handling, shooting_form, mid_range, three_point, free_throw, finishing,
      passing, court_vision, defensive_stance, lateral_quickness, rebounding,
      basketball_iq, leadership, effort, coachability,
      strengths, areas_to_improve, coach_comments)
    VALUES (v_aiden, '2025-12-20', 'Winter 2025-26',
      7, 7, 7, 6, 7, 7,
      6, 7, 9, 9, 7,
      8, 9, 10, 9,
      'Consistently the highest-rated player on the team. Elite effort and defensive application. Won conditioning segment. One of the team''s two best defenders. Highly coachable with immediate feedback application. Good leader who consistently talks on defense.',
      'Must drill baseline defense -- cannot let anyone beat him baseline. Telegraphs passes by staring down targets. Passes out of fear and a desire to get rid of the ball. Needs to develop passing confidence and read the floor better on offense.',
      'Aiden sets the standard for effort and accountability. His defensive instincts are elite-tier. The baseline defense lapse was the most severe tactical critique of Practice 5 -- this is a correctable habit that requires repetition. His passing tendencies are the primary offensive growth area.')
    ON CONFLICT DO NOTHING;
  END IF;

  -- Quest: Elite/Starter
  IF v_quest IS NOT NULL THEN
    INSERT INTO public.player_evaluations (athlete_id, evaluation_date, season,
      ball_handling, shooting_form, mid_range, three_point, free_throw, finishing,
      passing, court_vision, defensive_stance, lateral_quickness, rebounding,
      basketball_iq, leadership, effort, coachability,
      strengths, areas_to_improve, coach_comments)
    VALUES (v_quest, '2025-12-20', 'Winter 2025-26',
      8, 7, 7, 6, 7, 8,
      9, 9, 9, 8, 5,
      9, 9, 8, 8,
      'Primary facilitator and team general. One of the two best defenders. Naturally high effort and physical commitment. 7+ assists in Dec 20 games. Scores effectively via floaters and layups. High defensive steal and deflection volume.',
      'Effort has fluctuated -- previously caused four extra team sprints. Turnovers and missed layups in recent games. Wastes energy running in circles instead of spot-to-spot movement. Telegraphs passes. Must maintain consistency in effort level.',
      'Quest is the engine of this team. When his effort is locked in, the entire team elevates. The challenge is sustaining that motor every single practice and game. His court vision and playmaking are elite for his age -- the turnovers are mostly correctable decision-making, not lack of skill.')
    ON CONFLICT DO NOTHING;
  END IF;

  -- A.D.: Rotation/Starter
  IF v_ad IS NOT NULL THEN
    INSERT INTO public.player_evaluations (athlete_id, evaluation_date, season,
      ball_handling, shooting_form, mid_range, three_point, free_throw, finishing,
      passing, court_vision, defensive_stance, lateral_quickness, rebounding,
      basketball_iq, leadership, effort, coachability,
      strengths, areas_to_improve, coach_comments)
    VALUES (v_ad, '2025-12-20', 'Winter 2025-26',
      5, 5, 5, 3, 5, 7,
      5, 6, 7, 6, 10,
      7, 7, 8, 6,
      'Most physically dominant rebounder. Incredible sequence of 83 good rebounds and scores. Sets beautiful screens. Highly active on defense with multiple steals and blocks.',
      'Can be rigid and previously uncoachable when asked to adjust dribble technique. Prone to fouls and poor defensive angles. Runs in circles instead of moving efficiently to his spots. Must improve coachability when adjusting fundamental habits.',
      'A.D. is a physical force. The rebounding and screen-setting are genuine differentiators at this level. The coachability concern is the most critical growth area -- if he can accept adjustment to his dribbling and footwork, his ceiling is very high. The rigidity is what could stunt his progress.')
    ON CONFLICT DO NOTHING;
  END IF;

  -- Howard: Elite/Starter (elevated)
  IF v_howard IS NOT NULL THEN
    INSERT INTO public.player_evaluations (athlete_id, evaluation_date, season,
      ball_handling, shooting_form, mid_range, three_point, free_throw, finishing,
      passing, court_vision, defensive_stance, lateral_quickness, rebounding,
      basketball_iq, leadership, effort, coachability,
      strengths, areas_to_improve, coach_comments)
    VALUES (v_howard, '2025-12-20', 'Winter 2025-26',
      6, 6, 6, 5, 6, 7,
      6, 7, 9, 8, 10,
      8, 9, 9, 9,
      'Has elevated to elite level since baseline evaluations. Carved out a starting role by treating practice like a tryout. Best defender and best rebounder on the team. Leads team in steals. High IQ for the morphing Monster zone defense. Recognized as a leader.',
      'Back pedals noted as too high. Occasionally misses the trap entirely. Telegraphs passes like Aiden and Quest. Transitioned to primary ball handler -- had a 5-turnover game but building confidence is the priority over avoiding mistakes.',
      'Howard is the story of this season. His transformation from a 9.00 baseline to the team''s most impactful defender is the direct result of treating every practice like a tryout. Moving him to primary ball handler was intentional -- the 5-turnover game is acceptable because we are investing in his long-term ceiling. He will grow into this role.')
    ON CONFLICT DO NOTHING;
  END IF;

  -- Anton: Rotation/Starter
  IF v_anton IS NOT NULL THEN
    INSERT INTO public.player_evaluations (athlete_id, evaluation_date, season,
      ball_handling, shooting_form, mid_range, three_point, free_throw, finishing,
      passing, court_vision, defensive_stance, lateral_quickness, rebounding,
      basketball_iq, leadership, effort, coachability,
      strengths, areas_to_improve, coach_comments)
    VALUES (v_anton, '2025-12-20', 'Winter 2025-26',
      7, 8, 8, 7, 8, 7,
      7, 7, 6, 6, 5,
      8, 7, 8, 9,
      'Competitor who loves big clutch moments. Plays very well under control with smart plays. One of the team''s best shooters -- two-pointers, and-ones, free throws. Growing as a guard with offensive and defensive IQ beyond his years.',
      'As a newer integration, needs to continue learning the defensive system. Developing activity with his feet on defense. Rebounding effort can improve.',
      'Anton has been a high-value addition. His shooting and composure in clutch moments are already at a level most players at this age do not reach. The defensive system integration is the expected growth curve for a new player -- he is progressing ahead of schedule.')
    ON CONFLICT DO NOTHING;
  END IF;

  -- Emory: Development
  IF v_emory IS NOT NULL THEN
    INSERT INTO public.player_evaluations (athlete_id, evaluation_date, season,
      ball_handling, shooting_form, mid_range, three_point, free_throw, finishing,
      passing, court_vision, defensive_stance, lateral_quickness, rebounding,
      basketball_iq, leadership, effort, coachability,
      strengths, areas_to_improve, coach_comments)
    VALUES (v_emory, '2025-12-20', 'Winter 2025-26',
      6, 7, 6, 7, 6, 6,
      5, 5, 6, 5, 5,
      6, 5, 7, 8,
      'Becoming a confident offensive threat. Recently had his best game hitting multiple three-pointers and driving confidently. Capable of securing back-to-back steals. Highly honest with coaches about physical limitations.',
      'Closeout speed is frequently lackluster. Noticeably slow going back on defense in transition. Needs to be more vocal on the floor. Must improve discipline in help-side positioning.',
      'Emory is on an upward trajectory offensively. The three-point shooting breakout is real and should be encouraged. The defensive effort -- particularly transition speed and closeout urgency -- is the primary barrier between Development and Rotation tier. His honesty with coaches is a character strength that will serve his development well.')
    ON CONFLICT DO NOTHING;
  END IF;

  -- Ashton: Rotation/Development
  IF v_ashton IS NOT NULL THEN
    INSERT INTO public.player_evaluations (athlete_id, evaluation_date, season,
      ball_handling, shooting_form, mid_range, three_point, free_throw, finishing,
      passing, court_vision, defensive_stance, lateral_quickness, rebounding,
      basketball_iq, leadership, effort, coachability,
      strengths, areas_to_improve, coach_comments)
    VALUES (v_ashton, '2025-12-20', 'Winter 2025-26',
      6, 7, 7, 5, 6, 6,
      5, 5, 7, 6, 5,
      6, 5, 6, 8,
      'High technical capability with immediate coachability. Amazing job on defensive slides -- even helped a teammate execute them. Playing strong and balancing game with midrange shots. Shooting is developing with a green light to protect confidence.',
      'Inconsistent effort -- eases up when he thinks coaches are not watching. Tactical lapses: forgets to trap corners during live play. Ends up in the way or in the wrong spot during drills. Needs reminders on positioning. Not yet a vocal presence or organizer on the floor.',
      'Ashton has genuine technical talent -- the defensive slides and midrange development prove that. The effort consistency is the critical differentiator between where he is and where he needs to be. When he is directly challenged by coaches, he corrects immediately, which shows the capacity is there. The gap is internal motivation when he thinks no one is watching.')
    ON CONFLICT DO NOTHING;
  END IF;

  -- Kyrie: Limited -> Development (improving)
  IF v_kyrie IS NOT NULL THEN
    INSERT INTO public.player_evaluations (athlete_id, evaluation_date, season,
      ball_handling, shooting_form, mid_range, three_point, free_throw, finishing,
      passing, court_vision, defensive_stance, lateral_quickness, rebounding,
      basketball_iq, leadership, effort, coachability,
      strengths, areas_to_improve, coach_comments)
    VALUES (v_kyrie, '2025-12-20', 'Winter 2025-26',
      7, 7, 7, 6, 7, 8,
      5, 5, 5, 8, 4,
      6, 7, 4, 6,
      'Massive offensive ceiling with a scorer''s mentality. Scored 18 points in a prior game. Executes floaters, layups, draws fouls, and hits free throws. Possesses elite speed. Provides positive vocal leadership when in a good headspace. Biggest grade jump on the team (+1.65 from baseline). Closeouts improved significantly after direct coaching.',
      'Primary obstacle is sustained effort and discipline. Repeatedly called out for minimal effort, slow transition, and not getting up on defense. Physical output rarely matches actual athletic capability. Struggles with correct help-side position (once penalized 5 down-and-backs). Must transition from bucket getter to floor reader -- recognize drive vs pass situations and improve spatial awareness.',
      'Kyrie is the highest-ceiling player on this team when effort is engaged. The +1.65 grade jump proves he can make rapid technical improvements. The effort gap is not a talent issue -- it is a discipline and consistency issue. The coaching focus is transitioning him from a pure scorer to a complete player who reads the floor. His elite speed is an untapped weapon that he rarely deploys at full capacity.')
    ON CONFLICT DO NOTHING;
  END IF;

  -- Junior: Development
  IF v_junior IS NOT NULL THEN
    INSERT INTO public.player_evaluations (athlete_id, evaluation_date, season,
      ball_handling, shooting_form, mid_range, three_point, free_throw, finishing,
      passing, court_vision, defensive_stance, lateral_quickness, rebounding,
      basketball_iq, leadership, effort, coachability,
      strengths, areas_to_improve, coach_comments)
    VALUES (v_junior, '2025-12-20', 'Winter 2025-26',
      6, 7, 8, 7, 6, 8,
      8, 8, 6, 5, 5,
      7, 6, 7, 7,
      'Great touch and shot especially in mid-range and around the rim. Excellent scorer and tenacious defender. Highly effective passer with great vision when playing free. Beautiful passes with high basketball IQ on reads. Capable outside threat hitting multiple threes. Resilient -- keeps showing up after being subbed out. Earned spot among winners in competitive defensive drill.',
      'Shooting mechanics: needs to not dip the ball so low before shooting. Help-side positioning still developing. Could be more consistent with sustained maximum effort across all segments.',
      'Junior has a unique combination of scoring touch and passing vision that is rare at this age. When he plays free and confident, his impact is immediate. The shooting dip is a correctable mechanical habit. His resilience -- not folding after being subbed -- is a character trait that will serve him well in competitive environments. The 17-point game showed what his ceiling looks like.')
    ON CONFLICT DO NOTHING;
  END IF;

  -- Kai West: Limited (new player)
  IF v_kai IS NOT NULL THEN
    INSERT INTO public.player_evaluations (athlete_id, evaluation_date, season,
      ball_handling, shooting_form, mid_range, three_point, free_throw, finishing,
      passing, court_vision, defensive_stance, lateral_quickness, rebounding,
      basketball_iq, leadership, effort, coachability,
      strengths, areas_to_improve, coach_comments)
    VALUES (v_kai, '2025-12-20', 'Winter 2025-26',
      4, 7, 6, 7, 6, 4,
      4, 4, 5, 5, 3,
      4, 4, 6, 6,
      'Great shooting touch with multiple clutch shots in shooting drill. Hit multiple threes. Mostly tries hard.',
      'Struggles immensely with basketball IQ and spacing. Notoriously clogs driving lanes by standing still. Difficulty with help defense concepts. Not committed to rebounding. Frequently second-guesses himself.',
      'Kai is a new addition with genuine shooting ability that flashes in controlled settings. The basketball IQ and spacing awareness are the primary development priorities. His tendency to clog lanes directly impacts the team''s offensive flow. The self-doubt is limiting his ability to apply his shooting talent in game situations. Rebounding commitment must become non-negotiable.')
    ON CONFLICT DO NOTHING;
  END IF;

END $$;
