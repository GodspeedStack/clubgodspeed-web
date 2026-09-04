-- v17_01_roster_admin
-- Director / founder roster administration for the Coach Portal.
-- Edit an athlete (name, jersey, grade, date of birth, status), move athletes on
-- and off teams, delete a team that has no active players. Every call is
-- SECURITY DEFINER with an explicit is_program_admin() guard, executable only by
-- authenticated (PUBLIC and anon revoked), and writes one row to an append-only
-- log. Coaches keep read access; they cannot call these.

create table if not exists public.roster_admin_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid not null,
  action      text not null check (action in ('athlete.update','roster.add','roster.remove','team.delete')),
  target_id   uuid,
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
alter table public.roster_admin_log enable row level security;
drop policy if exists sec_coach_director_all on public.roster_admin_log;   -- the event trigger stamps this on new tables
create policy roster_admin_log_admin_read on public.roster_admin_log
  for select to authenticated using (public.is_program_admin());
create policy roster_admin_log_service on public.roster_admin_log
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
revoke all on public.roster_admin_log from public, anon;
grant select on public.roster_admin_log to authenticated;

-- insert-only: no update, no delete (reuse block_mutation if present)
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'block_mutation') then
    execute 'drop trigger if exists roster_admin_log_immutable on public.roster_admin_log';
    execute 'create trigger roster_admin_log_immutable before update or delete on public.roster_admin_log for each row execute function public.block_mutation()';
  end if;
end $$;

create or replace function public._roster_admin_guard()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null or not public.is_program_admin() then
    raise exception using errcode = '42501', message = 'Only a director can change rosters.';
  end if;
  return v_uid;
end $$;
revoke all on function public._roster_admin_guard() from public, anon;

-- 1. Edit an athlete. Only the listed keys are accepted.
create or replace function public.admin_update_athlete(p_athlete_id uuid, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public._roster_admin_guard();
  v_first text := nullif(btrim(p_patch->>'first_name'), '');
  v_last  text := nullif(btrim(p_patch->>'last_name'), '');
  v_jersey smallint;
  v_grade text := nullif(btrim(p_patch->>'grade'), '');
  v_dob date;
  v_status text := nullif(btrim(p_patch->>'enrollment_status'), '');
  v_row public.athletes;
begin
  if p_patch ? 'jersey_number' and nullif(p_patch->>'jersey_number','') is not null then
    v_jersey := (p_patch->>'jersey_number')::smallint;
    if v_jersey < 0 or v_jersey > 99 then raise exception 'jersey_number must be 0 to 99'; end if;
  end if;
  if p_patch ? 'date_of_birth' and nullif(p_patch->>'date_of_birth','') is not null then
    v_dob := (p_patch->>'date_of_birth')::date;
    if v_dob > current_date or v_dob < current_date - interval '25 years' then raise exception 'date_of_birth out of range'; end if;
  end if;
  if v_grade is not null and v_grade !~ '^(K|[1-9]|1[0-2])(th|st|nd|rd)?$' then raise exception 'grade must be K or 1 to 12'; end if;
  if v_status is not null and v_status not in ('active','inactive','pending') then raise exception 'enrollment_status must be active, inactive or pending'; end if;
  if v_first is not null and length(v_first) > 60 then raise exception 'first_name too long'; end if;
  if v_last is not null and length(v_last) > 60 then raise exception 'last_name too long'; end if;

  update public.athletes a set
    first_name        = coalesce(v_first, a.first_name),
    last_name         = case when p_patch ? 'last_name' then v_last else a.last_name end,
    jersey_number     = case when p_patch ? 'jersey_number' then v_jersey else a.jersey_number end,
    grade             = case when p_patch ? 'grade' then v_grade else a.grade end,
    date_of_birth     = case when p_patch ? 'date_of_birth' then v_dob else a.date_of_birth end,
    enrollment_status = coalesce(v_status, a.enrollment_status),
    updated_at        = now()
  where a.id = p_athlete_id
  returning a.* into v_row;
  if not found then raise exception 'athlete not found'; end if;

  insert into public.roster_admin_log(actor_id, action, target_id, payload)
  values (v_uid, 'athlete.update', p_athlete_id, p_patch - 'date_of_birth' || jsonb_build_object('date_of_birth_changed', p_patch ? 'date_of_birth'));

  return jsonb_build_object('id', v_row.id, 'first_name', v_row.first_name, 'last_name', v_row.last_name,
    'jersey_number', v_row.jersey_number, 'grade', v_row.grade, 'date_of_birth', v_row.date_of_birth,
    'enrollment_status', v_row.enrollment_status);
end $$;
revoke all on function public.admin_update_athlete(uuid, jsonb) from public, anon;
grant execute on function public.admin_update_athlete(uuid, jsonb) to authenticated;

-- 2. Put an athlete on a team or take them off (history kept via left_at).
create or replace function public.admin_set_roster_membership(p_team_id uuid, p_athlete_id uuid, p_active boolean, p_role text default 'rotation')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public._roster_admin_guard();
  v_id uuid;
begin
  if p_role not in ('starter','rotation','bench','development','captain') then raise exception 'bad role'; end if;
  if not exists (select 1 from public.teams where id = p_team_id) then raise exception 'team not found'; end if;
  if not exists (select 1 from public.athletes where id = p_athlete_id) then raise exception 'athlete not found'; end if;

  if p_active then
    select id into v_id from public.team_rosters where team_id = p_team_id and athlete_id = p_athlete_id and left_at is null limit 1;
    if v_id is null then
      insert into public.team_rosters(team_id, athlete_id, role, joined_at) values (p_team_id, p_athlete_id, p_role, now()) returning id into v_id;
    end if;
    insert into public.roster_admin_log(actor_id, action, target_id, payload) values (v_uid, 'roster.add', p_athlete_id, jsonb_build_object('team_id', p_team_id, 'role', p_role));
  else
    update public.team_rosters set left_at = now() where team_id = p_team_id and athlete_id = p_athlete_id and left_at is null returning id into v_id;
    insert into public.roster_admin_log(actor_id, action, target_id, payload) values (v_uid, 'roster.remove', p_athlete_id, jsonb_build_object('team_id', p_team_id));
  end if;
  return jsonb_build_object('membership_id', v_id, 'team_id', p_team_id, 'athlete_id', p_athlete_id, 'active', p_active);
end $$;
revoke all on function public.admin_set_roster_membership(uuid, uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_roster_membership(uuid, uuid, boolean, text) to authenticated;

-- 3. Delete a team. Refused while any athlete is active on it, or while
--    non-cascading records (uniform orders, uploads, broadcasts, number locks) point at it.
create or replace function public.admin_delete_team(p_team_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public._roster_admin_guard();
  v_name text;
  v_active int;
  v_blockers text[] := '{}';
begin
  select name into v_name from public.teams where id = p_team_id;
  if v_name is null then raise exception 'team not found'; end if;
  select count(*) into v_active from public.team_rosters where team_id = p_team_id and left_at is null;
  if v_active > 0 then
    raise exception 'team_has_players' using message = format('%s still has %s active player(s). Remove them first.', v_name, v_active);
  end if;
  if exists (select 1 from public.uniform_orders where team_id = p_team_id) then v_blockers := v_blockers || 'uniform orders'; end if;
  if exists (select 1 from public.uniform_number_locks where team_id = p_team_id) then v_blockers := v_blockers || 'uniform number locks'; end if;
  if exists (select 1 from public.data_uploads where target_team_id = p_team_id) then v_blockers := v_blockers || 'data uploads'; end if;
  if exists (select 1 from public.broadcast_messages where team_id = p_team_id) then v_blockers := v_blockers || 'broadcast messages'; end if;
  if array_length(v_blockers, 1) > 0 then
    raise exception 'team_referenced' using message = format('%s is still referenced by %s.', v_name, array_to_string(v_blockers, ', '));
  end if;

  update public.coach_profiles set team_ids = array_remove(team_ids, p_team_id) where p_team_id = any(team_ids);
  delete from public.teams where id = p_team_id;   -- rosters history, program_content, coach_access cascade; sessions/games/events set null

  insert into public.roster_admin_log(actor_id, action, target_id, payload) values (v_uid, 'team.delete', p_team_id, jsonb_build_object('name', v_name));
  return jsonb_build_object('deleted', true, 'team_id', p_team_id, 'name', v_name);
end $$;
revoke all on function public.admin_delete_team(uuid) from public, anon;
grant execute on function public.admin_delete_team(uuid) to authenticated;

-- Proof queries (run as any role):
--   select proname, has_function_privilege('anon', oid, 'execute') anon_can from pg_proc where proname like 'admin_%' or proname = '_roster_admin_guard';
--   -> anon_can = false on every row.
--   select relrowsecurity from pg_class where relname = 'roster_admin_log';  -> true
