-- Keep the parent portal's season copy current automatically.
--
-- PROBLEM
-- The portal showed "2026 AAU SPRING/SUMMER DUES" in September. Two causes:
--   1. current_dues_config() selected on a hand-maintained is_active boolean, so
--      "current" was only correct while someone remembered to flip flags.
--   2. The portal heading text is hardcoded in the frontend rather than read
--      from the season config, so it could not follow the data at all.
--
-- This migration fixes cause 1 and supplies the data the frontend needs to fix
-- cause 2. The frontend change ships alongside it in parent-portal.js
-- (applyCurrentSeasonLabels).
--
-- APPROACH
-- Seasons get explicit date ranges. "Current" is derived from current_date, so
-- the portal rolls over on its own at each season boundary with no admin action.

alter table public.season_dues_config
  add column if not exists starts_on date,
  add column if not exists ends_on date,
  add column if not exists display_label text;

comment on column public.season_dues_config.starts_on is
  'First day this season config is current. Drives current_dues_config().';
comment on column public.season_dues_config.ends_on is
  'Last day this season config is current. Drives current_dues_config().';
comment on column public.season_dues_config.display_label is
  'Customer-facing heading, e.g. "Fall 2026 Season Dues". Render this in the
   parent portal instead of hardcoded season text.';

update public.season_dues_config set starts_on='2026-04-01', ends_on='2026-08-31',
  display_label='Summer 2026 Season Dues' where season='Summer 2026';
update public.season_dues_config set starts_on='2026-09-01', ends_on='2026-11-30',
  display_label='Fall 2026 Season Dues' where season='Fall 2026';
update public.season_dues_config set starts_on='2026-12-01', ends_on='2027-03-31',
  display_label='Winter 2026-27 Season Dues' where season='Winter 2026-27';

-- Bring the legacy flag in line with the dates as a one-time correction.
update public.season_dues_config
  set is_active = (current_date between starts_on and ends_on)
  where starts_on is not null;

-- Date-driven. Same signature, so every existing caller is fixed automatically.
create or replace function public.current_dues_config()
returns uuid
language sql stable security definer set search_path to 'public'
as $fn$
  select id from public.season_dues_config
  where starts_on is not null and current_date between starts_on and ends_on
  order by starts_on desc, created_at desc limit 1;
$fn$;

-- Full row for UI copy, so the heading comes from data, never a hardcoded string.
create or replace function public.current_season_dues()
returns table (
  id uuid, season text, program text, display_label text,
  description text, total_amount numeric, starts_on date, ends_on date
)
language sql stable security definer set search_path to 'public'
as $fn$
  select c.id, c.season, c.program, c.display_label, c.description,
         c.total_amount, c.starts_on, c.ends_on
  from public.season_dues_config c
  where c.starts_on is not null and current_date between c.starts_on and c.ends_on
  order by c.starts_on desc, c.created_at desc limit 1;
$fn$;

grant execute on function public.current_season_dues() to authenticated;

-- MAINTENANCE
-- Adding next season = one insert with starts_on/ends_on/display_label. The
-- portal switches over by itself on the start date. Ranges must not overlap;
-- if they do, the later starts_on wins.
--
-- STILL OUTSTANDING (data, not schema)
-- training_schedule_config holds rows only for season 'Spring/Summer 2026', and
-- billing-view.js requests that season by name. Until Fall rows exist there,
-- pointing that call at the current season would return an empty schedule, so
-- it is deliberately left hardcoded.
