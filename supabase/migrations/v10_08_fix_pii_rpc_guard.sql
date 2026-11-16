-- v10_08: fix the staff guard from v10_06. Inside a SECURITY DEFINER function current_user is the
-- owner (postgres), so the v10_06 check let any signed-in parent through. Use the JWT role claim
-- for service_role instead. No SQL-editor escape: nothing scheduled calls these, and it cannot be tested.
begin;

-- 1) get_sms_eligible_parents: staff only (coach/director). service_role and postgres still allowed.
create or replace function public.get_sms_eligible_parents(p_team_id uuid default null)
returns table(profile_id uuid, full_name text, phone text, email text, player_name text)
language plpgsql security definer
set search_path to 'public', 'pg_catalog'
as $$
begin
  if not (public.current_user_is_staff()
          or coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb->>'role' = 'service_role') then
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
  if not (public.current_user_is_staff()
          or coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb->>'role' = 'service_role') then
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

commit;
