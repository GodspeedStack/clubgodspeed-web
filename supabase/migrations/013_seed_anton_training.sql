-- =====================================================
-- SEED: Anton (p6) training data
-- =====================================================

-- Ensure parent account exists for Denis (if auth user exists)
INSERT INTO parent_accounts (id, user_id, email, first_name, last_name, phone)
SELECT
    '550e8400-e29b-41d4-a716-446655440901',
    u.id,
    u.email,
    'Denis',
    'Blyakhman',
    '(555) 666-7777'
FROM auth.users u
WHERE u.email = 'denis@gmail.com'
ON CONFLICT (email) DO NOTHING;

-- Training program catalog entry
INSERT INTO training_programs (
    id,
    name,
    program_type,
    status,
    schedule,
    coach,
    description,
    focus
) VALUES (
    'elite-guard-academy',
    'Elite Guard Academy',
    'elite',
    'active',
    'Mon 12pm',
    'Coach Mike',
    'Designed for guards who depend on skill, IQ, and movement not height.',
    '["Post feeds","Ball handling against pressure"]'
)
ON CONFLICT (id) DO NOTHING;

-- Training program document
INSERT INTO training_documents (
    program_id,
    title,
    doc_type,
    doc_date,
    link
) VALUES (
    'elite-guard-academy',
    'Elite Guard Academy Syllabus',
    'PDF',
    '2026-01-01',
    '#'
);

-- Completed training session (Jan 19, 12:00 PM)
INSERT INTO training_sessions (
    id,
    session_date,
    start_time,
    end_time,
    session_type,
    title,
    location,
    description,
    focus,
    program_id,
    status
) VALUES (
    '550e8400-e29b-41d4-a716-446655440201',
    '2026-01-19',
    '12:00:00',
    '17:00:00',
    'elite',
    'Elite Guard Academy',
    'Main Gym',
    'Focus: post feeds, ball handling against pressure',
    'post feeds, ball handling against pressure',
    'elite-guard-academy',
    'completed'
)
ON CONFLICT (id) DO NOTHING;

-- Training purchase: 10 hours total
INSERT INTO training_purchases (
    id,
    parent_id,
    athlete_id,
    package_id,
    transaction_id,
    hours_purchased,
    price_paid,
    status,
    purchase_date
)
SELECT
    '550e8400-e29b-41d4-a716-446655440101',
    pa.id,
    'p6',
    '550e8400-e29b-41d4-a716-446655440001',
    'TXN-ANTON-20260119',
    10.00,
    500.00,
    'active',
    '2026-01-19T12:00:00+00'
FROM parent_accounts pa
WHERE pa.email = 'denis@gmail.com'
ON CONFLICT (id) DO NOTHING;

-- Player enrollment for Elite Guard Academy
INSERT INTO player_enrollments (
    id,
    parent_id,
    athlete_id,
    program_id,
    program_name,
    program_type,
    enrolled_sessions,
    start_date,
    end_date,
    status,
    purchase_id
)
SELECT
    '550e8400-e29b-41d4-a716-446655440401',
    pa.id,
    'p6',
    'elite-guard-academy',
    'Elite Guard Academy',
    'elite',
    '[]',
    '2026-01-01',
    '2026-12-31',
    'active',
    '550e8400-e29b-41d4-a716-446655440101'
FROM parent_accounts pa
WHERE pa.email = 'denis@gmail.com'
ON CONFLICT (id) DO NOTHING;

-- Attendance record: 5 hours used
INSERT INTO training_attendance (
    id,
    purchase_id,
    session_id,
    athlete_id,
    hours_used,
    attendance_status,
    notes,
    attended_at
)
SELECT
    '550e8400-e29b-41d4-a716-446655440301',
    '550e8400-e29b-41d4-a716-446655440101',
    '550e8400-e29b-41d4-a716-446655440201',
    'p6',
    5.00,
    'present',
    'post feeds, ball handling against pressure',
    '2026-01-19T12:00:00+00'
WHERE EXISTS (
    SELECT 1 FROM training_purchases WHERE id = '550e8400-e29b-41d4-a716-446655440101'
)
AND EXISTS (
    SELECT 1 FROM training_sessions WHERE id = '550e8400-e29b-41d4-a716-446655440201'
)
ON CONFLICT (id) DO NOTHING;
