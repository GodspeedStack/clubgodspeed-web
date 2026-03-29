-- v2_11: Add coach/director RLS policies to dues tables
-- Fixes: "new row violates row-level security policy" when admin records manual payments
-- The admin panel authenticates as a regular user (director/coach role), not service_role.
-- Existing policies only allowed service_role writes and parent SELECT on own data.

-- Helper expression (matches parent_player_links pattern):
--   EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
--     AND profiles.role = ANY(ARRAY['director'::app_role, 'coach'::app_role]))

-- 1. parent_dues_enrollment: coach/director full access
CREATE POLICY "Coach/director full access on enrollment"
  ON parent_dues_enrollment
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

-- 2. dues_installments: coach/director full access
CREATE POLICY "Coach/director full access on installments"
  ON dues_installments
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

-- 3. dues_payments: coach/director full access
CREATE POLICY "Coach/director full access on payments"
  ON dues_payments
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
