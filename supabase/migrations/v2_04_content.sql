-- ============================================================
-- 04_content.sql
-- blog_posts  - public-facing site content
-- memos       - internal coach communications
-- ============================================================

-- -----------------------------------------------------------
-- TABLE: blog_posts
-- Written by director, published to clubgodspeed.com.
-- Supports draft/published/archived lifecycle.
-- -----------------------------------------------------------
create type public.post_status as enum ('draft', 'published', 'archived');

create table public.blog_posts (
  id           uuid         primary key default uuid_generate_v4(),
  title        text         not null,
  slug         text         unique,          -- URL-safe identifier for site CMS
  body         text         not null default '',
  excerpt      text,
  status       post_status  not null default 'draft',
  author_id    uuid         not null references auth.users (id) on delete restrict,
  published_at timestamptz,
  view_count   integer      not null default 0,
  tags         text[],
  created_at   timestamptz  not null default now(),
  updated_at   timestamptz  not null default now()
);

create index blog_posts_status_idx on public.blog_posts (status);
create index blog_posts_slug_idx   on public.blog_posts (slug);

create trigger blog_posts_updated_at
  before update on public.blog_posts
  for each row execute procedure public.handle_updated_at();

-- Auto-generate slug from title on insert if not provided
create or replace function public.generate_slug(title text)
returns text language sql immutable strict as $$
  select lower(
    regexp_replace(
      regexp_replace(trim(title), '[^a-zA-Z0-9\s-]', '', 'g'),
      '\s+', '-', 'g'
    )
  );
$$;

create or replace function public.handle_blog_post_insert()
returns trigger language plpgsql as $$
begin
  if new.slug is null or new.slug = '' then
    new.slug := public.generate_slug(new.title) || '-' || substr(new.id::text, 1, 8);
  end if;
  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end;
$$;

create trigger blog_posts_before_insert
  before insert on public.blog_posts
  for each row execute procedure public.handle_blog_post_insert();

-- Set published_at when status changes to published
create or replace function public.handle_blog_post_publish()
returns trigger language plpgsql as $$
begin
  if new.status = 'published' and old.status != 'published' and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end;
$$;

create trigger blog_posts_on_publish
  before update on public.blog_posts
  for each row execute procedure public.handle_blog_post_publish();

-- -----------------------------------------------------------
-- RLS: blog_posts
-- -----------------------------------------------------------
alter table public.blog_posts enable row level security;

-- Directors have full access
create policy "directors_all_blog_posts"
  on public.blog_posts for all
  using (public.is_director())
  with check (public.is_director());

-- Public (anonymous + authenticated non-directors) can only
-- read published posts. This enables the site CMS integration.
create policy "public_select_published_posts"
  on public.blog_posts for select
  using (status = 'published');

-- -----------------------------------------------------------
-- TABLE: memos
-- Internal communications from director to coaching staff.
-- Not public. Not visible to parents.
-- -----------------------------------------------------------
create type public.memo_recipient as enum (
  'all_coaches',
  'grade_4_staff',
  'grade_5_staff',
  'gene_only',
  'director_only'
);

create table public.memos (
  id           uuid             primary key default uuid_generate_v4(),
  subject      text             not null,
  body         text             not null default '',
  recipient    memo_recipient   not null default 'all_coaches',
  author_id    uuid             not null references auth.users (id) on delete restrict,
  created_at   timestamptz      not null default now(),
  updated_at   timestamptz      not null default now()
);

create index memos_recipient_idx on public.memos (recipient);
create index memos_created_idx   on public.memos (created_at desc);

create trigger memos_updated_at
  before update on public.memos
  for each row execute procedure public.handle_updated_at();

-- -----------------------------------------------------------
-- TABLE: memo_acknowledgments
-- Coaches mark a memo as read. Tracked per user.
-- -----------------------------------------------------------
create table public.memo_acknowledgments (
  memo_id      uuid         not null references public.memos (id) on delete cascade,
  user_id      uuid         not null references auth.users (id) on delete cascade,
  acknowledged_at timestamptz not null default now(),
  primary key (memo_id, user_id)
);

-- -----------------------------------------------------------
-- VIEW: memo_summary
-- Returns memos with ack count. Director-facing.
-- -----------------------------------------------------------
create or replace view public.memo_summary as
select
  m.id,
  m.subject,
  m.recipient,
  m.author_id,
  p.full_name as author_name,
  m.created_at,
  count(ma.user_id) as ack_count
from public.memos m
left join public.profiles p on p.id = m.author_id
left join public.memo_acknowledgments ma on ma.memo_id = m.id
group by m.id, m.subject, m.recipient, m.author_id, p.full_name, m.created_at;

-- -----------------------------------------------------------
-- RLS: memos
-- -----------------------------------------------------------
alter table public.memos enable row level security;

-- Directors have full access to all memos
create policy "directors_all_memos"
  on public.memos for all
  using (public.is_director())
  with check (public.is_director());

-- Coaches can read memos addressed to them
-- Maps recipient enum to approved coach profiles
create policy "coaches_select_addressed_memos"
  on public.memos for select
  using (
    exists (
      select 1 from public.profiles pr
      where pr.id = auth.uid()
        and pr.role = 'coach'
        and pr.approved = true
        and (
          recipient = 'all_coaches'
          or (recipient = 'grade_4_staff' and pr.grade = '4th')
          or (recipient = 'grade_5_staff' and pr.grade = '5th')
          -- gene_only: Gene's user_id must be stored separately
          -- or handled via a dedicated coach profile attribute
        )
    )
  );

-- -----------------------------------------------------------
-- RLS: memo_acknowledgments
-- -----------------------------------------------------------
alter table public.memo_acknowledgments enable row level security;

-- Directors see all acks
create policy "directors_select_acks"
  on public.memo_acknowledgments for select
  using (public.is_director());

-- Coaches can insert their own ack
create policy "coaches_insert_own_ack"
  on public.memo_acknowledgments for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'coach' and approved = true
    )
  );

-- Coaches can view their own acks
create policy "coaches_select_own_ack"
  on public.memo_acknowledgments for select
  using (user_id = auth.uid());
