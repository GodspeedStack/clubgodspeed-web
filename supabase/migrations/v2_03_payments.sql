-- ============================================================
-- 03_payments.sql
-- Season fee tracking per player per season.
-- Supports partial payments (multiple rows per player/season).
-- ============================================================

create type public.payment_method as enum (
  'cash', 'check', 'venmo', 'zelle', 'cashapp', 'card', 'other'
);

create type public.payment_status as enum (
  'pending', 'confirmed', 'refunded', 'waived'
);

-- -----------------------------------------------------------
-- TABLE: season_fees
-- One row per player per season defining what they owe.
-- Set by director; not editable by parents.
-- -----------------------------------------------------------
create table public.season_fees (
  id           uuid         primary key default uuid_generate_v4(),
  profile_id   uuid         not null references public.profiles (id) on delete cascade,
  season       text         not null,  -- e.g. 'spring_2026', 'summer_2026'
  grade        text         not null,
  amount_due   numeric(8,2) not null check (amount_due >= 0),
  due_date     date,
  notes        text,
  created_by   uuid         references auth.users (id) on delete set null,
  created_at   timestamptz  not null default now(),
  updated_at   timestamptz  not null default now(),
  unique (profile_id, season)
);

create trigger season_fees_updated_at
  before update on public.season_fees
  for each row execute procedure public.handle_updated_at();

-- -----------------------------------------------------------
-- TABLE: payments
-- One row per payment event (supports partial payments).
-- -----------------------------------------------------------
create table public.payments (
  id             uuid             primary key default uuid_generate_v4(),
  season_fee_id  uuid             not null references public.season_fees (id) on delete restrict,
  profile_id     uuid             not null references public.profiles (id) on delete restrict,
  amount         numeric(8,2)     not null check (amount > 0),
  method         payment_method   not null default 'other',
  status         payment_status   not null default 'confirmed',
  reference_note text,           -- Venmo txn ID, check number, etc.
  recorded_by    uuid             references auth.users (id) on delete set null,
  payment_date   date             not null default current_date,
  created_at     timestamptz      not null default now(),
  updated_at     timestamptz      not null default now()
);

create index payments_profile_idx    on public.payments (profile_id);
create index payments_season_fee_idx on public.payments (season_fee_id);
create index payments_date_idx       on public.payments (payment_date);

create trigger payments_updated_at
  before update on public.payments
  for each row execute procedure public.handle_updated_at();

-- -----------------------------------------------------------
-- VIEW: payment_summary
-- Aggregates paid/balance per player per season.
-- Used by admin dashboard and export.
-- -----------------------------------------------------------
create or replace view public.payment_summary as
select
  sf.id            as season_fee_id,
  sf.profile_id,
  p.full_name,
  p.email,
  p.grade,
  p.player_name,
  sf.season,
  sf.amount_due,
  sf.due_date,
  coalesce(sum(py.amount) filter (where py.status = 'confirmed'), 0) as amount_paid,
  sf.amount_due - coalesce(sum(py.amount) filter (where py.status = 'confirmed'), 0) as balance,
  case
    when sf.amount_due = 0 then 'waived'
    when coalesce(sum(py.amount) filter (where py.status = 'confirmed'), 0) >= sf.amount_due then 'paid'
    when coalesce(sum(py.amount) filter (where py.status = 'confirmed'), 0) > 0 then 'partial'
    else 'unpaid'
  end as payment_status
from public.season_fees sf
join public.profiles p on p.id = sf.profile_id
left join public.payments py on py.season_fee_id = sf.id
group by sf.id, sf.profile_id, p.full_name, p.email, p.grade, p.player_name, sf.season, sf.amount_due, sf.due_date;

-- -----------------------------------------------------------
-- RLS: season_fees
-- -----------------------------------------------------------
alter table public.season_fees enable row level security;

create policy "directors_all_season_fees"
  on public.season_fees for all
  using (public.is_director())
  with check (public.is_director());

-- Parents can view their own fee record
create policy "parents_select_own_fee"
  on public.season_fees for select
  using (profile_id = auth.uid());

-- -----------------------------------------------------------
-- RLS: payments
-- -----------------------------------------------------------
alter table public.payments enable row level security;

create policy "directors_all_payments"
  on public.payments for all
  using (public.is_director())
  with check (public.is_director());

-- Parents can view their own payment history
create policy "parents_select_own_payments"
  on public.payments for select
  using (profile_id = auth.uid());
