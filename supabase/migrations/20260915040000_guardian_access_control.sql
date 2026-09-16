-- Close the auto-link bypass, without putting every signup on Scott's desk.
--
-- THE HOLE: auto_link_parent_athlete() matched a signup to an athlete on a fuzzy
-- player-name comparison, and when nothing matched it CREATED the athlete. So
-- anyone who signed up and typed a real player's name was linked to that child,
-- and anyone who typed anything at all minted a roster entry. No approval, no log.
--
-- THE FIX, in two paths:
--   FAST PATH  the guardian's email was pre-authorised for that athlete, so the
--              link is automatic on signup. No admin touch. This is the common
--              case and it is what makes the change scale.
--   SLOW PATH  everything else becomes a pending guardian_request for the
--              director. Nothing is linked and no athlete is ever created.
--
-- The signup response is identical either way, so the form cannot be used to
-- probe which player names exist on the roster.

begin;

-- ── Access level and payer, per the multi-guardian spec ──────────────────────
alter table public.parent_player_links
  add column if not exists access_level text not null default 'full'
    check (access_level in ('full','view_only'));
alter table public.parent_player_links
  add column if not exists is_payer boolean not null default false;

create unique index if not exists parent_player_links_one_payer_per_athlete
  on public.parent_player_links (athlete_id) where is_payer;

-- ── Pre-authorised guardians. The fast path. ────────────────────────────────
create table if not exists public.athlete_guardian_invites (
  id            uuid primary key default gen_random_uuid(),
  athlete_id    uuid not null references public.athletes(id) on delete cascade,
  email         text not null,
  access_level  text not null default 'full' check (access_level in ('full','view_only')),
  invited_by    uuid,
  created_at    timestamptz not null default now(),
  claimed_by    uuid,
  claimed_at    timestamptz,
  revoked_at    timestamptz
);
create unique index if not exists athlete_guardian_invites_open
  on public.athlete_guardian_invites (athlete_id, lower(email))
  where revoked_at is null;
create index if not exists athlete_guardian_invites_email
  on public.athlete_guardian_invites (lower(email)) where revoked_at is null and claimed_at is null;

-- ── Requests needing a human. The slow path. ────────────────────────────────
create table if not exists public.guardian_requests (
  id                    uuid primary key default gen_random_uuid(),
  athlete_id            uuid references public.athletes(id) on delete cascade,
  requested_player_name text,
  requested_grade       text,
  requested_by          uuid,
  invitee_email         text not null,
  invitee_name          text,
  relationship          text,
  requested_level       text not null default 'full' check (requested_level in ('full','view_only')),
  status                text not null default 'pending' check (status in ('pending','approved','denied')),
  source                text not null default 'signup',
  decided_by            uuid,
  decided_at            timestamptz,
  internal_note         text,
  created_at            timestamptz not null default now()
);
create index if not exists guardian_requests_pending
  on public.guardian_requests (created_at desc) where status = 'pending';

-- ── Insert-only audit, same shape as document_events ────────────────────────
create table if not exists public.guardian_link_log (
  id                 uuid primary key default gen_random_uuid(),
  athlete_id         uuid,
  actor_profile_id   uuid,
  subject_profile_id uuid,
  action             text not null,
  detail             text,
  created_at         timestamptz not null default now()
);

-- ── Barred people stay barred ───────────────────────────────────────────────
create table if not exists public.guardian_bars (
  id         uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  email      text not null,
  barred_by  uuid,
  reason     text,
  created_at timestamptz not null default now()
);
create unique index if not exists guardian_bars_unique
  on public.guardian_bars (athlete_id, lower(email));

alter table public.athlete_guardian_invites enable row level security;
alter table public.guardian_requests        enable row level security;
alter table public.guardian_link_log        enable row level security;
alter table public.guardian_bars            enable row level security;

-- Staff only. Parents reach these through RPCs, never directly.
do $$
declare t text;
begin
  foreach t in array array['athlete_guardian_invites','guardian_requests','guardian_link_log','guardian_bars'] loop
    execute format('drop policy if exists %I on public.%I', t || '_staff_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.current_user_is_staff()) with check (public.current_user_is_staff())',
      t || '_staff_all', t);
  end loop;
end $$;

-- ── Backfill: every existing link becomes a claimed invite, so nothing that
-- ── already works starts asking for approval.
insert into public.athlete_guardian_invites (athlete_id, email, access_level, claimed_by, claimed_at)
select ppl.athlete_id, lower(p.email), 'full', ppl.profile_id, now()
from public.parent_player_links ppl
join public.profiles p on p.id = ppl.profile_id
where p.email is not null
on conflict do nothing;

-- One payer per athlete: seed from the primary guardian where one exists.
update public.parent_player_links ppl set is_payer = true
where ppl.is_primary
  and not exists (select 1 from public.parent_player_links x
                   where x.athlete_id = ppl.athlete_id and x.is_payer);

-- ── The rewritten linker ────────────────────────────────────────────────────
create or replace function public.auto_link_parent_athlete(p_profile_id uuid)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_prof    public.profiles%rowtype;
  v_name    text;
  v_grade   text;
  v_inv     public.athlete_guardian_invites%rowtype;
  v_primary boolean;
begin
  select * into v_prof from public.profiles where id = p_profile_id;
  if not found or v_prof.role <> 'parent' then return 'not_parent'; end if;
  if exists (select 1 from public.parent_player_links where profile_id = p_profile_id) then
    return 'already_linked';
  end if;

  -- FAST PATH: this email was pre-authorised for a specific athlete.
  select * into v_inv
  from public.athlete_guardian_invites i
  where lower(i.email) = lower(v_prof.email)
    and i.revoked_at is null
    and i.claimed_at is null
    and not exists (select 1 from public.guardian_bars b
                     where b.athlete_id = i.athlete_id
                       and lower(b.email) = lower(v_prof.email))
  order by i.created_at asc
  limit 1;

  if found then
    v_primary := not exists (select 1 from public.parent_player_links
                              where athlete_id = v_inv.athlete_id);
    insert into public.parent_player_links (profile_id, athlete_id, relationship, is_primary, access_level)
    values (p_profile_id, v_inv.athlete_id, 'guardian', v_primary, v_inv.access_level)
    on conflict (profile_id, athlete_id) do nothing;

    update public.athlete_guardian_invites
       set claimed_by = p_profile_id, claimed_at = now()
     where id = v_inv.id;

    insert into public.guardian_link_log (athlete_id, actor_profile_id, subject_profile_id, action, detail)
    values (v_inv.athlete_id, p_profile_id, p_profile_id, 'linked', 'pre-authorised invite claimed at signup');

    return 'linked';
  end if;

  -- SLOW PATH: queue it. Never link, never create an athlete.
  v_name  := nullif(btrim(v_prof.player_name), '');
  v_grade := v_prof.grade;
  if v_name is null then
    select nullif(btrim(r.player_name), ''), coalesce(v_grade, r.grade)
      into v_name, v_grade
    from public.login_requests r
    where r.user_id = p_profile_id or lower(r.email) = lower(v_prof.email)
    order by r.created_at desc limit 1;
  end if;

  insert into public.guardian_requests
    (requested_player_name, requested_grade, requested_by, invitee_email, invitee_name, relationship, source)
  values
    (v_name, v_grade, p_profile_id, lower(v_prof.email), v_prof.full_name, 'guardian', 'signup');

  insert into public.guardian_link_log (actor_profile_id, subject_profile_id, action, detail)
  values (p_profile_id, p_profile_id, 'requested', 'signup did not match a pre-authorised invite');

  return 'pending_review';
end $function$;

revoke all on function public.auto_link_parent_athlete(uuid) from public, anon;

commit;
