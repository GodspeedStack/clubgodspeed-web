-- v10_01_uniform_availability_authz.sql
--
-- get_uniform_availability was SECURITY DEFINER (so it bypasses RLS), granted
-- EXECUTE to anon, and performed no check on who was calling. Anyone on the
-- internet could POST an athlete UUID to /rest/v1/rpc/get_uniform_availability
-- and read that minor's jersey number, uniform status and team names without
-- signing in; with a null argument it returned every taken number in the
-- program. Any signed-in parent could do the same for other families' children.
--
-- This migration closes both holes: anon loses EXECUTE, and the function
-- authorizes the caller against the athlete before returning anything.

begin;

-- 1. Least privilege on the definer functions this page touches.
revoke execute on function public.get_uniform_availability(uuid) from anon, public;
revoke execute on function public.athlete_uniform_teams(uuid)    from anon, public;
revoke execute on function public.can_access_athlete(uuid)       from anon;

grant execute on function public.get_uniform_availability(uuid) to authenticated;
grant execute on function public.athlete_uniform_teams(uuid)    to authenticated;

-- 2. can_access_athlete() covers admins and coaches only. Parents need their
--    own path, matching the two athletes RLS policies already in place.
create or replace function public.parent_can_access_athlete(p_athlete uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists (
           select 1 from public.parent_player_links l
            where l.athlete_id = p_athlete
              and l.profile_id = auth.uid())
      or exists (
           select 1 from public.athletes a
             join public.parent_accounts pa on pa.id = a.parent_account_id
            where a.id = p_athlete
              and pa.user_id = auth.uid());
$$;

revoke execute on function public.parent_can_access_athlete(uuid) from public, anon;
grant  execute on function public.parent_can_access_athlete(uuid) to authenticated;

-- 3. The function itself now refuses unauthenticated callers, refuses athletes
--    the caller has no claim to, and reserves the program-wide (null) form for
--    admins. Body below is unchanged from the original past the guard block.
create or replace function public.get_uniform_availability(p_athlete_id uuid default null::uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  cfg     public.uniform_config%rowtype;
  v_own   int;
  v_teams uuid[];
  v_needs boolean;
  taken   int[];
  tnames  jsonb;
begin
  -- ---- authorization guard -------------------------------------------------
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if p_athlete_id is null then
    if not public.is_program_admin() then
      raise exception 'NOT_AUTHORIZED' using errcode = '42501';
    end if;
  elsif not (public.parent_can_access_athlete(p_athlete_id)
             or public.can_access_athlete(p_athlete_id)) then
    raise exception 'NOT_YOUR_ATHLETE' using errcode = '42501';
  end if;
  -- --------------------------------------------------------------------------

  select * into cfg from public.uniform_config where id = 1;
  if p_athlete_id is not null then
    select jersey_number, needs_uniform into v_own, v_needs from public.athletes where id = p_athlete_id;
    v_teams := array(select public.athlete_uniform_teams(p_athlete_id));
  else
    v_teams := array(select id from public.teams where uniform_scoped);
  end if;

  select jsonb_agg(name order by sort_key) into tnames
    from (select name, coalesce(nullif(regexp_replace(name,'\D','','g'),'')::int, 99) sort_key
            from public.teams where id = any(v_teams)) s;

  select array_agg(distinct n) into taken from (
    select a.jersey_number as n
      from public.athletes a
      join public.team_rosters r on r.athlete_id = a.id and r.left_at is null
     where a.jersey_number is not null and a.enrollment_status = 'active'
       and r.team_id = any(v_teams) and (p_athlete_id is null or a.id <> p_athlete_id)
    union
    select l.jersey_number as n from public.uniform_number_locks l
     where l.active and l.team_id = any(v_teams)
  ) u;

  return jsonb_build_object(
    'product_name', cfg.product_name, 'set_price', cfg.set_price,
    'jersey_price', cfg.jersey_price, 'shorts_price', cfg.shorts_price,
    'jersey_sizes', to_jsonb(cfg.jersey_sizes), 'shorts_sizes', to_jsonb(cfg.shorts_sizes),
    'number_min', cfg.number_min, 'number_max', cfg.number_max, 'active', cfg.active,
    'own_number', v_own, 'needs_uniform', coalesce(v_needs, true),
    'team_names', coalesce(tnames, '[]'::jsonb),
    'taken', coalesce(to_jsonb(taken), '[]'::jsonb));
end;
$function$;

revoke execute on function public.get_uniform_availability(uuid) from anon, public;
grant  execute on function public.get_uniform_availability(uuid) to authenticated;

commit;
