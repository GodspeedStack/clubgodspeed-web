-- =====================================================
-- PRODUCT VARIANTS RLS POLICY FIX
-- =====================================================
-- Purpose: Update RLS policies for product_variants table
-- Changes:
--   - Allow public viewing of ALL variants (not just active)
--   - Only admin users (via JWT claim) can modify
--   - Service_role automatically bypasses RLS (no policy needed)
-- =====================================================

-- Step 1: Ensure RLS is enabled (should already be enabled, but safe to run)
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;

-- Step 2: Drop existing conflicting policies from migration 002
DROP POLICY IF EXISTS "Anyone can view active variants" ON public.product_variants;
DROP POLICY IF EXISTS "Admins can manage variants" ON public.product_variants;

-- Step 3: Allow everyone (even not logged in) to see all product variants
-- This replaces the previous policy that only showed active variants
CREATE POLICY product_variants_public_select 
ON public.product_variants 
FOR SELECT 
TO anon, authenticated 
USING (true);

-- Step 4: Allow admin users (via JWT claim) to insert variants
-- Matches existing pattern in 002_ecommerce_schema.sql for products table
CREATE POLICY product_variants_admin_insert
ON public.product_variants 
FOR INSERT 
TO authenticated 
WITH CHECK ((auth.jwt() ->> 'role') = 'admin');

-- Step 5: Allow admin users (via JWT claim) to update variants
CREATE POLICY product_variants_admin_update
ON public.product_variants 
FOR UPDATE 
TO authenticated 
USING ((auth.jwt() ->> 'role') = 'admin')
WITH CHECK ((auth.jwt() ->> 'role') = 'admin');

-- Step 6: Allow admin users (via JWT claim) to delete variants
CREATE POLICY product_variants_admin_delete
ON public.product_variants 
FOR DELETE 
TO authenticated 
USING ((auth.jwt() ->> 'role') = 'admin');

-- Step 7: Add performance index (already exists, but safe with IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS idx_product_variants_product_id 
ON public.product_variants(product_id);
