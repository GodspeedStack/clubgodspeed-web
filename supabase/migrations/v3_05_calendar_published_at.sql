-- v3_05: Add published_at to calendar_events for publish-to-parents tracking
-- Used by publishCalendarToParents() in admin-os.js

ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS published_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_calendar_events_published
  ON public.calendar_events(published_at)
  WHERE published_at IS NULL;
