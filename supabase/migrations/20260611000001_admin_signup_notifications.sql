-- ============================================================
-- 20260611000001_admin_signup_notifications.sql
-- Admin notification on new parent signup with one-click approval.
--
-- Flow:
--   1. Parent signs up -> handle_new_user() creates profile (approved=false)
--   2. trg_admin_signup_notify inserts into admin_signup_notifications
--   3. Cron calls notify-admin-signup edge function every 2 min
--   4. Scott receives branded email with profile info + Approve button
--   5. Approve click -> edge function sets approved=true
--   6. trg_queue_welcome fires -> welcome email sent to parent
--
-- Contract:
--   - Parents start with approved=false (manual approval gate)
--   - approval_token is a one-time-use UUID for the email approve link
--   - Status: pending -> sent -> approved (or failed)
--   - Existing approved parents are NOT affected
-- ============================================================

-- ── 1. Notification queue table ─────────────────────────────

CREATE TABLE IF NOT EXISTS public.admin_signup_notifications (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    email           text NOT NULL,
    full_name       text,
    phone           text,
    player_name     text,
    grade           text,
    date_of_birth   date,
    approval_token  uuid NOT NULL DEFAULT gen_random_uuid(),
    status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'sent', 'approved', 'failed')),
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_signup_notif_status
    ON public.admin_signup_notifications(status)
    WHERE status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_signup_notif_token
    ON public.admin_signup_notifications(approval_token);

ALTER TABLE public.admin_signup_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages admin signup notifications"
    ON public.admin_signup_notifications
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- ── 2. Trigger: queue admin notification on new profile INSERT ──

CREATE OR REPLACE FUNCTION public.queue_admin_signup_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    -- Only notify for parent signups
    IF NEW.role = 'parent' THEN
        INSERT INTO public.admin_signup_notifications
            (profile_id, email, full_name, phone, player_name, grade, date_of_birth)
        VALUES
            (NEW.id, NEW.email, NEW.full_name, NEW.phone, NEW.player_name, NEW.grade, NEW.date_of_birth)
        ON CONFLICT DO NOTHING;
    END IF;
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Never block profile creation. Log and continue.
    RAISE WARNING 'queue_admin_signup_notification failed for %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_admin_signup_notify ON public.profiles;
CREATE TRIGGER trg_admin_signup_notify
    AFTER INSERT ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.queue_admin_signup_notification();

-- ── 3. Revert auto-approve: parents start pending ───────────
-- Existing approved parents remain approved. Only NEW signups start pending.

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
  v_grade    text    := NEW.raw_user_meta_data->>'grade';
  v_dob      text    := NEW.raw_user_meta_data->>'date_of_birth';
  -- Parents start pending; coach/director always pending (admin gates)
  v_approved boolean := false;
BEGIN
  INSERT INTO public.profiles (id, email, full_name, player_name, phone, grade, date_of_birth, role, approved, created_at)
  VALUES (
    NEW.id, NEW.email, v_name, v_player, v_phone, v_grade,
    CASE WHEN v_dob IS NOT NULL THEN v_dob::date ELSE NULL END,
    v_role, v_approved, now()
  )
  ON CONFLICT (id) DO UPDATE
     SET email       = EXCLUDED.email,
         full_name   = COALESCE(public.profiles.full_name,   EXCLUDED.full_name),
         player_name = COALESCE(public.profiles.player_name, EXCLUDED.player_name),
         phone       = COALESCE(public.profiles.phone,       EXCLUDED.phone),
         grade       = COALESCE(public.profiles.grade,       EXCLUDED.grade),
         date_of_birth = COALESCE(public.profiles.date_of_birth, EXCLUDED.date_of_birth),
         role        = COALESCE(public.profiles.role,        EXCLUDED.role),
         -- Never downgrade: keep approved if already true
         approved    = public.profiles.approved OR EXCLUDED.approved;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_user failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

-- ── 4. Cron setup ───────────────────────────────────────────
-- Configure via Supabase Dashboard > Database > Cron Jobs:
--   Name: notify-admin-signup
--   Schedule: */2 * * * *
--   Command: SELECT net.http_post(
--     url := 'https://nnqokhqennuxalamnvps.supabase.co/functions/v1/notify-admin-signup',
--     headers := '{"Authorization":"Bearer <SERVICE_ROLE_KEY>","Content-Type":"application/json"}'::jsonb,
--     body := '{}'::jsonb
--   );
