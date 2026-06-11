-- ============================================================
-- v10_02_raise_cron.sql
-- Schedules the Godspeed Raise campaign agent (fundraiser-engine).
-- Daily at 9:00 AM Mountain (15:00 UTC during DST).
--
-- BEFORE RUNNING: replace SERVICE_ROLE_KEY_HERE with the
-- service_role key from Supabase Dashboard -> Settings -> API.
-- (Alternative: schedule via Dashboard -> Integrations -> Cron.)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('fundraiser-engine-daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'fundraiser-engine-daily');

SELECT cron.schedule(
  'fundraiser-engine-daily',
  '0 15 * * *',
  $$
  SELECT net.http_post(
    url := 'https://nnqokhqennuxalamnvps.supabase.co/functions/v1/fundraiser-engine',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer SERVICE_ROLE_KEY_HERE'
    ),
    body := '{"action":"cron"}'::jsonb
  );
  $$
);
