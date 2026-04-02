-- v4_03: Allow public read access to team tournament schedule
-- Required so parent portal calendar can load tournaments via anon key.
-- Tournament names, dates, and locations are non-sensitive public information.
-- Write access remains restricted to directors/coaches/service_role.

-- Allow anonymous users to read the schedule (SELECT only)
CREATE POLICY "Public read schedule"
    ON public.team_tournament_schedule FOR SELECT
    USING (true);

-- Ensure the view is accessible to both anon and authenticated roles
GRANT SELECT ON public.team_schedule_view TO anon;
GRANT SELECT ON public.team_schedule_view TO authenticated;
