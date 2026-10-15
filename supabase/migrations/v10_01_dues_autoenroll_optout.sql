-- v10_01_dues_autoenroll_optout.sql
-- Club Godspeed | "roster him now, post dues later"
--
-- THREE things are fixed here. All three are needed for any one of them to work.
--
-- 1. NEW FLAG: athletes.dues_autoenroll (boolean, default true)
--    Background: trg_auto_enroll_dues_ins / _upd on public.athletes run
--    auto_enroll_athlete_dues(), which posts a parent_dues_enrollment row at the
--    active season_dues_config amount (today: Fall 2026, $472.90). It fires on
--    INSERT *and* UPDATE, so hand-deleting the posted row is not durable -- the
--    next save of that athlete record silently re-posts it.
--    With dues_autoenroll = false the trigger returns early: the athlete is on
--    rosters, lineups, attendance and uniform ordering, with no dues posted.
--    Flipping it to true later posts dues at that moment. That flip is the
--    "dues are coming and will be posted soon" switch.
--
-- 2. BUG FIX: admin_create_athlete / admin_update_athlete validated
--    enrollment_status against ('active','inactive','pending'). The athletes
--    CHECK constraint allows ('active','inactive','trial','graduated').
--    So the RPCs accepted 'pending' -- which the table then rejected, failing the
--    save -- and rejected 'trial' and 'graduated', which are legal. The UI's
--    "Pending" option could never save. Both lists now match the constraint.
--
-- 3. The RPCs now accept and return dues_autoenroll, so staff can set it from
--    the roster admin UI instead of needing SQL. Changes stay audited in
--    roster_admin_log, which already records the full patch.

begin;

-- 1 ------------------------------------------------------------------ the flag
alter table public.athletes
  add column if not exists dues_autoenroll boolean not null default true;

comment on column public.athletes.dues_autoenroll is
  'When false, auto_enroll_athlete_dues() skips this athlete: no season dues are '
  'posted on insert or update. Flip to true to post dues for the active season.';

create or replace function public.auto_enroll_athlete_dues()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_cfg uuid; v_tpl uuid; v_amt numeric(10,2); v_email text; v_name text;
begin
  if coalesce(NEW.enrollment_status,'active') <> 'active' then return NEW; end if;

  -- explicit opt-out: athlete is rostered but dues are not posted yet
  if coalesce(NEW.dues_autoenroll, true) = false then return NEW; end if;

  select id, total_amount into v_cfg, v_amt
    from public.season_dues_config where is_active order by created_at desc limit 1;
  if v_cfg is null then return NEW; end if;

  if exists (select 1 from public.parent_dues_enrollment e
             where e.athlete_id = NEW.id and e.dues_config_id = v_cfg) then
    return NEW;
  end if;

  select id into v_tpl from public.payment_plan_templates
    where dues_config_id = v_cfg and is_active order by sort_order limit 1;

  select p.email, p.full_name into v_email, v_name
    from public.parent_player_links l join public.profiles p on p.id = l.profile_id
    where l.athlete_id = NEW.id order by l.is_primary desc nulls last limit 1;

  begin
    insert into public.parent_dues_enrollment
      (parent_email, parent_name, athlete_id, athlete_name, dues_config_id,
       plan_template_id, total_owed, total_paid, status)
    values (
      coalesce(v_email, 'unassigned+' || replace(NEW.id::text,'-','') || '@clubgodspeed.com'),
      v_name, NEW.id, coalesce(NEW.display_name, NEW.first_name || ' ' || NEW.last_name),
      v_cfg, v_tpl, v_amt, 0, 'active');
  exception when unique_violation then
    null;  -- a real parent with a second child already holds (email,config); skip
  end;
  return NEW;
end;
$function$;

-- 2 and 3 ------------------------------------------------- roster admin RPCs
create or replace function public.admin_create_athlete(p_patch jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_uid    uuid := public._roster_admin_guard();
  v_first  text := nullif(btrim(p_patch->>'first_name'), '');
  v_last   text := coalesce(nullif(btrim(p_patch->>'last_name'), ''), '');
  v_jersey smallint;
  v_grade  text := nullif(btrim(p_patch->>'grade'), '');
  v_dob    date;
  v_status text := coalesce(nullif(btrim(p_patch->>'enrollment_status'), ''), 'active');
  v_dues   boolean := coalesce((p_patch->>'dues_autoenroll')::boolean, true);
  v_row    public.athletes;
begin
  if v_first is null then raise exception 'first_name is required'; end if;
  if length(v_first) > 60 then raise exception 'first_name too long'; end if;
  if length(v_last) > 60 then raise exception 'last_name too long'; end if;
  if p_patch ? 'jersey_number' and nullif(p_patch->>'jersey_number','') is not null then
    v_jersey := (p_patch->>'jersey_number')::smallint;
    if v_jersey < 0 or v_jersey > 99 then raise exception 'jersey_number must be 0 to 99'; end if;
  end if;
  if p_patch ? 'date_of_birth' and nullif(p_patch->>'date_of_birth','') is not null then
    v_dob := (p_patch->>'date_of_birth')::date;
    if v_dob > current_date or v_dob < current_date - interval '25 years' then raise exception 'date_of_birth out of range'; end if;
  end if;
  if v_grade is not null and v_grade !~ '^(K|[1-9]|1[0-2])(th|st|nd|rd)?$' then raise exception 'grade must be K or 1 to 12'; end if;
  -- matches the athletes_enrollment_status_check constraint
  if v_status not in ('active','inactive','trial','graduated') then
    raise exception 'enrollment_status must be active, inactive, trial or graduated';
  end if;

  insert into public.athletes(first_name, last_name, jersey_number, grade, date_of_birth,
                              enrollment_status, dues_autoenroll, created_by)
  values (v_first, v_last, v_jersey, v_grade, v_dob, v_status, v_dues, v_uid)
  returning * into v_row;

  insert into public.roster_admin_log(actor_id, action, target_id, payload)
  values (v_uid, 'athlete.create', v_row.id,
          (p_patch - 'date_of_birth') || jsonb_build_object('date_of_birth_set', p_patch ? 'date_of_birth'));

  return jsonb_build_object('id', v_row.id, 'first_name', v_row.first_name, 'last_name', v_row.last_name,
    'jersey_number', v_row.jersey_number, 'grade', v_row.grade, 'date_of_birth', v_row.date_of_birth,
    'enrollment_status', v_row.enrollment_status, 'dues_autoenroll', v_row.dues_autoenroll);
end $function$;

create or replace function public.admin_update_athlete(p_athlete_id uuid, p_patch jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_uid uuid := public._roster_admin_guard();
  v_first text := nullif(btrim(p_patch->>'first_name'), '');
  v_last  text := nullif(btrim(p_patch->>'last_name'), '');
  v_jersey smallint;
  v_grade text := nullif(btrim(p_patch->>'grade'), '');
  v_dob date;
  v_status text := nullif(btrim(p_patch->>'enrollment_status'), '');
  v_dues boolean;
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
  if p_patch ? 'dues_autoenroll' then
    v_dues := (p_patch->>'dues_autoenroll')::boolean;
  end if;
  if v_grade is not null and v_grade !~ '^(K|[1-9]|1[0-2])(th|st|nd|rd)?$' then raise exception 'grade must be K or 1 to 12'; end if;
  -- matches the athletes_enrollment_status_check constraint
  if v_status is not null and v_status not in ('active','inactive','trial','graduated') then
    raise exception 'enrollment_status must be active, inactive, trial or graduated';
  end if;
  if v_first is not null and length(v_first) > 60 then raise exception 'first_name too long'; end if;
  if v_last is not null and length(v_last) > 60 then raise exception 'last_name too long'; end if;

  update public.athletes a set
    first_name        = coalesce(v_first, a.first_name),
    last_name         = case when p_patch ? 'last_name' then v_last else a.last_name end,
    jersey_number     = case when p_patch ? 'jersey_number' then v_jersey else a.jersey_number end,
    grade             = case when p_patch ? 'grade' then v_grade else a.grade end,
    date_of_birth     = case when p_patch ? 'date_of_birth' then v_dob else a.date_of_birth end,
    enrollment_status = coalesce(v_status, a.enrollment_status),
    dues_autoenroll   = case when p_patch ? 'dues_autoenroll' then coalesce(v_dues, a.dues_autoenroll) else a.dues_autoenroll end,
    updated_at        = now()
  where a.id = p_athlete_id
  returning a.* into v_row;
  if not found then raise exception 'athlete not found'; end if;

  insert into public.roster_admin_log(actor_id, action, target_id, payload)
  values (v_uid, 'athlete.update', p_athlete_id, (p_patch - 'date_of_birth') || jsonb_build_object('date_of_birth_changed', p_patch ? 'date_of_birth'));

  return jsonb_build_object('id', v_row.id, 'first_name', v_row.first_name, 'last_name', v_row.last_name,
    'jersey_number', v_row.jersey_number, 'grade', v_row.grade, 'date_of_birth', v_row.date_of_birth,
    'enrollment_status', v_row.enrollment_status, 'dues_autoenroll', v_row.dues_autoenroll);
end $function$;

commit;
