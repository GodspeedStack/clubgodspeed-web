-- ============================================================
-- SEED: Anton Training Session S-2026-007 (April 1, 2026)
-- Run via Supabase SQL Editor with service_role
-- ============================================================

-- 1. Insert the training session
INSERT INTO public.training_sessions (
    id, session_date, session_type, title, team_id, season,
    coach_name, start_time, end_time, duration_minutes,
    focus_areas, session_notes
) VALUES (
    'b0000000-0000-0000-0000-000000000007',
    '2026-04-01',
    'individual_workout',
    'Individual Training - Anton',
    'a0000000-0000-0000-0000-000000000001',
    '2025-2026',
    'Coach Scott',
    '14:34:00',
    '16:34:00',
    120,
    ARRAY['ball_handling', 'shooting', 'finishing', 'defense'],
    'Worked on ball handling, creating space against pressure defense, finishing against contact, and shooting. '
    || 'GROWTH: Three-point shooting more consistent -- confirmed by shooting machine data in practice. '
    || 'Handles and dribbling getting sharper. '
    || 'IMPROVE: Needs daily dribbling -- recommend 50-100 pound dribbles per hand per day. '
    || 'Major focus: foot speed -- lateral quickness drills, jump rope, or tire jumps.'
) ON CONFLICT (id) DO UPDATE SET
    session_notes   = EXCLUDED.session_notes,
    focus_areas     = EXCLUDED.focus_areas,
    duration_minutes = EXCLUDED.duration_minutes,
    start_time      = EXCLUDED.start_time,
    end_time        = EXCLUDED.end_time;

-- 2. Record Anton's attendance
INSERT INTO public.training_attendance (
    session_id, athlete_id, status, effort_rating,
    skill_ratings, coach_notes
) VALUES (
    'b0000000-0000-0000-0000-000000000007',
    'a1000000-0000-0000-0000-000000000006',
    'present',
    4,
    '{
        "shooting": 8,
        "handles": 7,
        "finishing": 7,
        "defense": 7,
        "foot_speed": 5
    }'::jsonb,
    'Three-point shooting trending up (shooting machine confirms). Handles sharper. '
    || 'Needs daily pound dribbles (50-100 per hand). '
    || 'Priority: foot speed -- lateral quickness drills, jump rope, tire jumps.'
) ON CONFLICT (session_id, athlete_id) DO UPDATE SET
    effort_rating = EXCLUDED.effort_rating,
    skill_ratings = EXCLUDED.skill_ratings,
    coach_notes   = EXCLUDED.coach_notes;
