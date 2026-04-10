-- Auto-approve parent profiles on signup.
-- Eliminates the manual UPDATE step documented in project_parent_roster.md
-- that caused 19/28 parents to be stranded in approved=false state.
--
-- Contract:
--   INPUT : NEW row in auth.users with raw_user_meta_data.role
--   OUTPUT: public.profiles row with role + approved correctly stamped
--   INVARIANT: role='parent' => approved=true on creation
--              role='coach' | 'director' => approved=false (admin gates)
--
-- Idempotent and safe to re-run. Preserves the EXCEPTION WHEN OTHERS
-- hardening from 20260407000001_definitive_auth_triggers.sql so that
-- auth.users INSERT never rolls back on profile-side failures.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role     text    := COALESCE(NEW.raw_user_meta_data->>'role', 'parent');
  v_name     text    := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email);
  v_player   text    := NEW.raw_user_meta_data->>'player_name';
  v_phone    text    := NEW.raw_user_meta_data->>'phone';
  v_approved boolean := (v_role = 'parent');
BEGIN
  INSERT INTO public.profiles (id, email, full_name, player_name, phone, role, approved, created_at)
  VALUES (NEW.id, NEW.email, v_name, v_player, v_phone, v_role, v_approved, now())
  ON CONFLICT (id) DO UPDATE
     SET email       = EXCLUDED.email,
         full_name   = COALESCE(public.profiles.full_name,   EXCLUDED.full_name),
         player_name = COALESCE(public.profiles.player_name, EXCLUDED.player_name),
         phone       = COALESCE(public.profiles.phone,       EXCLUDED.phone),
         role        = COALESCE(public.profiles.role,        EXCLUDED.role),
         approved    = public.profiles.approved OR EXCLUDED.approved;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block auth.users INSERT. Failure is logged; health-check will catch drift.
  RAISE WARNING 'handle_new_user failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

-- Backfill: approve any existing parent profile still sitting at approved=false.
UPDATE public.profiles
   SET approved = true
 WHERE role = 'parent'
   AND approved IS NOT TRUE;
