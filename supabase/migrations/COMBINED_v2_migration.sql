-- ============================================================
-- GODSPEED ADMIN OS — COMBINED MIGRATION
-- Paste this entire file into Supabase SQL Editor and click Run.
-- Supabase Dashboard → SQL Editor → New Query → Paste → Run
-- ============================================================

-- NOTE: If you get "type already exists" errors on re-runs,
-- that is fine — those lines will be skipped and the rest will run.

-- ============================================================
-- 00: EXTENSIONS (required by uuid_generate_v4)
-- ============================================================
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ============================================================
-- 01: PROFILES
-- ============================================================
do $$ begin
  create type public.app_role as enum ('director', 'coach', 'parent');
exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id           uuid        primary key references auth.users (id) on delete cascade,
  email        text        not null,
  full_name    text,
  phone        text,
  role         app_role    not null default 'parent',
  grade        text,
  player_name  text,
  approved     boolean     not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists profiles_role_idx     on public.profiles (role);
create index if not exists profiles_approved_idx on public.profiles (approved);

create or replace function public.handle_updated_at()
returns trigger language plpgsql security definer as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.handle_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.is_director()
returns boolean language sql stable security definer
set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role = 'director'
      and approved = true
  );
$$;

alter table public.profiles enable row level security;

drop policy if exists "directors_select_all_profiles" on public.profiles;
create policy "directors_select_all_profiles"
  on public.profiles for select using (public.is_director());

drop policy if exists "directors_update_all_profiles" on public.profiles;
create policy "directors_update_all_profiles"
  on public.profiles for update using (public.is_director());

drop policy if exists "users_select_own_profile" on public.profiles;
create policy "users_select_own_profile"
  on public.profiles for select using (id = auth.uid());

drop policy if exists "users_update_own_profile" on public.profiles;
create policy "users_update_own_profile"
  on public.profiles for update
  using (id = auth.uid())
  with check (
    role = (select role from public.profiles where id = auth.uid())
    and approved = (select approved from public.profiles where id = auth.uid())
  );

drop policy if exists "no_direct_profile_insert" on public.profiles;
create policy "no_direct_profile_insert"
  on public.profiles for insert with check (false);

-- ============================================================
-- 02: LOGIN REQUESTS
-- ============================================================
do $$ begin
  create type public.request_status as enum ('pending', 'approved', 'denied');
exception when duplicate_object then null; end $$;

create table if not exists public.login_requests (
  id             uuid            primary key default uuid_generate_v4(),
  user_id        uuid            not null references auth.users (id) on delete cascade,
  email          text            not null,
  full_name      text,
  requested_role app_role        not null default 'parent',
  grade          text,
  player_name    text,
  status         request_status  not null default 'pending',
  reviewed_by    uuid            references auth.users (id) on delete set null,
  reviewed_at    timestamptz,
  ip_address     inet,
  user_agent     text,
  notes          text,
  created_at     timestamptz     not null default now(),
  updated_at     timestamptz     not null default now()
);

create index if not exists login_requests_status_idx  on public.login_requests (status);
create index if not exists login_requests_user_id_idx on public.login_requests (user_id);

drop trigger if exists login_requests_updated_at on public.login_requests;
create trigger login_requests_updated_at
  before update on public.login_requests
  for each row execute procedure public.handle_updated_at();

create or replace function public.handle_new_login_request()
returns trigger language plpgsql security definer as $$
begin
  insert into public.login_requests (user_id, email)
  values (new.id, new.email)
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_login_request on auth.users;
create trigger on_auth_user_login_request
  after insert on auth.users
  for each row execute procedure public.handle_new_login_request();

create or replace function public.approve_login_request(request_id uuid)
returns void language plpgsql security definer
set search_path = public as $$
declare v_request login_requests%rowtype;
begin
  if not public.is_director() then
    raise exception 'permission denied: director role required';
  end if;
  select * into v_request from public.login_requests
  where id = request_id and status = 'pending';
  if not found then raise exception 'request not found or already resolved'; end if;
  update public.login_requests
  set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
  where id = request_id;
  update public.profiles
  set approved = true, role = v_request.requested_role,
      grade = v_request.grade, player_name = v_request.player_name
  where id = v_request.user_id;
end;
$$;

create or replace function public.deny_login_request(request_id uuid, reason text default null)
returns void language plpgsql security definer
set search_path = public as $$
begin
  if not public.is_director() then
    raise exception 'permission denied: director role required';
  end if;
  update public.login_requests
  set status = 'denied', reviewed_by = auth.uid(), reviewed_at = now(),
      notes = coalesce(reason, notes)
  where id = request_id and status = 'pending';
  if not found then raise exception 'request not found or already resolved'; end if;
end;
$$;

alter table public.login_requests enable row level security;

drop policy if exists "directors_select_login_requests" on public.login_requests;
create policy "directors_select_login_requests"
  on public.login_requests for select using (public.is_director());

drop policy if exists "directors_update_login_requests" on public.login_requests;
create policy "directors_update_login_requests"
  on public.login_requests for update using (public.is_director());

drop policy if exists "users_select_own_request" on public.login_requests;
create policy "users_select_own_request"
  on public.login_requests for select using (user_id = auth.uid());

drop policy if exists "users_insert_own_request" on public.login_requests;
create policy "users_insert_own_request"
  on public.login_requests for insert with check (user_id = auth.uid());

-- ============================================================
-- 03: PAYMENTS
-- ============================================================
do $$ begin
  create type public.payment_method as enum ('cash','check','venmo','zelle','cashapp','card','other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payment_status as enum ('pending','confirmed','refunded','waived');
exception when duplicate_object then null; end $$;

create table if not exists public.season_fees (
  id           uuid         primary key default uuid_generate_v4(),
  profile_id   uuid         not null references public.profiles (id) on delete cascade,
  season       text         not null,
  grade        text         not null,
  amount_due   numeric(8,2) not null check (amount_due >= 0),
  due_date     date,
  notes        text,
  created_by   uuid         references auth.users (id) on delete set null,
  created_at   timestamptz  not null default now(),
  updated_at   timestamptz  not null default now(),
  unique (profile_id, season)
);

drop trigger if exists season_fees_updated_at on public.season_fees;
create trigger season_fees_updated_at
  before update on public.season_fees
  for each row execute procedure public.handle_updated_at();

create table if not exists public.payments (
  id             uuid             primary key default uuid_generate_v4(),
  season_fee_id  uuid             not null references public.season_fees (id) on delete restrict,
  profile_id     uuid             not null references public.profiles (id) on delete restrict,
  amount         numeric(8,2)     not null check (amount > 0),
  method         payment_method   not null default 'other',
  status         payment_status   not null default 'confirmed',
  reference_note text,
  recorded_by    uuid             references auth.users (id) on delete set null,
  payment_date   date             not null default current_date,
  created_at     timestamptz      not null default now(),
  updated_at     timestamptz      not null default now()
);

create index if not exists payments_profile_idx    on public.payments (profile_id);
create index if not exists payments_season_fee_idx on public.payments (season_fee_id);
create index if not exists payments_date_idx       on public.payments (payment_date);

drop trigger if exists payments_updated_at on public.payments;
create trigger payments_updated_at
  before update on public.payments
  for each row execute procedure public.handle_updated_at();

create or replace view public.payment_summary as
select
  sf.id as season_fee_id, sf.profile_id,
  p.full_name, p.email, p.grade, p.player_name,
  sf.season, sf.amount_due, sf.due_date,
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

alter table public.season_fees enable row level security;

drop policy if exists "directors_all_season_fees" on public.season_fees;
create policy "directors_all_season_fees"
  on public.season_fees for all
  using (public.is_director()) with check (public.is_director());

drop policy if exists "parents_select_own_fee" on public.season_fees;
create policy "parents_select_own_fee"
  on public.season_fees for select using (profile_id = auth.uid());

alter table public.payments enable row level security;

drop policy if exists "directors_all_payments" on public.payments;
create policy "directors_all_payments"
  on public.payments for all
  using (public.is_director()) with check (public.is_director());

drop policy if exists "parents_select_own_payments" on public.payments;
create policy "parents_select_own_payments"
  on public.payments for select using (profile_id = auth.uid());

-- ============================================================
-- 04: CONTENT (BLOG POSTS + MEMOS)
-- ============================================================
do $$ begin
  create type public.post_status as enum ('draft','published','archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.memo_recipient as enum ('all_coaches','grade_4_staff','grade_5_staff','gene_only','director_only');
exception when duplicate_object then null; end $$;

create table if not exists public.blog_posts (
  id           uuid         primary key default uuid_generate_v4(),
  title        text         not null,
  slug         text         unique,
  body         text         not null default '',
  excerpt      text,
  status       post_status  not null default 'draft',
  author_id    uuid         not null references auth.users (id) on delete restrict,
  published_at timestamptz,
  view_count   integer      not null default 0,
  tags         text[],
  created_at   timestamptz  not null default now(),
  updated_at   timestamptz  not null default now()
);

create index if not exists blog_posts_status_idx on public.blog_posts (status);
create index if not exists blog_posts_slug_idx   on public.blog_posts (slug);

drop trigger if exists blog_posts_updated_at on public.blog_posts;
create trigger blog_posts_updated_at
  before update on public.blog_posts
  for each row execute procedure public.handle_updated_at();

create or replace function public.generate_slug(title text)
returns text language sql immutable strict as $$
  select lower(regexp_replace(regexp_replace(trim(title),'[^a-zA-Z0-9\s-]','','g'),'\s+','-','g'));
$$;

create or replace function public.handle_blog_post_insert()
returns trigger language plpgsql as $$
begin
  if new.slug is null or new.slug = '' then
    new.slug := public.generate_slug(new.title) || '-' || substr(new.id::text, 1, 8);
  end if;
  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists blog_posts_before_insert on public.blog_posts;
create trigger blog_posts_before_insert
  before insert on public.blog_posts
  for each row execute procedure public.handle_blog_post_insert();

create or replace function public.handle_blog_post_publish()
returns trigger language plpgsql as $$
begin
  if new.status = 'published' and old.status != 'published' and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists blog_posts_on_publish on public.blog_posts;
create trigger blog_posts_on_publish
  before update on public.blog_posts
  for each row execute procedure public.handle_blog_post_publish();

alter table public.blog_posts enable row level security;

drop policy if exists "directors_all_blog_posts" on public.blog_posts;
create policy "directors_all_blog_posts"
  on public.blog_posts for all
  using (public.is_director()) with check (public.is_director());

drop policy if exists "public_select_published_posts" on public.blog_posts;
create policy "public_select_published_posts"
  on public.blog_posts for select using (status = 'published');

create table if not exists public.memos (
  id           uuid             primary key default uuid_generate_v4(),
  subject      text             not null,
  body         text             not null default '',
  recipient    memo_recipient   not null default 'all_coaches',
  author_id    uuid             not null references auth.users (id) on delete restrict,
  created_at   timestamptz      not null default now(),
  updated_at   timestamptz      not null default now()
);

create index if not exists memos_recipient_idx on public.memos (recipient);
create index if not exists memos_created_idx   on public.memos (created_at desc);

drop trigger if exists memos_updated_at on public.memos;
create trigger memos_updated_at
  before update on public.memos
  for each row execute procedure public.handle_updated_at();

create table if not exists public.memo_acknowledgments (
  memo_id         uuid         not null references public.memos (id) on delete cascade,
  user_id         uuid         not null references auth.users (id) on delete cascade,
  acknowledged_at timestamptz  not null default now(),
  primary key (memo_id, user_id)
);

create or replace view public.memo_summary as
select
  m.id, m.subject, m.recipient, m.author_id, m.body,
  p.full_name as author_name, m.created_at,
  count(ma.user_id) as ack_count
from public.memos m
left join public.profiles p on p.id = m.author_id
left join public.memo_acknowledgments ma on ma.memo_id = m.id
group by m.id, m.subject, m.recipient, m.author_id, m.body, p.full_name, m.created_at;

alter table public.memos enable row level security;

drop policy if exists "directors_all_memos" on public.memos;
create policy "directors_all_memos"
  on public.memos for all
  using (public.is_director()) with check (public.is_director());

drop policy if exists "coaches_select_addressed_memos" on public.memos;
create policy "coaches_select_addressed_memos"
  on public.memos for select using (
    exists (
      select 1 from public.profiles pr
      where pr.id = auth.uid() and pr.role = 'coach' and pr.approved = true
        and (recipient = 'all_coaches'
          or (recipient = 'grade_4_staff' and pr.grade = '4th')
          or (recipient = 'grade_5_staff' and pr.grade = '5th'))
    )
  );

alter table public.memo_acknowledgments enable row level security;

drop policy if exists "directors_select_acks" on public.memo_acknowledgments;
create policy "directors_select_acks"
  on public.memo_acknowledgments for select using (public.is_director());

drop policy if exists "coaches_insert_own_ack" on public.memo_acknowledgments;
create policy "coaches_insert_own_ack"
  on public.memo_acknowledgments for insert with check (
    user_id = auth.uid()
    and exists (select 1 from public.profiles where id = auth.uid() and role = 'coach' and approved = true)
  );

drop policy if exists "coaches_select_own_ack" on public.memo_acknowledgments;
create policy "coaches_select_own_ack"
  on public.memo_acknowledgments for select using (user_id = auth.uid());

-- ============================================================
-- 05: COMMUNICATIONS (CAMPAIGNS + EVENTS)
-- ============================================================
do $$ begin
  create type public.comms_type as enum ('email','sms');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.comms_status as enum ('draft','sent','failed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.comms_event_type as enum ('sent','delivered','opened','clicked','bounced','failed','unsubscribed');
exception when duplicate_object then null; end $$;

create table if not exists public.campaigns (
  id             uuid          primary key default uuid_generate_v4(),
  name           text          not null,
  type           comms_type    not null,
  subject        text,
  body           text          not null,
  status         comms_status  not null default 'draft',
  recipient_list text[]        not null default '{}',
  sent_at        timestamptz,
  sent_by        uuid          references auth.users (id) on delete set null,
  created_at     timestamptz   not null default now(),
  updated_at     timestamptz   not null default now()
);

drop trigger if exists campaigns_updated_at on public.campaigns;
create trigger campaigns_updated_at
  before update on public.campaigns
  for each row execute procedure public.handle_updated_at();

create table if not exists public.campaign_events (
  id           uuid                 primary key default uuid_generate_v4(),
  campaign_id  uuid                 not null references public.campaigns (id) on delete cascade,
  profile_id   uuid                 references public.profiles (id) on delete set null,
  recipient    text                 not null,
  event_type   comms_event_type     not null,
  metadata     jsonb,
  occurred_at  timestamptz          not null default now()
);

create index if not exists campaign_events_campaign_idx on public.campaign_events (campaign_id);
create index if not exists campaign_events_profile_idx  on public.campaign_events (profile_id);
create index if not exists campaign_events_type_idx     on public.campaign_events (event_type);

create or replace view public.campaign_stats as
select
  c.id, c.name, c.type, c.subject, c.status, c.sent_at,
  array_length(c.recipient_list, 1) as total_recipients,
  count(distinct ce.profile_id) filter (where ce.event_type = 'delivered') as delivered,
  count(distinct ce.profile_id) filter (where ce.event_type = 'opened')    as opened,
  count(distinct ce.profile_id) filter (where ce.event_type = 'clicked')   as clicked,
  count(distinct ce.profile_id) filter (where ce.event_type = 'bounced')   as bounced,
  round(count(distinct ce.profile_id) filter (where ce.event_type = 'opened')::numeric
    / nullif(array_length(c.recipient_list, 1), 0) * 100, 1) as open_rate_pct,
  round(count(distinct ce.profile_id) filter (where ce.event_type = 'clicked')::numeric
    / nullif(array_length(c.recipient_list, 1), 0) * 100, 1) as click_rate_pct
from public.campaigns c
left join public.campaign_events ce on ce.campaign_id = c.id
group by c.id, c.name, c.type, c.subject, c.status, c.sent_at, c.recipient_list;

alter table public.campaigns enable row level security;

drop policy if exists "directors_all_campaigns" on public.campaigns;
create policy "directors_all_campaigns"
  on public.campaigns for all
  using (public.is_director()) with check (public.is_director());

alter table public.campaign_events enable row level security;

drop policy if exists "directors_select_campaign_events" on public.campaign_events;
create policy "directors_select_campaign_events"
  on public.campaign_events for select using (public.is_director());

-- ============================================================
-- BOOTSTRAP: Set scott@clubgodspeed.com as Director
-- ============================================================
-- This runs AFTER the profile row is created by the trigger
-- when you sign up. If your account already exists, this
-- will elevate it to director immediately.
update public.profiles
set role = 'director', approved = true, full_name = 'Scott G.'
where email = 'jewellsco@gmail.com';

-- ============================================================
-- DONE ✅
-- Tables created: profiles, login_requests, season_fees,
--   payments, blog_posts, memos, memo_acknowledgments,
--   campaigns, campaign_events
-- Views created: payment_summary, memo_summary, campaign_stats
-- RPCs created: approve_login_request, deny_login_request
-- Director bootstrap: scott@clubgodspeed.com
-- ============================================================
