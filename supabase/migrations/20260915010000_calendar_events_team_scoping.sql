-- Scope calendar_events reads to the viewer's own team(s).
--
-- Before: the SELECT policy allowed ANY row with visibility='public' to be read
-- by anyone including anon, and any 'team_only' row by any signed-in user. There
-- was no team scoping at all, so every family saw every team's games.
--
-- After: program-wide rows (team_id is null) keep their existing rules.
-- Team-tagged rows are visible only to that team's families and to staff.
--
-- ORDER OF OPERATIONS: deploy the client change first
-- (calendar-embed.html + schedule-view.js now read as the signed-in parent).
-- Applying this while the client still reads with the anon key would make every
-- team-tagged game vanish from the parent calendar.

begin;

drop policy if exists "Authenticated users view public events" on public.calendar_events;

create policy "calendar_events_team_scoped_read"
on public.calendar_events
for select
using (
    current_user_is_staff()
    or (
        team_id is null
        and (
            visibility = 'public'
            or (visibility = 'team_only' and auth.uid() is not null)
        )
    )
    or (
        team_id is not null
        and visibility in ('public', 'team_only')
        and team_id in (select public.get_my_team_ids())
    )
);

commit;
