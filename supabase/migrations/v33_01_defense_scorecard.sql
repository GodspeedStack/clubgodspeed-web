-- v33_01 Defense scorecard (coach portal)
-- Scott's game sheet: star = good defense, tally = out of position (they scored or got the board),
-- X = badly out of position and they scored. "Other plays they scored on" covers turnovers and
-- no-hustle plays that led to points. Coaches and directors read; nobody writes from the client yet.
-- Coach-only by design: per-player marks on minors are never exposed to parents or anon.
-- STATUS 2026-10-07: tables, grants, read policies and the baseline rows are APPLIED in production.
-- The two sec_coach_director_all drops below are NOT yet applied; run this file to finish (it is idempotent).

create table if not exists public.defense_games (
  id           uuid primary key default gen_random_uuid(),
  team_id      uuid not null references public.teams(id) on delete restrict,
  game_date    date,
  opponent     text,
  our_score    integer check (our_score >= 0),
  their_score  integer check (their_score >= 0),
  notes        text,
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now()
);
create index if not exists defense_games_team_idx on public.defense_games(team_id, game_date desc);

create table if not exists public.defense_game_marks (
  game_id          uuid not null references public.defense_games(id) on delete cascade,
  athlete_id       uuid not null references public.athletes(id) on delete restrict,
  stars            integer not null default 0 check (stars >= 0),
  tallies          integer not null default 0 check (tallies >= 0),
  xs               integer not null default 0 check (xs >= 0),
  other_scored     integer not null default 0 check (other_scored >= 0),
  other_note       text,
  turnovers        integer not null default 0 check (turnovers >= 0),
  rebounds         integer not null default 0 check (rebounds >= 0),
  quarters_played  integer check (quarters_played between 0 and 4),
  primary key (game_id, athlete_id)
);

alter table public.defense_games enable row level security;
alter table public.defense_game_marks enable row level security;

revoke all on public.defense_games, public.defense_game_marks from anon, public;
grant select on public.defense_games, public.defense_game_marks to authenticated;

drop policy if exists defense_games_read on public.defense_games;
create policy defense_games_read on public.defense_games
  for select to authenticated
  using (public.coach_can_see('defense', team_id));

drop policy if exists defense_marks_read on public.defense_game_marks;
create policy defense_marks_read on public.defense_game_marks
  for select to authenticated
  using (exists (select 1 from public.defense_games g
                  where g.id = game_id and public.coach_can_see('defense', g.team_id)));

-- An event trigger adds sec_coach_director_all (any staff, ALL) to every new table. Grants above already
-- block writes; this narrows reads to the coach's own teams (coach_can_see). Directors still see all.
drop policy if exists sec_coach_director_all on public.defense_games;
drop policy if exists sec_coach_director_all on public.defense_game_marks;

-- Baseline game (Team Black, lost 26-37), scored by Scott 2026-10-06/07.
with g as (
  insert into public.defense_games (team_id, opponent, our_score, their_score, notes)
  select 'a0000000-0000-0000-0000-000000000005', null, 26, 37,
         'Baseline. Scored from Scott''s sheet. Opponent and date not recorded.'
  where not exists (select 1 from public.defense_games d
                     where d.team_id = 'a0000000-0000-0000-0000-000000000005' and d.notes like 'Baseline.%')
  returning id
)
insert into public.defense_game_marks (game_id, athlete_id, stars, tallies, xs, other_scored, other_note, turnovers, rebounds)
select g.id, v.athlete_id::uuid, v.stars, v.tallies, v.xs, v.other_scored, v.other_note, v.turnovers, v.rebounds
from g, (values
  ('957fe335-8b1c-4bba-9263-7b3c8a83b26d', 1, 0, 0, 0, null,                      0, 3),  -- Romeo
  ('a1000000-0000-0000-0000-000000000007', 0, 2, 0, 0, null,                      1, 0),  -- Emory
  ('a1000000-0000-0000-0000-000000000002', 4, 2, 0, 1, 'Turnover they scored on', 5, 0),  -- Quest
  ('4b0bad3b-1a36-4eae-a181-f8822dac2e6a', 0, 7, 0, 0, null,                      1, 0),  -- Zach
  ('a1000000-0000-0000-0000-000000000009', 1, 5, 2, 0, null,                      0, 1),  -- Gene Jr
  ('a1000000-0000-0000-0000-000000000006', 6, 4, 4, 0, null,                      0, 0),  -- Anton
  ('a1000000-0000-0000-0000-000000000008', 3, 3, 5, 0, null,                      1, 0),  -- Ashton
  ('8d53a462-d21d-4c50-98aa-2a014698b3f7', 2, 7, 3, 1, 'No hustle on the boards, they scored', 1, 0)  -- Kai
) as v(athlete_id, stars, tallies, xs, other_scored, other_note, turnovers, rebounds);
