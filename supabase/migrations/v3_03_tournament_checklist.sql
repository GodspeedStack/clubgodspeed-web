-- ============================================================
-- v3_03_tournament_checklist.sql
-- Adds registration metadata + admin checklist to calendar_events
-- ============================================================

-- 1. New columns for tournament metadata
ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS cost text,
  ADD COLUMN IF NOT EXISTS registration_deadline date,
  ADD COLUMN IF NOT EXISTS registration_url text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS admin_checklist jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.calendar_events.cost IS 'Display string for tournament cost e.g. "$395-450"';
COMMENT ON COLUMN public.calendar_events.registration_deadline IS 'Date registration closes';
COMMENT ON COLUMN public.calendar_events.registration_url IS 'Link to tournament registration page';
COMMENT ON COLUMN public.calendar_events.notes IS 'Freeform notes parsed from tournament paste (rules, requirements, etc)';
COMMENT ON COLUMN public.calendar_events.admin_checklist IS 'JSONB array of {id, label, done, done_at, done_by} checklist items';

-- 2. Updated upsert RPC with new fields
CREATE OR REPLACE FUNCTION public.upsert_calendar_event(
    p_id                  uuid DEFAULT NULL,
    p_title               text DEFAULT NULL,
    p_description         text DEFAULT NULL,
    p_event_type          text DEFAULT 'other',
    p_start_date          date DEFAULT NULL,
    p_start_time          time DEFAULT NULL,
    p_end_date            date DEFAULT NULL,
    p_end_time            time DEFAULT NULL,
    p_all_day             boolean DEFAULT false,
    p_location            text DEFAULT NULL,
    p_location_url        text DEFAULT NULL,
    p_team_id             uuid DEFAULT NULL,
    p_visibility          text DEFAULT 'public',
    p_color               text DEFAULT NULL,
    p_grade_level         text DEFAULT NULL,
    p_cost                text DEFAULT NULL,
    p_registration_deadline date DEFAULT NULL,
    p_registration_url    text DEFAULT NULL,
    p_notes               text DEFAULT NULL,
    p_admin_checklist     jsonb DEFAULT NULL,
    p_event_date          date DEFAULT NULL,
    p_created_by          uuid DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_event_id uuid;
    v_date date;
BEGIN
    v_date := COALESCE(p_start_date, p_event_date);

    IF p_id IS NOT NULL THEN
        UPDATE public.calendar_events SET
            title       = COALESCE(p_title, title),
            description = COALESCE(p_description, description),
            event_type  = COALESCE(p_event_type, event_type),
            start_date  = COALESCE(v_date, start_date),
            start_time  = COALESCE(p_start_time, start_time),
            end_date    = COALESCE(p_end_date, end_date),
            end_time    = COALESCE(p_end_time, end_time),
            all_day     = COALESCE(p_all_day, all_day),
            location    = COALESCE(p_location, location),
            location_url = COALESCE(p_location_url, location_url),
            team_id     = p_team_id,
            visibility  = COALESCE(p_visibility, visibility),
            color       = COALESCE(p_color, color),
            grade_level = p_grade_level,
            cost        = COALESCE(p_cost, cost),
            registration_deadline = COALESCE(p_registration_deadline, registration_deadline),
            registration_url = COALESCE(p_registration_url, registration_url),
            notes       = COALESCE(p_notes, notes),
            admin_checklist = COALESCE(p_admin_checklist, admin_checklist),
            updated_at  = now()
        WHERE id = p_id
        RETURNING id INTO v_event_id;
    ELSE
        INSERT INTO public.calendar_events (
            title, description, event_type, start_date, start_time,
            end_date, end_time, all_day, location, location_url,
            team_id, visibility, color, created_by, grade_level,
            cost, registration_deadline, registration_url, notes, admin_checklist
        ) VALUES (
            p_title, p_description, p_event_type, v_date, p_start_time,
            p_end_date, p_end_time, p_all_day, p_location, p_location_url,
            p_team_id, p_visibility, p_color, COALESCE(p_created_by, auth.uid()), p_grade_level,
            p_cost, p_registration_deadline, p_registration_url, p_notes,
            COALESCE(p_admin_checklist, '[]'::jsonb)
        ) RETURNING id INTO v_event_id;
    END IF;

    RETURN v_event_id;
END;
$$;
