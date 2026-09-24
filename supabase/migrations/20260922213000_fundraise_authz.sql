-- v10_02_fundraise_authz.sql
--
-- get_campaign_public is SECURITY DEFINER (so it bypasses RLS), had EXECUTE
-- granted to anon, and did no caller check. Once a campaign is live it returns
-- every participant's name, goal and amount raised, plus the donor wall, to
-- anyone holding the publishable anon key.
--
-- DECISION (Scott, 2026-09-22): lock it to signed-in users. Godspeed Raise
-- becomes family-only. A grandparent or neighbour with a share link can no
-- longer open a player's page or donate without a Godspeed account. Reverse by
-- restoring the anon grant and removing the guard.

begin;

revoke execute on function public.get_campaign_public(text, boolean) from anon, public;
grant  execute on function public.get_campaign_public(text, boolean) to authenticated;

-- Belt and braces: even if a grant is restored by accident, the function
-- refuses a caller with no session.
create or replace function public.require_signed_in()
returns void
language plpgsql
stable
security definer
set search_path to ''
as $$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
end;
$$;

revoke execute on function public.require_signed_in() from public, anon;
grant  execute on function public.require_signed_in() to authenticated;

commit;
