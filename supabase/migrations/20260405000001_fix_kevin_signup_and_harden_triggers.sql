-- ============================================================
-- 20260405000001_fix_kevin_signup_and_harden_triggers.sql
--
-- Purpose:
-- 1. Re-apply bulletproof handle_new_user() trigger (idempotent)
-- 2. Re-apply bulletproof handle_new_login_request() trigger (idempotent)
-- 3. Ensure RLS policies allow the service_role and trigger to insert profiles
-- 4. Add missing RLS policy for anon/authenticated profile self-insert
--    (needed by client-side fallback profile creation)
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

-- 3. Ensure triggers exist on auth.users (idempotent: drop + recreate)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS on_auth_user_created_login_request ON auth.users;
CREATE TRIGGER on_auth_user_created_login_request
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_login_request();

-- 4. RLS: Allow authenticated users to insert their own profile row (fallback)
--    This supports the client-side fallback if the trigger fails.
DO $$
BEGIN
  -- Only create if not exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'profiles' AND policyname = 'Users can insert own profile'
  ) THEN
    CREATE POLICY "Users can insert own profile"
      ON public.profiles FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = id);
  END IF;

  -- Allow authenticated users to read their own profile
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'profiles' AND policyname = 'Users can read own profile'
  ) THEN
    CREATE POLICY "Users can read own profile"
      ON public.profiles FOR SELECT
      TO authenticated
      USING (auth.uid() = id);
  END IF;

  -- Allow authenticated users to upsert their own profile (for fallback)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'profiles' AND policyname = 'Users can update own profile'
  ) THEN
    CREATE POLICY "Users can update own profile"
      ON public.profiles FOR UPDATE
      TO authenticated
      USING (auth.uid() = id)
      WITH CHECK (auth.uid() = id);
  END IF;
END $$;

-- 5. RLS: Allow authenticated users to insert their own login_request (fallback)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'login_requests' AND policyname = 'Users can insert own login request'
  ) THEN
    CREATE POLICY "Users can insert own login request"
      ON public.login_requests FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'login_requests' AND policyname = 'Users can read own login request'
  ) THEN
    CREATE POLICY "Users can read own login request"
      ON public.login_requests FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;
