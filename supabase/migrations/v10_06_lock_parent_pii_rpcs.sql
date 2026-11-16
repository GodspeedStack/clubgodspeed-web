-- v10_06: lock down RPCs that returned parent PII (email/phone) to anon and to any signed-in parent.
-- Confirmed 2026-11-11: as role anon, get_sms_eligible_parents() returned 16 parents (name, phone, email,
-- player) and parents_needing_document_reminder() returned 17 parent emails. send_broadcast() was also
-- callable by anon with no role check.
-- Paste into the Supabase SQL editor. Never run `supabase db push`.

begin;

-- 1) get_sms_eligible_parents: staff only (coach/director). service_role and postgres still allowed.
create or replace function public.get_sms_eligible_parents(p_team_id uuid default null)
returns table(profile_id uuid, full_name text, phone text, email text, player_name text)
language plpgsql security definer
set search_path to 'public', 'pg_catalog'
as $$
begin
  if not (public.current_user_is_staff() or current_user in ('postgres','service_role')) then
    raise exception 'ADMIN_ONLY';
  end if;
  return query
  select distinct on (p.id)
    p.id, p.full_name, p.phone, p.email,
    a.first_name || ' ' || a.last_name
  from profiles p
  join parent_player_links ppl on ppl.profile_id = p.id
  join athletes a on a.id = ppl.athlete_id
  left join team_rosters tr on tr.athlete_id = a.id
  where p.role = 'parent' and p.approved = true
    and p.phone is not null and p.phone <> ''
    and (p_team_id is null or tr.team_id = p_team_id)
  order by p.id, ppl.is_primary desc nulls last;
end;
$$;

-- 2) parents_needing_document_reminder: same guard (the reminder edge function runs as service_role).
create or replace function public.parents_needing_document_reminder(p_max_reminders integer default 2)
returns table(parent_user_id uuid, parent_email text, athlete_names text, pending_docs integer,
              doc_titles text, reminders_already_sent integer, next_type text)
language plpgsql stable security definer
set search_path to 'public', 'pg_catalog'
as $$
begin
  if not (public.current_user_is_staff() or current_user in ('postgres','service_role')) then
    raise exception 'ADMIN_ONLY';
  end if;
  return query
  with pending as (
    select ua.parent_user_id, ua.parent_email,
           string_agg(distinct a.display_name, ', ' order by a.display_name) as athlete_names,
           count(*)::int as pending_docs,
           string_agg(distinct d.title, ', ' order by d.title) as doc_titles
    from public.user_agreements ua
    join public.documents d on d.id = ua.document_id
    left join public.athletes a on a.id = ua.athlete_id
    where ua.signed_at is null and d.is_active and d.is_mandatory
      and not exists (
        select 1
        from public.user_agreements other
        join public.parent_player_links theirs
          on theirs.athlete_id = ua.athlete_id
         and theirs.profile_id = other.parent_user_id
        where d.requires_each_guardian = false
          and other.athlete_id = ua.athlete_id
          and other.document_id = ua.document_id
          and other.parent_user_id <> ua.parent_user_id
          and other.signed_at is not null
      )
    group by ua.parent_user_id, ua.parent_email
  ),
  sent as (
    select lower(recipient_email) as email, count(*)::int as n
    from public.document_notification_log
    where notification_type in ('initial','reminder')
    group by lower(recipient_email)
  )
  select p.parent_user_id, p.parent_email, p.athlete_names, p.pending_docs, p.doc_titles,
         coalesce(s.n,0),
         case when coalesce(s.n,0) = 0 then 'initial' else 'reminder' end
  from pending p left join sent s on s.email = lower(p.parent_email)
  where coalesce(s.n,0) < p_max_reminders
  order by p.parent_email;
end;
$$;

-- 3) send_broadcast: staff only.
create or replace function public.send_broadcast(p_subject text, p_body text, p_audience text default 'all_parents',
                                                 p_team_id uuid default null, p_channel text default 'email')
returns uuid language plpgsql security definer
set search_path to 'public', 'pg_catalog'
as $$
declare v_message_id uuid; v_count int := 0;
begin
  if not public.current_user_is_staff() then
    raise exception 'ADMIN_ONLY';
  end if;
  insert into public.broadcast_messages (sender_id, subject, body, channel, audience, team_id, status)
  values (auth.uid(), p_subject, p_body, p_channel, p_audience, p_team_id, 'sending')
  returning id into v_message_id;

  if p_audience = 'all_parents' then
    insert into public.broadcast_recipients (message_id, user_id, email)
    select v_message_id, p.id, p.email from public.profiles p where p.role = 'parent' and p.email is not null;
  elsif p_audience = 'team' and p_team_id is not null then
    insert into public.broadcast_recipients (message_id, user_id, email)
    select distinct v_message_id, p.id, p.email from public.profiles p
    join public.parent_accounts pa on pa.user_id = p.id
    join public.athletes a on a.parent_account_id = pa.id
    join public.team_rosters tr on tr.athlete_id = a.id and tr.team_id = p_team_id
    where p.email is not null;
  end if;

  get diagnostics v_count = row_count;
  update public.broadcast_messages set recipient_count = v_count where id = v_message_id;
  return v_message_id;
end;
$$;

-- 4) Anon (not signed in) has no business calling any of these. authenticated keeps its explicit grant;
--    the in-function guards above and the existing is_program_admin()/ADMIN_ONLY checks handle parents.
revoke execute on function public.get_sms_eligible_parents(uuid)                               from anon, public;
revoke execute on function public.parents_needing_document_reminder(integer)                   from anon, public;
revoke execute on function public.parents_without_athlete()                                    from anon, public;
revoke execute on function public.list_guardian_requests()                                     from anon, public;
revoke execute on function public.list_coach_activity(integer)                                 from anon, public;
revoke execute on function public.parent_portal_health()                                       from anon, public;
revoke execute on function public.reverse_payment(uuid, uuid, text, numeric)                   from anon, public;
revoke execute on function public.send_broadcast(text, text, text, uuid, text)                 from anon, public;
revoke execute on function public.assign_document_to_roster(uuid, uuid)                        from anon, public;

commit;
