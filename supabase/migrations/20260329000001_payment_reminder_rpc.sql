-- Required by send-payment-reminders edge function.
-- Given a parent_id, returns all parents linked to the same athlete(s),
-- including the original parent. Used to fan out payment reminders.

CREATE OR REPLACE FUNCTION get_all_parents_for_parent(p_parent_id uuid)
RETURNS TABLE (
    profile_id  uuid,
    email       text,
    full_name   text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    -- Find all athletes linked to this parent, then return all parents of those athletes
    SELECT DISTINCT
        pr.id    AS profile_id,
        pr.email AS email,
        pr.full_name AS full_name
    FROM parent_player_links ppl1          -- links for the given parent
    JOIN parent_player_links ppl2          -- all parents sharing the same athlete
        ON ppl2.athlete_id = ppl1.athlete_id
    JOIN profiles pr
        ON pr.id = ppl2.profile_id
    WHERE ppl1.profile_id = p_parent_id
      AND pr.email IS NOT NULL
      AND pr.approved = true;
$$;

-- payment_reminders: service_role bypasses RLS by default, so the edge function
-- can always insert. Add explicit policy so future authenticated admin tools work too.
ALTER TABLE public.payment_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access reminders" ON public.payment_reminders;
CREATE POLICY "Service role full access reminders"
    ON public.payment_reminders
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Directors/coaches can view all reminders for reporting
DROP POLICY IF EXISTS "Staff view reminders" ON public.payment_reminders;
CREATE POLICY "Staff view reminders"
    ON public.payment_reminders
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND role IN ('director', 'coach')
        )
    );
