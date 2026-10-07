-- v32_01_player_film.sql
--
-- FILM ROOM
-- Per-athlete video and photo evidence of what a player is doing well and what
-- he needs to level up on. Hangs off the taxonomy the development board already
-- uses (development_config keys 'skills' and 'subskills') so film sits alongside
-- the ratings instead of becoming a second, parallel opinion of the same player.
--
-- FOUR DESIGN CALLS, EACH COPIED FROM SOMETHING THAT ALREADY WORKS HERE
--
-- 1. One row per athlete per clip, not one row with many athletes.
--    A single clip can show four players. Ashton's note and Emory's note about
--    the same possession are different coaching points, and more importantly a
--    row is the unit of parent visibility: Ashton's family must never read a
--    note written about Emory. Same media, two rows, two notes.
--
-- 2. Coach-only until deliberately shared.
--    player_development already works this way: the board is staff-read, and
--    player_development_shares is the explicit act of showing a parent. Film of
--    somebody's child should not be looser than his skill ratings, so
--    shared_with_parent_at starts null and nothing reaches a parent until it is
--    set. RLS enforces it rather than the UI remembering to.
--
-- 3. Media can live in storage OR at a URL.
--    The athlete-media bucket (private, created 2026-03-25) is still empty.
--    Supabase Storage has no transcoding and real egress cost, so full game
--    video is better held as an unlisted link on the club's own YouTube channel
--    and referenced here, while stills and short cuts go in the bucket. The
--    table accepts either and requires at least one.
--
-- 4. assessment is a hard two-value check, not free text.
--    Scott's framing is "what he is doing good" and "what he needs to level up
--    on". Those are the only two states, and keeping them constrained is what
--    makes a film room filterable later rather than a pile of clips.

begin;

create table if not exists public.player_film (
  id                     uuid primary key default gen_random_uuid(),
  athlete_id             uuid not null references public.athletes(id) on delete cascade,

  -- What this clip is evidence of
  assessment             text not null check (assessment in ('strength','growth')),
  skill                  text not null,   -- development_config -> 'skills'
  subskill               text,            -- development_config -> 'subskills'
  title                  text not null,
  coach_note             text,

  -- The media. At least one of storage_path / external_url is required.
  media_type             text not null check (media_type in ('video','photo')),
  storage_path           text,            -- object path inside the athlete-media bucket
  external_url           text,            -- unlisted YouTube or other hosted video
  thumbnail_path         text,
  clip_start_seconds     integer check (clip_start_seconds >= 0),
  clip_end_seconds       integer check (clip_end_seconds >= 0),

  -- Where it came from
  captured_on            date,
  source_event           text,
  game_id                uuid references public.games(id)             on delete set null,
  session_id             uuid references public.training_sessions(id) on delete set null,

  -- Parent visibility, mirroring player_development_shares
  shared_with_parent_at  timestamptz,
  shared_by              uuid,

  created_by             uuid,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint player_film_needs_media
    check (storage_path is not null or external_url is not null),
  constraint player_film_clip_range
    check (clip_end_seconds is null or clip_start_seconds is null
           or clip_end_seconds > clip_start_seconds)
);

comment on table public.player_film is
  'Film room. One row per athlete per clip. assessment says whether the clip shows a strength or a growth area. Nothing is visible to a parent until shared_with_parent_at is set.';

create index if not exists idx_player_film_athlete
  on public.player_film (athlete_id, captured_on desc nulls last);
create index if not exists idx_player_film_skill
  on public.player_film (skill, assessment);
create index if not exists idx_player_film_shared
  on public.player_film (athlete_id) where shared_with_parent_at is not null;

-- updated_at
create or replace function public.touch_player_film()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_touch_player_film on public.player_film;
create trigger trg_touch_player_film
  before update on public.player_film
  for each row execute function public.touch_player_film();

-- RLS, matching the patterns already used on player_development and practice_grades
alter table public.player_film enable row level security;

drop policy if exists player_film_service     on public.player_film;
drop policy if exists player_film_staff_all   on public.player_film;
drop policy if exists player_film_parent_read on public.player_film;

create policy player_film_service on public.player_film
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy player_film_staff_all on public.player_film
  for all using (public.current_user_is_staff())
  with check (public.current_user_is_staff());

-- A parent sees a clip only when it is their athlete AND it has been shared.
create policy player_film_parent_read on public.player_film
  for select using (
    shared_with_parent_at is not null
    and athlete_id in (select public.get_my_athlete_ids())
  );

revoke all on public.player_film from anon;
grant select, insert, update, delete on public.player_film to authenticated;

commit;
