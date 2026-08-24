-- v13_06_compliance_seed.sql
-- Stands up the parent document-signing compliance system that never existed.
-- Seeds the 5 documents (content from the portal's DOCUMENT_TEMPLATE) + a current
-- version each, and adds get_my_documents() which auto-assigns each mandatory doc
-- to every linked parent x athlete and returns real agreements (with content) to
-- sign. Signing goes through the existing record_document_signature RPC, gated on
-- its result. Idempotent (no unique-constraint assumptions).
begin;

-- 1. Documents
insert into public.documents (id,title,slug,category,season,requires_signature,signature_type,is_mandatory,is_active,published_at,description)
select v.id, v.title, v.slug, v.category, v.season, true, 'typed_name', true, true, now(), v.descr
from (values
 ('d0000000-0000-0000-0000-000000000001'::uuid,'Athletic Liability Waiver','athletic','waiver','2025-2026','Assumption of risk and liability release.'),
 ('d0000000-0000-0000-0000-000000000002'::uuid,'Medical Consent','medical','medical_release','2025-2026','Emergency medical treatment authorization.'),
 ('d0000000-0000-0000-0000-000000000003'::uuid,'Practice & Training Consent','practice','consent_form','2025-2026','Consent to participate in training.'),
 ('d0000000-0000-0000-0000-000000000004'::uuid,'Parental Code of Conduct','conduct','code_of_conduct','2025-2026','Sideline conduct policy.'),
 ('d0000000-0000-0000-0000-000000000005'::uuid,'Social Media Release','media','other','2025-2026','Photo and video usage permission.')
) v(id,title,slug,category,season,descr)
where not exists (select 1 from public.documents d where d.slug = v.slug);

-- 2. Current version per document (content_html carries {parent_name}/{child_name} placeholders)
insert into public.document_versions (document_id, version_number, content_html, content_hash, is_current, published_at)
select d.id, 1, v.html, md5(v.html), true, now()
from (values
 ('athletic', $H$<h3>Athletic Liability Release</h3>
<p>I, <strong>{parent_name}</strong>, legal guardian of <strong>{child_name}</strong>, acknowledge that basketball is a contact sport involving inherent risks. I voluntarily assume all risks, including but not limited to sprains, fractures, concussions, and serious injury.</p>
<p>I release Godspeed Basketball, its coaches, and facilities from any liability regarding injuries sustained by {child_name} during practice, games, or travel.</p>
<p><strong>Acknowledgment:</strong> By signing below, I waive my right to sue for negligence.</p>$H$),
 ('medical', $H$<h3>Medical Consent Form</h3>
<p>In the event of an emergency where I, <strong>{parent_name}</strong>, cannot be reached, I authorize Godspeed Basketball staff to obtain medical treatment for <strong>{child_name}</strong>.</p>
<p>I agree to cover all costs associated with emergency transport and treatment.</p>
<p><strong>Medical Conditions:</strong> I certify {child_name} is physically fit to participate.</p>$H$),
 ('practice', $H$<h3>Practice &amp; Training Consent</h3>
<p>Godspeed Training is high-intensity. Sessions may involve heavy exertion, plyometrics, and physical contact.</p>
<p>I, <strong>{parent_name}</strong>, give full consent for <strong>{child_name}</strong> to participate in all training drills as designed by the coaching staff.</p>
<p>I understand it is my child's responsibility to hydrate and rest properly.</p>$H$),
 ('conduct', $H$<h3>Parental Code of Conduct</h3>
<p><strong>Strict Policy: No Coaching from the Sidelines.</strong></p>
<p>To ensure athlete focus and development, parents must refrain from shouting instructions during games, practices, and training sessions.</p>
<p><strong>Consequences:</strong> I, <strong>{parent_name}</strong>, understand that violating this policy undermines the coaching staff and <strong>will affect {child_name}'s playing time</strong>. Repeated offenses may result in removal from the program.</p>
<p>We are a family. We support, we cheer, but we let the players play and the coaches coach.</p>$H$),
 ('media', $H$<h3>Social Media Release</h3>
<p>I, <strong>{parent_name}</strong>, grant permission for Club Godspeed to use photos and videos of <strong>{child_name}</strong> for social media and marketing.</p>
<p>I understand these may be posted on Instagram, YouTube, and the website.</p>
<p>My child's name will not be sold to third parties.</p>$H$)
) v(slug,html)
join public.documents d on d.slug = v.slug
where not exists (select 1 from public.document_versions dv where dv.document_id = d.id);

-- 3. Reader RPC: auto-assign mandatory docs to this parent's athletes, return real agreements + content.
create or replace function public.get_my_documents()
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare uid uuid := auth.uid(); result jsonb;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED' using errcode='28000'; end if;

  insert into public.user_agreements (parent_user_id, parent_email, athlete_id, document_id, version_id, status)
  select uid,
         (select email from public.profiles where id = uid),
         l.athlete_id, d.id,
         (select dv.id from public.document_versions dv where dv.document_id = d.id and dv.is_current order by dv.version_number desc limit 1),
         'pending'
  from public.parent_player_links l
  cross join public.documents d
  where l.profile_id = uid and d.is_active and d.is_mandatory
    and not exists (
      select 1 from public.user_agreements ua
       where ua.parent_user_id = uid and ua.athlete_id = l.athlete_id and ua.document_id = d.id
    );

  select jsonb_agg(x) into result from (
    select jsonb_build_object(
      'agreement_id', ua.id,
      'slug', d.slug,
      'title', d.title,
      'status', ua.status,
      'signed_at', ua.signed_at,
      'athlete_id', ua.athlete_id,
      'athlete_name', coalesce(a.display_name, a.first_name || ' ' || a.last_name),
      'parent_name', (select full_name from public.profiles where id = uid),
      'content_html', (select dv.content_html from public.document_versions dv
                        where dv.document_id = d.id and dv.is_current
                        order by dv.version_number desc limit 1)
    ) as x
    from public.user_agreements ua
    join public.documents d on d.id = ua.document_id and d.is_active
    join public.athletes a on a.id = ua.athlete_id
    where ua.parent_user_id = uid
    order by d.title, a.first_name
  ) sub;

  return coalesce(result, '[]'::jsonb);
end;
$fn$;

grant execute on function public.get_my_documents() to authenticated;
commit;
