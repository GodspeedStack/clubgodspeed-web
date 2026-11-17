-- v19_03: Grant EXECUTE on get_campaign_public to anon role.
--
-- The v19_01 migration created the function and issued this grant, but the
-- grant did not propagate to the remote DB (anon was absent from
-- information_schema.role_routine_grants). Without it every unauthenticated
-- page load hits a 401 and the fundraise hub renders the pre-launch hero
-- instead of live campaign data.
--
-- Re-runnable: GRANT is a no-op if the privilege already exists.

GRANT EXECUTE ON FUNCTION public.get_campaign_public(TEXT, BOOLEAN) TO anon;
