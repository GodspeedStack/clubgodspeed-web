-- ============================================================
-- 20260324000000_fix_signup_triggers_and_admin_notify.sql
-- Fixes:
--   1. handle_new_user() now populates profiles with signup metadata
--   2. handle_new_login_request() now populates login_requests with metadata
-- ============================================================

-- 1. Fix profile trigger — extract metadata from raw_user_meta_data
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email, full_name, phone, grade, player_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'parent_name'),
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'grade',
    new.raw_user_meta_data->>'player_name'
  );
  return new;
end;
$$;

-- 2. Fix login_request trigger — populate full details from metadata
create or replace function public.handle_new_login_request()
returns trigger language plpgsql security definer as $$
begin
  insert into public.login_requests (user_id, email, full_name, grade, player_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'parent_name'),
    new.raw_user_meta_data->>'grade',
    new.raw_user_meta_data->>'player_name'
  );
  return new;
end;
$$;
