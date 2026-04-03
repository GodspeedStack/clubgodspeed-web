-- v2_12: Add coach/director RLS to payment_plans
-- Fixes: admin quick-pay cannot INSERT/UPDATE payment_plans (parent portal tables)
-- because only parent-scoped policies existed.

-- Director/coach full access on payment_plans
CREATE POLICY "Coach/director full access on payment_plans"
  ON payment_plans
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = ANY(ARRAY['director'::app_role, 'coach'::app_role])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = ANY(ARRAY['director'::app_role, 'coach'::app_role])
    )
  );
