-- v10_02_dues_autoenroll_trigger_scope.sql
-- Follow-up to v10_01. Apply v10_01 first.
--
-- Defect v10_01 left behind: trg_auto_enroll_dues_upd was declared
--   AFTER UPDATE OF enrollment_status
-- so it fires only when enrollment_status appears in the UPDATE's column list.
-- Setting dues_autoenroll from false to true therefore did NOT post dues -- the
-- "dues are ready, post them now" switch silently did nothing until someone
-- happened to touch enrollment_status.
--
-- Fix: add dues_autoenroll to the trigger's column list, and guard the WHEN clause
-- on the flag as well so the function is not called for athletes still on hold.
--
-- Verified in a rolled-back transaction against production, 2026-10-15:
--   dues_autoenroll=false on insert        -> 0 dues rows   (held)
--   routine edit (jersey) while held       -> 0 dues rows   (still held)
--   normal insert, flag default true       -> 1 dues row    (unchanged behavior)
--   flip dues_autoenroll false -> true     -> 1 dues row at $472.90

begin;

drop trigger if exists trg_auto_enroll_dues_upd on public.athletes;

create trigger trg_auto_enroll_dues_upd
  after update of enrollment_status, dues_autoenroll on public.athletes
  for each row
  when (new.enrollment_status = 'active' and new.dues_autoenroll)
  execute function public.auto_enroll_athlete_dues();

commit;
