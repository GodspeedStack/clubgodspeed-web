-- ============================================================
-- v3_06_calendar_recalled_at.sql
-- Adds recalled_at timestamp to calendar_events for tracking
-- events that were published then recalled by admin.
-- ============================================================

ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS recalled_at timestamptz;

COMMENT ON COLUMN public.calendar_events.recalled_at
  IS 'Timestamp when event was recalled (de-published). NULL if never recalled or re-published.';
