-- Jersey number self-service picker.
--
-- Uniqueness is per GRADE BAND, not per team: the two teams carrying 5th
-- graders share one pool so a call-up never collides, and 6th has its own.
-- The band is an explicit column rather than parsed from team names, so it
-- stays correct when teams are renamed.
--
-- Numbers 0 to 99 are all selectable. Taken ones come back flagged.
--
-- PRIVACY: get_jersey_availability returns NUMBERS ONLY. It never reveals which
-- athlete holds a number, so the picker cannot be used to enumerate a roster.

begin;

alter table public.teams add column if not exists jersey_pool text;

update public.teams set jersey_pool = 'grades-4-5'
 where id in ('a0000000-0000-0000-0000-000000000004',
              'a0000000-0000-0000-0000-000000000005');
update public.teams set jersey_pool = 'grade-6'
 where id = 'a0000000-0000-0000-0000-000000000006';

-- Any team left unassigned gets its own private pool rather than silently
-- sharing one, so a new team can never collide by accident.
update public.teams set jersey_pool = 'team-' || id::text where jersey_pool is null;

-- Is the current user a parent of this athlete, or staff?
create or replace function public.can_manage_athlete(p_athlete_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select public.current_user_is_staff()
      or exists (select 1 from public.athlete_parents ap
                  where ap.athlete_id = p_athlete_id
                    and ap.parent_account_id = auth.uid())
      or exists (select 1 from public.parent_player_links ppl
                  where ppl.athlete_id = p_athlete_id
                    and ppl.profile_id = auth.uid());
$function$;

-- The pools this athlete's current teams belong to.
create or replace function public.athlete_jersey_pools(p_athlete_id uuid)
returns setof text
language sql
stable
security definer
set search_path to 'public'
as $function$
  select distinct t.jersey_pool
  from public.team_rosters tr
  join public.teams t on t.id = tr.team_id
  where tr.athlete_id = p_athlete_id
    and tr.left_at is null
    and t.jersey_pool is not null;
$function$;

-- 0..99 with a taken flag. Numbers only, never names.
create or replace function public.get_jersey_availability(p_athlete_id uuid)
returns table (number int, taken boolean, is_mine boolean)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not public.can_manage_athlete(p_athlete_id) then
    raise exception 'not authorized for this athlete' using errcode = '42501';
  end if;

  return query
  with pools as (select public.athlete_jersey_pools(p_athlete_id) as pool),
  used as (
    select distinct a.jersey_number, (a.id = p_athlete_id) as mine
    from public.team_rosters tr
    join public.teams t on t.id = tr.team_id
    join public.athletes a on a.id = tr.athlete_id
    where tr.left_at is null
      and a.jersey_number is not null
      and t.jersey_pool in (select pool from pools)
  )
  select g.n,
         exists (select 1 from used u where u.jersey_number = g.n and not u.mine),
         exists (select 1 from used u where u.jersey_number = g.n and u.mine)
  from generate_series(0, 99) as g(n)
  order by g.n;
end $function$;

-- Atomic claim. Serialized per pool+number so two parents cannot both win.
create or replace function public.claim_jersey_number(p_athlete_id uuid, p_number int)
returns text
language plpgsql
volatile
security definer
set search_path to 'public'
as $function$
declare v_pool text; v_conflict boolean;
begin
  if not public.can_manage_athlete(p_athlete_id) then
    raise exception 'not authorized for this athlete' using errcode = '42501';
  end if;
  if p_number is null or p_number < 0 or p_number > 99 then
    return 'invalid_number';
  end if;

  for v_pool in select public.athlete_jersey_pools(p_athlete_id) loop
    perform pg_advisory_xact_lock(hashtext(v_pool || ':' || p_number::text));

    select exists (
      select 1
      from public.team_rosters tr
      join public.teams t on t.id = tr.team_id
      join public.athletes a on a.id = tr.athlete_id
      where tr.left_at is null
        and t.jersey_pool = v_pool
        and a.jersey_number = p_number
        and a.id <> p_athlete_id
    ) into v_conflict;

    if v_conflict then
      return 'taken';
    end if;
  end loop;

  update public.athletes set jersey_number = p_number where id = p_athlete_id;
  return 'claimed';
end $function$;

revoke all on function public.get_jersey_availability(uuid) from public, anon;
revoke all on function public.claim_jersey_number(uuid, int) from public, anon;
revoke all on function public.athlete_jersey_pools(uuid) from public, anon;
revoke all on function public.can_manage_athlete(uuid) from public, anon;
grant execute on function public.get_jersey_availability(uuid) to authenticated;
grant execute on function public.claim_jersey_number(uuid, int) to authenticated;

commit;
