-- v20_01 (APPLIED LIVE 2026-09-09 via MCP; checked in for the record)
--
-- Every signup since profiles.role became the app_role enum silently failed to
-- get a profile row: handle_new_user inserted a text role into an enum column
-- ("column role is of type app_role but expression is of type text") and its
-- EXCEPTION block downgraded that to a warning, so the auth account was created
-- with no profile. No profile means verifyApproval fails, admin approval updates
-- nothing, no athlete link, no documents. Seen live for sly@slybrandon.com
-- (Google sign-in 2026-09-02, approved 2026-09-04, still locked out 2026-09-09).
--
-- 1. handle_new_user casts the role properly (self-signup is always parent).
-- 2. Backfill profiles for the five real accounts that had none; approved follows
--    the decision already recorded in login_requests.
-- 3. Link Sly Brandon to Sylvester (parent_player_links, guardian, primary).
--
-- Pre-launch check (expect only test fixtures):
--   select u.email from auth.users u where not exists (select 1 from public.profiles p where p.id = u.id);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  v_role_txt text := coalesce(new.raw_user_meta_data->>'role', 'parent');
  v_role     public.app_role;
  v_name     text := coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', new.email);
  v_player   text := new.raw_user_meta_data->>'player_name';
  v_phone    text := new.raw_user_meta_data->>'phone';
  v_grade    text := new.raw_user_meta_data->>'grade';
  v_dob      text := new.raw_user_meta_data->>'date_of_birth';
  v_approved boolean := false;
begin
  v_role := case when v_role_txt = 'parent' then 'parent'::public.app_role else 'parent'::public.app_role end;
  insert into public.profiles (id, email, full_name, player_name, phone, grade, date_of_birth, role, approved, created_at)
  values (new.id, new.email, v_name, v_player, v_phone, v_grade,
          case when v_dob ~ '^\d{4}-\d{2}-\d{2}$' then v_dob::date else null end,
          v_role, v_approved, now())
  on conflict (id) do update
     set email = excluded.email,
         full_name = coalesce(public.profiles.full_name, excluded.full_name),
         player_name = coalesce(public.profiles.player_name, excluded.player_name),
         phone = coalesce(public.profiles.phone, excluded.phone),
         grade = coalesce(public.profiles.grade, excluded.grade),
         date_of_birth = coalesce(public.profiles.date_of_birth, excluded.date_of_birth),
         role = coalesce(public.profiles.role, excluded.role),
         approved = public.profiles.approved or excluded.approved;
  return new;
exception when others then
  raise warning 'handle_new_user failed for % (%): %', new.id, new.email, sqlerrm;
  return new;
end;
$function$;

insert into public.profiles (id, email, full_name, role, approved, created_at)
select u.id, u.email,
       coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', lr.full_name, u.email),
       'parent'::public.app_role, coalesce(lr.status = 'approved', false), u.created_at
  from auth.users u
  left join lateral (select status, full_name from public.login_requests l where l.user_id = u.id order by created_at desc limit 1) lr on true
 where not exists (select 1 from public.profiles p where p.id = u.id)
   and u.email not like '%@test-clubgodspeed.invalid' and u.email not like 'smoketest_%'
on conflict (id) do nothing;

insert into public.parent_player_links (profile_id, athlete_id, relationship, is_primary)
select u.id, a.id, 'guardian', true
  from auth.users u, public.athletes a
 where lower(u.email) = 'sly@slybrandon.com' and a.id = '51267743-30ae-4ae3-a456-c198598ec29a'
on conflict (profile_id, athlete_id) do nothing;

update public.profiles set player_name = 'Sylvester', approved = true where lower(email) = 'sly@slybrandon.com';
