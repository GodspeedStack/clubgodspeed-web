-- v13_07_fall_dues_and_uniform_pricing.sql
-- Fall 2026 clean dues rebuild: $420 per rostered player, fresh ($0 paid).
-- Does NOT delete old rows (dues_payments FK + audit); updates rostered players'
-- enrollments in place and inserts fresh ones for new players. Non-rostered/old
-- enrollments (Kingston, Aydon, Cassius, orphan) are left untouched as history.
-- Also sets the live uniform price to $102.90 (jersey $52.93 + shorts $49.97).
begin;

-- 1. Fall dues config ($420/player)
insert into public.season_dues_config (id, season, program, total_amount, currency, is_active, description, created_at, updated_at)
values ('d0000000-0000-0000-0000-00000f000424','Fall 2026','AAU Fall',420.00,'usd',true,'Fall 2026 season dues, $420 per player.',now(),now())
on conflict (id) do update set total_amount=420.00, is_active=true, season='Fall 2026', program='AAU Fall', updated_at=now();

-- 2. Fall pay-in-full plan template
insert into public.payment_plan_templates (id, dues_config_id, plan_name, num_installments, installment_amount, frequency_days, convenience_fee, sort_order, is_active, created_at)
values ('d0000000-0000-0000-0000-00000f000425','d0000000-0000-0000-0000-00000f000424','Pay in Full',1,420.00,0,0.00,1,true,now())
on conflict (id) do update set installment_amount=420.00, is_active=true, dues_config_id='d0000000-0000-0000-0000-00000f000424';

-- 3. Active rostered players + their real parent (primary link)
create temporary table _fall_roster on commit drop as
select a.id aid,
       coalesce(a.display_name, a.first_name || ' ' || a.last_name) aname,
       (select p.email     from public.parent_player_links l join public.profiles p on p.id=l.profile_id where l.athlete_id=a.id order by l.is_primary desc nulls last limit 1) pemail,
       (select p.full_name from public.parent_player_links l join public.profiles p on p.id=l.profile_id where l.athlete_id=a.id order by l.is_primary desc nulls last limit 1) pname
from public.athletes a
where a.enrollment_status='active'
  and exists (select 1 from public.team_rosters r join public.teams t on t.id=r.team_id and t.uniform_scoped where r.athlete_id=a.id and r.left_at is null);

-- 4. Update existing enrollments for rostered players -> Fall $420 / $0
update public.parent_dues_enrollment e set
  dues_config_id   = 'd0000000-0000-0000-0000-00000f000424',
  plan_template_id = 'd0000000-0000-0000-0000-00000f000425',
  total_owed = 420.00, total_paid = 0, status = 'active',
  parent_email = coalesce(fr.pemail, e.parent_email),
  parent_name  = coalesce(fr.pname, e.parent_name),
  athlete_name = coalesce(e.athlete_name, fr.aname),
  updated_at = now()
from _fall_roster fr where e.athlete_id = fr.aid;

-- 5. Insert Fall enrollments for rostered players that had none
insert into public.parent_dues_enrollment (parent_email, parent_name, athlete_id, athlete_name, dues_config_id, plan_template_id, total_owed, total_paid, status)
select coalesce(fr.pemail, 'unassigned+' || replace(fr.aid::text,'-','') || '@clubgodspeed.com'), fr.pname, fr.aid, fr.aname,
       'd0000000-0000-0000-0000-00000f000424','d0000000-0000-0000-0000-00000f000425',420.00,0,'active'
from _fall_roster fr
where not exists (select 1 from public.parent_dues_enrollment e where e.athlete_id = fr.aid);

-- 6. Uniform price to $102.90 (jersey $52.93 + shorts $49.97)
alter table public.uniform_config add column if not exists jersey_price numeric(10,2);
alter table public.uniform_config add column if not exists shorts_price numeric(10,2);
update public.uniform_config set set_price=102.90, jersey_price=52.93, shorts_price=49.97, updated_at=now() where id=1;

commit;
