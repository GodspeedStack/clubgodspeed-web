-- ============================================================================
-- v25_01  Game reminders
--
-- Parents are never told about a game unless they open the portal and look.
-- This adds the idempotency ledger behind send-game-reminders so a family is
-- told about a given game at most once per reminder kind, no matter how many
-- times the cron fires, retries, or is replayed by hand.
--
-- The uniqueness lives in the database, not in the function's control flow,
-- because a double-send to 36 families is not recoverable by apology.
-- ============================================================================

create table if not exists public.game_reminder_log (
  id             uuid primary key default gen_random_uuid(),

  -- the calendar_events row this reminder is about
  event_id       uuid not null references public.calendar_events(id) on delete cascade,

  -- 'week_ahead' = Thursday preview; 'day_of' = morning of the game
  reminder_kind  text not null
                   check (reminder_kind in ('week_ahead','day_of')),

  -- lowercased at write time by the trigger below: an address that differs
  -- only by case is the same inbox and must not receive the message twice
  recipient_email text not null,

  -- who/what it was about, kept for the admin view and for debugging a miss
  profile_id     uuid references public.profiles(id) on delete set null,
  team_id        uuid references public.teams(id) on delete set null,
  athlete_ids    uuid[] not null default '{}',

  -- joins this row to the parent message ledger (v24_01), so every reminder
  -- is traceable end to end: why it was sent, that it was sent, what happened
  message_log_id uuid references public.parent_message_log(id) on delete set null,

  -- The row is written as a CLAIM before the send is attempted, so two
  -- concurrent runs cannot both mail the same family. If the send then fails,
  -- the claim is marked failed rather than deleted (deletes are blocked), and
  -- the partial unique index below frees the slot so the next run retries.
  send_failed    boolean not null default false,
  fail_reason    text,

  sent_at        timestamptz not null default now(),
  created_at     timestamptz not null default now()
);

-- The real guarantee. One SUCCESSFUL claim per (event, kind, inbox).
-- Partial, so a failed attempt does not permanently bar the retry: a family
-- missing a game reminder because Resend blipped once is the worse outcome.
create unique index if not exists game_reminder_log_once
  on public.game_reminder_log (event_id, reminder_kind, recipient_email)
  where send_failed = false;

-- Claims that were never resolved either way: written, then the run died
-- before it could record success or failure. Surfaced so they are visible
-- rather than silently blocking a family's reminder forever.
create index if not exists game_reminder_log_in_flight_idx
  on public.game_reminder_log (sent_at)
  where send_failed = false and message_log_id is null;

create index if not exists game_reminder_log_sent_at_idx
  on public.game_reminder_log (sent_at desc);

create index if not exists game_reminder_log_event_idx
  on public.game_reminder_log (event_id);

-- ---------------------------------------------------------------------------
-- Normalise the address before the unique index sees it.
-- Doing this in a BEFORE trigger rather than trusting every caller means a
-- future sender cannot reintroduce the duplicate by forgetting to lowercase.
-- ---------------------------------------------------------------------------
create or replace function public.game_reminder_log_normalise()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $fn$
begin
  new.recipient_email := lower(btrim(new.recipient_email));
  if new.recipient_email = '' then
    raise exception 'game_reminder_log: recipient_email cannot be blank';
  end if;
  return new;
end;
$fn$;

drop trigger if exists game_reminder_log_normalise_trg on public.game_reminder_log;
create trigger game_reminder_log_normalise_trg
  before insert or update on public.game_reminder_log
  for each row execute function public.game_reminder_log_normalise();

-- ---------------------------------------------------------------------------
-- Append-only. A reminder that was sent stays sent; deleting the row would
-- re-arm the send and mail the family a second time.
-- ---------------------------------------------------------------------------
create or replace function public.game_reminder_log_guard()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $fn$
begin
  raise exception 'game_reminder_log is append-only: rows cannot be deleted';
end;
$fn$;

drop trigger if exists game_reminder_log_no_delete on public.game_reminder_log;
create trigger game_reminder_log_no_delete
  before delete on public.game_reminder_log
  for each row execute function public.game_reminder_log_guard();

-- ---------------------------------------------------------------------------
-- RLS: staff read only. The function writes with the service role, which
-- bypasses RLS; nothing client-side has any business reading this.
-- ---------------------------------------------------------------------------
alter table public.game_reminder_log enable row level security;

drop policy if exists game_reminder_log_staff_read on public.game_reminder_log;
create policy game_reminder_log_staff_read
  on public.game_reminder_log
  for select
  to authenticated
  using (public.current_user_is_staff());

revoke all on public.game_reminder_log from anon, authenticated;
grant select on public.game_reminder_log to authenticated;

comment on table public.game_reminder_log is
  'Idempotency ledger for send-game-reminders. One row per (event, kind, inbox). Append-only.';
