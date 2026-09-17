-- v22_01: "Connect your player" capture, on top of SPEC-multi-guardian-access.
--
-- Decisions (Scott, 2026-09-17): a parent types first name, last name, grade,
-- team and relationship; never sees the roster; the director alone approves.
--
-- Contract
--   guardian_requests gains requested_player_first/last and requested_team.
--     requested_player_name stays as "first last" for older readers.
--   submit_player_connection(first, last, grade, team, relationship) -> jsonb
--     Caller: any approved parent with no link. Upserts their one pending
--     request (a second submit edits it, never duplicates). Barred emails are
--     accepted silently and never surfaced to the director as approvable.
--     Returns get_my_connection().
--   get_my_connection() -> jsonb
--     { linked: bool, athletes: [display_name], pending: {first,last,grade,
--       team,relationship,created_at} | null }
--   list_guardian_requests() -> jsonb (director only)
--     Pending requests with requester name/email, what they typed, and up to
--     five ranked roster candidates, each with its current guardians (name and
--     relationship only). Barred requests are excluded.
--   auto_link_parent_athlete(): when it files a request from signup it now
--     copies player_first_name, player_last_name, team and relationship from
--     the signup metadata so the director sees structured data.

alter table public.guardian_requests
  add column if not exists requested_player_first text,
  add column if not exists requested_player_last  text,
  add column if not exists requested_team         text;

-- ── Parent side ────────────────────────────────────────────────────────────
create or replace function public.get_my_connection()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare v_uid uuid := auth.uid(); v_pending jsonb; v_athletes jsonb;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED' using errcode = '28000'; end if;
  select jsonb_agg(coalesce(nullif(a.display_name, ''), a.first_name) order by a.first_name) into v_athletes
  from public.parent_player_links l join public.athletes a on a.id = l.athlete_id
  where l.profile_id = v_uid;
  select jsonb_build_object(
           'first', r.requested_player_first, 'last', r.requested_player_last,
           'grade', r.requested_grade, 'team', r.requested_team,
           'relationship', r.relationship, 'created_at', r.created_at)
    into v_pending
  from public.guardian_requests r
  where r.requested_by = v_uid and r.status = 'pending'
  order by r.created_at desc limit 1;
  return jsonb_build_object(
    'linked', coalesce(jsonb_array_length(v_athletes), 0) > 0,
    'athletes', coalesce(v_athletes, '[]'::jsonb),
    'pending', v_pending);
end $$;
grant execute on function public.get_my_connection() to authenticated;

create or replace function public.submit_player_connection(
  p_first text, p_last text, p_grade text, p_team text, p_relationship text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare v_uid uuid := auth.uid(); v_prof public.profiles%rowtype; v_id uuid;
        v_first text := left(btrim(coalesce(p_first, '')), 60);
        v_last  text := left(btrim(coalesce(p_last, '')), 60);
        v_grade text := left(btrim(coalesce(p_grade, '')), 12);
        v_team  text := left(btrim(coalesce(p_team, '')), 80);
        v_rel   text := lower(left(btrim(coalesce(p_relationship, 'guardian')), 20));
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED' using errcode = '28000'; end if;
  select * into v_prof from public.profiles where id = v_uid;
  if not found or v_prof.role <> 'parent' then raise exception 'PARENTS_ONLY'; end if;
  if v_first = '' then raise exception 'FIRST_NAME_REQUIRED'; end if;
  if v_rel not in ('mother','father','guardian','stepparent','other') then v_rel := 'guardian'; end if;
  if exists (select 1 from public.parent_player_links where profile_id = v_uid) then
    return public.get_my_connection();
  end if;

  select id into v_id from public.guardian_requests
   where requested_by = v_uid and status = 'pending' order by created_at desc limit 1;

  if v_id is null then
    insert into public.guardian_requests
      (requested_player_name, requested_player_first, requested_player_last, requested_grade, requested_team,
       requested_by, invitee_email, invitee_name, relationship, source)
    values (btrim(v_first || ' ' || v_last), v_first, nullif(v_last, ''), nullif(v_grade, ''), nullif(v_team, ''),
            v_uid, lower(v_prof.email), v_prof.full_name, v_rel, 'connect')
    returning id into v_id;
    insert into public.guardian_link_log (actor_profile_id, subject_profile_id, action, detail)
    values (v_uid, v_uid, 'requested', 'connect your player: ' || btrim(v_first || ' ' || v_last));
  else
    update public.guardian_requests
       set requested_player_name = btrim(v_first || ' ' || v_last),
           requested_player_first = v_first, requested_player_last = nullif(v_last, ''),
           requested_grade = nullif(v_grade, ''), requested_team = nullif(v_team, ''),
           relationship = v_rel
     where id = v_id;
  end if;

  update public.profiles set player_name = coalesce(player_name, btrim(v_first || ' ' || v_last)) where id = v_uid;
  return public.get_my_connection();
end $$;
grant execute on function public.submit_player_connection(text, text, text, text, text) to authenticated;

-- ── Director side ──────────────────────────────────────────────────────────
create or replace function public.list_guardian_requests()
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce(jsonb_agg(row_json order by created_at asc), '[]'::jsonb)
  from (
    select r.created_at,
      jsonb_build_object(
        'id', r.id,
        'created_at', r.created_at,
        'source', r.source,
        'requester_name', coalesce(p.full_name, r.invitee_name),
        'requester_email', coalesce(p.email, r.invitee_email),
        'relationship', r.relationship,
        'player_first', coalesce(r.requested_player_first, split_part(coalesce(r.requested_player_name, ''), ' ', 1)),
        'player_last', coalesce(r.requested_player_last, nullif(regexp_replace(coalesce(r.requested_player_name, ''), '^\S+\s*', ''), '')),
        'grade', r.requested_grade,
        'team', r.requested_team,
        'candidates', (
          select coalesce(jsonb_agg(c order by c.score desc, c.display_name), '[]'::jsonb)
          from (
            select a.id, coalesce(nullif(a.display_name, ''), a.first_name) as display_name, a.grade,
              ( (lower(btrim(a.first_name)) = lower(split_part(coalesce(r.requested_player_first, r.requested_player_name, ''), ' ', 1)))::int * 10
              + (coalesce(r.requested_player_last, '') <> '' and coalesce(a.last_name, '') <> ''
                 and (lower(btrim(a.last_name)) = lower(r.requested_player_last)
                      or lower(btrim(a.last_name)) = left(lower(r.requested_player_last), 1)
                      or lower(r.requested_player_last) like lower(btrim(a.last_name)) || '%'))::int * 3
              + (regexp_replace(coalesce(a.grade, ''), '\D', '', 'g') <> ''
                 and regexp_replace(coalesce(a.grade, ''), '\D', '', 'g') = regexp_replace(coalesce(r.requested_grade, ''), '\D', '', 'g'))::int * 2
              + (lower(btrim(a.first_name)) like lower(left(split_part(coalesce(r.requested_player_first, r.requested_player_name, ''), ' ', 1), 3)) || '%')::int
              ) as score,
              (select coalesce(jsonb_agg(jsonb_build_object('name', coalesce(gp.full_name, 'Parent'), 'relationship', gl.relationship, 'level', gl.access_level)), '[]'::jsonb)
                 from public.parent_player_links gl join public.profiles gp on gp.id = gl.profile_id where gl.athlete_id = a.id) as guardians
            from public.athletes a
            where a.enrollment_status = 'active'
          ) c
          where c.score > 0
          limit 5
        )
      ) as row_json
    from public.guardian_requests r
    left join public.profiles p on p.id = r.requested_by
    where public.is_program_admin()
      and r.status = 'pending'
      and not exists (select 1 from public.guardian_bars b where lower(b.email) = lower(coalesce(p.email, r.invitee_email)))
  ) x;
$$;
grant execute on function public.list_guardian_requests() to authenticated;

-- ── Signup path: carry structured fields into the review queue ─────────────
create or replace function public.auto_link_parent_athlete(p_profile_id uuid)
returns text
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_prof    public.profiles%rowtype;
  v_meta    jsonb;
  v_name    text;
  v_grade   text;
  v_inv     public.athlete_guardian_invites%rowtype;
  v_primary boolean;
begin
  select * into v_prof from public.profiles where id = p_profile_id;
  if not found or v_prof.role <> 'parent' then return 'not_parent'; end if;
  if exists (select 1 from public.parent_player_links where profile_id = p_profile_id) then
    return 'already_linked';
  end if;

  select * into v_inv
  from public.athlete_guardian_invites i
  where lower(i.email) = lower(v_prof.email)
    and i.revoked_at is null
    and i.claimed_at is null
    and not exists (select 1 from public.guardian_bars b
                     where b.athlete_id = i.athlete_id
                       and lower(b.email) = lower(v_prof.email))
  order by i.created_at asc
  limit 1;

  if found then
    v_primary := not exists (select 1 from public.parent_player_links
                              where athlete_id = v_inv.athlete_id);
    insert into public.parent_player_links (profile_id, athlete_id, relationship, is_primary, access_level)
    values (p_profile_id, v_inv.athlete_id, 'guardian', v_primary, v_inv.access_level)
    on conflict (profile_id, athlete_id) do nothing;

    update public.athlete_guardian_invites
       set claimed_by = p_profile_id, claimed_at = now()
     where id = v_inv.id;

    insert into public.guardian_link_log (athlete_id, actor_profile_id, subject_profile_id, action, detail)
    values (v_inv.athlete_id, p_profile_id, p_profile_id, 'linked', 'pre-authorised invite claimed at signup');

    return 'linked';
  end if;

  -- One pending request per person. A repeat approval or profile edit must
  -- not file a second copy.
  if exists (select 1 from public.guardian_requests where requested_by = p_profile_id and status = 'pending') then
    return 'pending_review';
  end if;

  select coalesce(u.raw_user_meta_data, '{}'::jsonb) into v_meta from auth.users u where u.id = p_profile_id;

  v_name  := nullif(btrim(v_prof.player_name), '');
  v_grade := v_prof.grade;
  if v_name is null then
    select nullif(btrim(r.player_name), ''), coalesce(v_grade, r.grade)
      into v_name, v_grade
    from public.login_requests r
    where r.user_id = p_profile_id or lower(r.email) = lower(v_prof.email)
    order by r.created_at desc limit 1;
  end if;

  insert into public.guardian_requests
    (requested_player_name, requested_player_first, requested_player_last, requested_grade, requested_team,
     requested_by, invitee_email, invitee_name, relationship, source)
  values
    (v_name,
     coalesce(nullif(btrim(v_meta->>'player_first_name'), ''), split_part(coalesce(v_name, ''), ' ', 1)),
     coalesce(nullif(btrim(v_meta->>'player_last_name'), ''), nullif(regexp_replace(coalesce(v_name, ''), '^\S+\s*', ''), '')),
     coalesce(nullif(btrim(v_meta->>'grade'), ''), v_grade),
     nullif(btrim(v_meta->>'team'), ''),
     p_profile_id, lower(v_prof.email), v_prof.full_name,
     case when lower(coalesce(v_meta->>'relationship', '')) in ('mother','father','guardian','stepparent','other')
          then lower(v_meta->>'relationship') else 'guardian' end,
     'signup');

  insert into public.guardian_link_log (actor_profile_id, subject_profile_id, action, detail)
  values (p_profile_id, p_profile_id, 'requested', 'signup did not match a pre-authorised invite');

  return 'pending_review';
end $$;
