-- 015_parent_approval_status.sql
-- Description: Adds a scalable approval workflow to parent_accounts.

-- 1. Add approval_status column
ALTER TABLE public.parent_accounts 
ADD COLUMN IF NOT EXISTS approval_status text DEFAULT 'pending' 
CHECK (approval_status IN ('pending', 'approved', 'rejected'));

-- Provide backwards compatibility for existing active parents (so Denis isn't locked out)
UPDATE public.parent_accounts SET approval_status = 'approved' WHERE created_at < current_date;

-- 2. Ensure Admin can Update parent_accounts
DROP POLICY IF EXISTS "Admins can update parent accounts" ON public.parent_accounts;
CREATE POLICY "Admins can update parent accounts"
  ON public.parent_accounts
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid() AND user_profiles.role = 'admin'
    )
  );

-- 3. Ensure Admin can Select from parent_accounts to list them in the dashboard
DROP POLICY IF EXISTS "Admins can view parent accounts" ON public.parent_accounts;
CREATE POLICY "Admins can view parent accounts"
  ON public.parent_accounts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid() AND user_profiles.role = 'admin'
    )
  );
