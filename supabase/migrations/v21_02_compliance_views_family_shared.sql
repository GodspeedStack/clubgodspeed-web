-- v21_02: admin compliance views apply the family-shared rule. Applied live
-- 2026-09-17 via MCP.
-- parent_compliance_status.agreement_status is now the EFFECTIVE status: a
-- parent's row reads 'signed' when they signed OR a co-guardian on the same
-- athlete signed (unless the document requires each guardian). New columns
-- appended: signed_by_name, signed_by_me, family_covered. Rows for parents no
-- longer linked to the athlete are dropped. document_compliance_summary
-- counts the same effective statuses. Existing columns keep name and order so
-- admin-documents.html needs no change.

create or replace view public.parent_compliance_status as
with base as (
  select ua.*, d.title, d.slug, d.category, d.is_mandatory, d.requires_each_guardian,
         a.display_name, a.enrollment_status,
         fam.signed_at as fam_signed_at, fam.signer_name as fam_signer_name
  from public.user_agreements ua
  join public.documents d on d.id = ua.document_id and d.is_active = true
  join public.athletes a on a.id = ua.athlete_id
  join public.parent_player_links mine on mine.athlete_id = ua.athlete_id and mine.profile_id = ua.parent_user_id
  left join lateral (
    select other.signed_at, coalesce(pr.full_name, pr.email) as signer_name
    from public.user_agreements other
    join public.parent_player_links theirs on theirs.athlete_id = ua.athlete_id and theirs.profile_id = other.parent_user_id
    left join public.profiles pr on pr.id = other.parent_user_id
    where d.requires_each_guardian = false
      and other.athlete_id = ua.athlete_id and other.document_id = ua.document_id
      and other.parent_user_id <> ua.parent_user_id and other.status = 'signed'
    order by other.signed_at asc nulls last limit 1
  ) fam on true
)
select b.parent_user_id,
       b.parent_email,
       b.display_name as athlete_name,
       b.athlete_id,
       b.enrollment_status,
       b.title as document_title,
       b.slug as document_slug,
       b.category as document_category,
       b.is_mandatory,
       case when b.status = 'signed' or b.fam_signed_at is not null then 'signed' else b.status end as agreement_status,
       b.assigned_at, b.first_notified_at, b.last_notified_at, b.notification_count,
       b.first_viewed_at, b.view_count, b.first_downloaded_at, b.download_count,
       coalesce(b.signed_at, b.fam_signed_at) as signed_at,
       case when b.status <> 'signed' and b.fam_signed_at is null then extract(day from now() - b.assigned_at)::integer else null::integer end as days_outstanding,
       case when b.is_mandatory and b.status <> 'signed' and b.fam_signed_at is null and b.enrollment_status = 'active' then true else false end as roster_at_risk,
       case when b.status = 'signed' then (select coalesce(p.full_name, p.email) from public.profiles p where p.id = b.parent_user_id) else b.fam_signer_name end as signed_by_name,
       (b.status = 'signed') as signed_by_me,
       (b.status <> 'signed' and b.fam_signed_at is not null) as family_covered
from base b;

create or replace view public.document_compliance_summary as
select d.id as document_id, d.title, d.slug, d.category, d.season, d.is_mandatory,
       count(c.athlete_id) as total_assigned,
       count(c.athlete_id) filter (where c.agreement_status = 'signed') as total_signed,
       count(c.athlete_id) filter (where c.agreement_status = 'pending') as total_pending,
       count(c.athlete_id) filter (where c.agreement_status = 'notified') as total_notified,
       count(c.athlete_id) filter (where c.agreement_status = 'viewed') as total_viewed,
       count(c.athlete_id) filter (where c.agreement_status = 'downloaded') as total_downloaded,
       case when count(c.athlete_id) = 0 then 0::numeric
            else round(count(c.athlete_id) filter (where c.agreement_status = 'signed')::numeric / count(c.athlete_id)::numeric * 100, 1) end as sign_rate_pct
from public.documents d
left join public.parent_compliance_status c on c.document_slug = d.slug
where d.is_active = true
group by d.id, d.title, d.slug, d.category, d.season, d.is_mandatory;
