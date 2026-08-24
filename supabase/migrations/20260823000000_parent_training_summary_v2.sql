-- 20260823000000: get_my_training_summary() v2  (supersedes 20260818000000; CREATE OR REPLACE, re-run safe)
-- Matches authoritative record private/anton-training-billing.md:
--  * only session_type='individual_workout' counts toward paid packages
--    (excludes the non-billed 2026-12-16 team practice: sessions 13 -> 12)
--  * remaining = CURRENT package hours - hours delivered on/after its
--    purchase_date (prior packages closed; unused hours forfeit) -> 6.00
--  * returns training-billing aggregates (invoices/paid/outstanding/payer/method)
-- SECURITY DEFINER; identity ONLY from caller JWT; scoped to caller's own
-- athletes via athlete_parents -> parent_accounts(email); anon revoked.

CREATE OR REPLACE FUNCTION public.get_my_training_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $FN$
DECLARE
  caller_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  rate_per_hour numeric := 40;
  method_label  text := 'Venmo (@Coachsco)';
  a_ids uuid[];
  payer_name text;
  purchased numeric := 0;
  used_h    numeric := 0;
  sess      int     := 0;
  upcoming  int     := 0;
  cur_pkg_hours numeric := 0;
  cur_pkg_date  date;
  cur_used  numeric := 0;
  remaining numeric := 0;
  invoiced  numeric := 0;
  pkg_count int := 0;
  pkgs      jsonb   := '[]'::jsonb;
  sessions  jsonb   := '[]'::jsonb;
BEGIN
  IF caller_email = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  SELECT array_agg(DISTINCT ap.athlete_id) INTO a_ids
    FROM athlete_parents ap
    JOIN parent_accounts pa ON pa.id = ap.parent_account_id
   WHERE lower(pa.email) = caller_email;

  SELECT trim(coalesce(pa.first_name,'') || ' ' || coalesce(pa.last_name,''))
    INTO payer_name
    FROM parent_accounts pa
   WHERE lower(pa.email) = caller_email
   LIMIT 1;
  IF payer_name IS NULL OR payer_name = '' THEN
    SELECT full_name INTO payer_name FROM profiles WHERE lower(email) = caller_email LIMIT 1;
  END IF;

  IF a_ids IS NOT NULL THEN
    SELECT coalesce(sum(hours_purchased), 0), count(*) INTO purchased, pkg_count
      FROM training_hour_packages WHERE athlete_id = ANY(a_ids);

    SELECT coalesce(sum(coalesce(ts.duration_minutes,0)),0)/60.0, count(*)
      INTO used_h, sess
      FROM training_attendance ta
      JOIN training_sessions ts ON ts.id = ta.session_id
     WHERE ta.athlete_id = ANY(a_ids)
       AND ta.status IN ('present','late')
       AND ts.session_type = 'individual_workout';

    SELECT hours_purchased, purchase_date
      INTO cur_pkg_hours, cur_pkg_date
      FROM training_hour_packages
     WHERE athlete_id = ANY(a_ids)
     ORDER BY purchase_date DESC NULLS LAST
     LIMIT 1;

    IF cur_pkg_date IS NOT NULL THEN
      SELECT coalesce(sum(coalesce(ts.duration_minutes,0)),0)/60.0
        INTO cur_used
        FROM training_attendance ta
        JOIN training_sessions ts ON ts.id = ta.session_id
       WHERE ta.athlete_id = ANY(a_ids)
         AND ta.status IN ('present','late')
         AND ts.session_type = 'individual_workout'
         AND ts.session_date >= cur_pkg_date;
    END IF;
    remaining := greatest(coalesce(cur_pkg_hours,0) - coalesce(cur_used,0), 0);

    SELECT count(*) INTO upcoming
      FROM training_sessions ts
     WHERE ts.session_date >= current_date
       AND ts.session_type = 'individual_workout';

    invoiced := purchased * rate_per_hour;

    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'invoice_no', 'INV-' || lpad((row_number() over (order by p.purchase_date))::text, 3, '0'),
             'purchase_date', p.purchase_date,
             'hours', p.hours_purchased,
             'amount', p.hours_purchased * rate_per_hour,
             'status', 'Paid',
             'method', method_label
           ) ORDER BY p.purchase_date), '[]'::jsonb)
      INTO pkgs
      FROM training_hour_packages p
     WHERE p.athlete_id = ANY(a_ids);

    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'date', ts.session_date,
             'activity', coalesce(nullif(trim(ts.title),''), 'Individual training'),
             'minutes', coalesce(ts.duration_minutes,0)
           ) ORDER BY ts.session_date DESC), '[]'::jsonb)
      INTO sessions
      FROM training_attendance ta
      JOIN training_sessions ts ON ts.id = ta.session_id
     WHERE ta.athlete_id = ANY(a_ids)
       AND ta.status IN ('present','late')
       AND ts.session_type = 'individual_workout';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'athletes', coalesce(array_length(a_ids,1),0),
    'hours_purchased', round(purchased,2),
    'hours_used', round(used_h,2),
    'hours_remaining', round(remaining,2),
    'sessions_completed', sess,
    'upcoming_sessions', upcoming,
    'current_package', jsonb_build_object(
      'ordinal', pkg_count,
      'total_packages', pkg_count,
      'total_hours', round(coalesce(cur_pkg_hours,0),2),
      'delivered', round(coalesce(cur_used,0),2),
      'remaining', round(remaining,2),
      'purchase_date', cur_pkg_date
    ),
    'billing', jsonb_build_object(
      'total_invoiced', round(invoiced,2),
      'total_paid', round(invoiced,2),
      'outstanding', 0,
      'payer', coalesce(payer_name,''),
      'method', method_label,
      'invoices', pkgs
    ),
    'packages', pkgs,
    'sessions', sessions
  );
END;
$FN$;

REVOKE ALL ON FUNCTION public.get_my_training_summary() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_training_summary() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_training_summary() TO authenticated;
