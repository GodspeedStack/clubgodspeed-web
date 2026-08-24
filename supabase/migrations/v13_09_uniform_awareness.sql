-- v13_09_uniform_awareness.sql
-- Only NEW players buy uniforms. Flag it on athletes (new default = true; existing
-- returning players = false) and surface the cost breakdown + needs_uniform through
-- the availability RPC so the portal can make new families aware of the $102.90 cost.
begin;

alter table public.athletes add column if not exists needs_uniform boolean not null default true;

-- Returning/existing players already have uniforms.
update public.athletes set needs_uniform=false
where first_name in ('Aiden','Anton','Ashton','Aydon','Cassius','Emory','Gene','Howard','Kai','Khaliq','Khyrie','Oliver','Quest','Kingston');

-- Availability RPC now also returns the price breakdown + this player's needs_uniform.
create or replace function public.get_uniform_availability(p_athlete_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  cfg     public.uniform_config%rowtype;
  v_own   int;
  v_teams uuid[];
  v_needs boolean;
  taken   int[];
  tnames  jsonb;
begin
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
$fn$;
grant execute on function public.get_uniform_availability(uuid) to anon, authenticated;
commit;
