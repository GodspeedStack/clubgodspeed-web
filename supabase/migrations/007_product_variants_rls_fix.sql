-- =====================================================
-- PRODUCT VARIANTS RLS POLICY FIX
-- =====================================================
-- Purpose: Update RLS policies for product_variants table
-- Changes:
--   - Allow public viewing of ALL variants (not just active)
--   - Block regular authenticated users from modifying
--   - Only service_role (backend/admin) can modify via RLS bypass
-- =====================================================

-- Step 1: Ensure RLS is enabled (should already be enabled, but safe to run)
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;

-- Step 2: Drop existing policies if they exist
DROP POLICY IF EXISTS "Anyone can view active variants" ON public.product_variants;
DROP POLICY IF EXISTS "Admins can manage variants" ON public.product_variants;

-- Step 3: Allow everyone (even not logged in) to see all product variants
CREATE POLICY product_variants_public_select 
ON public.product_variants 
FOR SELECT 
TO anon, authenticated 
USING (true);

-- Step 4: Block regular authenticated users from modifying products
-- Note: service_role bypasses RLS, so this only affects regular authenticated users
-- We explicitly block INSERT, UPDATE, and DELETE (SELECT is already allowed above)
CREATE POLICY product_variants_block_modify_insert
ON public.product_variants 
FOR INSERT 
TO authenticated 
WITH CHECK (false);

CREATE POLICY product_variants_block_modify_update
ON public.product_variants 
FOR UPDATE 
TO authenticated 
USING (false) 
WITH CHECK (false);

CREATE POLICY product_variants_block_modify_delete
ON public.product_variants 
FOR DELETE 
TO authenticated 
USING (false);

-- Step 5: Add performance index (already exists, but safe with IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS idx_product_variants_product_id 
ON public.product_variants(product_id);
