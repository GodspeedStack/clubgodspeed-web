-- ============================================================
-- v14_01_add_coach_wash.sql
-- Provision Brandon Wash ("Coach Wash") as a coach for Fall 2026.
--
-- PREREQUISITE — do this FIRST, in the Supabase dashboard:
--   Authentication > Users > Add user
--     Email: brandonwash14@gmail.com
--     Auto Confirm User: ON  (otherwise he must click the invite link
--                             before signInWithPassword will succeed)
--   This script CANNOT create the account or set a password. It only
--   stamps the profile row that the handle_new_user trigger creates.
--
-- WHY THIS IS NEEDED:
--   handle_new_user (20260409000001_auto_approve_parents.sql) reads the role
--   from raw_user_meta_data. A user created through the dashboard has no role
--   in its metadata, so the trigger defaults it to 'parent'. Coach Wash would
--   then be turned away at the coach portal with "This account is not set up
--   as a coach." This corrects the role and approves him.
--
--   Coach/director accounts also default to approved=false by design
--   (admin gates staff), so approval has to be granted explicitly.
--
-- Idempotent: safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- STEP 1: DIAGNOSTIC — run these first and confirm the auth user exists.
-- ------------------------------------------------------------
--   SELECT id, email, email_confirmed_at, created_at
--     FROM auth.users
--    WHERE lower(email) = 'brandonwash14@gmail.com';
--
--   SELECT id, email, full_name, role, approved
--     FROM public.profiles
--    WHERE lower(email) = 'brandonwash14@gmail.com';
--
-- If the auth.users query returns no row, stop — create the account in the
-- dashboard first. If email_confirmed_at is NULL, he cannot sign in yet;
-- either re-send the invite or toggle Auto Confirm on the user.

-- ------------------------------------------------------------
-- STEP 2: Backstop — if the trigger failed and left no profile row,
-- build one from the auth user.
-- ------------------------------------------------------------
INSERT INTO public.profiles (id, email, full_name, role, approved)
SELECT u.id,
       u.email,
       'Brandon Wash',
       'coach'::public.app_role,
       true
  FROM auth.users u
 WHERE lower(u.email) = 'brandonwash14@gmail.com'
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------
-- STEP 3: Stamp the role and approval.
-- Keeps an existing full_name if one is already set.
-- ------------------------------------------------------------
UPDATE public.profiles
   SET role      = 'coach'::public.app_role,
       approved  = true,
       full_name = COALESCE(NULLIF(full_name, ''), 'Brandon Wash')
 WHERE lower(email) = 'brandonwash14@gmail.com';

-- ------------------------------------------------------------
-- STEP 4: VERIFY — expect exactly one row, role='coach', approved=true.
-- ------------------------------------------------------------
--   SELECT id, email, full_name, role, approved
--     FROM public.profiles
--    WHERE lower(email) = 'brandonwash14@gmail.com';
