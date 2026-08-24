-- 20260824020000: parent "Already Paid Dues" review requests
-- Parent clicks the portal button -> request_dues_review() logs a row.
-- Parents have NO direct row access (write via SECURITY DEFINER RPC only).
-- Staff (director/admin) can read and resolve, so the admin portal surfaces them.

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
revoke all on public.dues_review_requests from anon;
grant select, update on public.dues_review_requests to authenticated;

drop policy if exists dues_review_staff_read on public.dues_review_requests;
create policy dues_review_staff_read on public.dues_review_requests
  for select to authenticated using (public.current_user_is_staff());

drop policy if exists dues_review_staff_update on public.dues_review_requests;
create policy dues_review_staff_update on public.dues_review_requests
  for update to authenticated using (public.current_user_is_staff())
  with check (public.current_user_is_staff());

create or replace function public.request_dues_review(p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare caller_email text := lower(coalesce(auth.jwt() ->> 'email','')); a_id uuid;
begin
  if caller_email = '' then return jsonb_build_object('ok',false,'error','Not authenticated'); end if;
  if exists (select 1 from public.dues_review_requests where parent_email=caller_email and status='pending')
    then return jsonb_build_object('ok',true,'existing',true); end if;
  select ap.athlete_id into a_id from athlete_parents ap
    join parent_accounts pa on pa.id = ap.parent_account_id
    where lower(pa.email)=caller_email limit 1;
  insert into public.dues_review_requests (parent_email, athlete_id, note)
    values (caller_email, a_id, nullif(p_note,''));
  return jsonb_build_object('ok',true);
end; $$;
revoke all on function public.request_dues_review(text) from public, anon;
grant execute on function public.request_dues_review(text) to authenticated;

-- realtime so the admin portal gets a live toast on new requests
alter publication supabase_realtime add table public.dues_review_requests;
