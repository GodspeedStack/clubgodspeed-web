-- 20260824020000: parent-initiated "Already Paid Dues" review requests
-- A parent clicks "Already Paid Dues" in the portal; this logs a request the
-- admin can act on. Private-by-design: table is deny-all + RPC-only, and the
-- RPC derives identity ONLY from the caller's JWT (never trusts the client).

create table if not exists public.dues_review_requests (
  id           uuid primary key default gen_random_uuid(),
  parent_email text not null,
  athlete_id   uuid,
  note         text,
  status       text not null default 'pending',   -- pending | resolved
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz
);

alter table public.dues_review_requests enable row level security;
revoke all on public.dues_review_requests from anon, authenticated;

create or replace function public.request_dues_review(p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  a_id uuid;
begin
  if caller_email = '' then
    return jsonb_build_object('ok', false, 'error', 'Not authenticated');
  end if;

  -- De-dupe: one open request per parent at a time.
  if exists (select 1 from public.dues_review_requests
              where parent_email = caller_email and status = 'pending') then
    return jsonb_build_object('ok', true, 'existing', true);
  end if;

  -- Best-effort link to one of the caller's athletes.
  select ap.athlete_id into a_id
    from athlete_parents ap
    join parent_accounts pa on pa.id = ap.parent_account_id
   where lower(pa.email) = caller_email
   limit 1;

  insert into public.dues_review_requests (parent_email, athlete_id, note)
  values (caller_email, a_id, nullif(p_note, ''));

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.request_dues_review(text) from public, anon;
grant execute on function public.request_dues_review(text) to authenticated;
