-- v12_01_welcome_email_hardening.sql
-- Make approval welcome emails ironclad.
--
-- Root causes fixed:
--   1. welcome_email_queue was never drained (no cron) -> enqueued emails never sent.
--   2. Queue processor marked rows 'failed' on first error with no retry.
--   3. Auto-approved-at-INSERT parents never fired the approved-flip UPDATE trigger,
--      so they were never enqueued at all.
--
-- This migration is idempotent. After running it, deploy the updated
-- send-welcome-email function (retry-aware) so the cron drain can retry.
--
-- REQUIRED: in step 3, replace SERVICE_ROLE_KEY_HERE with the service_role key
-- from Supabase Dashboard -> Settings -> API before running (same as the other crons).

-- 1. Durability columns on the queue -------------------------------------
ALTER TABLE public.welcome_email_queue
  ADD COLUMN IF NOT EXISTS attempts    integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error  text,
  ADD COLUMN IF NOT EXISTS updated_at  timestamptz NOT NULL DEFAULT now();

-- 2. Enqueue reliably on BOTH insert and approval-flip, without duplicates.
CREATE OR REPLACE FUNCTION public.queue_welcome_email()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Fire when a profile is approved: either created already-approved (INSERT),
  -- or flipped from not-approved to approved (UPDATE).
  IF NEW.approved = true
     AND (TG_OP = 'INSERT' OR OLD.approved IS DISTINCT FROM true) THEN
    -- Guard against duplicates: only one live (pending/sent) row per user.
    IF NOT EXISTS (
      SELECT 1 FROM public.welcome_email_queue q
      WHERE q.user_id = NEW.id AND q.status IN ('pending','sent')
    ) AND NEW.email IS NOT NULL THEN
      INSERT INTO public.welcome_email_queue (user_id, email, full_name)
      VALUES (NEW.id, NEW.email, NEW.full_name);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_queue_welcome ON public.profiles;
CREATE TRIGGER trg_queue_welcome
  AFTER UPDATE OF approved ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.queue_welcome_email();

DROP TRIGGER IF EXISTS trg_queue_welcome_insert ON public.profiles;
CREATE TRIGGER trg_queue_welcome_insert
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.queue_welcome_email();

-- 3. Drain the queue every 5 minutes (the missing piece). --------------------
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('welcome-email-drain')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'welcome-email-drain');

SELECT cron.schedule(
  'welcome-email-drain',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://nnqokhqennuxalamnvps.supabase.co/functions/v1/send-welcome-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer SERVICE_ROLE_KEY_HERE'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- 4. Backfill the parents who were missed. -----------------------------------
--    Enqueues a pending welcome email for each, unless one already exists.
INSERT INTO public.welcome_email_queue (user_id, email, full_name)
SELECT p.id, p.email, p.full_name
FROM public.profiles p
WHERE lower(p.email) IN (
  'lorenmsylvan@gmail.com',   -- Loren Sylvan (Zach)
  'stevevano@gmail.com',      -- Steve van ooteghem (Oliver)
  'sheila.antony@gmail.com'   -- Sheila Antony (Oliver)
)
AND NOT EXISTS (
  SELECT 1 FROM public.welcome_email_queue q
  WHERE q.user_id = p.id AND q.status IN ('pending','sent')
);

-- 5. Verify -----------------------------------------------------------------
-- Queue state for the three parents:
-- SELECT q.email, q.status, q.attempts, q.last_error, q.created_at, q.sent_at
--   FROM public.welcome_email_queue q
--  WHERE lower(q.email) IN ('lorenmsylvan@gmail.com','stevevano@gmail.com','sheila.antony@gmail.com')
--  ORDER BY q.created_at DESC;
-- Cron registered:
-- SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'welcome-email-drain';
