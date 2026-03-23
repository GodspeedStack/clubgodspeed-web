-- ============================================================
-- 05_comms.sql
-- Campaign tracking for email and SMS sends.
-- Stores per-recipient open/click events.
-- Integration target: Resend (email) + Twilio (SMS)
-- ============================================================

create type public.comms_type    as enum ('email', 'sms');
create type public.comms_status  as enum ('draft', 'sent', 'failed');

-- -----------------------------------------------------------
-- TABLE: campaigns
-- One row per send batch (e.g. "Dues Reminder - April 1")
-- -----------------------------------------------------------
create table public.campaigns (
  id             uuid          primary key default uuid_generate_v4(),
  name           text          not null,
  type           comms_type    not null,
  subject        text,                       -- email only
  body           text          not null,
  status         comms_status  not null default 'draft',
  recipient_list text[]        not null default '{}',  -- array of profile_ids or 'all'
  sent_at        timestamptz,
  sent_by        uuid          references auth.users (id) on delete set null,
  created_at     timestamptz   not null default now(),
  updated_at     timestamptz   not null default now()
);

create trigger campaigns_updated_at
  before update on public.campaigns
  for each row execute procedure public.handle_updated_at();

-- -----------------------------------------------------------
-- TABLE: campaign_events
-- Per-recipient delivery events ingested from webhook.
-- Resend sends 'delivered', 'opened', 'clicked', 'bounced'.
-- Twilio sends 'delivered', 'failed'.
-- -----------------------------------------------------------
create type public.comms_event_type as enum (
  'sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed', 'unsubscribed'
);

create table public.campaign_events (
  id           uuid                 primary key default uuid_generate_v4(),
  campaign_id  uuid                 not null references public.campaigns (id) on delete cascade,
  profile_id   uuid                 references public.profiles (id) on delete set null,
  recipient    text                 not null,   -- email address or phone number
  event_type   comms_event_type     not null,
  metadata     jsonb,                           -- provider-specific payload
  occurred_at  timestamptz          not null default now()
);

create index campaign_events_campaign_idx  on public.campaign_events (campaign_id);
create index campaign_events_profile_idx   on public.campaign_events (profile_id);
create index campaign_events_type_idx      on public.campaign_events (event_type);

-- -----------------------------------------------------------
-- VIEW: campaign_stats
-- Aggregated open/click/delivery rates per campaign.
-- -----------------------------------------------------------
create or replace view public.campaign_stats as
select
  c.id,
  c.name,
  c.type,
  c.subject,
  c.status,
  c.sent_at,
  array_length(c.recipient_list, 1) as total_recipients,
  count(distinct ce.profile_id) filter (where ce.event_type = 'delivered') as delivered,
  count(distinct ce.profile_id) filter (where ce.event_type = 'opened')    as opened,
  count(distinct ce.profile_id) filter (where ce.event_type = 'clicked')   as clicked,
  count(distinct ce.profile_id) filter (where ce.event_type = 'bounced')   as bounced,
  round(
    count(distinct ce.profile_id) filter (where ce.event_type = 'opened')::numeric
    / nullif(array_length(c.recipient_list, 1), 0) * 100, 1
  ) as open_rate_pct,
  round(
    count(distinct ce.profile_id) filter (where ce.event_type = 'clicked')::numeric
    / nullif(array_length(c.recipient_list, 1), 0) * 100, 1
  ) as click_rate_pct
from public.campaigns c
left join public.campaign_events ce on ce.campaign_id = c.id
group by c.id, c.name, c.type, c.subject, c.status, c.sent_at, c.recipient_list;

-- -----------------------------------------------------------
-- RLS: campaigns
-- -----------------------------------------------------------
alter table public.campaigns enable row level security;

create policy "directors_all_campaigns"
  on public.campaigns for all
  using (public.is_director())
  with check (public.is_director());

-- -----------------------------------------------------------
-- RLS: campaign_events
-- Webhook inserts go through a service-role key (bypasses RLS).
-- Admin reads only.
-- -----------------------------------------------------------
alter table public.campaign_events enable row level security;

create policy "directors_select_campaign_events"
  on public.campaign_events for select
  using (public.is_director());

-- No client-side insert policy - events inserted by edge function
-- using service_role key only.
