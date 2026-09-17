-- ============================================================================
-- v23_01  Godspeed Futures network intake
-- ----------------------------------------------------------------------------
-- Parents tell us their line of work and which fields they can open a door to.
-- The form is public on purpose: 10 of 37 real parents have never signed in, so
-- gating this behind the portal would lose about a third of the answers.
--
-- Public means anon can INSERT and nothing else. Anon cannot read, update or
-- delete a single row, so one parent can never see another parent's answer or
-- harvest the list. Staff read and triage.
-- ============================================================================

create table if not exists public.futures_network_signups (
  id                uuid primary key default gen_random_uuid(),
  submitted_at      timestamptz not null default now(),

  -- what the parent typed. No account required, so we take their word for who
  -- they are and reconcile to a profile afterwards.
  parent_name       text not null,
  parent_email      text not null,
  parent_phone      text,
  athlete_name      text,

  line_of_work      text not null,
  employer          text,
  -- free text: the cousin who is an architect, the friend who runs a station
  fields_i_can_reach text,
  willing_to_speak  boolean not null default false,
  notes             text,

  -- resolved after the fact, never trusted from the form
  matched_profile_id uuid references public.profiles(id) on delete set null,
  status            text not null default 'new'
                      check (status in ('new','reviewed','approved','declined')),
  reviewed_by       uuid references auth.users(id) on delete set null,
  reviewed_at       timestamptz,

  source            text not null default 'futures_form',

  -- timestamptz::date depends on the session TimeZone and is therefore not
  -- IMMUTABLE, so it cannot be indexed directly. Pinning the conversion to UTC
  -- makes it immutable and lets the one-per-day guard below be a plain index.
  submitted_date    date generated always as ((submitted_at at time zone 'UTC')::date) stored,

  -- Length caps. This is an unauthenticated write path, so every free-text
  -- field is bounded at the database rather than trusting the page.
  constraint futures_name_len    check (length(parent_name) between 1 and 120),
  constraint futures_email_len   check (length(parent_email) between 3 and 200),
  constraint futures_email_shape check (parent_email like '%_@_%.__%'),
  constraint futures_phone_len   check (parent_phone is null or length(parent_phone) <= 40),
  constraint futures_athlete_len check (athlete_name is null or length(athlete_name) <= 120),
  constraint futures_work_len    check (length(line_of_work) between 1 and 500),
  constraint futures_employer_len check (employer is null or length(employer) <= 200),
  constraint futures_reach_len   check (fields_i_can_reach is null or length(fields_i_can_reach) <= 2000),
  constraint futures_notes_len   check (notes is null or length(notes) <= 2000)
);

comment on table public.futures_network_signups is
  'Godspeed Futures intake. Parents submit their line of work and the fields they can reach. Public insert, staff read. Scott approves every professional before they come near the boys.';

create index if not exists futures_signups_submitted_idx
  on public.futures_network_signups (submitted_at desc);
create index if not exists futures_signups_status_idx
  on public.futures_network_signups (status, submitted_at desc);
create index if not exists futures_signups_email_idx
  on public.futures_network_signups (lower(parent_email));

-- One submission per email per day. A parent correcting their answer tomorrow
-- is fine; a script hammering the endpoint is not.
create unique index if not exists futures_signups_one_per_day_idx
  on public.futures_network_signups (lower(parent_email), submitted_date);

-- ─── RLS ────────────────────────────────────────────────────────────────────

alter table public.futures_network_signups enable row level security;

revoke all on public.futures_network_signups from anon, authenticated;

-- Anon may add a row and nothing else. No SELECT policy exists for anon, so
-- there is no way to read back what anyone submitted.
grant insert on public.futures_network_signups to anon, authenticated;

drop policy if exists futures_public_insert on public.futures_network_signups;
create policy futures_public_insert
  on public.futures_network_signups
  for insert
  to anon, authenticated
  with check (
    -- The form may only ever create a fresh, untriaged row.
    -- matched_profile_id is deliberately NOT checked here: the BEFORE INSERT
    -- trigger below overwrites it unconditionally, and Postgres runs BEFORE
    -- triggers before evaluating WITH CHECK, so requiring null here would
    -- reject every submission whose email matches a known parent.
    status = 'new'
    and reviewed_by is null
    and reviewed_at is null
    and source = 'futures_form'
  );

-- Staff read and triage.
grant select, update on public.futures_network_signups to authenticated;

drop policy if exists futures_staff_read on public.futures_network_signups;
create policy futures_staff_read
  on public.futures_network_signups
  for select to authenticated
  using (public.current_user_is_staff());

drop policy if exists futures_staff_update on public.futures_network_signups;
create policy futures_staff_update
  on public.futures_network_signups
  for update to authenticated
  using (public.current_user_is_staff())
  with check (public.current_user_is_staff());

-- ─── Reconcile a submission to a known family ───────────────────────────────

-- Match on email only. Never infer a family from a surname.
create or replace function public.futures_match_profile()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  -- Overwrite unconditionally. Whatever the client sent is discarded, which is
  -- what makes it safe to leave this column out of the insert policy.
  new.matched_profile_id := (
    select p.id from public.profiles p
     where lower(p.email) = lower(new.parent_email)
     limit 1
  );
  return new;
end;
$$;

drop trigger if exists futures_match_profile_trg on public.futures_network_signups;
create trigger futures_match_profile_trg
  before insert on public.futures_network_signups
  for each row execute function public.futures_match_profile();
