-- v14_04: Close the remaining unauthenticated reach into SECURITY DEFINER functions.
--
-- Findings (get_advisors security, 2026-09-03): 66 definer functions executable
-- by `anon`, 25 with a mutable search_path, zero ERROR-level items left.
--
-- Rules applied here (same lesson as v14_02: REVOKE FROM anon alone is a no-op
-- because anon inherits the default PUBLIC grant):
--   1. Every SECURITY DEFINER function in public that is NOT a trigger function:
--      REVOKE FROM PUBLIC, anon; GRANT TO authenticated, service_role.
--   2. Five functions legitimately serve logged-out pages and keep anon:
--      get_or_create_onboarding, advance_onboarding_step (onboarding wizard
--      before an account exists), verify_email_token (email verification link),
--      get_campaign_public x2 (public fundraiser page).
--   3. Trigger / event-trigger functions are left alone: they cannot be invoked
--      through /rpc ("trigger functions can only be called as triggers").
--   4. Three admin-only functions had no internal role check; they now require
--      a coach/director/founder caller or the service role (edge functions).
--   5. Every function still lacking a search_path gets one pinned to public, extensions.
--
-- Proof queries (expect 5, 0, 0):
--   select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='public' and p.prosecdef and pg_get_function_result(p.oid) not in ('trigger','event_trigger')
--      and has_function_privilege('anon', p.oid, 'EXECUTE');
--   select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='public' and p.prosecdef and p.proconfig is null;
--   select public.assign_document_to_roster('00000000-0000-0000-0000-000000000000') -- as anon: permission denied

-- ── 1 + 2: grants ─────────────────────────────────────────────
do $$
declare r record; sig text;
begin
  for r in
    select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) args
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef and p.prokind = 'f'
       and pg_get_function_result(p.oid) not in ('trigger','event_trigger')
  loop
    sig := format('public.%I(%s)', r.proname, r.args);
    execute format('revoke execute on function %s from public, anon', sig);
    execute format('grant execute on function %s to authenticated, service_role', sig);
    if r.proname in ('get_or_create_onboarding','advance_onboarding_step','verify_email_token','get_campaign_public') then
      execute format('grant execute on function %s to anon', sig);
    end if;
  end loop;
end $$;

-- ── 4: internal guards on admin-only functions that had none ──
create or replace function public.assign_document_to_roster(p_document_id uuid, p_assigned_by uuid default null::uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
    v_doc public.documents%rowtype;
    v_count integer := 0;
begin
    if not (auth.role() = 'service_role' or public.is_gs_admin()) then
        raise exception 'ADMIN_ONLY' using errcode = '42501';
    end if;

    select * into v_doc from public.documents where id = p_document_id;
    if not found then
        return jsonb_build_object('error', 'Document not found');
    end if;

    insert into public.user_agreements (
        parent_user_id, parent_email, athlete_id, document_id, assigned_by
    )
    select pa.user_id, pa.email, a.id, p_document_id, coalesce(p_assigned_by, auth.uid())
    from public.athletes a
    join public.parent_accounts pa on pa.id = a.parent_account_id
    where a.enrollment_status = 'active'
    and (
        v_doc.applies_to = 'all_active'
        or (v_doc.applies_to = 'aau_only' and a.team_name ilike '%aau%')
        or (v_doc.applies_to = 'training_only' and a.team_name ilike '%training%')
    )
    on conflict (parent_user_id, athlete_id, document_id) do nothing;

    get diagnostics v_count = row_count;

    insert into public.document_events (agreement_id, event_type, actor_id, actor_type, event_metadata)
    select ua.id, 'assigned', coalesce(p_assigned_by, auth.uid()), 'admin',
           jsonb_build_object('document_title', v_doc.title, 'season', v_doc.season)
    from public.user_agreements ua
    where ua.document_id = p_document_id
    and ua.assigned_at >= now() - interval '1 minute';

    return jsonb_build_object('success', true, 'assigned_count', v_count);
end;
$function$;

create or replace function public.get_sms_eligible_parents(p_team_id uuid default null::uuid)
 returns table(profile_id uuid, full_name text, phone text, email text, player_name text)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not (auth.role() = 'service_role' or public.is_gs_admin()) then
    raise exception 'ADMIN_ONLY' using errcode = '42501';
  end if;
  return query
  select distinct on (p.id)
    p.id as profile_id, p.full_name, p.phone, p.email,
    a.first_name || ' ' || a.last_name as player_name
  from public.profiles p
  join public.parent_player_links ppl on ppl.profile_id = p.id
  join public.athletes a on a.id = ppl.athlete_id
  left join public.team_rosters tr on tr.athlete_id = a.id
  where p.role = 'parent'
    and p.approved = true
    and p.phone is not null
    and p.phone <> ''
    and (p_team_id is null or tr.team_id = p_team_id)
  order by p.id, ppl.is_primary desc nulls last;
end;
$function$;

create or replace function public.link_parent_to_athlete(p_profile_id uuid, p_athlete_id uuid, p_relationship text default 'guardian'::text, p_is_primary boolean default false)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
    link_id uuid;
begin
    if not (auth.role() = 'service_role' or public.is_gs_admin()) then
        raise exception 'ADMIN_ONLY' using errcode = '42501';
    end if;

    insert into public.parent_player_links (profile_id, athlete_id, relationship, is_primary)
    values (p_profile_id, p_athlete_id, p_relationship, p_is_primary)
    on conflict (profile_id, athlete_id) do update set relationship = excluded.relationship, is_primary = excluded.is_primary
    returning id into link_id;

    update public.profiles
    set player_name = (
        select string_agg(a.display_name, ', ')
        from public.parent_player_links ppl2
        join public.athletes a on a.id = ppl2.athlete_id
        where ppl2.profile_id = p_profile_id
    )
    where id = p_profile_id;

    return link_id;
end;
$function$;

-- Re-assert grants on the three replaced functions (CREATE OR REPLACE keeps
-- existing ACLs, but be explicit so the proof query cannot regress).
revoke execute on function public.assign_document_to_roster(uuid, uuid) from public, anon;
revoke execute on function public.get_sms_eligible_parents(uuid) from public, anon;
revoke execute on function public.link_parent_to_athlete(uuid, uuid, text, boolean) from public, anon;
grant execute on function public.assign_document_to_roster(uuid, uuid) to authenticated, service_role;
grant execute on function public.get_sms_eligible_parents(uuid) to authenticated, service_role;
grant execute on function public.link_parent_to_athlete(uuid, uuid, text, boolean) to authenticated, service_role;

-- ── 5: pin search_path on every definer function that lacks one ──
do $$
declare r record;
begin
  for r in
    select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) args
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
       and (p.proconfig is null or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'))
  loop
    execute format('alter function public.%I(%s) set search_path = public, extensions', r.proname, r.args);
  end loop;
end $$;
