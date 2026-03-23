-- ============================================================
-- v2_06_fix_auth_triggers.sql
-- Fix: propagate user_metadata from Supabase Auth signup into
-- profiles and login_requests so admin panel can see names,
-- player info, phone, and grade immediately after signup.
-- ============================================================

-- -----------------------------------------------------------
-- 1. Updated handle_new_user trigger
--    Reads raw_user_meta_data set during supabase.auth.signUp()
-- -----------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
declare
  meta jsonb;
begin
  meta := coalesce(new.raw_user_meta_data, '{}'::jsonb);

  insert into public.profiles (
    id,
    email,
    full_name,
    phone,
    player_name,
    grade,
    role,
    approved
  ) values (
    new.id,
    new.email,
    coalesce(meta->>'parent_name', meta->>'full_name'),
    meta->>'phone',
    meta->>'player_name',
    meta->>'grade',
    'parent',    -- default; director can change via approve flow
    false        -- must be approved by director
  );

  return new;
end;
$$;

-- -----------------------------------------------------------
-- 2. Updated handle_new_login_request trigger
--    Also reads raw_user_meta_data for richer request data.
-- -----------------------------------------------------------
create or replace function public.handle_new_login_request()
returns trigger language plpgsql security definer as $$
declare
  meta jsonb;
begin
  meta := coalesce(new.raw_user_meta_data, '{}'::jsonb);

  insert into public.login_requests (
    user_id,
    email,
    full_name,
    requested_role,
    grade,
    player_name
  ) values (
    new.id,
    new.email,
    coalesce(meta->>'parent_name', meta->>'full_name'),
    'parent',
    meta->>'grade',
    meta->>'player_name'
  );

  return new;
end;
$$;

-- -----------------------------------------------------------
-- 3. Allow authenticated users to insert their own profile
--    row in case the trigger fires before the session exists.
--    (Relaxes the blanket no_direct_profile_insert policy for
--    the user's own row only.)
-- -----------------------------------------------------------
-- Drop the overly restrictive no-insert policy
drop policy if exists "no_direct_profile_insert" on public.profiles;

-- Replace with a policy that still blocks cross-user inserts
create policy "users_insert_own_profile"
  on public.profiles for insert
  with check (id = auth.uid());
