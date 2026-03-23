-- ============================================================
-- 02_login_requests.sql
-- Tracks new parent/coach access requests.
-- Created automatically when a user signs up (via trigger)
-- or manually submitted through the portal form.
-- ============================================================

create type public.request_status as enum ('pending', 'approved', 'denied');

create table public.login_requests (
  id           uuid            primary key default uuid_generate_v4(),
  user_id      uuid            not null references auth.users (id) on delete cascade,
  email        text            not null,
  full_name    text,
  requested_role app_role      not null default 'parent',
  grade        text,
  player_name  text,
  status       request_status  not null default 'pending',
  reviewed_by  uuid            references auth.users (id) on delete set null,
  reviewed_at  timestamptz,
  ip_address   inet,
  user_agent   text,
  notes        text,           -- director internal notes on the request
  created_at   timestamptz     not null default now(),
  updated_at   timestamptz     not null default now()
);

create index login_requests_status_idx   on public.login_requests (status);
create index login_requests_user_id_idx  on public.login_requests (user_id);

create trigger login_requests_updated_at
  before update on public.login_requests
  for each row execute procedure public.handle_updated_at();

-- -----------------------------------------------------------
-- TRIGGER: auto-create login_request on new auth.users insert
-- Fires after the profile trigger (trigger names execute alpha
-- order - "on_auth" fires before "on_login" alphabetically).
-- -----------------------------------------------------------
create or replace function public.handle_new_login_request()
returns trigger language plpgsql security definer as $$
begin
  insert into public.login_requests (user_id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_login_request
  after insert on auth.users
  for each row execute procedure public.handle_new_login_request();

-- -----------------------------------------------------------
-- STORED PROCEDURE: approve_login_request
-- Called by admin panel. Atomically:
--   1. Updates login_requests.status = 'approved'
--   2. Sets profiles.approved = true
--   3. Sets profiles.role from the request
-- Uses security definer so the RPC can write both tables
-- even though client JWT is a non-director (edge case safety).
-- The function validates the caller IS a director first.
-- -----------------------------------------------------------
create or replace function public.approve_login_request(request_id uuid)
returns void language plpgsql security definer
set search_path = public as $$
declare
  v_request login_requests%rowtype;
begin
  if not public.is_director() then
    raise exception 'permission denied: director role required';
  end if;

  select * into v_request
  from public.login_requests
  where id = request_id and status = 'pending';

  if not found then
    raise exception 'request not found or already resolved';
  end if;

  update public.login_requests
  set status      = 'approved',
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = request_id;

  update public.profiles
  set approved = true,
      role     = v_request.requested_role,
      grade    = v_request.grade,
      player_name = v_request.player_name
  where id = v_request.user_id;
end;
$$;

-- Deny counterpart
create or replace function public.deny_login_request(request_id uuid, reason text default null)
returns void language plpgsql security definer
set search_path = public as $$
begin
  if not public.is_director() then
    raise exception 'permission denied: director role required';
  end if;

  update public.login_requests
  set status      = 'denied',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      notes       = coalesce(reason, notes)
  where id = request_id and status = 'pending';

  if not found then
    raise exception 'request not found or already resolved';
  end if;
end;
$$;

-- -----------------------------------------------------------
-- RLS: login_requests
-- -----------------------------------------------------------
alter table public.login_requests enable row level security;

-- Directors see everything
create policy "directors_select_login_requests"
  on public.login_requests for select
  using (public.is_director());

create policy "directors_update_login_requests"
  on public.login_requests for update
  using (public.is_director());

-- Users can see their own request (portal status page)
create policy "users_select_own_request"
  on public.login_requests for select
  using (user_id = auth.uid());

-- Insert is trigger-only for the user's own record
create policy "users_insert_own_request"
  on public.login_requests for insert
  with check (user_id = auth.uid());
