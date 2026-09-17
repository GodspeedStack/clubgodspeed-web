-- v20_04: eliminate the "approved parent sees zero documents" class of bug.
--
-- Root cause: approving a parent (approve_login_request RPC, or the Players
-- tab flipping profiles.approved directly) never created a
-- parent_player_links row. get_my_documents() builds from links, so an
-- unlinked parent had nothing to sign. Every case this week (Sly, Elizabeth,
-- Markus, Megan, Sheila) was this.
--
-- Contract
--   auto_link_parent_athlete(profile_id) -> text outcome
--     'already_linked' | 'no_player_name' | 'linked:<athlete>' | 'created:<athlete>'
--     Finds the athlete named on the signup (profiles.player_name, falling
--     back to the latest login_requests row). Match rule, in order:
--       first name equal (case-insensitive), then last name compatible
--       (roster last name empty, equal, or an initial of the requested one),
--       or display_name equal to the whole requested name.
--     Ties: grade match first, then athletes with no linked parent, then oldest.
--     No match: creates the athlete (active, current season, flagged in notes)
--     so the parent can sign today and the roster can be tidied later.
--     is_primary = true only when the athlete has no other linked parent.
--   trigger trg_auto_link_on_approval on profiles (insert, or update of
--     approved/player_name) fires it for approved parents with no link.
--     Failures are logged as warnings and never block approval.
--   parents_without_athlete() -> setof (email, full_name, requested_player)
--     Director health check. Should always be empty.
--   Backfill at the end links every real approved parent that names a player.

create or replace function public.auto_link_parent_athlete(p_profile_id uuid)
returns text
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_prof     public.profiles%rowtype;
  v_name     text;
  v_grade    text;
  v_first    text;
  v_last     text;
  v_aid      uuid;
  v_display  text;
  v_primary  boolean;
  v_season   text;
  v_created  boolean := false;
begin
  select * into v_prof from public.profiles where id = p_profile_id;
  if not found or v_prof.role <> 'parent' then return 'not_parent'; end if;
  if exists (select 1 from public.parent_player_links where profile_id = p_profile_id) then
    return 'already_linked';
  end if;

  -- Requested player and grade: profile first, then the signup request.
  v_name  := nullif(btrim(v_prof.player_name), '');
  v_grade := v_prof.grade;
  if v_name is null then
    select nullif(btrim(r.player_name), ''), coalesce(v_grade, r.grade) into v_name, v_grade
    from public.login_requests r
    where r.user_id = p_profile_id or lower(r.email) = lower(v_prof.email)
    order by r.created_at desc limit 1;
  end if;
  if v_name is null then return 'no_player_name'; end if;

  v_first := lower(split_part(v_name, ' ', 1));
  v_last  := lower(nullif(regexp_replace(v_name, '^\S+\s*', ''), ''));
  v_grade := nullif(regexp_replace(coalesce(v_grade, ''), '\D', '', 'g'), '');

  select a.id, coalesce(nullif(a.display_name, ''), a.first_name || ' ' || coalesce(a.last_name, ''))
    into v_aid, v_display
  from public.athletes a
  where a.enrollment_status = 'active'
    and (
      lower(btrim(coalesce(a.display_name, ''))) = lower(v_name)
      or (
        lower(btrim(a.first_name)) = v_first
        and (
          v_last is null
          or coalesce(btrim(a.last_name), '') = ''
          or lower(btrim(a.last_name)) = v_last
          or lower(btrim(a.last_name)) = left(v_last, 1)
          or v_last like lower(btrim(a.last_name)) || '%'
        )
      )
    )
  order by
    (regexp_replace(coalesce(a.grade, ''), '\D', '', 'g') = v_grade) desc,
    (not exists (select 1 from public.parent_player_links l where l.athlete_id = a.id)) desc,
    a.created_at asc
  limit 1;

  if v_aid is null then
    select max(season) into v_season from public.athletes;
    insert into public.athletes (first_name, last_name, grade, season, enrollment_status, notes)
    values (
      initcap(v_first),
      coalesce(initcap(v_last), ''),
      v_grade,
      coalesce(v_season, to_char(now(), 'YYYY') || '-' || to_char(now() + interval '1 year', 'YYYY')),
      'active',
      'Created automatically when the parent signup was approved. Confirm this player on the roster.'
    )
    returning id, display_name into v_aid, v_display;
    v_created := true;
  end if;

  v_primary := not exists (select 1 from public.parent_player_links where athlete_id = v_aid);
  insert into public.parent_player_links (profile_id, athlete_id, relationship, is_primary)
  values (p_profile_id, v_aid, 'guardian', v_primary)
  on conflict (profile_id, athlete_id) do nothing;

  update public.profiles set player_name = coalesce(player_name, v_display) where id = p_profile_id;

  return case when v_created then 'created:' else 'linked:' end || v_display;
end $$;

revoke all on function public.auto_link_parent_athlete(uuid) from public, anon, authenticated;

create or replace function public.trg_auto_link_parent_athlete()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare v_out text;
begin
  if new.role = 'parent' and coalesce(new.approved, false)
     and (tg_op = 'INSERT' or not coalesce(old.approved, false) or old.player_name is distinct from new.player_name) then
    begin
      v_out := public.auto_link_parent_athlete(new.id);
      if v_out in ('already_linked', 'not_parent') then return new; end if;
      update public.login_requests
        set notes = concat_ws(' | ', nullif(notes, ''), 'auto-link ' || v_out || ' at ' || to_char(now(), 'YYYY-MM-DD HH24:MI'))
        where user_id = new.id and status = 'approved';
    exception when others then
      raise warning 'auto_link_parent_athlete failed for %: % -- approval proceeds', new.email, sqlerrm;
    end;
  end if;
  return new;
end $$;

drop trigger if exists trg_auto_link_on_approval on public.profiles;
create trigger trg_auto_link_on_approval
  after insert or update of approved, player_name on public.profiles
  for each row execute function public.trg_auto_link_parent_athlete();

-- Director health check. Expected result: no rows.
create or replace function public.parents_without_athlete()
returns table (email text, full_name text, requested_player text, approved_at timestamptz)
language sql
security definer
set search_path to ''
as $$
  select p.email, p.full_name,
         coalesce(p.player_name, (select r.player_name from public.login_requests r
                                   where r.user_id = p.id order by r.created_at desc limit 1)),
         p.updated_at
  from public.profiles p
  where public.is_program_admin()
    and p.role = 'parent' and p.approved
    and p.email not like '%.invalid' and p.email not like 'smoketest%'
    and not exists (select 1 from public.parent_player_links l where l.profile_id = p.id)
  order by p.updated_at desc;
$$;
grant execute on function public.parents_without_athlete() to authenticated;

-- Backfill: every real approved parent who named a player but has no link.
do $$
declare r record; v_out text;
begin
  for r in
    select p.id, p.email from public.profiles p
    where p.role = 'parent' and p.approved
      and p.email not like '%.invalid' and p.email not like 'smoketest%'
      and p.email not like 'test%' and p.email not like '%@example.com'
      and p.email not like '%godspeedtest.dev' and p.email not like 'jewells%'
      and not exists (select 1 from public.parent_player_links l where l.profile_id = p.id)
  loop
    v_out := public.auto_link_parent_athlete(r.id);
    raise notice 'v20_04 backfill %: %', r.email, v_out;
  end loop;
end $$;
