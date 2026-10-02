-- =============================================================================
-- Community Wall v1
-- Photo + short-video wall shared by every current Godspeed family.
--
-- Contract (decided by Scott 2026-10-02):
--   * Visibility : one program-wide feed, filterable by team. Signed-in,
--                  approved families with a player on an active roster, plus
--                  approved staff. Nobody else, ever.
--   * Moderation : posts go live instantly. Any member can report; a report
--                  hides the item until a coach restores or removes it.
--   * Sharing    : no public links. Media is read through short-lived signed
--                  URLs; parents may save or use the phone share sheet.
--
-- Security model:
--   * Every wall_* table has RLS ON and NO policies -> deny all direct access.
--   * All reads and writes go through SECURITY DEFINER RPCs below, granted to
--     `authenticated` only (anon and PUBLIC explicitly revoked).
--   * Storage bucket `community-wall` is private. Uploads are allowed only to
--     paths the server reserved for the caller's own processing post. Reads
--     are allowed only for media on posts the caller may see.
--   * Athlete tags require a signed Social Media Release (documents.slug='media').
--
-- Errors: RAISE with message = CODE and detail = human text, so the client
-- surfaces { code, message, details } (architecture contract 4).
-- Idempotency: create_post / add_comment take a client-generated UUID;
-- set_like is a set, not a toggle (architecture contract 3).
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Tables
-- -----------------------------------------------------------------------------
create table public.wall_posts (
  id            uuid primary key default gen_random_uuid(),
  author_id     uuid not null references public.profiles(id) on delete cascade,
  client_id     uuid not null,
  team_id       uuid references public.teams(id) on delete set null,
  caption       text not null default '' check (char_length(caption) <= 500),
  status        text not null default 'processing'
                  check (status in ('processing','live','hidden','removed')),
  pinned_at     timestamptz,
  like_count    integer not null default 0 check (like_count >= 0),
  comment_count integer not null default 0 check (comment_count >= 0),
  created_at    timestamptz not null default now(),
  published_at  timestamptz,
  updated_at    timestamptz not null default now(),
  unique (author_id, client_id)
);
comment on table public.wall_posts is 'Community wall posts. RLS deny-all; access only via wall_* RPCs.';
create index wall_posts_feed_idx on public.wall_posts (status, published_at desc, id desc);
create index wall_posts_team_idx on public.wall_posts (team_id, status, published_at desc);
create index wall_posts_author_idx on public.wall_posts (author_id, created_at desc);

create table public.wall_media (
  id           uuid primary key default gen_random_uuid(),
  post_id      uuid not null references public.wall_posts(id) on delete cascade,
  position     smallint not null check (position between 0 and 9),
  kind         text not null check (kind in ('image','video')),
  mime         text not null check (mime in ('image/jpeg','image/webp','video/mp4','video/quicktime')),
  storage_path text not null unique,
  poster_path  text unique,
  bytes        integer not null check (bytes > 0),
  width        integer check (width is null or width between 1 and 10000),
  height       integer check (height is null or height between 1 and 10000),
  duration_ms  integer check (duration_ms is null or duration_ms between 0 and 61000),
  unique (post_id, position),
  check ((kind = 'image' and mime like 'image/%' and bytes <= 10485760)
      or (kind = 'video' and mime like 'video/%' and bytes <= 52428800 and poster_path is not null))
);
comment on table public.wall_media is 'Media items for wall posts (max 10 per post). Objects live in storage bucket community-wall.';

create table public.wall_likes (
  post_id    uuid not null references public.wall_posts(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table public.wall_comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.wall_posts(id) on delete cascade,
  author_id  uuid not null references public.profiles(id) on delete cascade,
  client_id  uuid not null,
  body       text not null check (char_length(btrim(body)) between 1 and 500),
  status     text not null default 'live' check (status in ('live','hidden','removed')),
  created_at timestamptz not null default now(),
  unique (author_id, client_id)
);
create index wall_comments_post_idx on public.wall_comments (post_id, created_at);

create table public.wall_tags (
  post_id    uuid not null references public.wall_posts(id) on delete cascade,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  tagged_by  uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, athlete_id)
);
create index wall_tags_athlete_idx on public.wall_tags (athlete_id);

create table public.wall_reports (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid references public.wall_posts(id) on delete cascade,
  comment_id  uuid references public.wall_comments(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason      text not null check (reason in ('not_our_program','inappropriate','privacy','spam','other')),
  note        text check (note is null or char_length(note) <= 300),
  created_at  timestamptz not null default now(),
  check ((post_id is not null) <> (comment_id is not null))
);
create unique index wall_reports_post_once on public.wall_reports (reporter_id, post_id) where post_id is not null;
create unique index wall_reports_comment_once on public.wall_reports (reporter_id, comment_id) where comment_id is not null;
create index wall_reports_created_idx on public.wall_reports (reporter_id, created_at desc);

-- Append-only audit of every moderation, removal and untag action.
create table public.wall_moderation_log (
  id         bigint generated always as identity primary key,
  actor_id   uuid not null,
  action     text not null,
  post_id    uuid,
  comment_id uuid,
  detail     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
comment on table public.wall_moderation_log is 'Append-only. Never UPDATE or DELETE.';

create or replace function public.wall_block_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'APPEND_ONLY' using detail = 'wall_moderation_log is append-only.';
end $$;
create trigger wall_moderation_log_no_update before update or delete on public.wall_moderation_log
  for each row execute function public.wall_block_mutation();

-- Deny-all: RLS on, no policies, no table grants to client roles.
alter table public.wall_posts          enable row level security;
alter table public.wall_media          enable row level security;
alter table public.wall_likes          enable row level security;
alter table public.wall_comments       enable row level security;
alter table public.wall_tags           enable row level security;
alter table public.wall_reports        enable row level security;
alter table public.wall_moderation_log enable row level security;
revoke all on public.wall_posts, public.wall_media, public.wall_likes, public.wall_comments,
              public.wall_tags, public.wall_reports, public.wall_moderation_log
  from anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Internal helpers (not callable by clients)
-- -----------------------------------------------------------------------------
create or replace function public.wall_is_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.approved = true
      and p.role::text in ('coach','director','founder')
  );
$$;

create or replace function public.wall_family_athletes()
returns uuid[] language sql stable security definer set search_path = '' as $$
  select public.family_athlete_ids(auth.uid(), auth.jwt() ->> 'email');
$$;

-- Active teams the caller's family plays on.
create or replace function public.wall_my_team_ids()
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct r.team_id), '{}'::uuid[])
  from public.team_rosters r
  join public.teams t on t.id = r.team_id
  where r.left_at is null and t.is_active
    and r.athlete_id = any(public.wall_family_athletes());
$$;

-- Member = approved staff, or approved parent with a player on an active roster.
create or replace function public.wall_is_member()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    public.wall_is_staff()
    or (
      exists (select 1 from public.profiles p
              where p.id = auth.uid() and p.approved = true and p.role::text = 'parent')
      and cardinality(public.wall_my_team_ids()) > 0
    )
  );
$$;

create or replace function public.wall_media_release_ok(p_athlete uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_agreements ua
    join public.documents d on d.id = ua.document_id
    where d.slug = 'media' and d.is_active and ua.athlete_id = p_athlete and ua.status = 'signed'
  );
$$;

-- "Jordan Smith" -> "Jordan S." Keeps surnames off the wall. Suffixes ignored.
create or replace function public.wall_display_name(p_full text)
returns text language sql immutable set search_path = '' as $$
  select case
    when n = '' then 'Godspeed Family'
    when position(' ' in n) = 0 then n
    else split_part(n, ' ', 1) || ' ' || upper(left(reverse(split_part(reverse(n), ' ', 1)), 1)) || '.'
  end
  from (select regexp_replace(regexp_replace(btrim(coalesce(p_full, '')), '\s+', ' ', 'g'),
                              ',?\s+(jr|sr|ii|iii|iv)\.?$', '', 'i') as n) x;
$$;

create or replace function public.wall_post_json(p public.wall_posts, p_uid uuid, p_staff boolean, p_mine uuid[])
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id,
    'author', (
      select jsonb_build_object(
        'id', pr.id,
        'name', public.wall_display_name(pr.full_name),
        'is_staff', pr.role::text in ('coach','director','founder'),
        'title', case when pr.role::text in ('coach','director','founder')
                      then coalesce(nullif(btrim(pr.title), ''), 'Coach') end)
      from public.profiles pr where pr.id = p.author_id),
    'team', (select jsonb_build_object('id', t.id, 'name', t.name) from public.teams t where t.id = p.team_id),
    'caption', p.caption,
    'status', p.status,
    'published_at', p.published_at,
    'pinned', p.pinned_at is not null,
    'like_count', p.like_count,
    'comment_count', p.comment_count,
    'liked', exists (select 1 from public.wall_likes l where l.post_id = p.id and l.user_id = p_uid),
    'is_mine', p.author_id = p_uid,
    'can_moderate', p_staff,
    'media', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', m.id, 'kind', m.kind, 'path', m.storage_path, 'poster', m.poster_path,
               'width', m.width, 'height', m.height, 'duration_ms', m.duration_ms)
             order by m.position)
      from public.wall_media m where m.post_id = p.id), '[]'::jsonb),
    'tags', coalesce((
      select jsonb_agg(jsonb_build_object(
               'athlete_id', a.id, 'name', a.first_name, 'mine', a.id = any(p_mine))
             order by a.first_name)
      from public.wall_tags wt join public.athletes a on a.id = wt.athlete_id
      where wt.post_id = p.id), '[]'::jsonb)
  );
$$;

-- -----------------------------------------------------------------------------
-- 3. Client RPCs
-- -----------------------------------------------------------------------------

-- Who am I on the wall, which teams can I filter/post to, which players can I tag.
create or replace function public.wall_context()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid   uuid := auth.uid();
  v_staff boolean;
  v_mine  uuid[];
  v_teams uuid[];
begin
  if not public.wall_is_member() then
    return jsonb_build_object('is_member', false);
  end if;
  v_staff := public.wall_is_staff();
  v_mine  := public.wall_family_athletes();
  v_teams := public.wall_my_team_ids();

  return jsonb_build_object(
    'is_member', true,
    'is_staff', v_staff,
    'me', (select jsonb_build_object('id', p.id, 'name', public.wall_display_name(p.full_name))
           from public.profiles p where p.id = v_uid),
    'teams', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name,
                                          'mine', t.id = any(v_teams),
                                          'can_post', v_staff or t.id = any(v_teams))
                       order by t.name desc)
      from public.teams t where t.is_active), '[]'::jsonb),
    -- Only players with a signed media release are offered for tagging, so the
    -- list never reveals which families have NOT signed. The caller's own
    -- players are always listed, with their release state, so the UI can
    -- prompt the parent to sign.
    'taggable', coalesce((
      select jsonb_agg(jsonb_build_object(
               'athlete_id', a.id, 'name', a.first_name, 'jersey', a.jersey_number,
               'mine', a.id = any(v_mine), 'release_ok', public.wall_media_release_ok(a.id),
               'team_ids', (select coalesce(jsonb_agg(distinct r2.team_id), '[]'::jsonb)
                            from public.team_rosters r2 where r2.athlete_id = a.id and r2.left_at is null))
             order by (a.id = any(v_mine)) desc, a.first_name)
      from public.athletes a
      where exists (select 1 from public.team_rosters r join public.teams t on t.id = r.team_id
                    where r.athlete_id = a.id and r.left_at is null and t.is_active)
        and (a.id = any(v_mine) or public.wall_media_release_ok(a.id))), '[]'::jsonb),
    'pending_review', case when v_staff then
      (select count(*) from public.wall_posts where status = 'hidden')
      + (select count(*) from public.wall_comments where status = 'hidden') else 0 end
  );
end $$;

-- Keyset-paginated feed. p_filter: 'all' | 'my_players' | 'mine'.
create or replace function public.wall_feed(
  p_team_id   uuid default null,
  p_filter    text default 'all',
  p_cursor_ts timestamptz default null,
  p_cursor_id uuid default null,
  p_limit     integer default 12)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid      uuid := auth.uid();
  v_staff    boolean;
  v_mine     uuid[];
  v_lim      integer := least(greatest(coalesce(p_limit, 12), 1), 30);
  v_pin_mode boolean;
  v_rows     public.wall_posts[];
  v_posts    jsonb := '[]'::jsonb;
  v_pinned   jsonb := '[]'::jsonb;
  v_next     jsonb := null;
  r          public.wall_posts;
  i          integer := 0;
begin
  if not public.wall_is_member() then
    raise exception 'NOT_MEMBER' using detail = 'The community wall is for current Godspeed families.';
  end if;
  if coalesce(p_filter, 'all') not in ('all','my_players','mine') then
    raise exception 'BAD_FILTER' using detail = 'Unknown filter.';
  end if;
  v_staff    := public.wall_is_staff();
  v_mine     := public.wall_family_athletes();
  v_pin_mode := coalesce(p_filter, 'all') = 'all' and p_team_id is null;

  if v_pin_mode and p_cursor_ts is null then
    select coalesce(jsonb_agg(public.wall_post_json(p, v_uid, v_staff, v_mine) order by p.pinned_at desc), '[]'::jsonb)
      into v_pinned
      from public.wall_posts p
     where p.status = 'live' and p.pinned_at is not null;
  end if;

  select array_agg(x.rec order by x.published_at desc, x.id desc) into v_rows
  from (
    select p as rec, p.published_at, p.id from public.wall_posts p
    where (p.status = 'live' or (p.status = 'hidden' and p.author_id = v_uid))
      and p.published_at is not null
      and (p_team_id is null or p.team_id = p_team_id)
      and (p_filter <> 'mine' or p.author_id = v_uid)
      and (p_filter <> 'my_players' or exists (
             select 1 from public.wall_tags t where t.post_id = p.id and t.athlete_id = any(v_mine)))
      and not (v_pin_mode and p.pinned_at is not null and p.status = 'live')
      and (p_cursor_ts is null or (p.published_at, p.id) < (p_cursor_ts, p_cursor_id))
    order by p.published_at desc, p.id desc
    limit v_lim + 1
  ) x;

  if v_rows is not null then
    foreach r in array v_rows loop
      i := i + 1;
      exit when i > v_lim;
      v_posts := v_posts || jsonb_build_array(public.wall_post_json(r, v_uid, v_staff, v_mine));
      v_next  := jsonb_build_object('ts', r.published_at, 'id', r.id);
    end loop;
    if cardinality(v_rows) <= v_lim then v_next := null; end if;
  end if;

  return jsonb_build_object('pinned', v_pinned, 'posts', v_posts, 'next', v_next);
end $$;

-- Phase 1 of posting: reserve the post and storage paths.
-- p_media: [{ "kind":"image|video", "mime":"...", "bytes":123, "width":1, "height":1, "duration_ms":0 }]
create or replace function public.wall_create_post(
  p_client_id   uuid,
  p_team_id     uuid,
  p_caption     text,
  p_media       jsonb,
  p_athlete_ids uuid[] default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid     uuid := auth.uid();
  v_staff   boolean;
  v_post    public.wall_posts;
  v_item    jsonb;
  v_pos     integer := 0;
  v_mid     uuid;
  v_ext     text;
  v_kind    text;
  v_mime    text;
  v_bytes   bigint;
  v_aid     uuid;
  v_uploads jsonb := '[]'::jsonb;
begin
  if not public.wall_is_member() then
    raise exception 'NOT_MEMBER' using detail = 'The community wall is for current Godspeed families.';
  end if;
  if p_client_id is null then
    raise exception 'BAD_REQUEST' using detail = 'client_id is required.';
  end if;

  -- Idempotent replay: same client_id returns the same reservation.
  select * into v_post from public.wall_posts where author_id = v_uid and client_id = p_client_id;
  if found then
    return jsonb_build_object('post_id', v_post.id, 'status', v_post.status, 'uploads', coalesce((
      select jsonb_agg(jsonb_build_object('position', m.position, 'path', m.storage_path, 'poster_path', m.poster_path)
                       order by m.position)
      from public.wall_media m where m.post_id = v_post.id), '[]'::jsonb));
  end if;

  if (select count(*) from public.wall_posts
       where author_id = v_uid and created_at > now() - interval '24 hours') >= 20 then
    raise exception 'RATE_LIMITED' using detail = 'You can post up to 20 times a day.';
  end if;

  v_staff := public.wall_is_staff();
  if p_team_id is not null and not exists (
       select 1 from public.teams t where t.id = p_team_id and t.is_active
         and (v_staff or t.id = any(public.wall_my_team_ids()))) then
    raise exception 'BAD_TEAM' using detail = 'You can only post to your own team.';
  end if;
  if char_length(coalesce(p_caption, '')) > 500 then
    raise exception 'CAPTION_TOO_LONG' using detail = 'Captions can be up to 500 characters.';
  end if;
  if jsonb_typeof(p_media) is distinct from 'array'
     or jsonb_array_length(p_media) not between 1 and 10 then
    raise exception 'BAD_MEDIA' using detail = 'Add between 1 and 10 photos or videos.';
  end if;
  if cardinality(coalesce(p_athlete_ids, '{}')) > 15 then
    raise exception 'TOO_MANY_TAGS' using detail = 'Tag up to 15 players.';
  end if;

  insert into public.wall_posts (author_id, client_id, team_id, caption)
  values (v_uid, p_client_id, p_team_id, btrim(coalesce(p_caption, '')))
  returning * into v_post;

  for v_item in select * from jsonb_array_elements(p_media) loop
    v_kind  := v_item ->> 'kind';
    v_mime  := v_item ->> 'mime';
    v_bytes := (v_item ->> 'bytes')::bigint;
    v_ext := case v_mime when 'image/jpeg' then 'jpg' when 'image/webp' then 'webp'
                         when 'video/mp4' then 'mp4' when 'video/quicktime' then 'mov' end;
    if v_ext is null or v_kind not in ('image','video') or left(v_mime, 5) <> v_kind then
      raise exception 'BAD_MEDIA' using detail = 'Only JPG, WebP, MP4 and MOV files are supported.';
    end if;
    if v_bytes is null or v_bytes <= 0
       or (v_kind = 'image' and v_bytes > 10485760)
       or (v_kind = 'video' and v_bytes > 52428800) then
      raise exception 'FILE_TOO_LARGE' using detail = 'Photos can be up to 10 MB and videos up to 50 MB.';
    end if;
    if v_kind = 'video' and coalesce((v_item ->> 'duration_ms')::integer, 0) > 61000 then
      raise exception 'VIDEO_TOO_LONG' using detail = 'Videos can be up to 60 seconds.';
    end if;

    v_mid := gen_random_uuid();
    insert into public.wall_media (id, post_id, position, kind, mime, storage_path, poster_path,
                                   bytes, width, height, duration_ms)
    values (v_mid, v_post.id, v_pos, v_kind, v_mime,
            v_uid || '/' || v_post.id || '/' || v_mid || '.' || v_ext,
            case when v_kind = 'video' then v_uid || '/' || v_post.id || '/' || v_mid || '-poster.jpg' end,
            v_bytes,
            nullif((v_item ->> 'width')::integer, 0),
            nullif((v_item ->> 'height')::integer, 0),
            (v_item ->> 'duration_ms')::integer);
    v_pos := v_pos + 1;
  end loop;

  foreach v_aid in array coalesce(p_athlete_ids, '{}') loop
    if not exists (select 1 from public.team_rosters r join public.teams t on t.id = r.team_id
                   where r.athlete_id = v_aid and r.left_at is null and t.is_active) then
      raise exception 'BAD_TAG' using detail = 'That player is not on a current roster.';
    end if;
    if not public.wall_media_release_ok(v_aid) then
      raise exception 'MEDIA_RELEASE_MISSING'
        using detail = 'That player cannot be tagged until the Social Media Release is signed.';
    end if;
    insert into public.wall_tags (post_id, athlete_id, tagged_by) values (v_post.id, v_aid, v_uid)
    on conflict do nothing;
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object('position', m.position, 'path', m.storage_path,
                                               'poster_path', m.poster_path) order by m.position), '[]'::jsonb)
    into v_uploads from public.wall_media m where m.post_id = v_post.id;

  return jsonb_build_object('post_id', v_post.id, 'status', v_post.status, 'uploads', v_uploads);
end $$;

-- Phase 2 of posting: verify every reserved object landed, then go live.
create or replace function public.wall_publish_post(p_post_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid  uuid := auth.uid();
  v_post public.wall_posts;
  v_missing integer;
begin
  select * into v_post from public.wall_posts where id = p_post_id for update;
  if not found or v_post.author_id <> v_uid then
    raise exception 'NOT_FOUND' using detail = 'Post not found.';
  end if;
  if v_post.status <> 'processing' then
    return public.wall_post_json(v_post, v_uid, public.wall_is_staff(), public.wall_family_athletes());
  end if;

  -- Every main object and poster must exist, match the declared type, and fit the limit.
  select count(*) into v_missing
  from public.wall_media m
  cross join lateral (values
      (m.storage_path, m.mime, case when m.kind = 'image' then 10485760 else 52428800 end),
      (m.poster_path, 'image/jpeg', 2097152)) f(path, mime, max_bytes)
  where m.post_id = p_post_id and f.path is not null
    and not exists (
      select 1 from storage.objects o
      where o.bucket_id = 'community-wall' and o.name = f.path
        and coalesce(o.metadata ->> 'mimetype', '') = f.mime
        and coalesce((o.metadata ->> 'size')::bigint, 0) between 1 and f.max_bytes);

  if v_missing > 0 then
    raise exception 'UPLOAD_INCOMPLETE' using detail = v_missing || ' file(s) did not finish uploading.';
  end if;

  update public.wall_posts
     set status = 'live', published_at = now(), updated_at = now()
   where id = p_post_id
  returning * into v_post;

  return public.wall_post_json(v_post, v_uid, public.wall_is_staff(), public.wall_family_athletes());
end $$;

-- Idempotent like: set, not toggle.
create or replace function public.wall_set_like(p_post_id uuid, p_liked boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_changed integer;
  v_count integer;
begin
  if not public.wall_is_member() then
    raise exception 'NOT_MEMBER' using detail = 'The community wall is for current Godspeed families.';
  end if;
  perform 1 from public.wall_posts where id = p_post_id and status = 'live' for update;
  if not found then
    raise exception 'NOT_FOUND' using detail = 'Post not found.';
  end if;

  if p_liked then
    insert into public.wall_likes (post_id, user_id) values (p_post_id, v_uid) on conflict do nothing;
    get diagnostics v_changed = row_count;
    update public.wall_posts set like_count = like_count + v_changed where id = p_post_id
      returning like_count into v_count;
  else
    delete from public.wall_likes where post_id = p_post_id and user_id = v_uid;
    get diagnostics v_changed = row_count;
    update public.wall_posts set like_count = greatest(like_count - v_changed, 0) where id = p_post_id
      returning like_count into v_count;
  end if;
  return jsonb_build_object('liked', p_liked, 'like_count', v_count);
end $$;

create or replace function public.wall_list_comments(p_post_id uuid, p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_staff boolean;
begin
  if not public.wall_is_member() then
    raise exception 'NOT_MEMBER' using detail = 'The community wall is for current Godspeed families.';
  end if;
  v_staff := public.wall_is_staff();
  if not exists (select 1 from public.wall_posts p where p.id = p_post_id
                 and (p.status = 'live' or p.author_id = v_uid or (v_staff and p.status = 'hidden'))) then
    raise exception 'NOT_FOUND' using detail = 'Post not found.';
  end if;

  return coalesce((
    select jsonb_agg(c.j order by c.created_at)
    from (
      select cm.created_at, jsonb_build_object(
               'id', cm.id, 'body', cm.body, 'created_at', cm.created_at, 'status', cm.status,
               'is_mine', cm.author_id = v_uid, 'can_moderate', v_staff,
               'author', jsonb_build_object(
                 'id', pr.id, 'name', public.wall_display_name(pr.full_name),
                 'is_staff', pr.role::text in ('coach','director','founder'))) j
      from public.wall_comments cm
      join public.profiles pr on pr.id = cm.author_id
      where cm.post_id = p_post_id
        and (cm.status = 'live' or (cm.status = 'hidden' and (cm.author_id = v_uid or v_staff)))
      order by cm.created_at desc
      limit least(greatest(coalesce(p_limit, 100), 1), 200)
    ) c), '[]'::jsonb);
end $$;

create or replace function public.wall_add_comment(p_post_id uuid, p_client_id uuid, p_body text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_c   public.wall_comments;
begin
  if not public.wall_is_member() then
    raise exception 'NOT_MEMBER' using detail = 'The community wall is for current Godspeed families.';
  end if;
  select * into v_c from public.wall_comments where author_id = v_uid and client_id = p_client_id;
  if not found then
    if char_length(btrim(coalesce(p_body, ''))) not between 1 and 500 then
      raise exception 'BAD_COMMENT' using detail = 'Comments can be 1 to 500 characters.';
    end if;
    if (select count(*) from public.wall_comments
         where author_id = v_uid and created_at > now() - interval '10 minutes') >= 30 then
      raise exception 'RATE_LIMITED' using detail = 'You are commenting too fast. Try again in a few minutes.';
    end if;
    perform 1 from public.wall_posts where id = p_post_id and status = 'live' for update;
    if not found then
      raise exception 'NOT_FOUND' using detail = 'Post not found.';
    end if;
    insert into public.wall_comments (post_id, author_id, client_id, body)
    values (p_post_id, v_uid, p_client_id, btrim(p_body))
    returning * into v_c;
    update public.wall_posts set comment_count = comment_count + 1 where id = p_post_id;
  end if;
  return jsonb_build_object(
    'id', v_c.id, 'body', v_c.body, 'created_at', v_c.created_at, 'status', v_c.status,
    'is_mine', true, 'can_moderate', public.wall_is_staff(),
    'author', (select jsonb_build_object('id', pr.id, 'name', public.wall_display_name(pr.full_name),
                                         'is_staff', pr.role::text in ('coach','director','founder'))
               from public.profiles pr where pr.id = v_uid));
end $$;

create or replace function public.wall_delete_comment(p_comment_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_staff boolean := public.wall_is_staff();
  v_c public.wall_comments;
begin
  select * into v_c from public.wall_comments where id = p_comment_id for update;
  if not found or (v_c.author_id <> v_uid and not v_staff) then
    raise exception 'NOT_FOUND' using detail = 'Comment not found.';
  end if;
  if v_c.status <> 'removed' then
    update public.wall_comments set status = 'removed' where id = p_comment_id;
    if v_c.status = 'live' then
      update public.wall_posts set comment_count = greatest(comment_count - 1, 0) where id = v_c.post_id;
    end if;
    insert into public.wall_moderation_log (actor_id, action, post_id, comment_id, detail)
    values (v_uid, case when v_c.author_id = v_uid then 'comment_deleted_by_author' else 'comment_removed' end,
            v_c.post_id, v_c.id, jsonb_build_object('prior_status', v_c.status));
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- Author deletes own post (or staff removes). Returns the storage paths the
-- author's client should delete. Staff removals leave objects unreadable
-- (read policy requires a visible post) for the cleanup job.
create or replace function public.wall_delete_post(p_post_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_staff boolean := public.wall_is_staff();
  v_post public.wall_posts;
  v_paths jsonb := '[]'::jsonb;
begin
  select * into v_post from public.wall_posts where id = p_post_id for update;
  if not found or (v_post.author_id <> v_uid and not v_staff) then
    raise exception 'NOT_FOUND' using detail = 'Post not found.';
  end if;
  if v_post.status <> 'removed' then
    update public.wall_posts set status = 'removed', pinned_at = null, updated_at = now() where id = p_post_id;
    insert into public.wall_moderation_log (actor_id, action, post_id, detail)
    values (v_uid, case when v_post.author_id = v_uid then 'post_deleted_by_author' else 'post_removed' end,
            p_post_id, jsonb_build_object('prior_status', v_post.status));
  end if;
  if v_post.author_id = v_uid then
    select coalesce(jsonb_agg(x.p), '[]'::jsonb) into v_paths
    from (select m.storage_path p from public.wall_media m where m.post_id = p_post_id
          union all
          select m.poster_path from public.wall_media m where m.post_id = p_post_id and m.poster_path is not null) x;
  end if;
  return jsonb_build_object('ok', true, 'paths', v_paths);
end $$;

-- Report a post or comment. The report hides the item until a coach reviews it.
create or replace function public.wall_report(
  p_post_id uuid default null, p_comment_id uuid default null,
  p_reason text default 'other', p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_author uuid;
begin
  if not public.wall_is_member() then
    raise exception 'NOT_MEMBER' using detail = 'The community wall is for current Godspeed families.';
  end if;
  if (p_post_id is null) = (p_comment_id is null) then
    raise exception 'BAD_REQUEST' using detail = 'Report one post or one comment.';
  end if;
  if p_reason not in ('not_our_program','inappropriate','privacy','spam','other') then
    raise exception 'BAD_REASON' using detail = 'Pick a reason.';
  end if;
  if (select count(*) from public.wall_reports
       where reporter_id = v_uid and created_at > now() - interval '24 hours') >= 10 then
    raise exception 'RATE_LIMITED' using detail = 'You can send up to 10 reports a day. A coach will review them.';
  end if;

  if p_post_id is not null then
    select author_id into v_author from public.wall_posts where id = p_post_id and status in ('live','hidden');
  else
    select c.author_id into v_author from public.wall_comments c where c.id = p_comment_id and c.status in ('live','hidden');
  end if;
  if v_author is null then
    raise exception 'NOT_FOUND' using detail = 'That item is no longer on the wall.';
  end if;
  if v_author = v_uid then
    raise exception 'OWN_CONTENT' using detail = 'You can delete your own posts instead.';
  end if;

  insert into public.wall_reports (post_id, comment_id, reporter_id, reason, note)
  values (p_post_id, p_comment_id, v_uid, p_reason, nullif(left(btrim(coalesce(p_note, '')), 300), ''))
  on conflict do nothing;

  if p_post_id is not null then
    update public.wall_posts set status = 'hidden', updated_at = now() where id = p_post_id and status = 'live';
  else
    update public.wall_comments set status = 'hidden' where id = p_comment_id and status = 'live';
    if found then
      update public.wall_posts set comment_count = greatest(comment_count - 1, 0)
       where id = (select post_id from public.wall_comments where id = p_comment_id);
    end if;
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- A parent can remove their own player's tag from anyone's post.
create or replace function public.wall_untag_my_player(p_post_id uuid, p_athlete_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if not (p_athlete_id = any(public.wall_family_athletes()) or public.wall_is_staff()) then
    raise exception 'NOT_YOUR_ATHLETE' using detail = 'You can only remove tags of your own player.';
  end if;
  delete from public.wall_tags where post_id = p_post_id and athlete_id = p_athlete_id;
  if found then
    insert into public.wall_moderation_log (actor_id, action, post_id, detail)
    values (v_uid, 'tag_removed', p_post_id, jsonb_build_object('athlete_id', p_athlete_id));
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- Staff moderation: restore | remove | pin | unpin.
create or replace function public.wall_moderate(
  p_action text, p_post_id uuid default null, p_comment_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_prior text;
  v_post_of_comment uuid;
begin
  if not public.wall_is_staff() then
    raise exception 'FORBIDDEN' using detail = 'Only coaches can moderate the wall.';
  end if;
  if p_action not in ('restore','remove','pin','unpin') then
    raise exception 'BAD_ACTION' using detail = 'Unknown action.';
  end if;

  if p_comment_id is not null then
    select status, post_id into v_prior, v_post_of_comment from public.wall_comments where id = p_comment_id for update;
    if not found then raise exception 'NOT_FOUND' using detail = 'Comment not found.'; end if;
    if p_action = 'restore' and v_prior = 'hidden' then
      update public.wall_comments set status = 'live' where id = p_comment_id;
      update public.wall_posts set comment_count = comment_count + 1 where id = v_post_of_comment;
    elsif p_action = 'remove' and v_prior <> 'removed' then
      update public.wall_comments set status = 'removed' where id = p_comment_id;
      if v_prior = 'live' then
        update public.wall_posts set comment_count = greatest(comment_count - 1, 0) where id = v_post_of_comment;
      end if;
    elsif p_action in ('pin','unpin') then
      raise exception 'BAD_ACTION' using detail = 'Comments cannot be pinned.';
    end if;
  else
    select status into v_prior from public.wall_posts where id = p_post_id for update;
    if not found then raise exception 'NOT_FOUND' using detail = 'Post not found.'; end if;
    if p_action = 'restore' and v_prior = 'hidden' then
      update public.wall_posts set status = 'live', updated_at = now() where id = p_post_id;
    elsif p_action = 'remove' and v_prior <> 'removed' then
      update public.wall_posts set status = 'removed', pinned_at = null, updated_at = now() where id = p_post_id;
    elsif p_action = 'pin' then
      if v_prior <> 'live' then raise exception 'BAD_STATE' using detail = 'Only live posts can be pinned.'; end if;
      update public.wall_posts set pinned_at = now() where id = p_post_id;
      -- Keep at most 3 pinned posts; the oldest pin drops off.
      update public.wall_posts set pinned_at = null
       where id in (select id from public.wall_posts where pinned_at is not null
                    order by pinned_at desc offset 3);
    elsif p_action = 'unpin' then
      update public.wall_posts set pinned_at = null where id = p_post_id;
    end if;
  end if;

  insert into public.wall_moderation_log (actor_id, action, post_id, comment_id, detail)
  values (v_uid, p_action, coalesce(p_post_id, v_post_of_comment), p_comment_id,
          jsonb_build_object('prior_status', v_prior));
  return jsonb_build_object('ok', true);
end $$;

-- Staff review queue: hidden posts and comments with their reports.
create or replace function public.wall_review_queue()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if not public.wall_is_staff() then
    raise exception 'FORBIDDEN' using detail = 'Only coaches can review the wall.';
  end if;
  return jsonb_build_object(
    'posts', coalesce((
      select jsonb_agg(public.wall_post_json(p, v_uid, true, '{}'::uuid[])
               || jsonb_build_object('reports', (
                    select coalesce(jsonb_agg(jsonb_build_object('reason', r.reason, 'note', r.note,
                                                                 'created_at', r.created_at) order by r.created_at), '[]'::jsonb)
                    from public.wall_reports r where r.post_id = p.id))
             order by p.updated_at desc)
      from public.wall_posts p where p.status = 'hidden'), '[]'::jsonb),
    'comments', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id, 'post_id', c.post_id, 'body', c.body, 'created_at', c.created_at,
               'author', jsonb_build_object('name', public.wall_display_name(pr.full_name)),
               'reports', (select coalesce(jsonb_agg(jsonb_build_object('reason', r.reason, 'note', r.note)), '[]'::jsonb)
                           from public.wall_reports r where r.comment_id = c.id))
             order by c.created_at desc)
      from public.wall_comments c join public.profiles pr on pr.id = c.author_id
      where c.status = 'hidden'), '[]'::jsonb));
end $$;

-- -----------------------------------------------------------------------------
-- 4. Storage: private bucket + path-reserved policies
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('community-wall', 'community-wall', false, 52428800,
        array['image/jpeg','image/webp','video/mp4','video/quicktime'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.wall_can_upload_object(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.wall_media m join public.wall_posts p on p.id = m.post_id
    where p.author_id = auth.uid() and p.status = 'processing'
      and (m.storage_path = p_name or m.poster_path = p_name));
$$;

create or replace function public.wall_can_read_object(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.wall_is_member() and exists (
    select 1 from public.wall_media m join public.wall_posts p on p.id = m.post_id
    where (m.storage_path = p_name or m.poster_path = p_name)
      and (p.status = 'live'
           or p.author_id = auth.uid()   -- authors always see (and can clean up) their own files
           or (p.status = 'hidden' and public.wall_is_staff())));
$$;

create or replace function public.wall_can_delete_object(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.wall_media m join public.wall_posts p on p.id = m.post_id
    where p.author_id = auth.uid() and p.status in ('processing','removed')
      and (m.storage_path = p_name or m.poster_path = p_name));
$$;

create policy "community_wall_insert_reserved" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'community-wall' and public.wall_can_upload_object(name));

create policy "community_wall_read_visible" on storage.objects
  for select to authenticated
  using (bucket_id = 'community-wall' and public.wall_can_read_object(name));

create policy "community_wall_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'community-wall' and public.wall_can_delete_object(name));

-- -----------------------------------------------------------------------------
-- 5. Grants. Supabase default privileges give EXECUTE to anon; strip it.
-- -----------------------------------------------------------------------------
do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'wall\_%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;

grant execute on function
  public.wall_context(),
  public.wall_feed(uuid, text, timestamptz, uuid, integer),
  public.wall_create_post(uuid, uuid, text, jsonb, uuid[]),
  public.wall_publish_post(uuid),
  public.wall_set_like(uuid, boolean),
  public.wall_list_comments(uuid, integer),
  public.wall_add_comment(uuid, uuid, text),
  public.wall_delete_comment(uuid),
  public.wall_delete_post(uuid),
  public.wall_report(uuid, uuid, text, text),
  public.wall_untag_my_player(uuid, uuid),
  public.wall_moderate(text, uuid, uuid),
  public.wall_review_queue(),
  -- called from storage policies as the invoking role
  public.wall_can_upload_object(text),
  public.wall_can_read_object(text),
  public.wall_can_delete_object(text)
to authenticated;

commit;
