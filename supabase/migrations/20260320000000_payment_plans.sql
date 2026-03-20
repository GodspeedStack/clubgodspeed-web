create table public.payment_plans (
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

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  plan_id uuid references public.payment_plans(id) on delete cascade,
  parent_id uuid references auth.users(id) on delete cascade,
  installment_number int not null,
  amount numeric(10,2) not null,
  due_date date not null,
  paid_at timestamptz,
  status text not null default 'pending'
    check (status in ('pending','paid','overdue','waived')),
  payment_method text check (payment_method in ('card','venmo')),
  stripe_payment_intent_id text,
  receipt_sent_at timestamptz
);

create table public.payment_reminders (
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

create index idx_payments_due_date on public.payments(due_date);
create index idx_payments_status on public.payments(status);
create index idx_payments_parent on public.payments(parent_id);

alter table public.payment_plans enable row level security;
alter table public.payments enable row level security;
alter table public.payment_reminders enable row level security;

create policy "Parents view own plans" on public.payment_plans
  for select using (auth.uid() = parent_id);

create policy "Parents view own payments" on public.payments
  for select using (auth.uid() = parent_id);

create policy "Admin all plans" on public.payment_plans
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

create policy "Admin all payments" on public.payments
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

create policy "Admin all reminders" on public.payment_reminders
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );
