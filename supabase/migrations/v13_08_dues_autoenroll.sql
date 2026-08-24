-- v13_08_dues_autoenroll.sql
-- New players automatically get the current season's dues; when a parent links
-- to a player, their real email backfills onto the enrollment.
begin;

-- Retire prior-season dues configs so "current dues" is unambiguous (Fall only).
update public.season_dues_config set is_active=false, updated_at=now()
where id <> 'd0000000-0000-0000-0000-00000f000424' and is_active;

-- Helper: current season dues config = the single newest active one.
create or replace function public.current_dues_config()
returns uuid language sql stable security definer set search_path=public as $$
  select id from public.season_dues_config where is_active order by created_at desc limit 1;
$$;

-- Auto-enroll an active athlete into the current dues config (idempotent).
create or replace function public.auto_enroll_athlete_dues()
returns trigger language plpgsql security definer set search_path=public as $fn$
declare v_cfg uuid; v_tpl uuid; v_amt numeric(10,2); v_email text; v_name text;
begin
  if coalesce(NEW.enrollment_status,'active') <> 'active' then return NEW; end if;

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
      (parent_email, parent_name, athlete_id, athlete_name, dues_config_id, plan_template_id, total_owed, total_paid, status)
    values (
      coalesce(v_email, 'unassigned+' || replace(NEW.id::text,'-','') || '@clubgodspeed.com'),
      v_name, NEW.id, coalesce(NEW.display_name, NEW.first_name || ' ' || NEW.last_name),
      v_cfg, v_tpl, v_amt, 0, 'active');
  exception when unique_violation then
    null;  -- a real parent with a second child already holds (email,config); skip
  end;
  return NEW;
end;
$fn$;

drop trigger if exists trg_auto_enroll_dues_ins on public.athletes;
create trigger trg_auto_enroll_dues_ins after insert on public.athletes
  for each row execute function public.auto_enroll_athlete_dues();

drop trigger if exists trg_auto_enroll_dues_upd on public.athletes;
create trigger trg_auto_enroll_dues_upd after update of enrollment_status on public.athletes
  for each row when (NEW.enrollment_status = 'active') execute function public.auto_enroll_athlete_dues();

-- When a parent links to a player, backfill their real email onto a placeholder enrollment.
create or replace function public.backfill_enrollment_parent()
returns trigger language plpgsql security definer set search_path=public as $fn$
declare v_email text; v_name text;
begin
  select email, full_name into v_email, v_name from public.profiles where id = NEW.profile_id;
  if v_email is null then return NEW; end if;
  begin
    update public.parent_dues_enrollment
      set parent_email = v_email, parent_name = coalesce(parent_name, v_name), updated_at = now()
      where athlete_id = NEW.athlete_id
        and parent_email like 'unassigned+%@clubgodspeed.com';
  exception when unique_violation then null; end;
  return NEW;
end;
$fn$;

drop trigger if exists trg_backfill_enrollment_parent on public.parent_player_links;
create trigger trg_backfill_enrollment_parent after insert on public.parent_player_links
  for each row execute function public.backfill_enrollment_parent();

commit;
