-- v10_03_public_team_labels.sql
-- Purpose: let the PUBLIC schedule page (calendar.html) label a game with the
-- actual team, so 5th Black and 5th White are distinguishable.
--
-- Why a view rather than an anon policy on teams:
--   public.teams already carries the anon SELECT grant but has no anon RLS
--   policy, so anon reads return zero rows and a PostgREST embed yields null.
--   Adding an anon policy to teams would expose the whole row -- head_coach,
--   assistant_coaches, max_roster, season -- because RLS is row-level, not
--   column-level. This view exposes exactly two columns for active teams and
--   nothing else.
--
-- security_invoker is left false (the default) ON PURPOSE: the view runs as its
-- owner so it can read teams past that table's RLS. That is the entire point,
-- and it is why the column list is deliberately two columns wide. Do not add
-- columns to this view -- add a separate, equally narrow one.

begin;

create or replace view public.public_team_labels as
  select id, name
  from public.teams
  where is_active;

alter view public.public_team_labels set (security_invoker = false);

comment on view public.public_team_labels is
  'Anon-readable team id + name for active teams, for the public schedule page. '
  'Deliberately two columns. Do not widen.';

revoke all on public.public_team_labels from anon, authenticated;
grant select on public.public_team_labels to anon, authenticated;

commit;
