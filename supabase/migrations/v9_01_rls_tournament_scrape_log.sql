-- ============================================================
-- FIX: Enable RLS on tournament_scrape_log
-- Resolves Supabase security advisory rls_disabled_in_public
-- Run via Supabase SQL Editor as postgres
-- ============================================================

-- Enable RLS (blocks all access by default)
ALTER TABLE public.tournament_scrape_log ENABLE ROW LEVEL SECURITY;

-- Coach/admin read access (matches pattern from v2_08)
CREATE POLICY "Coaches read scrape_log"
    ON public.tournament_scrape_log
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.role IN ('coach', 'admin')
        )
    );

-- No public/parent access. service_role bypasses RLS automatically.
