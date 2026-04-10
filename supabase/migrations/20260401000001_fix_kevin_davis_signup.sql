-- ============================================================
-- 20260401000001_fix_kevin_davis_signup.sql
-- Diagnostic + fix for "database error finding user" on signup
-- for Kevinddavis91@gmail.com (parent of Emory White)
-- ============================================================

-- STEP 1: DIAGNOSTIC — Check if email already exists in auth.users
-- Run this SELECT first to understand the state:
--
--   SELECT id, email, email_confirmed_at, created_at, raw_user_meta_data
--   FROM auth.users
--   WHERE email = 'kevinddavis91@gmail.com';
--
-- Also check profiles and login_requests:
--
--   SELECT * FROM public.profiles WHERE email = 'kevinddavis91@gmail.com';
--   SELECT * FROM public.login_requests WHERE email = 'kevinddavis91@gmail.com';

-- STEP 2: FIX — If a stale auth.users row exists (from a prior failed
-- signup or expired email confirmation), delete the orphaned records
-- so the user can re-register cleanly.
--
-- Cascade will handle profiles + login_requests FK references.

-- Uncomment and run ONLY if the diagnostic shows a stale row:
-- DELETE FROM auth.users WHERE email = 'kevinddavis91@gmail.com';

-- STEP 3: ALTERNATIVE FIX — If the user EXISTS in auth.users with a
-- valid record but is missing a profiles row (trigger failed mid-flight),
-- manually insert the profile so the user can log in:

-- INSERT INTO public.profiles (id, email, full_name, phone, player_name, role, approved)
-- SELECT
--   id,
--   email,
--   'Kevin Davis',
--   NULL,
--   'Emory White',
--   'parent',
--   false
-- FROM auth.users
-- WHERE email = 'kevinddavis91@gmail.com'
-- ON CONFLICT (id) DO NOTHING;

-- Also ensure a login_request exists for admin approval:
-- INSERT INTO public.login_requests (user_id, email, full_name, requested_role, player_name)
-- SELECT
--   id,
--   email,
--   'Kevin Davis',
--   'parent',
--   'Emory White'
-- FROM auth.users
-- WHERE email = 'kevinddavis91@gmail.com'
-- ON CONFLICT DO NOTHING;
