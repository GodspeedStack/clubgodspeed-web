-- v14_03: Repair auth.users rows bulk-inserted 2026-03-28 with NULL text columns.
--
-- Why: GoTrue scans these columns as non-nullable strings. A NULL makes every
-- user lookup by email fail with HTTP 500
--   "error finding user: sql: Scan error on column ... email_change: converting NULL to string is unsupported"
-- which breaks /recover (password reset), /otp (magic link), OAuth account
-- linking and admin generateLink for exactly those 14 accounts. Seen live in
-- auth logs 2026-09-03 14:58Z from a parent trying to reach a document.
--
-- Empty string is GoTrue's own default for these columns. Idempotent: only
-- touches rows that are still NULL. No PII is written.
--
-- Proof query (expect 0 rows after):
--   select email from auth.users
--    where email_change is null or email_change_token_new is null;
--
-- Rule for future bulk account creation: use auth.admin.createUser (or the
-- admin-reset-signup edge function), never raw INSERT into auth.users.

update auth.users
   set email_change               = coalesce(email_change, ''),
       email_change_token_new     = coalesce(email_change_token_new, ''),
       email_change_token_current = coalesce(email_change_token_current, ''),
       confirmation_token         = coalesce(confirmation_token, ''),
       recovery_token             = coalesce(recovery_token, ''),
       phone_change               = coalesce(phone_change, ''),
       phone_change_token         = coalesce(phone_change_token, ''),
       reauthentication_token     = coalesce(reauthentication_token, '')
 where email_change is null
    or email_change_token_new is null
    or email_change_token_current is null
    or confirmation_token is null
    or recovery_token is null
    or phone_change is null
    or phone_change_token is null
    or reauthentication_token is null;
