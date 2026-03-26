-- ============================================================
-- GODSPEED BASKETBALL — SEED: Initial Roster from Mock Data
-- Populates athletes, teams, team_rosters, and a sample
-- training session + attendance + game + stats.
-- ============================================================
-- Run AFTER godspeed_athlete_data_layer.sql
-- Run in Supabase SQL Editor as role: postgres
-- ============================================================

BEGIN;

-- ── 1. Team ──────────────────────────────────────────────────
INSERT INTO public.teams (id, name, season, age_group, head_coach, is_active)
VALUES (
    'a0000000-0000-0000-0000-000000000001',
    '10U Development Black',
    '2025-2026',
    '10U Development',
    'Coach Scott',
    true
) ON CONFLICT (name, season) DO NOTHING;

-- ── 2. Athletes (from portal-data.js mock roster) ────────────
-- Note: parent_account_id will be linked separately once parents
-- are mapped to their Supabase auth accounts.

INSERT INTO public.athletes (id, first_name, last_name, jersey_number, position, enrollment_status, team_name, season, notes) VALUES
('a1000000-0000-0000-0000-000000000001', 'Aiden',   'Player',  1, 'G',    'active', '10U Development Black', '2025-2026', 'Fix baseline drives'),
('a1000000-0000-0000-0000-000000000002', 'Quest',   'Player',  2, 'G',    'active', '10U Development Black', '2025-2026', 'Fixed sprint discipline'),
('a1000000-0000-0000-0000-000000000003', 'Cassius', 'Player',  3, 'G',    'active', '10U Development Black', '2025-2026', 'IQ/Spacing needs work'),
('a1000000-0000-0000-0000-000000000004', 'A.D.',    'Player',  4, 'PF',   'active', '10U Development Black', '2025-2026', 'Needs coachability'),
('a1000000-0000-0000-0000-000000000005', 'Howard',  'Player',  5, 'C',    'active', '10U Development Black', '2025-2026', 'Defensive Anchor'),
('a1000000-0000-0000-0000-000000000006', 'Anton',   'Player', 12, 'PG',   'active', '10U Development Black', '2025-2026', 'Plays under control'),
('a1000000-0000-0000-0000-000000000007', 'Emory',   'Player',  7, 'SF',   'active', '10U Development Black', '2025-2026', 'Lackluster closeouts'),
('a1000000-0000-0000-0000-000000000008', 'Ashton',  'Player',  8, 'SG',   'active', '10U Development Black', '2025-2026', 'Amazing slides. Needs consistent motor.'),
('a1000000-0000-0000-0000-000000000009', 'Junior',  'Player',  9, 'G',    'active', '10U Development Black', '2025-2026', 'Scheme IQ / Conditioning'),
('a1000000-0000-0000-0000-000000000010', 'Kyrie',   'Player', 10, 'G',    'active', '10U Development Black', '2025-2026', 'Improving closeouts'),
('a1000000-0000-0000-0000-000000000011', 'Oliver',  'Player', 11, 'SF',   'active', '10U Development Black', '2025-2026', 'Huge jump in Practice 8'),
('a1000000-0000-0000-0000-000000000012', 'Khalik',  'Player', 12, 'PF',   'active', '10U Development Black', '2025-2026', 'Learning help defense')
ON CONFLICT DO NOTHING;

-- ── 3. Team Rosters ──────────────────────────────────────────
INSERT INTO public.team_rosters (team_id, athlete_id, role) VALUES
('a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'starter'),
('a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', 'starter'),
('a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000003', 'starter'),
('a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000004', 'starter'),
('a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000005', 'starter'),
('a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000006', 'rotation'),
('a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000007', 'bench'),
('a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000008', 'bench'),
('a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000009', 'bench'),
('a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000010', 'bench'),
('a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000011', 'rotation'),
('a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000012', 'bench')
ON CONFLICT (team_id, athlete_id) DO NOTHING;

-- ── 4. Sample Training Session (Practice 9) ──────────────────
INSERT INTO public.training_sessions (id, session_date, session_type, title, team_id, season, coach_name, focus_areas, session_notes)
VALUES (
    'b0000000-0000-0000-0000-000000000001',
    '2025-12-16',
    'team_practice',
    'Practice 9 — Team Execution',
    'a0000000-0000-0000-0000-000000000001',
    '2025-2026',
    'Coach Scott',
    ARRAY['execution', 'defense', 'conditioning'],
    'Team execution focus. High intensity. Full roster attendance.'
) ON CONFLICT DO NOTHING;

-- ── 5. Training Attendance for Practice 9 ────────────────────
INSERT INTO public.training_attendance (session_id, athlete_id, status, effort_rating, skill_ratings, coach_notes) VALUES
('b0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'present', 5, '{"focus":9,"hustle":9,"skill":9,"iq":9}'::jsonb, 'Exceptional job.'),
('b0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', 'present', 5, '{"focus":9,"hustle":9,"skill":9,"iq":9}'::jsonb, 'High motor maintained.'),
('b0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000003', 'present', 4, '{"focus":8,"hustle":9,"skill":8,"iq":8}'::jsonb, 'Solid engine.'),
('b0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000004', 'present', 4, '{"focus":8,"hustle":9,"skill":8,"iq":8}'::jsonb, 'Good physical presence.'),
('b0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000006', 'present', 4, '{"focus":8,"hustle":9,"skill":8,"iq":8}'::jsonb, 'Under control.'),
('b0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000007', 'present', 4, '{"focus":8,"hustle":8,"skill":8,"iq":8}'::jsonb, 'Stepped up level.'),
('b0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000011', 'present', 4, '{"focus":8,"hustle":8,"skill":8,"iq":8}'::jsonb, 'Zero complaints. Fully engaged.')
ON CONFLICT (session_id, athlete_id) DO NOTHING;

-- ── 6. Sample Game (Weeks Tournament) ────────────────────────
INSERT INTO public.games (id, game_date, game_type, team_id, opponent_name, is_home, team_score, opponent_score, season, tournament_name, game_notes)
VALUES (
    'c0000000-0000-0000-0000-000000000001',
    '2025-12-07',
    'tournament',
    'a0000000-0000-0000-0000-000000000001',
    'Weeks',
    false,
    42,
    38,
    '2025-2026',
    'Weeks Tournament',
    'Win 2 of 3. Strong defensive effort.'
) ON CONFLICT DO NOTHING;

-- ── 7. Player Game Stats (Weeks Tournament) ──────────────────
INSERT INTO public.player_game_stats (game_id, athlete_id, points, offensive_rebounds, defensive_rebounds, assists, steals, blocks, turnovers, coach_notes) VALUES
('c0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000004', 6, 3, 5, 0, 4, 1, 1, 'Dominant interior force. 3 consecutive rebounds.'),
('c0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000005', 2, 1, 3, 0, 5, 0, 0, 'Defensive anchor. Steal leader.'),
('c0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000006', 7, 0, 1, 2, 1, 0, 1, 'MVP Candidate. Played very under control. And-1.'),
('c0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', 5, 0, 1, 3, 3, 0, 2, 'High disruptive energy.'),
('c0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000007', 2, 0, 0, 0, 2, 0, 1, 'Back-to-back steals. High intensity burst.'),
('c0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000008', 3, 0, 1, 0, 1, 0, 0, 'High Hustle: Secured steal, good rebound -> coast-to-coast layup. Made FT.')
ON CONFLICT (game_id, athlete_id) DO NOTHING;

-- ── 8. Player Evaluation (Anton — detailed assessment) ───────
INSERT INTO public.player_evaluations (
    athlete_id, evaluation_date, season,
    ball_handling, shooting_form, mid_range, three_point, free_throw,
    finishing, passing, court_vision, defensive_stance, lateral_quickness,
    rebounding, basketball_iq, leadership, effort, coachability,
    strengths, areas_to_improve, coach_comments
) VALUES (
    'a1000000-0000-0000-0000-000000000006',
    '2026-02-25',
    '2025-2026',
    5, 7, 6, 5, 7,
    6, 7, 8, 5, 5,
    5, 8, 6, 8, 8,
    'Efficiency & IQ: One of the most efficient and composed players on the roster. High-level basketball IQ for his age. Competitiveness & Poise: His competitiveness is a defining quality. Versatility: Fits seamlessly into both the 2nd unit and the starting role.',
    'On-Ball Defense: Against high-level teams with faster guards, struggles to stay in front. Lateral quickness and defensive positioning are essential. Ball Handling Under Pressure: Needs significant work to function as a lead guard at the next level.',
    'I believe in Anton and love his competitiveness. The goal is clear: earn the starting point guard role. When Anton improves his ball handling and on-ball defense, I am confident his game will flourish and he will earn more minutes.'
) ON CONFLICT DO NOTHING;

COMMIT;
