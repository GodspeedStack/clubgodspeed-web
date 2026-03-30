-- ============================================================
-- v3_02_tournament_calendar.sql
-- Adds grade_level to calendar_events, updates upsert RPC,
-- creates tournament_reminder_log table, and tournament reminder RPC
-- ============================================================

-- 1. Add grade_level column to calendar_events
ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS grade_level text;

COMMENT ON COLUMN public.calendar_events.grade_level
  IS '4th, 5th, or both — used for tournament events to distinguish team divisions';

-- 2. Add check constraint for grade_level
ALTER TABLE public.calendar_events
  DROP CONSTRAINT IF EXISTS chk_grade_level;
ALTER TABLE public.calendar_events
  ADD CONSTRAINT chk_grade_level
  CHECK (grade_level IS NULL OR grade_level IN ('4th', '5th', 'both'));

-- 3. Update event_type check to ensure 'tournament' is included
-- (Already present in v3_01 but ensuring forward compat)
ALTER TABLE public.calendar_events
  DROP CONSTRAINT IF EXISTS calendar_events_event_type_check;
ALTER TABLE public.calendar_events
  ADD CONSTRAINT calendar_events_event_type_check
  CHECK (event_type IN ('practice','game','tournament','meeting','camp','tryout','fundraiser','deadline','other'));

-- 4. Replace upsert RPC with grade_level support
CREATE OR REPLACE FUNCTION public.upsert_calendar_event(
    p_id            uuid DEFAULT NULL,
    p_title         text DEFAULT NULL,
    p_description   text DEFAULT NULL,
    p_event_type    text DEFAULT 'other',
    p_start_date    date DEFAULT NULL,
    p_start_time    time DEFAULT NULL,
    p_end_date      date DEFAULT NULL,
    p_end_time      time DEFAULT NULL,
    p_all_day       boolean DEFAULT false,
    p_location      text DEFAULT NULL,
    p_location_url  text DEFAULT NULL,
    p_team_id       uuid DEFAULT NULL,
    p_visibility    text DEFAULT 'public',
    p_color         text DEFAULT NULL,
    p_grade_level   text DEFAULT NULL,
    -- legacy aliases (admin-os.js compat)
    p_event_date    date DEFAULT NULL,
    p_created_by    uuid DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_event_id uuid;
    v_date date;
BEGIN
    -- Resolve date: prefer p_start_date, fall back to legacy p_event_date
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
            updated_at  = now()
        WHERE id = p_id
        RETURNING id INTO v_event_id;
    ELSE
        INSERT INTO public.calendar_events (
            title, description, event_type, start_date, start_time,
            end_date, end_time, all_day, location, location_url,
            team_id, visibility, color, created_by, grade_level
        ) VALUES (
            p_title, p_description, p_event_type, v_date, p_start_time,
            p_end_date, p_end_time, p_all_day, p_location, p_location_url,
            p_team_id, p_visibility, p_color, COALESCE(p_created_by, auth.uid()), p_grade_level
        ) RETURNING id INTO v_event_id;
    END IF;

    RETURN v_event_id;
END;
$$;

-- 5. Tournament reminder log (audit + rate limiting)
CREATE TABLE IF NOT EXISTS public.tournament_reminder_log (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_email text NOT NULL,
    event_ids   uuid[] NOT NULL,
    sent_at     timestamptz NOT NULL DEFAULT now(),
    week_key    text NOT NULL  -- e.g. '2026-W14' for dedup
);

CREATE INDEX IF NOT EXISTS idx_tournament_reminder_week
  ON public.tournament_reminder_log(parent_email, week_key);

-- RLS: service_role only (edge functions)
ALTER TABLE public.tournament_reminder_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on tournament_reminder_log"
  ON public.tournament_reminder_log FOR ALL
  USING (auth.role() = 'service_role');

-- Coach/director read access
CREATE POLICY "Coach/director read tournament_reminder_log"
  ON public.tournament_reminder_log FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = ANY(ARRAY['director'::app_role, 'coach'::app_role])
  ));

-- 6. RPC: Get upcoming tournaments for reminder emails
CREATE OR REPLACE FUNCTION public.get_upcoming_tournaments(
    p_days_ahead integer DEFAULT 14
)
RETURNS TABLE (
    id uuid,
    title text,
    start_date date,
    start_time time,
    end_time time,
    location text,
    location_url text,
    grade_level text,
    description text
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT id, title, start_date, start_time, end_time,
           location, location_url, grade_level, description
    FROM public.calendar_events
    WHERE event_type = 'tournament'
      AND is_cancelled IS NOT TRUE
      AND start_date BETWEEN CURRENT_DATE AND (CURRENT_DATE + p_days_ahead)
    ORDER BY start_date, start_time;
$$;

-- 7. View: calendar_events aliased with event_date for backward compat in JS reads
CREATE OR REPLACE VIEW public.calendar_events_compat AS
SELECT *,
       start_date AS event_date
FROM public.calendar_events;

-- Grant access on the view
GRANT SELECT ON public.calendar_events_compat TO authenticated;
GRANT SELECT ON public.calendar_events_compat TO anon;
