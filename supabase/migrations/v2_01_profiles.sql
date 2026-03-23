-- ============================================================
-- 01_profiles.sql
-- User profiles linked to auth.users.
-- Roles: director | coach | parent
-- Only directors can write to most tables.
-- ============================================================

-- -----------------------------------------------------------
-- ENUM
-- -----------------------------------------------------------
create type public.app_role as enum ('director', 'coach', 'parent');

-- -----------------------------------------------------------
-- TABLE: profiles
-- One row per auth user. Created via trigger on sign-up.
-- -----------------------------------------------------------
create table public.profiles (
  id           uuid        primary key references auth.users (id) on delete cascade,
  email        text        not null,
  full_name    text,
  phone        text,
  role         app_role    not null default 'parent',
  grade        text,                          -- '4th' | '5th' | null for staff
  player_name  text,                          -- child's name if role = parent
  approved     boolean     not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- index used by RLS helper and admin queries
create index profiles_role_idx   on public.profiles (role);
create index profiles_approved_idx on public.profiles (approved);

-- -----------------------------------------------------------
-- TRIGGER: keep updated_at current
-- -----------------------------------------------------------
create or replace function public.handle_updated_at()
returns trigger language plpgsql security definer as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.handle_updated_at();

-- -----------------------------------------------------------
-- TRIGGER: auto-create profile row on auth.users insert
-- Populates email only; all other fields set by admin or user.
-- -----------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- -----------------------------------------------------------
-- HELPER: is the calling user a director?
-- Used in all RLS policies to keep them readable.
-- security definer + search_path lock = safe against
-- search_path injection.
-- -----------------------------------------------------------
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

-- -----------------------------------------------------------
-- RLS: profiles
-- -----------------------------------------------------------
alter table public.profiles enable row level security;

-- Directors see all profiles
create policy "directors_select_all_profiles"
  on public.profiles for select
  using (public.is_director());

-- Directors can update any profile (approve, change role, etc.)
create policy "directors_update_all_profiles"
  on public.profiles for update
  using (public.is_director());

-- Each user can read their own profile (portal login check)
create policy "users_select_own_profile"
  on public.profiles for select
  using (id = auth.uid());

-- Each user can update their own non-privileged fields
create policy "users_update_own_profile"
  on public.profiles for update
  using (id = auth.uid())
  with check (
    -- prevent self-elevation: role and approved are director-only
    role = (select role from public.profiles where id = auth.uid())
    and approved = (select approved from public.profiles where id = auth.uid())
  );

-- Insert is handled by trigger only - no direct client inserts
create policy "no_direct_profile_insert"
  on public.profiles for insert
  with check (false);
