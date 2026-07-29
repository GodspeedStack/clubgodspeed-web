-- ============================================================
-- v10_02_raise_cron.sql
-- Schedules the Godspeed Raise campaign agent (fundraiser-engine).
-- Daily at 9:00 AM Mountain (15:00 UTC during MDT).
--
-- SECURITY: this migration does NOT embed any key. The daily job
-- authenticates to the (verify_jwt=false) function with a shared
-- secret read from Supabase Vault at call time, so nothing sensitive
-- ever lands in git.
--
-- ONE-TIME SETUP (run out-of-band, e.g. Dashboard SQL editor — do NOT
-- commit the secret value):
--   1. Pick a random secret, e.g.  openssl rand -hex 32
--   2. Store it in Vault under the name the job reads:
--        select vault.create_secret('<the-secret>', 'fundraiser_cron_secret');
--   3. Set the SAME value as the CRON_SECRET env var on the
--      fundraiser-engine function (Dashboard -> Functions -> Secrets,
--      or:  supabase secrets set CRON_SECRET=<the-secret> ).
-- The engine only enforces the header when CRON_SECRET is set, so the
-- order of operations is safe either way.
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
      'x-cron-secret',
        (SELECT decrypted_secret FROM vault.decrypted_secrets
          WHERE name = 'fundraiser_cron_secret')
    ),
    body := '{"action":"cron"}'::jsonb
  );
  $$
);
