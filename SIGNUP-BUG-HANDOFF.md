# Signup Pipeline -- Bug Fix Handoff

**Project:** Club Godspeed (clubgodspeed.com)
**Stack:** Supabase Auth + PostgreSQL, Vanilla JS frontend, Vercel hosting
**Date:** 2026-04-07
**Priority:** P0 -- blocks all new parent signups

---

## Problem

New parents cannot create accounts. The signup form at `/parent-portal.html` displays: _"Our system ran into a temporary issue. Please wait a moment and try again."_

Affected users (confirmed): Kevin Davis (Kevinddavis91@gmail.com), Jerri Reece (jerriberil@gmail.com). Likely affects all new signups.

## Root Cause

Supabase Auth fires AFTER INSERT triggers on `auth.users` when a new user signs up. Three triggers exist:

| Trigger | Function | Target Table |
|---|---|---|
| `on_auth_user_created` | `handle_new_user()` | `profiles` |
| `on_auth_user_created_login_request` | `handle_new_login_request()` | `login_requests` |
| (name varies) | `handle_welcome_email()` | `welcome_email_queue` |

If **any** trigger throws an unhandled exception, PostgreSQL rolls back the entire `auth.users` INSERT. The Supabase Auth API then returns a database error to the client, which the frontend maps to the "temporary issue" message.

Multiple migrations registered overlapping triggers on auth.users with different names (`on_auth_user_created`, `on_auth_user_login_request`, `on_auth_user_created_login_request`), some pointing to un-bulletproofed functions. The live database accumulated stale triggers that were never cleaned up. The definitive fix (20260407000001) drops ALL INSERT triggers on auth.users and recreates exactly two, both with EXCEPTION WHEN OTHERS blocks.

## Fix Applied (2026-04-07)

All three trigger functions were replaced with bulletproof versions using this pattern:

```sql
CREATE OR REPLACE FUNCTION public.<function_name>()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  -- business logic here (INSERT with ON CONFLICT DO NOTHING where applicable)
  RETURN new;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '<function_name> failed for %: % -- signup proceeds',
    new.email, SQLERRM;
  RETURN new;  -- CRITICAL: always return new so auth.users INSERT commits
END;
$$;
```

The key guarantee: `RETURN new` in the EXCEPTION block ensures the auth.users INSERT always succeeds, even if downstream table writes fail. Failures are logged as PostgreSQL warnings (visible in Supabase logs) but never block signup.

Additionally, stale `auth.users` rows for affected users were cleaned up:

```sql
-- Order matters: FK constraints require deleting from child tables first
DELETE FROM public.welcome_email_queue WHERE user_id = '<stale_uuid>';
DELETE FROM public.login_requests WHERE user_id = '<stale_uuid>';
DELETE FROM public.profiles WHERE id = '<stale_uuid>';
DELETE FROM auth.users WHERE id = '<stale_uuid>';
```

## Architecture: Signup Flow

```
Browser                   Supabase Auth              PostgreSQL
  |                           |                          |
  |-- signUp(email,pass) ---->|                          |
  |                           |-- INSERT auth.users ---->|
  |                           |                          |-- TRIGGER: handle_new_user()
  |                           |                          |     INSERT profiles (ON CONFLICT UPDATE)
  |                           |                          |     EXCEPTION -> RAISE WARNING, RETURN new
  |                           |                          |
  |                           |                          |-- TRIGGER: handle_new_login_request()
  |                           |                          |     INSERT login_requests
  |                           |                          |     EXCEPTION -> RAISE WARNING, RETURN new
  |                           |                          |
  |                           |                          |-- TRIGGER: handle_welcome_email()
  |                           |                          |     INSERT welcome_email_queue
  |                           |                          |     EXCEPTION -> RAISE WARNING, RETURN new
  |                           |                          |
  |                           |<-- COMMIT (always) ------|
  |<-- { user, session } -----|                          |
  |                           |                          |
  |-- show "check email" ---->|                          |
```

## Files

| File | Role |
|---|---|
| `auth-supabase.js` | Client-side auth wrapper. `signup()` calls `supabaseClient.auth.signUp()`, retries on transient DB errors (2 attempts), maps errors to user-friendly messages. |
| `parent-portal.js` | UI layer. `handleSignup()` (line ~740) calls `auth.signup()`, catches errors, displays messages in `.error-message` element. Error classification at line ~796. |
| `supabase/migrations/20260405000001_fix_kevin_signup_and_harden_triggers.sql` | Migration file containing bulletproof trigger definitions + RLS policies for fallback profile/login_request creation. |

## Error Classification (parent-portal.js, line 796-831)

The frontend classifies errors by matching substrings in the error message:

| Substring match | User message |
|---|---|
| `already` + `exist`/`register` | "An account with this email already exists" + login/resend links |
| `not connected` / `failed to fetch` | "Couldn't reach the server" |
| `password` / `weak` | Weak password or breached password message |
| `rate` / `limit` | "Too many attempts" |
| `database` / `trigger` / `violates` | "Our system ran into a temporary issue" |
| (default) | "Something went wrong creating your account" |

## Client-Side Retry Logic (auth-supabase.js)

```
_isDatabaseError(error) checks for: "database error", "db error", "violates",
  "trigger", "transaction", "timeout"

_isNetworkError(error) checks for: "failed to fetch", "network",
  "not connected", "econnrefused", "dns"

Retry: up to 2 attempts with 1500ms * attempt backoff
Only retries on _isDatabaseError or _isNetworkError
```

## Recurring Failure Pattern

When signup fails, a partial `auth.users` row may persist (depending on where the failure occurred). Subsequent signup attempts for the same email then hit Supabase's duplicate-email handling, which returns either a null user or empty identities array. The frontend correctly maps these to "already registered" -- but the user never received a confirmation email and cannot log in.

**Resolution for stale rows:** Delete from child tables first (FK order), then `auth.users`. Tables to check: `welcome_email_queue`, `login_requests`, `profiles`.

## Verification

A health check edge function is deployed at:

```
GET https://nnqokhqennuxalamnvps.supabase.co/functions/v1/health-check
Authorization: Bearer <anon_key>
```

Returns `{ ok: true/false, checks: [...], failures: [...] }`. Checks: db_connection, trigger existence, critical table reads (profiles, fundraising_totals, payment_plans, login_requests), RLS policy presence, signup pipeline accessibility.

On failure, auto-emails jewellsco@gmail.com via Resend.

Source: `supabase/functions/health-check/index.ts`

## Preventive Rules

1. **Every AFTER INSERT trigger on `auth.users` MUST have an EXCEPTION WHEN OTHERS block that returns `new`.** No exceptions. A single unhandled trigger failure blocks all signups.

2. **Before adding any new trigger on `auth.users`**, audit all existing triggers:
   ```sql
   SELECT trigger_name, event_manipulation, action_statement
   FROM information_schema.triggers
   WHERE event_object_schema = 'auth' AND event_object_table = 'users';
   ```

3. **New trigger functions must use SECURITY DEFINER with `SET search_path = public`** to bypass RLS.

4. **Use ON CONFLICT DO NOTHING or DO UPDATE** on all INSERTs inside triggers to handle retries and edge cases.

5. **Test signup in a clean state** after any auth-related migration: create a fresh email, sign up, confirm the profile and login_request rows were created.
