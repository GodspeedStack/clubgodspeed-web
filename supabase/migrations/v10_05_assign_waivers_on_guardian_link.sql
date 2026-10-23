-- v10_05_assign_waivers_on_guardian_link.sql
-- Every mandatory document is assigned the moment a guardian is linked to an athlete.
--
-- Why: assign_document_to_roster() walks the legacy athletes.parent_account_id ->
-- parent_accounts path and silently skips every family linked through
-- parent_player_links (the modern path, and the only path new signups use). So a
-- parent could register, link, and see NO waivers. Eddie Butler hit this on
-- 2026-10-23; two more linked families (Sylvester, Kylan Womack) were found with
-- 5 of 6 mandatory documents never assigned. Liability exposure, fixed here.
--
-- Three parts:
--   1. assign_mandatory_documents_for_link(profile, athlete) -- idempotent, logs events
--   2. trigger on parent_player_links INSERT that calls it
--   3. one-shot backfill over every existing link
--
-- assign_document_to_roster() is ALSO rewritten to cover both identity paths, so a
-- newly published document reaches modern-linked families too.

begin;

-- 1 ------------------------------------------------------------------------
create or replace function public.assign_mandatory_documents_for_link(
  p_profile_id uuid, p_athlete_id uuid, p_actor uuid default null)
returns integer
language plpgsql security definer set search_path to 'public' as $$
declare v_email text; v_team text; v_count int := 0;
begin
  select email into v_email from public.profiles where id = p_profile_id;
  if v_email is null then return 0; end if;
  select team_name into v_team from public.athletes where id = p_athlete_id;

  with ins as (
    insert into public.user_agreements
      (parent_user_id, parent_email, athlete_id, document_id, version_id, assigned_by)
    select p_profile_id, v_email, p_athlete_id, d.id,
           (select v.id from public.document_versions v
             where v.document_id = d.id order by v.created_at desc limit 1),
           p_actor
    from public.documents d
    where d.is_active and d.is_mandatory
      and (d.applies_to = 'all_active'
           or (d.applies_to = 'aau_only'      and coalesce(v_team,'') ilike '%aau%')
           or (d.applies_to = 'training_only' and coalesce(v_team,'') ilike '%training%'))
    on conflict (parent_user_id, athlete_id, document_id) do nothing
    returning id, document_id
  ),
  ev as (
    insert into public.document_events (agreement_id, event_type, actor_id, actor_type, event_metadata)
    select ins.id, 'assigned', p_actor,
           case when p_actor is null then 'system' else 'admin' end,
           jsonb_build_object('document_title', d.title, 'season', d.season,
                              'reason', 'guardian linked to athlete')
    from ins join public.documents d on d.id = ins.document_id
    returning 1
  )
  select count(*) into v_count from ins;
  return v_count;
end $$;

revoke all on function public.assign_mandatory_documents_for_link(uuid, uuid, uuid) from public, anon;

-- 2 ------------------------------------------------------------------------
create or replace function public.trg_assign_documents_on_link()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  perform public.assign_mandatory_documents_for_link(NEW.profile_id, NEW.athlete_id, auth.uid());
  return NEW;
end $$;

drop trigger if exists trg_assign_documents_on_link on public.parent_player_links;
create trigger trg_assign_documents_on_link
  after insert on public.parent_player_links
  for each row execute function public.trg_assign_documents_on_link();

-- 3 ------------------------------------------------------------------------
-- Backfill every existing link. Idempotent: pairs that already have everything add 0.
do $$
declare r record; n int; total int := 0;
begin
  for r in select profile_id, athlete_id from public.parent_player_links loop
    n := public.assign_mandatory_documents_for_link(r.profile_id, r.athlete_id, null);
    total := total + n;
  end loop;
  raise notice 'backfill assigned % mandatory documents', total;
end $$;

-- assign_document_to_roster: cover BOTH identity paths -------------------------
create or replace function public.assign_document_to_roster(p_document_id uuid, p_assigned_by uuid default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_doc public.documents%rowtype; v_count integer := 0;
begin
  select * into v_doc from public.documents where id = p_document_id;
  if not found then return jsonb_build_object('error', 'Document not found'); end if;

  with pairs as (
    -- modern path
    select l.profile_id as parent_user_id, p.email as parent_email, l.athlete_id
    from public.parent_player_links l
    join public.profiles p on p.id = l.profile_id
    union
    -- legacy path
    select pa.user_id, pa.email, a.id
    from public.athletes a join public.parent_accounts pa on pa.id = a.parent_account_id
    where pa.user_id is not null
  ),
  ins as (
    insert into public.user_agreements (parent_user_id, parent_email, athlete_id, document_id, version_id, assigned_by)
    select pr.parent_user_id, pr.parent_email, pr.athlete_id, p_document_id,
           (select v.id from public.document_versions v where v.document_id = p_document_id order by v.created_at desc limit 1),
           p_assigned_by
    from pairs pr join public.athletes a on a.id = pr.athlete_id
    where a.enrollment_status = 'active'
      and (v_doc.applies_to = 'all_active'
           or (v_doc.applies_to = 'aau_only'      and a.team_name ilike '%aau%')
           or (v_doc.applies_to = 'training_only' and a.team_name ilike '%training%'))
    on conflict (parent_user_id, athlete_id, document_id) do nothing
    returning id
  ),
  ev as (
    insert into public.document_events (agreement_id, event_type, actor_id, actor_type, event_metadata)
    select ins.id, 'assigned', p_assigned_by, 'admin',
           jsonb_build_object('document_title', v_doc.title, 'season', v_doc.season)
    from ins returning 1
  )
  select count(*) into v_count from ins;

  return jsonb_build_object('success', true, 'assigned_count', v_count);
end $$;

commit;
