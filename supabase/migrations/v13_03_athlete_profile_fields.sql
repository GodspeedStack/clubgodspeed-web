-- v13_03_athlete_profile_fields.sql
-- Master-roster data lives in the DB so the roster sheet self-populates.
-- Adds player profile fields; uniform orders write jersey/shorts sizes back to
-- the athlete automatically so sizes fill in as parents order.
begin;

alter table public.athletes add column if not exists jersey_size text;
alter table public.athletes add column if not exists shorts_size text;
alter table public.athletes add column if not exists allergies text;
alter table public.athletes add column if not exists medical_notes text;
alter table public.athletes add column if not exists emergency_contact text;
alter table public.athletes add column if not exists emergency_phone text;
-- date_of_birth already exists on athletes.

-- create_uniform_order: same as v13_02 (corrected) plus it writes the chosen
-- sizes onto the athlete record so the roster reflects them.
create or replace function public.create_uniform_order(
  p_athlete_id uuid, p_jersey_number int, p_jersey_size text, p_shorts_size text,
  p_customer_name text default null, p_customer_email text default null, p_customer_phone text default null
) returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  cfg public.uniform_config%rowtype; v_uid uuid := auth.uid(); v_owns boolean;
  v_name text; v_price numeric(10,2); v_order public.uniform_orders%rowtype; v_teams uuid[]; tid uuid;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED' using errcode='28000'; end if;
  select * into cfg from public.uniform_config where id = 1;
  if not cfg.active then raise exception 'ORDERING_CLOSED' using errcode='P0001'; end if;

  select exists (select 1 from public.parent_player_links l where l.profile_id=v_uid and l.athlete_id=p_athlete_id) into v_owns;
  if not v_owns and not public.is_gs_admin() then raise exception 'NOT_YOUR_ATHLETE' using errcode='42501'; end if;

  if p_jersey_number < cfg.number_min or p_jersey_number > cfg.number_max then raise exception 'NUMBER_OUT_OF_RANGE' using errcode='P0001'; end if;
  if not (p_jersey_size = any(cfg.jersey_sizes)) then raise exception 'BAD_JERSEY_SIZE' using errcode='P0001'; end if;
  if not (p_shorts_size = any(cfg.shorts_sizes)) then raise exception 'BAD_SHORTS_SIZE' using errcode='P0001'; end if;

  v_teams := array(select public.athlete_uniform_teams(p_athlete_id));

  if exists (
    select 1 from public.athletes a
      join public.team_rosters r on r.athlete_id=a.id and r.left_at is null
     where a.jersey_number=p_jersey_number and a.enrollment_status='active'
       and a.id<>p_athlete_id and r.team_id = any(v_teams)
  ) then raise exception 'NUMBER_TAKEN' using errcode='P0001'; end if;

  select coalesce(display_name, first_name||' '||left(last_name,1)) into v_name from public.athletes where id=p_athlete_id;
  v_price := cfg.set_price;

  insert into public.uniform_orders (
    athlete_id, team_id, team_ids, parent_profile_id, player_name,
    jersey_number, jersey_size, shorts_size, quantity, unit_price, total_amount, status,
    customer_name, customer_email, customer_phone
  ) values (
    p_athlete_id, coalesce(v_teams[1],'a0000000-0000-0000-0000-000000000006'), v_teams, v_uid, v_name,
    p_jersey_number, p_jersey_size, p_shorts_size, 1, v_price, v_price, 'pending_payment',
    p_customer_name, p_customer_email, p_customer_phone
  ) returning * into v_order;

  begin
    foreach tid in array v_teams loop
      insert into public.uniform_number_locks (order_id, team_id, jersey_number) values (v_order.id, tid, p_jersey_number);
    end loop;
  exception when unique_violation then raise exception 'NUMBER_TAKEN' using errcode='P0001'; end;

  -- Self-populate the roster: record this player's sizes (and confirmed number).
  update public.athletes
     set jersey_size = p_jersey_size, shorts_size = p_shorts_size, updated_at = now()
   where id = p_athlete_id;

  insert into public.uniform_order_notifications (order_id) values (v_order.id);

  return jsonb_build_object('order_id', v_order.id, 'order_number', v_order.order_number,
    'player_name', v_order.player_name, 'jersey_number', v_order.jersey_number,
    'jersey_size', v_order.jersey_size, 'shorts_size', v_order.shorts_size, 'total_amount', v_order.total_amount);
end;
$fn$;

grant execute on function public.create_uniform_order(uuid,int,text,text,text,text,text) to authenticated;
commit;
