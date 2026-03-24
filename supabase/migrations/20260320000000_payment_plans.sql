-- Payment Plans & Installments Migration
-- NOTE: public.payments already exists (season_fee payments).
-- This migration adds installment-based payment plan support alongside it.

-- 1. Create payment_plans table
create table if not exists public.payment_plans (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  parent_id uuid references auth.users(id) on delete cascade,
  player_name text not null,
  season text not null default 'Spring/Summer 2026',
  plan_type text not null check (plan_type in ('full','2-installment','3-installment')),
  total_amount numeric(10,2) not null default 724.00,
  status text not null default 'active'
    check (status in ('active','completed','cancelled'))
);

-- 2. Extend existing payments table with installment columns
-- Make legacy NOT NULL columns nullable so new payment types can coexist
alter table public.payments alter column season_fee_id drop not null;
alter table public.payments alter column profile_id drop not null;

-- Add installment-specific columns
alter table public.payments add column if not exists plan_id uuid references public.payment_plans(id) on delete cascade;
alter table public.payments add column if not exists parent_id uuid references auth.users(id) on delete cascade;
alter table public.payments add column if not exists installment_number int;
alter table public.payments add column if not exists due_date date;
alter table public.payments add column if not exists paid_at timestamptz;
alter table public.payments add column if not exists payment_method text;
alter table public.payments add column if not exists stripe_payment_intent_id text;
alter table public.payments add column if not exists receipt_sent_at timestamptz;

-- 3. Create payment_reminders table
create table if not exists public.payment_reminders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  payment_id uuid references public.payments(id) on delete cascade,
  parent_id uuid references auth.users(id) on delete cascade,
  reminder_type text not null check (reminder_type in (
    '7_day','1_day','due_today','3_day_overdue','7_day_overdue','receipt','manual'
  )),
  email_to text not null,
  sent_at timestamptz default now()
);

-- 4. Indexes
create index if not exists idx_payments_due_date on public.payments(due_date);
create index if not exists idx_payments_parent on public.payments(parent_id);

-- 5. RLS
alter table public.payment_plans enable row level security;
alter table public.payment_reminders enable row level security;

create policy "Parents view own plans" on public.payment_plans
  for select using (auth.uid() = parent_id);

create policy "Parents view own payments" on public.payments
  for select using (auth.uid() = parent_id);
