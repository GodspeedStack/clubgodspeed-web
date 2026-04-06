-- ============================================================
-- v8_01_fundraising_totals.sql
-- Codifies the fundraising_totals table that was created manually
-- in the Supabase dashboard. This migration is idempotent.
-- ============================================================

-- 1. Table (skip if already exists)
CREATE TABLE IF NOT EXISTS public.fundraising_totals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_name  TEXT NOT NULL,
  total_raised  NUMERIC(10, 2) NOT NULL DEFAULT 0,
  parent_shares INTEGER NOT NULL DEFAULT 0,
  email_shares  INTEGER NOT NULL DEFAULT 0,
  sms_shares    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Index for the ilike lookups used by parent portal
CREATE INDEX IF NOT EXISTS idx_fundraising_totals_athlete_name
  ON public.fundraising_totals (athlete_name);

-- 3. Auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_fundraising_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fundraising_updated_at ON public.fundraising_totals;
CREATE TRIGGER trg_fundraising_updated_at
  BEFORE UPDATE ON public.fundraising_totals
  FOR EACH ROW EXECUTE FUNCTION public.update_fundraising_updated_at();

-- 4. Enable RLS
ALTER TABLE public.fundraising_totals ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies (drop-and-recreate for idempotency)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'fundraising_totals'
  LOOP
    EXECUTE format('DROP POLICY %I ON fundraising_totals', r.policyname);
  END LOOP;
END $$;

-- Any authenticated user can read (parents need this for billing credit display)
CREATE POLICY "Authenticated users can view fundraising totals"
  ON public.fundraising_totals
  FOR SELECT
  TO authenticated
  USING (true);

-- Coaches/directors can insert, update, delete
CREATE POLICY "Coaches and directors can manage fundraising"
  ON public.fundraising_totals
  FOR ALL
  TO authenticated
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

-- Service role full access (edge functions)
CREATE POLICY "Service role full access to fundraising"
  ON public.fundraising_totals
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
