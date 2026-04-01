-- ============================================================
-- v5_01: Expand get_roster_with_parents to return jersey_number,
--        date_of_birth, player_position for admin roster view
-- ============================================================
-- NOTE: Must DROP first because return type changed (new columns added)

DROP FUNCTION IF EXISTS get_roster_with_parents();

CREATE OR REPLACE FUNCTION get_roster_with_parents()
RETURNS TABLE (
    athlete_id uuid,
    first_name text,
    last_name text,
    display_name text,
    grade text,
    jersey_number smallint,
    date_of_birth date,
    player_position text,
    enrollment_status text,
    parents jsonb
) LANGUAGE sql SECURITY DEFINER AS $$
    SELECT
        a.id AS athlete_id,
        a.first_name,
        a.last_name,
        a.display_name,
        a.grade,
        a.jersey_number,
        a.date_of_birth,
        a.position AS player_position,
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
    GROUP BY a.id, a.first_name, a.last_name, a.display_name, a.grade,
             a.jersey_number, a.date_of_birth, a.position, a.enrollment_status
    ORDER BY a.last_name, a.first_name;
$$;
