-- v13_02_uniform_multiteam.sql
-- Multi-team + swing-player jersey numbering for Godspeed uniforms.
--
-- Rule (Scott, 2026-08-23): a number must be free on EVERY team a player is on;
-- first-come locks it on all of them. A swing player (rostered on 2 teams) is
-- therefore more constrained; single-team players are only limited by their own
-- team. Whoever locks a number first holds it.
--
-- Model: teams flagged `uniform_scoped` are the ones numbering cares about
-- (6th/5th/4th grade). A player's "uniform teams" = uniform_scoped teams they're
-- rostered on (team_rosters.left_at is null). Locks live in uniform_number_locks,
-- one row per (team the player is on, number); a unique partial index makes the
-- first-come guarantee atomic across every team at once.
--
-- Idempotent.

begin;

-- 1. Team scoping flag + the three grade teams
alter table public.teams add column if not exists uniform_scoped boolean not null default false;

insert into public.teams (id, name, season, uniform_scoped, is_active) values
  ('a0000000-0000-0000-0000-000000000006','Godspeed 6th Grade','2025-2026', true, true),
  ('a0000000-0000-0000-0000-000000000005','Godspeed 5th Grade','2025-2026', true, true),
  ('a0000000-0000-0000-0000-000000000004','Godspeed 4th Grade','2025-2026', true, true)
on conflict (id) do update set name = excluded.name, uniform_scoped = true, is_active = true;

update public.teams set uniform_scoped = false where id = 'a0000000-0000-0000-0000-000000000001';

-- 2. Per-team number locks (replaces the single-team unique index)
drop index if exists public.uniq_uniform_active_number_per_team;
alter table public.uniform_orders add column if not exists team_ids uuid[];

create table if not exists public.uniform_number_locks (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.uniform_orders(id) on delete cascade,
  team_id       uuid not null references public.teams(id),
  jersey_number int  not null,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);
create unique index if not exists uniq_uniform_lock_team_number
  on public.uniform_number_locks (team_id, jersey_number) where active;
create index if not exists idx_uniform_lock_order on public.uniform_number_locks(order_id);

alter table public.uniform_number_locks enable row level security;
drop policy if exists uniform_locks_admin on public.uniform_number_locks;
create policy uniform_locks_admin on public.uniform_number_locks
  for all using (public.is_gs_admin()) with check (public.is_gs_admin());

create or replace function public.sync_uniform_locks()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.uniform_number_locks
     set active = (new.status in ('pending_payment','paid'))
   where order_id = new.id;
  return new;
end;
$$;
drop trigger if exists trg_sync_uniform_locks on public.uniform_orders;
create trigger trg_sync_uniform_locks
  after update of status on public.uniform_orders
  for each row execute function public.sync_uniform_locks();

-- 3. A player's uniform teams (fallback: all scoped teams)
create or replace function public.athlete_uniform_teams(p_athlete_id uuid)
returns setof uuid language plpgsql stable security definer set search_path = public as $$
declare has_any boolean;
begin
  select exists(
    select 1 from public.team_rosters r
      join public.teams t on t.id = r.team_id
     where r.athlete_id = p_athlete_id and r.left_at is null and t.uniform_scoped
  ) into has_any;

  if has_any then
    return query
      select r.team_id from public.team_rosters r
        join public.teams t on t.id = r.team_id
       where r.athlete_id = p_athlete_id and r.left_at is null and t.uniform_scoped;
  else
    return query select id from public.teams where uniform_scoped;
  end if;
end;
$$;

-- 4. Availability — union of taken numbers across the player's teams
create or replace function public.get_uniform_availability(p_athlete_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  cfg     public.uniform_config%rowtype;
  v_own   int;
  v_teams uuid[];
  taken   int[];
  tnames  jsonb;
begin
  select * into cfg from public.uniform_config where id = 1;
  if p_athlete_id is not null then
    select jersey_number into v_own from public.athletes where id = p_athlete_id;
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
    'jersey_sizes', to_jsonb(cfg.jersey_sizes), 'shorts_sizes', to_jsonb(cfg.shorts_sizes),
    'number_min', cfg.number_min, 'number_max', cfg.number_max, 'active', cfg.active,
    'own_number', v_own, 'team_names', coalesce(tnames, '[]'::jsonb),
    'taken', coalesce(to_jsonb(taken), '[]'::jsonb));
end;
$fn$;

-- 5. Create order — lock the number on EVERY team the player is on
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

  insert into public.uniform_order_notifications (order_id) values (v_order.id);

  return jsonb_build_object('order_id', v_order.id, 'order_number', v_order.order_number,
    'player_name', v_order.player_name, 'jersey_number', v_order.jersey_number,
    'jersey_size', v_order.jersey_size, 'shorts_size', v_order.shorts_size, 'total_amount', v_order.total_amount);
end;
$fn$;

-- 6. Admin roster management (assign a player to one or more teams; swing = 2)
create or replace function public.set_athlete_teams(p_athlete_id uuid, p_team_ids uuid[])
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare tid uuid;
begin
  if not public.is_gs_admin() then raise exception 'ADMIN_ONLY' using errcode='42501'; end if;

  update public.team_rosters r set left_at = now()
    from public.teams t
   where r.team_id = t.id and t.uniform_scoped and r.athlete_id = p_athlete_id
     and r.left_at is null and not (r.team_id = any(p_team_ids));

  foreach tid in array coalesce(p_team_ids, array[]::uuid[]) loop
    if exists (select 1 from public.teams where id = tid and uniform_scoped) then
      if exists (select 1 from public.team_rosters where athlete_id = p_athlete_id and team_id = tid) then
        update public.team_rosters set left_at = null where athlete_id = p_athlete_id and team_id = tid;
      else
        insert into public.team_rosters (team_id, athlete_id) values (tid, p_athlete_id);
      end if;
    end if;
  end loop;

  return jsonb_build_object('athlete_id', p_athlete_id, 'team_ids', to_jsonb(p_team_ids));
end;
$fn$;

create or replace function public.get_uniform_roster_overview()
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare result jsonb;
begin
  if not public.is_gs_admin() then raise exception 'ADMIN_ONLY' using errcode='42501'; end if;
  select jsonb_build_object(
    'teams', (select jsonb_agg(jsonb_build_object('id',id,'name',name) order by name)
                from public.teams where uniform_scoped),
    'athletes', (select jsonb_agg(jsonb_build_object(
                    'id', a.id,
                    'name', coalesce(a.display_name, a.first_name||' '||a.last_name),
                    'number', a.jersey_number,
                    'team_ids', coalesce((select jsonb_agg(r.team_id)
                                            from public.team_rosters r
                                            join public.teams t on t.id = r.team_id
                                           where r.athlete_id = a.id and r.left_at is null and t.uniform_scoped),
                                         '[]'::jsonb)
                  ) order by a.first_name)
                  from public.athletes a where a.enrollment_status = 'active')
  ) into result;
  return result;
end;
$fn$;

grant execute on function public.get_uniform_availability(uuid) to anon, authenticated;
grant execute on function public.create_uniform_order(uuid,int,text,text,text,text,text) to authenticated;
grant execute on function public.athlete_uniform_teams(uuid) to authenticated;
grant execute on function public.set_athlete_teams(uuid, uuid[]) to authenticated;
grant execute on function public.get_uniform_roster_overview() to authenticated;

commit;
