-- v13_01: Scalable "mark family / team fully paid" RPCs
-- ---------------------------------------------------------------------------
-- WHY: Admin currently settles dues one installment at a time (markInstallmentPaid /
--      markPaymentConfirmed in admin-os.js). At 3+ teams x 10+ players that is
--      dozens of clicks per settlement pass. These RPCs settle an entire family
--      (enrollment) — or a batch of families (a whole team) — in a single atomic,
--      reversible call.
--
-- MODEL (canonical, mirrors markPaymentConfirmed + reverse_payment RPC):
--   A settled family =
--     1. parent_dues_enrollment.total_paid = total_owed, status = 'paid_in_full'
--     2. all dues_installments for that enrollment -> status='paid', paid_at=now()
--     3. one dues_payments audit row recording the settle (status='manual')
--
-- SECURITY: SECURITY DEFINER (bypasses RLS) but gated to director/coach only,
--           matching the existing reverse_payment() pattern.
--
-- REVERSIBLE: each installment can still be reversed via reverse_payment(); or
--             set total_paid back and installments to 'pending'. See
--             STRIPE_GOLIVE_DECISIONS.md "Undo a bulk settle".
-- ---------------------------------------------------------------------------

-- 1. Settle a single family by enrollment id -------------------------------
CREATE OR REPLACE FUNCTION mark_family_paid(p_enrollment_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role TEXT;
  enr         RECORD;
  remaining   NUMERIC;
  n_inst      INT;
  new_receipt TEXT;
BEGIN
  -- Gate: director/coach only
  SELECT p.role::TEXT INTO caller_role FROM profiles p WHERE p.id = auth.uid();
  IF caller_role IS NULL OR caller_role NOT IN ('director', 'coach') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Unauthorized: director or coach role required');
  END IF;

  SELECT id, parent_email, athlete_name, total_owed, COALESCE(total_paid,0) AS total_paid
    INTO enr
    FROM parent_dues_enrollment
   WHERE id = p_enrollment_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Enrollment not found');
  END IF;

  remaining := GREATEST(COALESCE(enr.total_owed,0) - enr.total_paid, 0);

  -- 1. Enrollment -> paid in full
  UPDATE parent_dues_enrollment
     SET total_paid = COALESCE(total_owed, 0),
         status     = 'paid_in_full'
   WHERE id = p_enrollment_id;

  -- 2. All outstanding installments -> paid
  UPDATE dues_installments
     SET status = 'paid', paid_at = NOW()
   WHERE enrollment_id = p_enrollment_id
     AND status <> 'paid';
  GET DIAGNOSTICS n_inst = ROW_COUNT;

  -- 3. Audit row (only if there was a remaining balance to settle)
  IF remaining > 0 THEN
    new_receipt := 'settle_' || replace(p_enrollment_id::text, '-', '') || '_' || floor(extract(epoch from now()))::text;
    INSERT INTO dues_payments (parent_email, parent_name, player_name, amount, note, receipt_id, status)
    VALUES (enr.parent_email, NULL, enr.athlete_name, remaining,
            'Admin bulk settle — marked paid in full', new_receipt, 'manual');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'enrollment_id', p_enrollment_id,
    'settled_amount', remaining,
    'installments_marked_paid', n_inst
  );
END;
$$;

-- 2. Settle a family by parent email (convenience) -------------------------
CREATE OR REPLACE FUNCTION mark_family_paid_by_email(p_parent_email TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  eid UUID;
BEGIN
  SELECT id INTO eid FROM parent_dues_enrollment
   WHERE lower(parent_email) = lower(p_parent_email) LIMIT 1;
  IF eid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No enrollment for that email');
  END IF;
  RETURN mark_family_paid(eid);
END;
$$;

-- 3. Settle a batch of families (a whole team) in one transaction ----------
--    Admin selects the team's families in the UI and passes their enrollment ids.
--    Team-scoping is done in the app layer (no assumption about a team column
--    on parent_dues_enrollment, which is not defined in-repo).
CREATE OR REPLACE FUNCTION mark_enrollments_paid(p_enrollment_ids UUID[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role TEXT;
  eid         UUID;
  results     JSONB := '[]'::jsonb;
  one         JSONB;
BEGIN
  SELECT p.role::TEXT INTO caller_role FROM profiles p WHERE p.id = auth.uid();
  IF caller_role IS NULL OR caller_role NOT IN ('director', 'coach') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Unauthorized: director or coach role required');
  END IF;

  FOREACH eid IN ARRAY p_enrollment_ids LOOP
    one := mark_family_paid(eid);
    results := results || jsonb_build_array(one);
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'count', array_length(p_enrollment_ids, 1), 'results', results);
END;
$$;

GRANT EXECUTE ON FUNCTION mark_family_paid(UUID)            TO authenticated;
GRANT EXECUTE ON FUNCTION mark_family_paid_by_email(TEXT)   TO authenticated;
GRANT EXECUTE ON FUNCTION mark_enrollments_paid(UUID[])     TO authenticated;

COMMENT ON FUNCTION mark_family_paid(UUID) IS
  'Settle one family/enrollment to paid-in-full across dues cascade. Director/coach only. Reversible via reverse_payment().';
COMMENT ON FUNCTION mark_enrollments_paid(UUID[]) IS
  'Batch-settle many enrollments (e.g. a whole team) atomically. Director/coach only.';
