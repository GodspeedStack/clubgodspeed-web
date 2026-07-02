-- v10_01_profile_visibility_flags.sql
-- Per-profile UI visibility flags for the parent portal.
--   is_dues_exempt : hide AAU Season Dues nav + CTA + billing view for this account
--   hide_calendar  : hide Calendar nav + view for this account
--
-- Consumed by account-visibility.js (client reads these columns for the logged-in user).
-- Existing parent RLS SELECT policy on `profiles` (own row only) already covers these columns.
-- Idempotent: safe to re-run.

-- 1. Schema ---------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_dues_exempt boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hide_calendar  boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.is_dues_exempt IS 'When true, hide all dues/billing UI for this account.';
COMMENT ON COLUMN public.profiles.hide_calendar  IS 'When true, hide the calendar nav + view for this account.';

-- 2. Data: exempt the three accounts --------------------------------------
-- Dues-exempt: Stacey Young, Sheila Antony, Steve van ooteghem
UPDATE public.profiles
   SET is_dues_exempt = true
 WHERE lower(email) IN (
   'msstace1@gmail.com',
   'sheila.antony@gmail.com',
   'stevevano@gmail.com'
 );

-- Hide calendar: Sheila Antony, Steve van ooteghem
UPDATE public.profiles
   SET hide_calendar = true
 WHERE lower(email) IN (
   'sheila.antony@gmail.com',
   'stevevano@gmail.com'
 );

-- 3. Verify ---------------------------------------------------------------
-- SELECT email, is_dues_exempt, hide_calendar
--   FROM public.profiles
--  WHERE lower(email) IN ('msstace1@gmail.com','sheila.antony@gmail.com','stevevano@gmail.com');
