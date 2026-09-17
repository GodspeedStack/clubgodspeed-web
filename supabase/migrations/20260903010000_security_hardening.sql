-- Security hardening: close anon-facing exposures found by Supabase advisors.
-- Applied live 2026-09-03. Verified with pg_class.reloptions + has_table_privilege.
--
-- FINDINGS ADDRESSED
--
-- 1) generate_email_verification_token(uuid, varchar)
--    SECURITY DEFINER with NO authorization check. It accepted any user_id and
--    any email, minted a valid 24-hour verification token, and RETURNED it to
--    the caller. It was executable by `anon`, so an unauthenticated caller
--    holding only the public API key could mint a verification token for any
--    account, including the director's. Potential account-takeover path.
--
--    Fix: revoke EXECUTE from anon/authenticated/public. Left available to
--    service_role for server-side use. Safe to revoke: email_verification_tokens
--    has 0 rows lifetime, i.e. this custom path has never run in production
--    (Supabase Auth handles verification natively).
--
-- 2) Ten SECURITY DEFINER views (advisor ERROR level).
--    A SECURITY DEFINER view runs with the view owner's privileges and bypasses
--    the querying user's RLS entirely. All ten were SELECTable by `anon`.
--    admin_financial_summary therefore exposed every family's financial data to
--    an unauthenticated caller; impersonation_audit_recent and
--    v_security_rls_audit exposed the audit trail and the security posture map.
--
--    Fix: set security_invoker = on so the querying user's RLS applies, and
--    revoke anon SELECT on the eight internal views.
--
--    tournament_catalog and calendar_events_compat KEEP anon SELECT on purpose:
--    they back public-facing pages, and their base tables already carry
--    permissive read policies ("Public read active tournaments" where
--    is_active = true; "view public events" where visibility = 'public').
--    With security_invoker on, anon now sees exactly those rows and no longer
--    sees inactive or private ones.

-- 1) Lock down the token minter -------------------------------------------
revoke execute on function public.generate_email_verification_token(uuid, character varying)
  from anon, authenticated, public;

-- 2) Make all ten views respect the caller's RLS ---------------------------
alter view public.admin_financial_summary    set (security_invoker = on);
alter view public.impersonation_audit_recent set (security_invoker = on);
alter view public.v_security_rls_audit       set (security_invoker = on);
alter view public.onboarding_funnel          set (security_invoker = on);
alter view public.onboarding_status          set (security_invoker = on);
alter view public.training_hours_summary     set (security_invoker = on);
alter view public.availability_summary       set (security_invoker = on);
alter view public.team_schedule_view         set (security_invoker = on);
alter view public.tournament_catalog         set (security_invoker = on);
alter view public.calendar_events_compat     set (security_invoker = on);

-- 3) Remove anon read on the eight internal views --------------------------
revoke select on public.admin_financial_summary    from anon;
revoke select on public.impersonation_audit_recent from anon;
revoke select on public.v_security_rls_audit       from anon;
revoke select on public.onboarding_funnel          from anon;
revoke select on public.onboarding_status          from anon;
revoke select on public.training_hours_summary     from anon;
revoke select on public.availability_summary       from anon;
revoke select on public.team_schedule_view         from anon;
