-- Access requests table
create table public.access_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  parent_name text not null,
  email text not null,
  player_name text not null,
  player_age int not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id)
);

-- Only admins can read/write. No public access.
alter table public.access_requests enable row level security;

create policy "Admin full access"
  on public.access_requests
  for all
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Allow anonymous insert only (public request form)
create policy "Public can submit requests"
  on public.access_requests
  for insert
  with check (true);
