-- =====================================================================
-- v8_01_impersonation_audit.sql
-- Admin impersonation audit log. Append-only. Readable by coach/director.
-- Writes only via admin-impersonate edge function (service_role).
-- =====================================================================

create table if not exists impersonation_audit (
  id              uuid primary key default gen_random_uuid(),
  admin_user_id   uuid not null references auth.users(id) on delete restrict,
  admin_name      text,
  admin_email     text,
  target_user_id  uuid not null references auth.users(id) on delete restrict,
  target_email    text not null,
  target_name     text,
  reason          text not null check (char_length(reason) between 3 and 500),
  ip_address      inet,
  user_agent      text,
  link_expires_at timestamptz not null,
  created_at      timestamptz not null default now()
);

create index if not exists idx_impersonation_audit_admin_time
  on impersonation_audit (admin_user_id, created_at desc);

create index if not exists idx_impersonation_audit_target_time
  on impersonation_audit (target_user_id, created_at desc);

create index if not exists idx_impersonation_audit_created_at
  on impersonation_audit (created_at desc);

-- =====================================================================
-- RLS: append-only from service_role, read-only for admins
-- =====================================================================
alter table impersonation_audit enable row level security;

-- Admins (coach/director) can read all audit rows
drop policy if exists "admins_read_impersonation_audit" on impersonation_audit;
create policy "admins_read_impersonation_audit"
  on impersonation_audit
  for select
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('coach', 'director')
    )
  );

-- No insert/update/delete policies defined: only service_role (edge function)
-- can write, and nothing can mutate rows after insert. This enforces
-- immutability for SOC2-friendly audit trails.

-- =====================================================================
-- Rate-limit helper: count recent impersonations by a given admin
-- Used by the edge function before generating a new link.
-- =====================================================================
create or replace function recent_impersonation_count(p_admin_id uuid, p_window_minutes int default 60)
returns integer
language sql
security definer
set search_path = public
as $$
  select count(*)::int
  from impersonation_audit
  where admin_user_id = p_admin_id
    and created_at >= now() - make_interval(mins => p_window_minutes);
$$;

revoke all on function recent_impersonation_count(uuid, int) from public;
grant execute on function recent_impersonation_count(uuid, int) to service_role;

-- =====================================================================
-- Convenience view: last 50 impersonations for the admin dashboard
-- =====================================================================
create or replace view impersonation_audit_recent as
select
  id,
  admin_name,
  admin_email,
  target_name,
  target_email,
  reason,
  created_at,
  link_expires_at
from impersonation_audit
order by created_at desc
limit 50;

grant select on impersonation_audit_recent to authenticated;

comment on table impersonation_audit is
  'Append-only audit log of admin impersonation events. Writes via admin-impersonate edge function only.';
