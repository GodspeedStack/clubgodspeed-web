-- v13_01_uniform_orders.sql
-- Parent-facing uniform (jersey + shorts) ordering for Godspeed Basketball.
-- Features: first-come jersey-number locking, server-side pricing, Stripe
-- checkout, and a durable admin-email notification queue ("without fail").
--
-- Security model (mirrors create-checkout):
--   * Ownership is verified against parent_player_links (profile_id -> athlete_id).
--   * Price is NEVER trusted from the browser; it comes from uniform_config.
--   * Order insert happens only inside create_uniform_order() (SECURITY DEFINER),
--     so the client cannot forge price, status, or someone else's athlete.
--   * RLS lets a parent read only their own orders; coach/director read all.
--
-- Idempotent: safe to re-run.

begin;

-- Single team today; used as the default scope so the unique number-lock index
-- never sees a NULL team_id (Postgres treats NULLs as distinct, which would
-- silently defeat the lock).
-- 10U Development Black = a0000000-0000-0000-0000-000000000001

-- ---------------------------------------------------------------------------
-- 1. Config — single row, admin-editable. Server-side source of truth.
-- ---------------------------------------------------------------------------
create table if not exists public.uniform_config (
  id            int primary key default 1,
  set_price     numeric(10,2) not null default 155.83,  -- required kit: 2 jerseys + blue shorts
  jersey_price  numeric(10,2) not null default 52.93,   -- per jersey (Black/White)
  shorts_price  numeric(10,2) not null default 49.97,   -- per shorts (Orange/Blue)
  product_name  text not null default 'Godspeed Uniform Set (Jersey + Shorts)',
  jersey_sizes  text[] not null default array['YS','YM','YL','AS','AM','AL','AXL'],
  shorts_sizes  text[] not null default array['YS','YM','YL','AS','AM','AL','AXL'],
  number_min    int  not null default 0,
  number_max    int  not null default 99,
  active        boolean not null default true,
  updated_at    timestamptz not null default now(),
  constraint uniform_config_singleton check (id = 1)
);
insert into public.uniform_config (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Orders
-- ---------------------------------------------------------------------------
create table if not exists public.uniform_orders (
  id                         uuid primary key default gen_random_uuid(),
  order_number               text unique not null
                               default ('UNI-' || to_char(now(),'YYMMDD') || '-' || upper(substr(md5(random()::text),1,5))),
  athlete_id                 uuid not null references public.athletes(id) on delete restrict,
  team_id                    uuid not null default 'a0000000-0000-0000-0000-000000000001' references public.teams(id),
  parent_profile_id          uuid,                       -- auth.users id of the ordering parent
  player_name                text not null,
  jersey_number              int  not null,
  jersey_size                text not null,
  shorts_size                text not null,
  quantity                   int  not null default 1 check (quantity between 1 and 10),
  unit_price                 numeric(10,2) not null,
  total_amount               numeric(10,2) not null,
  status                     text not null default 'pending_payment'
                               check (status in ('pending_payment','paid','cancelled','refunded')),
  customer_name              text,
  customer_email             text,
  customer_phone             text,
  stripe_checkout_session_id text,
  stripe_payment_intent_id   text,
  notes                      text,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  paid_at                    timestamptz,
  cancelled_at               timestamptz
);

-- First-come number lock: at most ONE active (pending_payment | paid) order may
-- hold a given number on a team. Concurrent duplicate submits: the DB rejects
-- the second with a unique violation, which create_uniform_order() converts into
-- a clean NUMBER_TAKEN error.
create unique index if not exists uniq_uniform_active_number_per_team
  on public.uniform_orders (team_id, jersey_number)
  where status in ('pending_payment','paid');

create index if not exists idx_uniform_orders_athlete on public.uniform_orders(athlete_id);
create index if not exists idx_uniform_orders_status  on public.uniform_orders(status);
create index if not exists idx_uniform_orders_created on public.uniform_orders(created_at desc);

-- ---------------------------------------------------------------------------
-- 3. Admin notification queue — durable + retried (the "email without fail" core)
-- ---------------------------------------------------------------------------
create table if not exists public.uniform_order_notifications (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.uniform_orders(id) on delete cascade,
  channel     text not null default 'admin_email',
  status      text not null default 'pending' check (status in ('pending','sent','failed')),
  attempts    int  not null default 0,
  last_error  text,
  sent_at     timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_uniform_notif_status on public.uniform_order_notifications(status);

-- ---------------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------------
alter table public.uniform_orders              enable row level security;
alter table public.uniform_order_notifications enable row level security;
alter table public.uniform_config              enable row level security;

-- helper: is the current user a coach/director/admin?
create or replace function public.is_gs_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('director','coach','founder')
  );
$$;

drop policy if exists uniform_orders_parent_select on public.uniform_orders;
create policy uniform_orders_parent_select on public.uniform_orders
  for select using (parent_profile_id = auth.uid() or public.is_gs_admin());

drop policy if exists uniform_orders_admin_all on public.uniform_orders;
create policy uniform_orders_admin_all on public.uniform_orders
  for all using (public.is_gs_admin()) with check (public.is_gs_admin());

-- config: anyone signed in may read price/sizes; only admin edits
drop policy if exists uniform_config_read on public.uniform_config;
create policy uniform_config_read on public.uniform_config for select using (true);
drop policy if exists uniform_config_admin_write on public.uniform_config;
create policy uniform_config_admin_write on public.uniform_config
  for update using (public.is_gs_admin()) with check (public.is_gs_admin());

drop policy if exists uniform_notif_admin on public.uniform_order_notifications;
create policy uniform_notif_admin on public.uniform_order_notifications
  for all using (public.is_gs_admin()) with check (public.is_gs_admin());

-- ---------------------------------------------------------------------------
-- 5. Availability RPC — returns config + taken numbers (no PII).
--    Taken = numbers held by another active athlete on the team OR by an active
--    order. Excludes THIS athlete's own currently-assigned number so a returning
--    player can keep it.
-- ---------------------------------------------------------------------------
create or replace function public.get_uniform_availability(p_athlete_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  cfg   public.uniform_config%rowtype;
  v_team uuid := 'a0000000-0000-0000-0000-000000000001';
  v_own  int;
  taken  int[];
begin
  select * into cfg from public.uniform_config where id = 1;

  if p_athlete_id is not null then
    select jersey_number into v_own from public.athletes where id = p_athlete_id;
  end if;

  select array_agg(distinct n) into taken from (
    -- numbers assigned to other active athletes
    select a.jersey_number as n
      from public.athletes a
     where a.jersey_number is not null
       and a.enrollment_status = 'active'
       and (p_athlete_id is null or a.id <> p_athlete_id)
    union
    -- numbers held by active orders
    select o.jersey_number as n
      from public.uniform_orders o
     where o.status in ('pending_payment','paid')
       and o.team_id = v_team
  ) t;

  return jsonb_build_object(
    'product_name', cfg.product_name,
    'set_price',    cfg.set_price,
    'jersey_sizes', to_jsonb(cfg.jersey_sizes),
    'shorts_sizes', to_jsonb(cfg.shorts_sizes),
    'number_min',   cfg.number_min,
    'number_max',   cfg.number_max,
    'active',       cfg.active,
    'own_number',   v_own,
    'taken',        coalesce(to_jsonb(taken), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Create-order RPC — atomic ownership + availability + insert.
--    Returns the order so the client can open Stripe checkout.
-- ---------------------------------------------------------------------------
create or replace function public.create_uniform_order(
  p_athlete_id     uuid,
  p_jersey_number  int,
  p_jersey_size    text,
  p_shorts_size    text,
  p_customer_name  text default null,
  p_customer_email text default null,
  p_customer_phone text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  cfg      public.uniform_config%rowtype;
  v_uid    uuid := auth.uid();
  v_team   uuid := 'a0000000-0000-0000-0000-000000000001';
  v_owns   boolean;
  v_name   text;
  v_price  numeric(10,2);
  v_order  public.uniform_orders%rowtype;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  select * into cfg from public.uniform_config where id = 1;
  if not cfg.active then
    raise exception 'ORDERING_CLOSED' using errcode = 'P0001';
  end if;

  -- Ownership: parent must be linked to this athlete (same basis as dues checkout),
  -- unless the caller is an admin placing an order on a family's behalf.
  select exists (
    select 1 from public.parent_player_links l
     where l.profile_id = v_uid and l.athlete_id = p_athlete_id
  ) into v_owns;
  if not v_owns and not public.is_gs_admin() then
    raise exception 'NOT_YOUR_ATHLETE' using errcode = '42501';
  end if;

  -- Validate inputs against server-side config.
  if p_jersey_number < cfg.number_min or p_jersey_number > cfg.number_max then
    raise exception 'NUMBER_OUT_OF_RANGE' using errcode = 'P0001';
  end if;
  if not (p_jersey_size = any(cfg.jersey_sizes)) then
    raise exception 'BAD_JERSEY_SIZE' using errcode = 'P0001';
  end if;
  if not (p_shorts_size = any(cfg.shorts_sizes)) then
    raise exception 'BAD_SHORTS_SIZE' using errcode = 'P0001';
  end if;

  -- Number taken by another active athlete's assignment?
  if exists (
    select 1 from public.athletes a
     where a.jersey_number = p_jersey_number
       and a.enrollment_status = 'active'
       and a.id <> p_athlete_id
  ) then
    raise exception 'NUMBER_TAKEN' using errcode = 'P0001';
  end if;

  select coalesce(display_name, first_name || ' ' || left(last_name,1))
    into v_name from public.athletes where id = p_athlete_id;
  v_price := cfg.set_price;

  begin
    insert into public.uniform_orders (
      athlete_id, team_id, parent_profile_id, player_name,
      jersey_number, jersey_size, shorts_size, quantity,
      unit_price, total_amount, status,
      customer_name, customer_email, customer_phone
    ) values (
      p_athlete_id, v_team, v_uid, v_name,
      p_jersey_number, p_jersey_size, p_shorts_size, 1,
      v_price, v_price, 'pending_payment',
      p_customer_name, p_customer_email, p_customer_phone
    ) returning * into v_order;
  exception when unique_violation then
    -- Lost the first-come race on this number.
    raise exception 'NUMBER_TAKEN' using errcode = 'P0001';
  end;

  -- Durable notification record — drained + retried by the edge function.
  insert into public.uniform_order_notifications (order_id) values (v_order.id);

  return jsonb_build_object(
    'order_id',     v_order.id,
    'order_number', v_order.order_number,
    'player_name',  v_order.player_name,
    'jersey_number',v_order.jersey_number,
    'jersey_size',  v_order.jersey_size,
    'shorts_size',  v_order.shorts_size,
    'total_amount', v_order.total_amount
  );
end;
$$;

grant execute on function public.get_uniform_availability(uuid) to anon, authenticated;
grant execute on function public.create_uniform_order(uuid,int,text,text,text,text,text) to authenticated;

commit;
