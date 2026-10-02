-- v28_01_jersey_grade_band.sql
--
-- WHY
-- parent-portal.html mounts jersey-picker.js, which calls
-- get_jersey_availability() and claim_jersey_number(). Neither function was
-- ever created, so the picker has been answering PGRST202 / HTTP 404 to every
-- parent who opened it. That is why 5 of the 9 players on 5th White have no
-- jersey number.
--
-- SCOPE: GRADE BAND, not team
-- Players move between the two 5th grade teams and get called up, so a number
-- that is free on White but worn on Black is not really free. Both 5th teams
-- therefore share one pool of 0-99. A band is the grade number in the team
-- name, so "Godspeed 5th Grade Black" and "Godspeed 5th Grade White" are both
-- band 5, and "Godspeed 6th Grade" is band 6. A player rostered across two
-- bands (Emory and Anton are on 5th Black and 6th) must have a number that is
-- free in both.
--
-- This deliberately matches jersey-picker.js's existing contract rather than
-- changing the client:
--   get_jersey_availability(uuid) -> rows of (number, taken, is_mine)
--   claim_jersey_number(uuid, int) -> 'taken' | 'invalid_number' | 'ok'
-- The picker treats any other string as success, so the vocabulary is closed.
--
-- uniform_number_locks is honoured as well, so a number held by an in-flight
-- order on order-uniform.html cannot be claimed here. The two surfaces agree.

-- ---------------------------------------------------------------------------
-- Which grade bands does this athlete compete in?
-- ---------------------------------------------------------------------------
create or replace function public.athlete_grade_bands(p_athlete_id uuid)
returns int[]
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_bands int[];
  v_grade int;
begin
  select array_agg(distinct b) into v_bands
  from (
    select nullif(regexp_replace(t.name, '\D', '', 'g'), '')::int as b
      from public.team_rosters r
      join public.teams t on t.id = r.team_id
     where r.athlete_id = p_athlete_id
       and r.left_at is null
       and t.uniform_scoped
  ) s
  where b is not null;

  -- Not rostered yet: fall back to the grade on the athlete record so a brand
  -- new player still sees a correct grid instead of an empty one.
  if v_bands is null or array_length(v_bands, 1) is null then
    select nullif(regexp_replace(coalesce(grade, ''), '\D', '', 'g'), '')::int
      into v_grade
      from public.athletes where id = p_athlete_id;
    if v_grade is not null then
      v_bands := array[v_grade];
    end if;
  end if;

  return coalesce(v_bands, '{}'::int[]);
end $$;

-- ---------------------------------------------------------------------------
-- Every number in range, with who holds it
-- ---------------------------------------------------------------------------
create or replace function public.get_jersey_availability(p_athlete_id uuid)
returns table (number int, taken boolean, is_mine boolean)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_bands  int[];
  v_min    int;
  v_max    int;
  v_own    int;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  -- A parent may only see their own athlete's grid; staff may see any.
  if not (public.parent_can_access_athlete(p_athlete_id)
          or public.can_access_athlete(p_athlete_id)) then
    raise exception 'NOT_YOUR_ATHLETE' using errcode = '42501';
  end if;

  select coalesce(cfg.number_min, 0), coalesce(cfg.number_max, 99)
    into v_min, v_max
    from public.uniform_config cfg where cfg.id = 1;
  v_min := coalesce(v_min, 0);
  v_max := coalesce(v_max, 99);

  v_bands := public.athlete_grade_bands(p_athlete_id);
  select a.jersey_number into v_own from public.athletes a where a.id = p_athlete_id;

  return query
  with band_teams as (
    select t.id
      from public.teams t
     where t.uniform_scoped
       and nullif(regexp_replace(t.name, '\D', '', 'g'), '')::int = any(v_bands)
  ),
  spoken_for as (
    -- numbers worn by other active players in the same band
    select distinct a.jersey_number as n
      from public.athletes a
      join public.team_rosters r on r.athlete_id = a.id and r.left_at is null
     where a.jersey_number is not null
       and a.enrollment_status = 'active'
       and a.id <> p_athlete_id
       and r.team_id in (select id from band_teams)
    union
    -- numbers held by an in-flight uniform order
    select distinct l.jersey_number as n
      from public.uniform_number_locks l
     where l.active
       and l.team_id in (select id from band_teams)
  )
  select g.n::int,
         exists (select 1 from spoken_for s where s.n = g.n),
         (v_own is not null and v_own = g.n)
    from generate_series(v_min, v_max) as g(n)
   order by g.n;
end $$;

-- ---------------------------------------------------------------------------
-- Claim one. The server decides, so two parents cannot both win.
-- ---------------------------------------------------------------------------
create or replace function public.claim_jersey_number(p_athlete_id uuid, p_number int)
returns text
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_bands int[];
  v_min   int;
  v_max   int;
  v_held  boolean;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if not (public.parent_can_access_athlete(p_athlete_id)
          or public.can_access_athlete(p_athlete_id)) then
    raise exception 'NOT_YOUR_ATHLETE' using errcode = '42501';
  end if;

  select coalesce(cfg.number_min, 0), coalesce(cfg.number_max, 99)
    into v_min, v_max
    from public.uniform_config cfg where cfg.id = 1;
  v_min := coalesce(v_min, 0);
  v_max := coalesce(v_max, 99);

  if p_number is null or p_number < v_min or p_number > v_max then
    return 'invalid_number';
  end if;

  v_bands := public.athlete_grade_bands(p_athlete_id);
  if array_length(v_bands, 1) is null then
    return 'invalid_number';
  end if;

  -- Serialise claims within a band. Without this, two parents reading the grid
  -- at the same moment could both pass the check below and both write.
  perform pg_advisory_xact_lock(hashtext('jersey_band:' || v_bands[1]::text));

  select exists (
    select 1
      from public.athletes a
      join public.team_rosters r on r.athlete_id = a.id and r.left_at is null
      join public.teams t on t.id = r.team_id
     where a.jersey_number = p_number
       and a.enrollment_status = 'active'
       and a.id <> p_athlete_id
       and t.uniform_scoped
       and nullif(regexp_replace(t.name, '\D', '', 'g'), '')::int = any(v_bands)
    union all
    select 1
      from public.uniform_number_locks l
      join public.teams t on t.id = l.team_id
     where l.active
       and l.jersey_number = p_number
       and t.uniform_scoped
       and nullif(regexp_replace(t.name, '\D', '', 'g'), '')::int = any(v_bands)
  ) into v_held;

  if v_held then
    return 'taken';
  end if;

  update public.athletes
     set jersey_number = p_number,
         updated_at    = now()
   where id = p_athlete_id;

  return 'ok';
end $$;

-- ---------------------------------------------------------------------------
-- Grants. Signed-in only: these read other families' player numbers, and in
-- Sept 2026 nine SECURITY DEFINER functions turned out to be callable by anon.
-- ---------------------------------------------------------------------------
revoke all on function public.athlete_grade_bands(uuid)           from public, anon;
revoke all on function public.get_jersey_availability(uuid)       from public, anon;
revoke all on function public.claim_jersey_number(uuid, int)      from public, anon;

grant execute on function public.athlete_grade_bands(uuid)        to authenticated;
grant execute on function public.get_jersey_availability(uuid)    to authenticated;
grant execute on function public.claim_jersey_number(uuid, int)   to authenticated;
