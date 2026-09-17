-- v21_01: one source of truth for "who still has to sign". Applied live
-- 2026-09-17 via MCP.
--
-- Bug: document-reminder-cron read user_agreements row by row, so when one
-- parent signed, every other guardian of the same athlete kept getting
-- reminders even though the portal (get_my_documents) already showed the
-- document as done for the family. Seen 2026-09-17 morning send: 24 of 49
-- emails went to parents whose family had already signed.
--
-- Contract
--   public.reminder_candidates() -> setof rows the reminder job may email.
--     A row is included only when ALL of these hold:
--       - agreement status <> 'signed'
--       - document is active and mandatory
--       - athlete enrollment_status = 'active'
--       - the parent is still linked to that athlete (parent_player_links)
--       - NOT family-covered: no other linked guardian of the same athlete has
--         a signed row for the same document, unless the document has
--         requires_each_guardian = true (Medical Consent). Same rule as
--         get_my_documents().
--   Service role only. Never exposed to anon or authenticated.
--   public.agreement_is_family_covered(agreement_id) -> boolean, the rule
--     itself, reusable by admin views.

create or replace function public.agreement_is_family_covered(p_agreement_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists (
    select 1
    from public.user_agreements ua
    join public.documents d on d.id = ua.document_id
    join public.user_agreements other
      on other.athlete_id = ua.athlete_id
     and other.document_id = ua.document_id
     and other.parent_user_id <> ua.parent_user_id
     and other.status = 'signed'
    join public.parent_player_links theirs
      on theirs.athlete_id = ua.athlete_id and theirs.profile_id = other.parent_user_id
    where ua.id = p_agreement_id
      and d.requires_each_guardian = false
  );
$$;
revoke all on function public.agreement_is_family_covered(uuid) from public, anon, authenticated;

create or replace function public.reminder_candidates()
returns table (
  id uuid,
  parent_user_id uuid,
  parent_email text,
  athlete_id uuid,
  status text,
  assigned_at timestamptz,
  notification_count integer,
  last_notified_at timestamptz,
  document_id uuid,
  document_title text,
  document_slug text,
  requires_each_guardian boolean,
  athlete_name text
)
language sql
stable
security definer
set search_path to ''
as $$
  select ua.id, ua.parent_user_id, ua.parent_email, ua.athlete_id, ua.status,
         ua.assigned_at, ua.notification_count, ua.last_notified_at,
         d.id, d.title, d.slug, d.requires_each_guardian,
         coalesce(nullif(a.display_name, ''), a.first_name || ' ' || coalesce(a.last_name, ''))
  from public.user_agreements ua
  join public.documents d on d.id = ua.document_id
  join public.athletes a on a.id = ua.athlete_id
  where ua.status <> 'signed'
    and d.is_active and d.is_mandatory
    and a.enrollment_status = 'active'
    and exists (select 1 from public.parent_player_links l
                 where l.profile_id = ua.parent_user_id and l.athlete_id = ua.athlete_id)
    and not public.agreement_is_family_covered(ua.id)
  order by ua.parent_email, a.first_name, d.title;
$$;
revoke all on function public.reminder_candidates() from public, anon, authenticated;
