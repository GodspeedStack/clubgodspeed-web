-- v15_02: complete_coach_step('profile') also saves full_name (validated: two words, <=120 chars).
-- Applied 2026-09-03.

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
  v_phone text; v_bio text; v_title text; v_headshot text; v_name text; v_teams uuid[];
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
    v_name     := nullif(btrim(p_payload->>'full_name'), '');
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
    if v_name is not null and (char_length(v_name) > 120 or v_name !~ '\S+\s+\S+') then
      return jsonb_build_object('error', jsonb_build_object('code','bad_name','message','Type your first and last name'));
    end if;
    if v_headshot is not null and v_headshot not like (v_uid::text || '/%') then
      return jsonb_build_object('error', jsonb_build_object('code','bad_headshot_path','message','Headshot must be in your own folder'));
    end if;
    update public.profiles
       set phone = v_phone,
           full_name = coalesce(v_name, full_name)
     where id = v_uid;
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

revoke execute on function public.complete_coach_step(text, jsonb) from public, anon;
grant execute on function public.complete_coach_step(text, jsonb) to authenticated, service_role;
