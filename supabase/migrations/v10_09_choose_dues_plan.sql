-- v10_09: parent portal billing runs on the active season enrollment.
-- choose_dues_plan(): a parent picks one of the season's payment_plan_templates for their own
-- athlete; the server writes the dues_installments schedule (amounts and dates are never
-- trusted from the browser). Also deactivates the stale Summer 2026 templates and marks
-- leftover pending installments paid on enrollments that are already paid in full.
begin;

create or replace function public.choose_dues_plan(p_enrollment_id uuid, p_template_id uuid)
returns jsonb
language plpgsql security definer
set search_path to 'public', 'pg_catalog'
as $$
declare
  v_uid uuid := auth.uid();
  enr public.parent_dues_enrollment%rowtype;
  tpl public.payment_plan_templates%rowtype;
  cfg public.season_dues_config%rowtype;
  v_owns boolean;
  v_existing int;
  v_first date;
  v_sum numeric(10,2) := 0;
  v_amt numeric(10,2);
  i int;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;

  select * into enr from public.parent_dues_enrollment where id = p_enrollment_id;
  if not found then raise exception 'NO_ENROLLMENT'; end if;

  select exists (select 1 from public.parent_player_links l where l.profile_id = v_uid and l.athlete_id = enr.athlete_id)
    into v_owns;
  if not v_owns and not public.current_user_is_staff() then raise exception 'NOT_YOUR_ENROLLMENT'; end if;

  select * into cfg from public.season_dues_config where id = enr.dues_config_id;
  if not found or not cfg.is_active then raise exception 'SEASON_NOT_ACTIVE'; end if;
  if enr.status not in ('active','past_due') then raise exception 'ENROLLMENT_NOT_OPEN'; end if;

  select * into tpl from public.payment_plan_templates where id = p_template_id;
  if not found or not tpl.is_active or tpl.dues_config_id <> enr.dues_config_id then raise exception 'BAD_TEMPLATE'; end if;

  select count(*) into v_existing from public.dues_installments where enrollment_id = enr.id;
  if v_existing > 0 then raise exception 'PLAN_ALREADY_SET'; end if;

  -- First due date: the 15th of the season's first month, or the next 15th at least a week out.
  v_first := make_date(extract(year from cfg.starts_on)::int, extract(month from cfg.starts_on)::int, 15);
  if current_date >= v_first - 7 then
    v_first := (date_trunc('month', current_date) + interval '1 month')::date + 14;
    if extract(day from current_date) < 8 then
      v_first := date_trunc('month', current_date)::date + 14;
    end if;
  end if;

  for i in 1..tpl.num_installments loop
    if i < tpl.num_installments then
      v_amt := tpl.installment_amount;
    else
      v_amt := round(enr.total_owed - v_sum, 2);   -- last one absorbs rounding (3 x 298.33 -> 298.34)
    end if;
    v_sum := v_sum + v_amt;
    insert into public.dues_installments (enrollment_id, installment_number, amount, due_date, status)
    values (enr.id, i, v_amt, (v_first + ((i - 1) * interval '1 month'))::date, 'pending');
  end loop;

  update public.parent_dues_enrollment set plan_template_id = tpl.id where id = enr.id;

  return jsonb_build_object('enrollment_id', enr.id, 'plan', tpl.plan_name, 'installments', tpl.num_installments, 'first_due', v_first);
end;
$$;

revoke execute on function public.choose_dues_plan(uuid, uuid) from public, anon;
grant execute on function public.choose_dues_plan(uuid, uuid) to authenticated, service_role;

-- Stale Summer 2026 templates still showed to parents through the is_active RLS policy.
update public.payment_plan_templates t
   set is_active = false
  from public.season_dues_config c
 where c.id = t.dues_config_id and c.is_active = false and t.is_active;

-- Paid-in-full enrollments with a leftover pending installment (Anton's Fall #4, $52.90).
update public.dues_installments i
   set status = 'paid', paid_at = coalesce(i.paid_at, now())
  from public.parent_dues_enrollment e
 where e.id = i.enrollment_id and e.status = 'paid_in_full' and e.total_paid >= e.total_owed
   and i.status = 'pending';

commit;
