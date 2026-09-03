-- v15_01: Coach onboarding (first-run wizard + document pack + welcome kit).
--
-- What this adds
--   coach_profiles     one row per staff account: bio, headshot, teams, and the
--                      timestamps of each onboarding step. Forward-only.
--   coach_agreements   gains user_id + document_version + a uniqueness rule so a
--                      coach can sign each document version exactly once.
--   coach-media        public-read storage bucket for headshots; a coach may only
--                      write inside their own folder (<uid>/...).
--   RPCs (SECURITY DEFINER, authenticated + service_role only, never anon)
--     get_coach_onboarding()                       -> jsonb state for the wizard + admin view
--     sign_coach_document(id, title, version, sig) -> jsonb, idempotent
--     complete_coach_step(step)                    -> jsonb, forward-only timestamps
--     list_coach_onboarding()                      -> staff-only roster of every coach's progress
--
-- Contracts honored: RLS on every table (default deny), append-only signatures,
-- forward-only state, explicit error objects, one job per function.
--
-- Proof queries at the bottom.

-- ── coach_profiles ─────────────────────────────────────────────
create table if not exists public.coach_profiles (
  user_id                 uuid primary key references auth.users(id) on delete cascade,
  title                   text not null default 'Coach',
  bio                     text,
  headshot_path           text,
  team_ids                uuid[] not null default '{}',
  password_set_at         timestamptz,
  profile_completed_at    timestamptz,
  documents_completed_at  timestamptz,
  teams_confirmed_at      timestamptz,
  onboarding_completed_at timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint coach_profiles_bio_len check (bio is null or char_length(bio) <= 600),
  constraint coach_profiles_title_len check (char_length(title) between 1 and 40)
);

alter table public.coach_profiles enable row level security;

drop policy if exists coach_profiles_own_read on public.coach_profiles;
create policy coach_profiles_own_read on public.coach_profiles
  for select to authenticated
  using (user_id = auth.uid() or public.is_gs_admin());

-- Writes go through the RPCs below (definer), never straight from the client.
drop policy if exists coach_profiles_service_all on public.coach_profiles;
create policy coach_profiles_service_all on public.coach_profiles
  for all to service_role using (true) with check (true);

drop trigger if exists trg_coach_profiles_updated_at on public.coach_profiles;
create trigger trg_coach_profiles_updated_at
  before update on public.coach_profiles
  for each row execute function public.handle_updated_at();

-- ── coach_agreements: identity + idempotency ──────────────────
alter table public.coach_agreements
  add column if not exists user_id uuid references auth.users(id) on delete set null,
  add column if not exists document_version text not null default '1';

create unique index if not exists coach_agreements_one_per_version
  on public.coach_agreements (user_id, document_id, document_version)
  where user_id is not null;

-- ── storage: coach-media (public read, own-folder write) ──────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('coach-media', 'coach-media', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists coach_media_public_read on storage.objects;
create policy coach_media_public_read on storage.objects
  for select to public using (bucket_id = 'coach-media');

drop policy if exists coach_media_own_write on storage.objects;
create policy coach_media_own_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'coach-media'
              and public.is_gs_admin()
              and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists coach_media_own_update on storage.objects;
create policy coach_media_own_update on storage.objects
  for update to authenticated
  using (bucket_id = 'coach-media' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'coach-media' and (storage.foldername(name))[1] = auth.uid()::text);

-- ── RPC: get_coach_onboarding ─────────────────────────────────
create or replace function public.get_coach_onboarding()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_cp public.coach_profiles%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('error', jsonb_build_object('code','not_authenticated','message','Sign in first'));
  end if;
  select * into v_profile from public.profiles where id = v_uid;
  if not found or v_profile.role not in ('coach','director','founder') then
    return jsonb_build_object('error', jsonb_build_object('code','not_staff','message','This account is not a coach account'));
  end if;

  -- First touch creates the row. Nothing else here writes.
  insert into public.coach_profiles (user_id) values (v_uid) on conflict (user_id) do nothing;
  select * into v_cp from public.coach_profiles where user_id = v_uid;

  return jsonb_build_object(
    'user_id', v_uid,
    'email', v_profile.email,
    'full_name', v_profile.full_name,
    'phone', v_profile.phone,
    'role', v_profile.role,
    'title', v_cp.title,
    'bio', v_cp.bio,
    'headshot_path', v_cp.headshot_path,
    'team_ids', to_jsonb(v_cp.team_ids),
    'steps', jsonb_build_object(
      'password',  v_cp.password_set_at,
      'profile',   v_cp.profile_completed_at,
      'documents', v_cp.documents_completed_at,
      'teams',     v_cp.teams_confirmed_at,
      'done',      v_cp.onboarding_completed_at
    ),
    'signed', coalesce((
      select jsonb_agg(jsonb_build_object('document_id', ca.document_id, 'version', ca.document_version, 'signed_at', ca.signed_at) order by ca.signed_at)
      from public.coach_agreements ca where ca.user_id = v_uid), '[]'::jsonb),
    'teams', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'age_group', t.age_group) order by t.name)
      from public.teams t where t.is_active), '[]'::jsonb)
  );
end;
$function$;

-- ── RPC: sign_coach_document (idempotent, append-only) ────────
create or replace function public.sign_coach_document(
  p_document_id text, p_document_title text, p_document_version text, p_signature text,
  p_team text default null, p_user_agent text default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_id uuid;
  v_existing timestamptz;
begin
  if v_uid is null then
    return jsonb_build_object('error', jsonb_build_object('code','not_authenticated','message','Sign in first'));
  end if;
  select * into v_profile from public.profiles where id = v_uid;
  if not found or v_profile.role not in ('coach','director','founder') then
    return jsonb_build_object('error', jsonb_build_object('code','not_staff','message','Only staff can sign coach documents'));
  end if;
  if coalesce(btrim(p_document_id),'') = '' or coalesce(btrim(p_document_version),'') = ''
     or coalesce(btrim(p_signature),'') = '' then
    return jsonb_build_object('error', jsonb_build_object('code','missing_fields','message','Document and signature are required'));
  end if;

  select signed_at into v_existing from public.coach_agreements
   where user_id = v_uid and document_id = btrim(p_document_id) and document_version = btrim(p_document_version);
  if found then
    return jsonb_build_object('success', true, 'already_signed', true, 'signed_at', v_existing);
  end if;

  insert into public.coach_agreements
    (user_id, coach_name, coach_email, team, document_id, document_title, document_version, signature_value, user_agent, signed_at)
  values
    (v_uid, left(coalesce(v_profile.full_name, v_profile.email),120), v_profile.email,
     left(nullif(btrim(p_team),''),60), left(btrim(p_document_id),60), left(btrim(p_document_title),160),
     left(btrim(p_document_version),20), left(btrim(p_signature),120), left(p_user_agent,300), now())
  returning id into v_id;

  return jsonb_build_object('success', true, 'already_signed', false, 'id', v_id, 'signed_at', now());
end;
$function$;

-- ── RPC: complete_coach_step (forward-only) ───────────────────
create or replace function public.complete_coach_step(
  p_step text, p_payload jsonb default '{}'::jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_phone text; v_bio text; v_title text; v_headshot text; v_teams uuid[];
  v_cp public.coach_profiles%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('error', jsonb_build_object('code','not_authenticated','message','Sign in first'));
  end if;
  select * into v_profile from public.profiles where id = v_uid;
  if not found or v_profile.role not in ('coach','director','founder') then
    return jsonb_build_object('error', jsonb_build_object('code','not_staff','message','This account is not a coach account'));
  end if;
  insert into public.coach_profiles (user_id) values (v_uid) on conflict (user_id) do nothing;

  if p_step = 'password' then
    update public.coach_profiles set password_set_at = coalesce(password_set_at, now()) where user_id = v_uid;

  elsif p_step = 'profile' then
    v_phone    := nullif(btrim(p_payload->>'phone'), '');
    v_bio      := nullif(btrim(p_payload->>'bio'), '');
    v_title    := coalesce(nullif(btrim(p_payload->>'title'), ''), 'Coach');
    v_headshot := nullif(btrim(p_payload->>'headshot_path'), '');
    if v_phone is null or v_bio is null then
      return jsonb_build_object('error', jsonb_build_object('code','missing_fields','message','Phone and a short bio are required'));
    end if;
    if char_length(v_bio) > 600 then
      return jsonb_build_object('error', jsonb_build_object('code','bio_too_long','message','Keep the bio under 600 characters'));
    end if;
    if v_headshot is not null and v_headshot not like (v_uid::text || '/%') then
      return jsonb_build_object('error', jsonb_build_object('code','bad_headshot_path','message','Headshot must be in your own folder'));
    end if;
    update public.profiles set phone = v_phone where id = v_uid;
    update public.coach_profiles
       set bio = v_bio, title = left(v_title, 40), headshot_path = coalesce(v_headshot, headshot_path),
           profile_completed_at = coalesce(profile_completed_at, now())
     where user_id = v_uid;

  elsif p_step = 'documents' then
    -- The client passes the list of required document ids + versions; all must be signed.
    if exists (
      select 1 from jsonb_array_elements(coalesce(p_payload->'required', '[]'::jsonb)) r
      where not exists (
        select 1 from public.coach_agreements ca
         where ca.user_id = v_uid and ca.document_id = r->>'document_id' and ca.document_version = r->>'version')
    ) then
      return jsonb_build_object('error', jsonb_build_object('code','documents_incomplete','message','Sign every document first'));
    end if;
    update public.coach_profiles set documents_completed_at = coalesce(documents_completed_at, now()) where user_id = v_uid;

  elsif p_step = 'teams' then
    select coalesce(array_agg(t.id), '{}') into v_teams
      from public.teams t
     where t.is_active and t.id in (select (x)::uuid from jsonb_array_elements_text(coalesce(p_payload->'team_ids','[]'::jsonb)) x);
    update public.coach_profiles set team_ids = v_teams, teams_confirmed_at = coalesce(teams_confirmed_at, now()) where user_id = v_uid;

  elsif p_step = 'done' then
    select * into v_cp from public.coach_profiles where user_id = v_uid;
    if v_cp.profile_completed_at is null or v_cp.documents_completed_at is null or v_cp.teams_confirmed_at is null then
      return jsonb_build_object('error', jsonb_build_object('code','steps_incomplete','message','Finish every step first'));
    end if;
    update public.coach_profiles set onboarding_completed_at = coalesce(onboarding_completed_at, now()) where user_id = v_uid;

  else
    return jsonb_build_object('error', jsonb_build_object('code','unknown_step','message','Unknown step'));
  end if;

  return public.get_coach_onboarding();
end;
$function$;

-- ── RPC: list_coach_onboarding (staff view) ───────────────────
create or replace function public.list_coach_onboarding()
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
begin
  if not public.is_gs_admin() then
    raise exception 'ADMIN_ONLY' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'user_id', p.id, 'full_name', p.full_name, 'email', p.email, 'role', p.role, 'phone', p.phone,
      'title', cp.title, 'headshot_path', cp.headshot_path,
      'team_names', (select coalesce(jsonb_agg(t.name order by t.name), '[]'::jsonb) from public.teams t where t.id = any(coalesce(cp.team_ids,'{}'))),
      'steps', jsonb_build_object(
        'password', cp.password_set_at, 'profile', cp.profile_completed_at,
        'documents', cp.documents_completed_at, 'teams', cp.teams_confirmed_at, 'done', cp.onboarding_completed_at),
      'signed_count', (select count(*) from public.coach_agreements ca where ca.user_id = p.id),
      'last_sign_in_at', (select u.last_sign_in_at from auth.users u where u.id = p.id)
    ) order by p.full_name nulls last, p.email)
    from public.profiles p
    left join public.coach_profiles cp on cp.user_id = p.id
    where p.role in ('coach','director','founder')
  ), '[]'::jsonb);
end;
$function$;

-- ── grants: authenticated + service_role only ─────────────────
revoke execute on function public.get_coach_onboarding() from public, anon;
revoke execute on function public.sign_coach_document(text, text, text, text, text, text) from public, anon;
revoke execute on function public.complete_coach_step(text, jsonb) from public, anon;
revoke execute on function public.list_coach_onboarding() from public, anon;
grant execute on function public.get_coach_onboarding() to authenticated, service_role;
grant execute on function public.sign_coach_document(text, text, text, text, text, text) to authenticated, service_role;
grant execute on function public.complete_coach_step(text, jsonb) to authenticated, service_role;
grant execute on function public.list_coach_onboarding() to authenticated, service_role;

-- Proof queries
--   select relrowsecurity from pg_class where relname='coach_profiles';                      -- true
--   select has_function_privilege('anon','public.get_coach_onboarding()','execute');       -- false
--   select public.get_coach_onboarding();  -- as a coach: jsonb with steps; as anon: permission denied
