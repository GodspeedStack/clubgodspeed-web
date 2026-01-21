-- =====================================================
-- SEED TRAINING DATA
-- =====================================================
-- Purpose: Populate sample training packages, purchases, and attendance
-- Run this after migration 006_parent_portal_training.sql
-- =====================================================

-- =====================================================
-- TRAINING PACKAGES
-- =====================================================

-- Insert sample training packages
INSERT INTO training_packages (id, name, description, total_hours, price, program_type, is_active)
VALUES
    ('550e8400-e29b-41d4-a716-446655440001', 'Skills Development - 10 Hours', 'Individual skills training package', 10.00, 500.00, 'skills', true),
    ('550e8400-e29b-41d4-a716-446655440002', 'Skills Development - 20 Hours', 'Extended skills training package', 20.00, 900.00, 'skills', true),
    ('550e8400-e29b-41d4-a716-446655440003', 'Elite Training - 15 Hours', 'Advanced training for competitive players', 15.00, 750.00, 'elite', true),
    ('550e8400-e29b-41d4-a716-446655440004', 'Practice Sessions - 5 Hours', 'Team practice sessions', 5.00, 250.00, 'practice', true),
    ('550e8400-e29b-41d4-a716-446655440005', 'Monthly Training Pass', 'Unlimited training for one month', 30.00, 1200.00, 'monthly', true)
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- SAMPLE TRAINING SESSIONS
-- =====================================================

-- Insert sample training sessions for the next 30 days
-- Note: These will need parent_accounts and training_purchases to be created first
-- This is a template - adjust dates as needed

DO $$
DECLARE
    session_date DATE;
    session_id UUID;
BEGIN
    -- Create sessions for next 30 days
    FOR i IN 0..29 LOOP
        session_date := CURRENT_DATE + i;
        
        -- Skip weekends (optional - remove if you want weekend sessions)
        IF EXTRACT(DOW FROM session_date) IN (0, 6) THEN
            CONTINUE;
        END IF;
        
        -- Morning Skills Session (9:00 AM - 10:30 AM)
        INSERT INTO training_sessions (
            session_date,
            start_time,
            end_time,
            session_type,
            title,
            location,
            description,
            status
        ) VALUES (
            session_date,
            '09:00:00',
            '10:30:00',
            'skills',
            'Skills Development Session',
            'Main Gym',
            'Individual skills training focusing on fundamentals',
            'scheduled'
        );
        
        -- Afternoon Practice Session (4:00 PM - 6:00 PM)
        IF EXTRACT(DOW FROM session_date) IN (1, 3, 5) THEN
            INSERT INTO training_sessions (
                session_date,
                start_time,
                end_time,
                session_type,
                title,
                location,
                description,
                status
            ) VALUES (
                session_date,
                '16:00:00',
                '18:00:00',
                'practice',
                'Team Practice',
                'Main Gym',
                'Team practice session',
                'scheduled'
            );
        END IF;
        
        -- Evening Elite Session (6:30 PM - 8:00 PM) - Tuesdays and Thursdays
        IF EXTRACT(DOW FROM session_date) IN (2, 4) THEN
            INSERT INTO training_sessions (
                session_date,
                start_time,
                end_time,
                session_type,
                title,
                location,
                description,
                status
            ) VALUES (
                session_date,
                '18:30:00',
                '20:00:00',
                'elite',
                'Elite Training Session',
                'Main Gym',
                'Advanced training for competitive players',
                'scheduled'
            );
        END IF;
    END LOOP;
END $$;

-- =====================================================
-- NOTES FOR MANUAL DATA ENTRY
-- =====================================================

-- To create sample purchases and attendance:
-- 1. First, ensure you have parent_accounts created (via user registration)
-- 2. Then create training_purchases:
-- 
-- INSERT INTO training_purchases (
--     parent_id,
--     athlete_id,
--     package_id,
--     hours_purchased,
--     price_paid,
--     status,
--     purchase_date
-- ) VALUES (
--     '<parent_account_id>',
--     '<athlete_id>',
--     '550e8400-e29b-41d4-a716-446655440001', -- 10 hour package
--     10.00,
--     500.00,
--     'active',
--     NOW()
-- );
--
-- 3. To record attendance:
--
-- INSERT INTO training_attendance (
--     purchase_id,
--     session_id,
--     athlete_id,
--     hours_used,
--     attendance_status
-- ) VALUES (
--     '<purchase_id>',
--     '<session_id>',
--     '<athlete_id>',
--     1.5,
--     'present'
-- );
--
-- Note: The hours_used in training_purchases will automatically update
-- via the trigger when attendance is recorded.

-- =====================================================
-- HELPER QUERIES FOR TESTING
-- =====================================================

-- View all training packages
-- SELECT * FROM training_packages WHERE is_active = true;

-- View upcoming sessions
-- SELECT * FROM training_sessions 
-- WHERE session_date >= CURRENT_DATE 
-- AND status = 'scheduled'
-- ORDER BY session_date, start_time;

-- View purchases for a parent (replace with actual parent_id)
-- SELECT tp.*, tpk.name as package_name
-- FROM training_purchases tp
-- LEFT JOIN training_packages tpk ON tp.package_id = tpk.id
-- WHERE tp.parent_id = '<parent_id>'
-- ORDER BY tp.purchase_date DESC;

-- View attendance for a purchase
-- SELECT ta.*, ts.session_date, ts.title as session_title
-- FROM training_attendance ta
-- JOIN training_sessions ts ON ta.session_id = ts.id
-- WHERE ta.purchase_id = '<purchase_id>'
-- ORDER BY ts.session_date DESC;

