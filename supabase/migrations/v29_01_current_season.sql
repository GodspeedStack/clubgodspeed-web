-- v29_01_current_season.sql
--
-- WHY
-- The parent portal hardcoded "AAU Season Dues" in five places. Parents saw the
-- correct amount from their own enrollment under a heading that named no season
-- at all, and would have kept saying "AAU" straight through the Winter turnover.
--
-- WHAT DECIDES THE SEASON
-- The date, against season_dues_config.starts_on / ends_on. Those windows are
-- contiguous (Summer ends 08-31, Fall 09-01 to 11-30, Winter 12-01 to 03-31),
-- so exactly one row covers any given day.
--
-- WHY NOT THE LEAGUE DATA
-- team_tournament_schedule looks like the natural signal and cannot be trusted:
-- on 2026-10-02 every row in it reads status = 'cancelled', including the JPS
-- Fall 5v5 League that is running and being played. Keying the season off it
-- would report that no season exists. So the league is corroboration only, and
-- the disagreement is surfaced rather than silently resolved.
--
-- is_active is an admin publishing switch, not the season. Winter 2026-27 is
-- staged with is_active = false under an embargo. If the date rolls into a
-- season that is still unpublished, that is an operational alarm, not something
-- to paper over: needs_attention goes true and total_amount stays null so no
-- embargoed price can leak.

create or replace function public.get_current_season()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  cfg            public.season_dues_config%rowtype;
  v_by_date      boolean := false;
  v_league_live  int := 0;
  v_league_rows  int := 0;
  v_league_bad   int := 0;
  v_attention    text := null;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  -- 1. The window today falls inside. Prefer a published row if two overlap.
  select * into cfg
    from public.season_dues_config
   where current_date between starts_on and ends_on
   order by is_active desc, starts_on desc
   limit 1;

  if found then
    v_by_date := true;
    if not cfg.is_active then
      v_attention := 'The season covering today is not published yet. '
                  || 'Activate it in season_dues_config before billing or announcing.';
    end if;
  else
    -- 2. No window covers today (a gap between seasons). Fall back to whatever
    --    is published so the portal still names something truthful.
    select * into cfg from public.season_dues_config where is_active order by starts_on desc limit 1;
    if found then
      v_attention := 'No season window covers today. Showing the published season instead; '
                  || 'extend ends_on or add the next season.';
    end if;
  end if;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'display_label', 'Season Dues',
      'needs_attention', true,
      'attention', 'No season_dues_config row is published and none covers today.');
  end if;

  -- 3. League corroboration. Informational only.
  select count(*),
         count(*) filter (where status <> 'cancelled'
                            and current_date between start_date and end_date),
         count(*) filter (where status = 'cancelled')
    into v_league_rows, v_league_live, v_league_bad
    from public.team_tournament_schedule;

  return jsonb_build_object(
    'ok', true,
    'season',        cfg.season,
    'program',       cfg.program,
    'display_label', coalesce(nullif(cfg.display_label, ''), cfg.season || ' Season Dues'),
    'starts_on',     cfg.starts_on,
    'ends_on',       cfg.ends_on,
    'is_active',     cfg.is_active,
    'matched_by_date', v_by_date,
    'days_remaining', greatest(0, cfg.ends_on - current_date),
    -- An unpublished season must not leak its price. See the Winter embargo.
    'total_amount',  case when cfg.is_active then cfg.total_amount else null end,
    'league_events_running', v_league_live,
    'league_status_unreliable', (v_league_rows > 0 and v_league_bad = v_league_rows),
    'needs_attention', (v_attention is not null),
    'attention', v_attention);
end $$;

revoke all on function public.get_current_season() from public, anon;
grant execute on function public.get_current_season() to authenticated;
