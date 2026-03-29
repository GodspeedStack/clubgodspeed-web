-- v2_10_parent_player_links.sql
-- Many-to-many junction: multiple parents per player, multiple players per parent

CREATE TABLE IF NOT EXISTS public.parent_player_links (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    athlete_id      uuid NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
    relationship    text CHECK (relationship IN ('mother','father','guardian','stepparent','other')) DEFAULT 'guardian',
    is_primary      boolean NOT NULL DEFAULT false,
    created_at      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT parent_player_unique UNIQUE (profile_id, athlete_id)
);

CREATE INDEX IF NOT EXISTS idx_ppl_profile ON public.parent_player_links(profile_id);
CREATE INDEX IF NOT EXISTS idx_ppl_athlete ON public.parent_player_links(athlete_id);

-- RLS
ALTER TABLE public.parent_player_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY ppl_director_all ON public.parent_player_links
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('director','coach'))
    );

CREATE POLICY ppl_parent_read ON public.parent_player_links
    FOR SELECT USING (profile_id = auth.uid());

-- RPC: roster with linked parents (admin view)
CREATE OR REPLACE FUNCTION get_roster_with_parents()
RETURNS TABLE (
    athlete_id uuid,
    first_name text,
    last_name text,
    display_name text,
    grade text,
    enrollment_status text,
    parents jsonb
) LANGUAGE sql SECURITY DEFINER AS $$
    SELECT
        a.id AS athlete_id,
        a.first_name,
        a.last_name,
        a.display_name,
        a.grade,
        a.enrollment_status,
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'profile_id', p.id,
                    'full_name', p.full_name,
                    'email', p.email,
                    'phone', p.phone,
                    'relationship', ppl.relationship,
                    'is_primary', ppl.is_primary,
                    'approved', p.approved
                )
            ) FILTER (WHERE p.id IS NOT NULL),
            '[]'::jsonb
        ) AS parents
    FROM public.athletes a
    LEFT JOIN public.parent_player_links ppl ON ppl.athlete_id = a.id
    LEFT JOIN public.profiles p ON p.id = ppl.profile_id
    WHERE a.enrollment_status = 'active'
    GROUP BY a.id, a.first_name, a.last_name, a.display_name, a.grade, a.enrollment_status
    ORDER BY a.last_name, a.first_name;
$$;

-- RPC: link parent to athlete (with backward-compat profiles.player_name sync)
CREATE OR REPLACE FUNCTION link_parent_to_athlete(
    p_profile_id uuid,
    p_athlete_id uuid,
    p_relationship text DEFAULT 'guardian',
    p_is_primary boolean DEFAULT false
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    link_id uuid;
BEGIN
    INSERT INTO public.parent_player_links (profile_id, athlete_id, relationship, is_primary)
    VALUES (p_profile_id, p_athlete_id, p_relationship, p_is_primary)
    ON CONFLICT (profile_id, athlete_id) DO UPDATE SET relationship = EXCLUDED.relationship, is_primary = EXCLUDED.is_primary
    RETURNING id INTO link_id;

    -- Sync profiles.player_name for backward compat
    UPDATE public.profiles
    SET player_name = (
        SELECT string_agg(a.display_name, ', ')
        FROM public.parent_player_links ppl2
        JOIN public.athletes a ON a.id = ppl2.athlete_id
        WHERE ppl2.profile_id = p_profile_id
    )
    WHERE id = p_profile_id;

    RETURN link_id;
END;
$$;

-- RPC: parent portal -- get my linked athletes
CREATE OR REPLACE FUNCTION get_my_athletes()
RETURNS TABLE (
    athlete_id uuid,
    first_name text,
    last_name text,
    display_name text,
    grade text,
    jersey_number smallint,
    player_position text,
    team_name text,
    enrollment_status text,
    relationship text
) LANGUAGE sql SECURITY DEFINER AS $$
    SELECT
        a.id AS athlete_id,
        a.first_name,
        a.last_name,
        a.display_name,
        a.grade,
        a.jersey_number,
        a.position AS player_position,
        a.team_name,
        a.enrollment_status,
        ppl.relationship
    FROM public.parent_player_links ppl
    JOIN public.athletes a ON a.id = ppl.athlete_id
    WHERE ppl.profile_id = auth.uid()
    ORDER BY a.first_name;
$$;
