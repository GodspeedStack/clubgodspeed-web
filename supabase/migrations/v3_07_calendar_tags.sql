-- ============================================================
-- v3_07_calendar_tags.sql
-- Adds tags text[] to calendar_events for status badges
-- (confirmed, registered, pending, interest, backup, etc.)
-- Used by schedule-view.js statusFromTags()
-- ============================================================

ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';

COMMENT ON COLUMN public.calendar_events.tags
  IS 'Array of status/category tags for UI badges: confirmed, registered, pending, interest, backup, planned, unpaid, paid';

CREATE INDEX IF NOT EXISTS idx_calendar_events_tags
  ON public.calendar_events USING GIN (tags);

-- Update event_type constraint to include 'season' (used for multi-day events > 3 days)
ALTER TABLE public.calendar_events
  DROP CONSTRAINT IF EXISTS calendar_events_event_type_check;
ALTER TABLE public.calendar_events
  ADD CONSTRAINT calendar_events_event_type_check
  CHECK (event_type IN ('practice','game','tournament','season','meeting','camp','tryout','fundraiser','deadline','other'));
