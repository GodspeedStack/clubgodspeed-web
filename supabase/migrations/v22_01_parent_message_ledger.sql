-- ============================================================================
-- v22_01  Parent Message Ledger
-- ----------------------------------------------------------------------------
-- Every message that leaves Godspeed for a parent is recorded here, exactly
-- once, whichever function sent it. The ledger is append-only: rows are never
-- deleted and only a narrow whitelist of columns may ever change after insert.
--
-- Two tables:
--   parent_message_log     one row per message
--   parent_message_events  one row per provider lifecycle event (delivered,
--                          opened, bounced, ...) pointing back at the log row
--
-- Enforcement: the provider webhook records EVERY event it receives. An event
-- that cannot be matched to a log row means a sender bypassed the chokepoint,
-- so the webhook opens a log row with source = 'UNLOGGED' and bypassed = true.
-- A bypass therefore shows up in the admin ledger instead of vanishing.
-- ============================================================================

-- ─── 1. MESSAGE LOG ─────────────────────────────────────────────────────────

create table if not exists public.parent_message_log (
  id                  uuid primary key default gen_random_uuid(),

  -- when the send was initiated (not when it was delivered)
  occurred_at         timestamptz not null default now(),

  channel             text not null
                        check (channel in ('email','sms','push','internal')),
  direction           text not null default 'outbound'
                        check (direction in ('outbound','inbound')),

  -- which edge function / code path produced this message
  source              text not null,
  -- what the message is for, in plain club language
  purpose             text not null,
  -- 'manual'   a person clicked send
  -- 'automated' fired off the back of an app event
  -- 'cron'     scheduled job
  -- 'system'   auth / infrastructure mail
  trigger_type        text not null default 'automated'
                        check (trigger_type in ('manual','automated','cron','system')),

  -- recipient: at least one contact point is required
  recipient_email     text,
  recipient_phone     text,
  recipient_name      text,
  recipient_profile_id uuid references public.profiles(id) on delete set null,
  -- which athlete the message was about, when it was about one
  athlete_id          uuid references public.athletes(id) on delete set null,

  subject             text,
  -- plain-text rendition of what was actually sent, capped so the ledger stays
  -- a record rather than a mail store
  body_text           text,
  -- sha256 of the exact payload handed to the provider, for integrity checks
  body_hash           text,

  status              text not null default 'queued'
                        check (status in ('queued','sent','delivered','opened',
                                          'clicked','bounced','complained',
                                          'failed','unknown')),
  status_at           timestamptz not null default now(),

  provider            text
                        check (provider in ('resend','twilio','supabase_auth','internal')),
  provider_message_id text,
  error_text          text,

  -- staff member who triggered it; null for cron and system mail
  sent_by             uuid references auth.users(id) on delete set null,

  -- loose link back to the thing that caused the send
  related_table       text,
  related_id          uuid,

  -- true when the webhook saw provider traffic it could not match to a send
  -- recorded through the chokepoint helper
  bypassed            boolean not null default false,

  -- set once the admin has been told about this message
  admin_notified_at   timestamptz,

  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),

  constraint parent_message_log_has_recipient
    check (recipient_email is not null or recipient_phone is not null
           or recipient_profile_id is not null),
  constraint parent_message_log_body_capped
    check (body_text is null or length(body_text) <= 20000),
  constraint parent_message_log_subject_capped
    check (subject is null or length(subject) <= 500)
);

comment on table public.parent_message_log is
  'Append-only ledger of every message sent to a parent. Never delete rows: this is the club''s record of what families were told and when.';
comment on column public.parent_message_log.bypassed is
  'True when provider traffic arrived that no sender had logged. Indicates a code path that skipped the chokepoint helper.';

create index if not exists parent_message_log_occurred_idx
  on public.parent_message_log (occurred_at desc);
create index if not exists parent_message_log_profile_idx
  on public.parent_message_log (recipient_profile_id, occurred_at desc);
create index if not exists parent_message_log_athlete_idx
  on public.parent_message_log (athlete_id, occurred_at desc);
create index if not exists parent_message_log_email_idx
  on public.parent_message_log (lower(recipient_email), occurred_at desc);
create index if not exists parent_message_log_phone_idx
  on public.parent_message_log (recipient_phone, occurred_at desc);
create index if not exists parent_message_log_provider_msg_idx
  on public.parent_message_log (provider, provider_message_id)
  where provider_message_id is not null;
-- drives the admin unread badge
create index if not exists parent_message_log_unnotified_idx
  on public.parent_message_log (occurred_at desc)
  where admin_notified_at is null;
create index if not exists parent_message_log_bypassed_idx
  on public.parent_message_log (occurred_at desc)
  where bypassed;

-- ─── 2. DELIVERY EVENTS ─────────────────────────────────────────────────────

create table if not exists public.parent_message_events (
  id            uuid primary key default gen_random_uuid(),
  message_id    uuid not null references public.parent_message_log(id) on delete cascade,
  event_type    text not null
                  check (event_type in ('queued','sent','delivered','opened',
                                        'clicked','bounced','complained',
                                        'failed','unknown')),
  occurred_at   timestamptz not null default now(),
  provider      text,
  -- provider's own event identifier, when it supplies one; the primary
  -- idempotency key for webhook retries
  provider_event_id text,
  -- raw provider payload, kept verbatim for dispute resolution
  payload       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

comment on table public.parent_message_events is
  'Append-only provider lifecycle events for parent_message_log rows.';

create index if not exists parent_message_events_message_idx
  on public.parent_message_events (message_id, occurred_at desc);

-- Idempotency. A provider retrying the same webhook must not double-insert.
-- Primary key: the provider's own event id when it gives us one.
create unique index if not exists parent_message_events_provider_event_idx
  on public.parent_message_events (provider, provider_event_id)
  where provider_event_id is not null;
-- Fallback for providers that send no event id.
create unique index if not exists parent_message_events_dedupe_idx
  on public.parent_message_events (message_id, event_type, occurred_at);

-- ─── 3. IMMUTABILITY ────────────────────────────────────────────────────────

-- Only a narrow set of columns may change after insert. Everything that
-- describes WHAT was sent to WHOM is frozen.
create or replace function public.parent_message_log_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'parent_message_log is append-only: rows cannot be deleted';
  end if;

  if new.id is distinct from old.id
     or new.occurred_at   is distinct from old.occurred_at
     or new.channel       is distinct from old.channel
     or new.direction     is distinct from old.direction
     or new.source        is distinct from old.source
     or new.purpose       is distinct from old.purpose
     or new.trigger_type  is distinct from old.trigger_type
     or new.recipient_email is distinct from old.recipient_email
     or new.recipient_phone is distinct from old.recipient_phone
     or new.recipient_profile_id is distinct from old.recipient_profile_id
     or new.athlete_id    is distinct from old.athlete_id
     or new.subject       is distinct from old.subject
     or new.body_text     is distinct from old.body_text
     or new.body_hash     is distinct from old.body_hash
     or new.sent_by       is distinct from old.sent_by
     or new.created_at    is distinct from old.created_at
  then
    raise exception 'parent_message_log: only status, status_at, provider, provider_message_id, error_text, bypassed, admin_notified_at, related_*, metadata may change after insert';
  end if;

  return new;
end;
$$;

drop trigger if exists parent_message_log_no_delete on public.parent_message_log;
create trigger parent_message_log_no_delete
  before delete on public.parent_message_log
  for each row execute function public.parent_message_log_guard();

drop trigger if exists parent_message_log_immutable on public.parent_message_log;
create trigger parent_message_log_immutable
  before update on public.parent_message_log
  for each row execute function public.parent_message_log_guard();

create or replace function public.parent_message_events_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  raise exception 'parent_message_events is append-only';
end;
$$;

drop trigger if exists parent_message_events_append_only on public.parent_message_events;
create trigger parent_message_events_append_only
  before update or delete on public.parent_message_events
  for each row execute function public.parent_message_events_guard();

-- ─── 4. STATUS ROLL-UP ──────────────────────────────────────────────────────

-- The ledger row carries the furthest-along status seen. Events can arrive out
-- of order, so rank them and never move backwards.
create or replace function public.parent_message_status_rank(p_status text)
returns int
language sql
immutable
as $$
  select case p_status
    when 'queued'     then 10
    when 'sent'       then 20
    when 'delivered'  then 30
    when 'opened'     then 40
    when 'clicked'    then 50
    when 'bounced'    then 60
    when 'complained' then 70
    when 'failed'     then 80
    else 0
  end;
$$;

create or replace function public.parent_message_apply_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  update public.parent_message_log
     set status    = new.event_type,
         status_at = new.occurred_at
   where id = new.message_id
     and public.parent_message_status_rank(new.event_type)
       > public.parent_message_status_rank(status);
  return new;
end;
$$;

drop trigger if exists parent_message_events_rollup on public.parent_message_events;
create trigger parent_message_events_rollup
  after insert on public.parent_message_events
  for each row execute function public.parent_message_apply_event();

-- ─── 5. RLS ─────────────────────────────────────────────────────────────────

alter table public.parent_message_log    enable row level security;
alter table public.parent_message_events enable row level security;

-- Staff read the whole ledger. Nothing else is granted to any client role:
-- all writes go through service_role (edge functions), which bypasses RLS.
drop policy if exists parent_message_log_staff_read on public.parent_message_log;
create policy parent_message_log_staff_read
  on public.parent_message_log
  for select
  to authenticated
  using (public.current_user_is_staff());

drop policy if exists parent_message_events_staff_read on public.parent_message_events;
create policy parent_message_events_staff_read
  on public.parent_message_events
  for select
  to authenticated
  using (public.current_user_is_staff());

revoke all on public.parent_message_log    from anon, authenticated;
revoke all on public.parent_message_events from anon, authenticated;
grant select on public.parent_message_log    to authenticated;
grant select on public.parent_message_events to authenticated;

-- ─── 6. ADMIN READ RPCS ─────────────────────────────────────────────────────

-- Count of messages the admin has not acknowledged yet, plus the bypass count.
create or replace function public.parent_message_badge()
returns table (unread bigint, bypassed bigint, failed_24h bigint)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select
    count(*) filter (where admin_notified_at is null),
    count(*) filter (where bypassed),
    count(*) filter (where status in ('bounced','complained','failed')
                       and occurred_at > now() - interval '24 hours')
  from public.parent_message_log
  where public.current_user_is_staff();
$$;

-- Mark everything up to a point in time as seen. Forward-only.
create or replace function public.parent_message_mark_seen(p_through timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_count integer;
begin
  if not public.current_user_is_staff() then
    raise exception 'staff only';
  end if;

  update public.parent_message_log
     set admin_notified_at = now()
   where admin_notified_at is null
     and occurred_at <= p_through;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.parent_message_badge() from public, anon;
revoke all on function public.parent_message_mark_seen(timestamptz) from public, anon;
grant execute on function public.parent_message_badge() to authenticated;
grant execute on function public.parent_message_mark_seen(timestamptz) to authenticated;

-- ─── 7. ADMIN SEARCH ────────────────────────────────────────────────────────

-- Search is an RPC rather than a PostgREST filter string so the admin's typed
-- text is always a bound parameter and never part of the query grammar.
create or replace function public.parent_message_search(
  p_q       text        default null,
  p_channel text        default null,
  p_status  text        default null,
  p_since   timestamptz default null,
  p_bypassed_only boolean default false,
  p_limit   integer     default 100,
  p_offset  integer     default 0
)
returns table (
  id uuid,
  occurred_at timestamptz,
  channel text,
  source text,
  purpose text,
  trigger_type text,
  recipient_name text,
  recipient_email text,
  recipient_phone text,
  athlete_name text,
  subject text,
  status text,
  status_at timestamptz,
  error_text text,
  bypassed boolean,
  admin_notified_at timestamptz,
  sent_by_name text,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 500);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_q text := nullif(btrim(coalesce(p_q, '')), '');
begin
  if not public.current_user_is_staff() then
    raise exception 'staff only';
  end if;

  return query
  with filtered as (
    select l.*,
           nullif(btrim(coalesce(a.first_name,'') || ' ' || coalesce(a.last_name,'')), '') as ath_name,
           sp.full_name as sender_name
      from public.parent_message_log l
      left join public.athletes a  on a.id  = l.athlete_id
      left join public.profiles  sp on sp.id = l.sent_by
     where (p_channel is null or l.channel = p_channel)
       and (p_status  is null or l.status  = p_status)
       and (p_since   is null or l.occurred_at >= p_since)
       and (not coalesce(p_bypassed_only, false) or l.bypassed)
       and (
         v_q is null
         or l.recipient_email ilike '%' || v_q || '%'
         or l.recipient_phone ilike '%' || v_q || '%'
         or l.recipient_name  ilike '%' || v_q || '%'
         or l.subject         ilike '%' || v_q || '%'
         or l.purpose         ilike '%' || v_q || '%'
         or l.source          ilike '%' || v_q || '%'
         or coalesce(a.first_name,'') || ' ' || coalesce(a.last_name,'') ilike '%' || v_q || '%'
       )
  ), counted as (
    select count(*) as n from filtered
  )
  select f.id, f.occurred_at, f.channel, f.source, f.purpose, f.trigger_type,
         f.recipient_name, f.recipient_email, f.recipient_phone,
         f.ath_name, f.subject, f.status, f.status_at, f.error_text,
         f.bypassed, f.admin_notified_at, f.sender_name,
         c.n
    from filtered f cross join counted c
   order by f.occurred_at desc
   limit v_limit offset v_offset;
end;
$$;

-- Full record for one message, including its provider event trail.
create or replace function public.parent_message_detail(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  v_row jsonb;
  v_events jsonb;
begin
  if not public.current_user_is_staff() then
    raise exception 'staff only';
  end if;

  select to_jsonb(l) - 'metadata'
         || jsonb_build_object(
              'athlete_name',
              nullif(btrim(coalesce(a.first_name,'') || ' ' || coalesce(a.last_name,'')), ''),
              'sent_by_name', sp.full_name
            )
    into v_row
    from public.parent_message_log l
    left join public.athletes a  on a.id  = l.athlete_id
    left join public.profiles  sp on sp.id = l.sent_by
   where l.id = p_id;

  if v_row is null then
    raise exception 'message not found';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'event_type', e.event_type,
           'occurred_at', e.occurred_at,
           'provider', e.provider
         ) order by e.occurred_at asc), '[]'::jsonb)
    into v_events
    from public.parent_message_events e
   where e.message_id = p_id;

  return v_row || jsonb_build_object('events', v_events);
end;
$$;

revoke all on function public.parent_message_search(text,text,text,timestamptz,boolean,integer,integer) from public, anon;
revoke all on function public.parent_message_detail(uuid) from public, anon;
grant execute on function public.parent_message_search(text,text,text,timestamptz,boolean,integer,integer) to authenticated;
grant execute on function public.parent_message_detail(uuid) to authenticated;
