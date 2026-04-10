-- ============================================================
-- SEED: Emory Coach Evaluation - April 6, 2026
-- Run via Supabase SQL Editor with service_role
-- ============================================================

INSERT INTO public.player_evaluations (
    id, athlete_id, evaluation_date, season,
    finishing, ball_handling,
    strengths, areas_to_improve, coach_comments
) VALUES (
    'e0000000-0000-0000-0000-000000000701',
    'a1000000-0000-0000-0000-000000000007',
    '2026-04-06',
    '2025-2026',
    7,
    6,
    'Showing a lot of improvement in his ability to drive. '
    || 'Driving left in the game this past weekend was good to see -- '
    || 'a direct result of consistently encouraging him to attack left.',
    'Continue developing left-hand drives until it becomes instinctive. '
    || 'Keep pushing aggression going downhill on both sides.',
    'Emory is responding well to coaching. The left-hand drives showing up in games '
    || 'means the reps are translating. Keep the emphasis on driving left every practice.'
) ON CONFLICT (id) DO UPDATE SET
    finishing        = EXCLUDED.finishing,
    ball_handling    = EXCLUDED.ball_handling,
    strengths        = EXCLUDED.strengths,
    areas_to_improve = EXCLUDED.areas_to_improve,
    coach_comments   = EXCLUDED.coach_comments;
