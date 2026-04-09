-- ============================================================
-- 20260407000001_definitive_auth_triggers.sql
--
-- Definitive cleanup: drops ALL INSERT triggers on auth.users,
-- then recreates exactly two bulletproof triggers.
--
-- Root cause: multiple migrations registered overlapping triggers
-- (on_auth_user_created, on_auth_user_login_request,
-- on_auth_user_created_login_request, plus legacy create_user_profile).
-- Some lacked EXCEPTION blocks, causing signup rollbacks.
--
-- This migration is idempotent and safe to re-run.
-- ============================================================

-- 1. Drop every INSERT trigger on auth.users (dynamic, catches any name)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT trigger_name
    FROM information_schema.triggers
    WHERE event_object_schema = 'auth'
      AND event_object_table = 'users'
      AND event_manipulation = 'INSERT'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON auth.users', r.trigger_name);
    RAISE NOTICE 'Dropped trigger: %', r.trigger_name;
  END LOOP;
END $$;

-- 2. Bulletproof handle_new_user (profiles)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  meta jsonb;
BEGIN
  meta := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  INSERT INTO public.profiles (
    id, email, full_name, phone, player_name, grade, role, approved
  ) VALUES (
    new.id, new.email,
    coalesce(meta->>'parent_name', meta->>'full_name'),
    meta->>'phone', meta->>'player_name', meta->>'grade',
    'parent', false
  )
  ON CONFLICT (id) DO UPDATE SET
    email       = EXCLUDED.email,
    full_name   = coalesce(EXCLUDED.full_name, profiles.full_name),
    phone       = coalesce(EXCLUDED.phone, profiles.phone),
    player_name = coalesce(EXCLUDED.player_name, profiles.player_name),
    grade       = coalesce(EXCLUDED.grade, profiles.grade);
  RETURN new;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_user failed for %: % -- signup proceeds', new.email, SQLERRM;
  RETURN new;
END;
$$;

-- 3. Bulletproof handle_new_login_request (login_requests)
CREATE OR REPLACE FUNCTION public.handle_new_login_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  meta jsonb;
BEGIN
  meta := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  INSERT INTO public.login_requests (
    user_id, email, full_name, requested_role, grade, player_name
  ) VALUES (
    new.id, new.email,
    coalesce(meta->>'parent_name', meta->>'full_name'),
    'parent', meta->>'grade', meta->>'player_name'
  );
  RETURN new;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_login_request failed for %: % -- signup proceeds', new.email, SQLERRM;
  RETURN new;
END;
$$;

-- 4. Register exactly two triggers
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER on_auth_user_created_login_request
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_login_request();

-- 5. Verify (will show in Supabase logs)
DO $$
DECLARE
  cnt int;
BEGIN
  SELECT count(DISTINCT trigger_name) INTO cnt
  FROM information_schema.triggers
  WHERE event_object_schema = 'auth'
    AND event_object_table = 'users'
    AND event_manipulation = 'INSERT';
  IF cnt != 2 THEN
    RAISE WARNING 'Expected 2 INSERT triggers on auth.users, found %', cnt;
  ELSE
    RAISE NOTICE 'OK: exactly 2 INSERT triggers on auth.users';
  END IF;
END $$;
