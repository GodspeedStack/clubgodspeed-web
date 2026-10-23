-- v10_04_parent_calendar_sees_public.sql
-- Parent portal calendar was showing LESS than the public website.
--
-- calendar_read_scoped sent anonymous visitors down one branch (visibility =
-- 'public', no team scoping) and signed-in non-staff users down another (team
-- scoping, with no public exemption). The result was backwards: a stranger on
-- clubgodspeed.com saw every team's games, while a signed-in parent saw only
-- their own child's team.
--
-- Measured 2026-10-22, upcoming events:
--   public website (logged out) .................. 10
--   Denis (Anton, Black + 6th) ................... 8
--   Andrea (6th grade) ........................... 4
--   Bowman (5th Black) ........................... 4
--   Elizabeth (Zaydrien, 5th White) .............. 2
--
-- Fix: a signed-in user also sees anything marked visibility='public'. This is
-- security-neutral -- those rows are already world-readable through the anon
-- branch of this same policy. Team scoping still governs team_only, and
-- coaches_only stays staff-only for everyone.
--
-- Verified in a rolled-back transaction against production:
--   all four parents above ....................... 10 of 10
--   anon total ................................... unchanged at 10
--   parents seeing coaches_only .................. 0
--   anon seeing coaches_only / team_only ......... 0 / 0

begin;

drop policy if exists calendar_read_scoped on public.calendar_events;

create policy calendar_read_scoped on public.calendar_events
for select using (
  case
    when auth.uid() is null then (visibility = 'public')
    when public.current_user_is_staff() then true
    else (
      -- anything the public site already shows, a signed-in parent sees too
      visibility = 'public'
      or (
        visibility <> 'coaches_only'
        and (
          team_id in (select public.get_my_team_ids())
          or (team_id is null and grade_level is null)
          or (team_id is null and grade_level = any(public.current_user_grade_levels()))
        )
      )
    )
  end
);

commit;
