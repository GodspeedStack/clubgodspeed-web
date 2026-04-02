-- ============================================================
-- 20260401000002_bulletproof_signup_triggers.sql
--
-- Problem: handle_new_user() and handle_new_login_request() triggers
-- fire AFTER INSERT on auth.users. If either trigger throws (unique
-- constraint, column mismatch, RLS), Supabase GoTrue rolls back the
-- entire signup and returns "Database error finding user."
--
-- Fix: Wrap both triggers in EXCEPTION blocks so they NEVER crash
-- the auth transaction. A failed profile/login_request insert is
-- recoverable; a failed signup is not.
-- ============================================================

-- 1. Bulletproof handle_new_user — profiles insert
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  meta jsonb;
BEGIN
  meta := coalesce(new.raw_user_meta_data, '{}'::jsonb);

  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    phone,
    player_name,
    grade,
    role,
    approved
  ) VALUES (
    new.id,
    new.email,
    coalesce(meta->>'parent_name', meta->>'full_name'),
    meta->>'phone',
    meta->>'player_name',
    meta->>'grade',
    'parent',
    false
  )
  ON CONFLICT (id) DO UPDATE SET
    email       = EXCLUDED.email,
    full_name   = coalesce(EXCLUDED.full_name, profiles.full_name),
    phone       = coalesce(EXCLUDED.phone, profiles.phone),
    player_name = coalesce(EXCLUDED.player_name, profiles.player_name),
    grade       = coalesce(EXCLUDED.grade, profiles.grade);

  RETURN new;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_user failed for %: % — signup proceeds without profile row',
    new.email, SQLERRM;
  RETURN new;
END;
$$;

-- 2. Bulletproof handle_new_login_request — login_requests insert
CREATE OR REPLACE FUNCTION public.handle_new_login_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  meta jsonb;
BEGIN
  meta := coalesce(new.raw_user_meta_data, '{}'::jsonb);

  INSERT INTO public.login_requests (
    user_id,
    email,
    full_name,
    requested_role,
    grade,
    player_name
  ) VALUES (
    new.id,
    new.email,
    coalesce(meta->>'parent_name', meta->>'full_name'),
    'parent',
    meta->>'grade',
    meta->>'player_name'
  );

  RETURN new;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_login_request failed for %: % — signup proceeds without login_request row',
    new.email, SQLERRM;
  RETURN new;
END;
$$;
