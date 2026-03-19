-- Core analytics event table
create table public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  user_id uuid references auth.users(id) on delete set null,
  session_id text not null,
  event_type text not null check (event_type in (
    'page_view',
    'page_exit',
    'click',
    'scroll_depth',
    'feature_used',
    'error_encountered',
    'download',
    'external_link'
  )),
  page text not null,
  element_label text,         -- what was clicked / interacted with
  duration_ms int,            -- time on page (page_exit events)
  scroll_pct int,             -- 25 / 50 / 75 / 100
  metadata jsonb default '{}'  -- flexible catch-all, no schema bloat
);

-- Indexes for the queries you'll actually run
create index idx_analytics_user on public.analytics_events(user_id);
create index idx_analytics_event_type on public.analytics_events(event_type);
create index idx_analytics_page on public.analytics_events(page);
create index idx_analytics_created on public.analytics_events(created_at desc);

-- RLS: users can insert their own. Admins read all.
alter table public.analytics_events enable row level security;

create policy "Users insert own events"
  on public.analytics_events
  for insert
  with check (auth.uid() = user_id);

create policy "Admin read all"
  on public.analytics_events
  for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );
