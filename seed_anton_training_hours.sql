-- ============================================================
-- SEED: Anton's Training Hours Package
-- Run AFTER migration_training_hours.sql
-- ============================================================

INSERT INTO public.training_hour_packages (
    athlete_id, season, hours_purchased, purchase_date, notes
) VALUES (
    'a1000000-0000-0000-0000-000000000006',
    '2025-2026',
    10.0,
    '2026-03-21',
    'Purchased by parent on Sat Mar 21, 2026. 2 hours used same day.'
) ON CONFLICT (athlete_id, season) DO UPDATE SET
    hours_purchased = EXCLUDED.hours_purchased,
    purchase_date = EXCLUDED.purchase_date,
    notes = EXCLUDED.notes,
    updated_at = now();

-- Also update Practice 9 session to reflect the Mar 21 training with duration
-- so hours_used computes correctly from the view.
-- If the Mar 21 session doesn't exist yet, insert it:
INSERT INTO public.training_sessions (
    id, session_date, session_type, title, team_id, season,
    coach_name, start_time, duration_minutes, focus_areas, session_notes
) VALUES (
    'b0000000-0000-0000-0000-000000000002',
    '2026-03-21',
    'individual_workout',
    'Individual Training - Anton',
    'a0000000-0000-0000-0000-000000000001',
    '2025-2026',
    'Coach Scott',
    '10:00:00',
    120,
    ARRAY['ball_handling', 'defense'],
    'Individual training session. 2 hours completed.'
) ON CONFLICT DO NOTHING;

-- Record Anton's attendance for this session
INSERT INTO public.training_attendance (
    session_id, athlete_id, status, effort_rating, skill_ratings, coach_notes
) VALUES (
    'b0000000-0000-0000-0000-000000000002',
    'a1000000-0000-0000-0000-000000000006',
    'present',
    4,
    '{"focus":8,"hustle":8,"skill":7,"iq":8}'::jsonb,
    'Good individual session. Focused on ball handling and defensive slides.'
) ON CONFLICT (session_id, athlete_id) DO NOTHING;
