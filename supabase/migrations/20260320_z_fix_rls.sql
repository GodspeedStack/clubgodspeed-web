-- Create a SECURITY DEFINER function to check admin status without triggering RLS
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM user_profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- Fix user_profiles Admin policy
DROP POLICY IF EXISTS "user_profiles_select_admin" ON public.user_profiles;
CREATE POLICY "user_profiles_select_admin" ON public.user_profiles
    FOR SELECT
    USING (public.is_admin());

-- Fix season_config Admin policy
DROP POLICY IF EXISTS "Admin full access" ON public.season_config;
CREATE POLICY "Admin full access" ON public.season_config
    FOR ALL
    USING (public.is_admin());
