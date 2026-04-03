-- v2_13: Atomic payment reversal RPC
-- Called by admin quick-pay "Delete" action.
-- Reverses the full 4-table cascade in a single transaction:
--   1. dues_payments (admin)
--   2. dues_installments (admin)
--   3. parent_dues_enrollment totals (admin)
--   4. payments + payment_plans (parent portal)
--
-- SECURITY DEFINER: runs with function owner privileges (bypasses RLS).
-- Restricted to director/coach via explicit role check inside the function.

CREATE OR REPLACE FUNCTION reverse_payment(
  p_installment_id UUID,
  p_enrollment_id  UUID,
  p_parent_email   TEXT,
  p_amount         NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role TEXT;
  inst_number INT;
  enr RECORD;
  prof_id UUID;
  portal_pay RECORD;
  new_paid NUMERIC;
BEGIN
  -- Gate: only director or coach can call this
  SELECT p.role::TEXT INTO caller_role
    FROM profiles p
   WHERE p.id = auth.uid();

  IF caller_role IS NULL OR caller_role NOT IN ('director', 'coach') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Unauthorized: director or coach role required');
  END IF;

  -- 1. Delete dues_payment(s) linked to this installment
  DELETE FROM dues_payments WHERE installment_id = p_installment_id;

  -- 2. Get installment number to decide delete vs reset
  SELECT installment_number INTO inst_number
    FROM dues_installments WHERE id = p_installment_id;

  IF inst_number = 99 THEN
    -- One-off installment created by quick-pay: remove entirely
    DELETE FROM dues_installments WHERE id = p_installment_id;
  ELSE
    -- Regular installment: reset to pending
    UPDATE dues_installments
       SET status = 'pending', paid_at = NULL
     WHERE id = p_installment_id;
  END IF;

  -- 3. Subtract from enrollment total_paid, reset status if needed
  IF p_enrollment_id IS NOT NULL THEN
    SELECT total_paid, total_owed INTO enr
      FROM parent_dues_enrollment WHERE id = p_enrollment_id;

    IF FOUND THEN
      new_paid := GREATEST(COALESCE(enr.total_paid, 0) - p_amount, 0);
      UPDATE parent_dues_enrollment
         SET total_paid = new_paid,
             status = CASE WHEN new_paid >= COALESCE(enr.total_owed, 0)
                           THEN 'paid_in_full' ELSE 'active' END
       WHERE id = p_enrollment_id;
    END IF;
  END IF;

  -- 4. Reverse portal-side payment
  IF p_parent_email IS NOT NULL AND p_parent_email <> '' THEN
    SELECT id INTO prof_id
      FROM profiles WHERE email = p_parent_email LIMIT 1;

    IF prof_id IS NOT NULL THEN
      -- Find most recent confirmed payment matching the amount
      SELECT pay.id AS pay_id, pay.plan_id
        INTO portal_pay
        FROM payments pay
       WHERE pay.parent_id = prof_id
         AND pay.status = 'confirmed'
         AND ABS(pay.amount - p_amount) < 0.01
       ORDER BY pay.paid_at DESC NULLS LAST
       LIMIT 1;

      IF portal_pay.pay_id IS NOT NULL THEN
        DELETE FROM payments WHERE id = portal_pay.pay_id;
        -- Reset payment_plan to active if it was completed
        IF portal_pay.plan_id IS NOT NULL THEN
          UPDATE payment_plans SET status = 'active'
           WHERE id = portal_pay.plan_id AND status = 'completed';
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Grant execute to authenticated users (role check is inside the function)
GRANT EXECUTE ON FUNCTION reverse_payment(UUID, UUID, TEXT, NUMERIC) TO authenticated;

COMMENT ON FUNCTION reverse_payment IS
  'Atomic reversal of a recorded payment across admin + portal tables. Director/coach only.';
