-- ============================================================
-- season_config: single source of truth for AAU season data
-- ============================================================

create table public.season_config (
  id            uuid          primary key default gen_random_uuid(),
  created_at    timestamptz   default now(),
  updated_at    timestamptz   default now(),
  season        text          not null default 'Spring/Summer 2026',
  season_fee    numeric(10,2) not null default 724.00,
  due_date      date          not null default '2026-04-01',
  total_families int          not null default 11,
  program_cost  numeric(10,2) not null default 6040.00,
  fundraise_goal numeric(10,2) not null default 6040.00,
  teams jsonb not null default '[
    {"grade": "4th", "count": 5},
    {"grade": "5th", "count": 6}
  ]',
  tournaments jsonb not null default '[
    {"name": "iHoop Spring Classic",            "fee_4th": 325, "fee_5th": 325},
    {"name": "BigFoot Battle of the Rockies",   "fee_4th": 395, "fee_5th": 395},
    {"name": "iHoop Spring Showdown",           "fee_4th": 425, "fee_5th": 425},
    {"name": "JPS Tournament #1",               "fee_4th": 325, "fee_5th": 325},
    {"name": "JPS Tournament #2",               "fee_4th": 325, "fee_5th": 325},
    {"name": "Gold Crown Spring Hoops Classic", "fee_4th": 475, "fee_5th": 475}
  ]',
  gym_sessions jsonb not null default '[
    {"label": "Gym spring (Mar-May, 36 sessions)", "cost": 900},
    {"label": "Gym summer (Jun-Jul, 24 sessions)", "cost": 600}
  ]',
  timeline jsonb not null default '[
    {"month": "Mar 2026",   "desc": "Spring opens. Training 3x per week begins."},
    {"month": "Apr 2026",   "desc": "JPS #1 — Apr 25-26. Dues due April 1."},
    {"month": "May 2026",   "desc": "Gold Crown + JPS #2."},
    {"month": "Jun-Jul 2026","desc": "Summer training. No tournaments."},
    {"month": "Late July",  "desc": "Season break begins."},
    {"month": "Fall 2026",  "desc": "Resumes late September."},
    {"month": "2027",       "desc": "Vegas. Hi-Top Risen national elite."}
  ]',
  notes jsonb not null default '[
    "Entry fees paid directly to event organizers — zero markup.",
    "Uniforms are a separate club investment, not included above."
  ]',
  is_active boolean not null default true
);

-- Only one active config at a time
create unique index idx_season_config_active
  on public.season_config(is_active)
  where is_active = true;

-- Auto-update updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger season_config_updated_at
  before update on public.season_config
  for each row execute function public.set_updated_at();

-- RLS
alter table public.season_config enable row level security;

create policy "Anyone can read active config"
  on public.season_config for select
  using (is_active = true);

create policy "Admin full access"
  on public.season_config for all
  using (
    exists (
      select 1 from public.user_profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Seed initial record
insert into public.season_config default values;
