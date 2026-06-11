-- ============================================================
-- v10_01_godspeed_raise.sql
-- Godspeed Raise: peer-to-peer fundraising platform.
-- Replaces Vertical Raise (they take 14-24%; we keep ~97%,
-- Stripe processing only). Idempotent.
--
-- Tables: fundraising_campaigns, campaign_participants,
--         fundraiser_contacts, donations, fundraiser_email_log
-- Views:  campaign_progress, participant_leaderboard
-- RPCs:   get_campaign_public(slug)
-- Trigger: completed donations feed fundraising_totals
--          (existing dues-credit model: Khaliq/Khyrie pattern)
-- ============================================================

-- ---------- 1. Campaigns ----------
CREATE TABLE IF NOT EXISTS public.fundraising_campaigns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT NOT NULL UNIQUE,
  title           TEXT NOT NULL,
  subtitle        TEXT,
  story           TEXT,
  goal_amount     NUMERIC(10,2) NOT NULL CHECK (goal_amount > 0),
  starts_at       TIMESTAMPTZ NOT NULL,
  ends_at         TIMESTAMPTZ NOT NULL,
  status          TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','live','ended','paid_out')),
  cover_image_url TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

-- Forward-only state machine: draft -> live -> ended -> paid_out
CREATE OR REPLACE FUNCTION public.enforce_campaign_status_forward()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  rank_old INT; rank_new INT;
BEGIN
  rank_old := array_position(ARRAY['draft','live','ended','paid_out'], OLD.status);
  rank_new := array_position(ARRAY['draft','live','ended','paid_out'], NEW.status);
  IF rank_new < rank_old THEN
    RAISE EXCEPTION 'Campaign status cannot move backward (% -> %)', OLD.status, NEW.status;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_campaign_status_forward ON public.fundraising_campaigns;
CREATE TRIGGER trg_campaign_status_forward
  BEFORE UPDATE ON public.fundraising_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.enforce_campaign_status_forward();

-- ---------- 2. Participants (player pages) ----------
CREATE TABLE IF NOT EXISTS public.campaign_participants (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id    UUID NOT NULL REFERENCES public.fundraising_campaigns(id) ON DELETE CASCADE,
  athlete_name   TEXT NOT NULL,
  slug           TEXT NOT NULL,
  photo_url      TEXT,
  personal_story TEXT,
  personal_goal  NUMERIC(10,2) NOT NULL DEFAULT 500 CHECK (personal_goal > 0),
  parent_id      UUID REFERENCES public.profiles(id),
  display_order  INT NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_participants_campaign ON public.campaign_participants(campaign_id);

-- ---------- 3. Contacts (parent-uploaded supporter lists) ----------
CREATE TABLE IF NOT EXISTS public.fundraiser_contacts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id    UUID NOT NULL REFERENCES public.campaign_participants(id) ON DELETE CASCADE,
  full_name         TEXT NOT NULL,
  email             TEXT NOT NULL CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone             TEXT,
  source            TEXT NOT NULL DEFAULT 'parent_upload',
  unsubscribed      BOOLEAN NOT NULL DEFAULT false,
  unsubscribe_token UUID NOT NULL DEFAULT gen_random_uuid(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (participant_id, email)
);
CREATE INDEX IF NOT EXISTS idx_contacts_participant ON public.fundraiser_contacts(participant_id);

-- ---------- 4. Donations ----------
CREATE TABLE IF NOT EXISTS public.donations (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id               UUID NOT NULL REFERENCES public.fundraising_campaigns(id),
  participant_id            UUID REFERENCES public.campaign_participants(id),
  donor_name                TEXT NOT NULL,
  donor_email               TEXT NOT NULL,
  display_name              TEXT,              -- shown on donor wall; null + is_anonymous -> "Anonymous"
  is_anonymous              BOOLEAN NOT NULL DEFAULT false,
  amount                    NUMERIC(10,2) NOT NULL CHECK (amount >= 5),
  message                   TEXT CHECK (char_length(message) <= 280),
  stripe_session_id         TEXT UNIQUE,
  stripe_payment_intent_id  TEXT UNIQUE,
  status                    TEXT NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','completed','refunded')),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at              TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_donations_campaign    ON public.donations(campaign_id);
CREATE INDEX IF NOT EXISTS idx_donations_participant ON public.donations(participant_id);
CREATE INDEX IF NOT EXISTS idx_donations_status      ON public.donations(status);

-- ---------- 5. Email log (immutable, insert-only) ----------
CREATE TABLE IF NOT EXISTS public.fundraiser_email_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID REFERENCES public.campaign_participants(id),
  contact_id     UUID REFERENCES public.fundraiser_contacts(id),
  donation_id    UUID REFERENCES public.donations(id),
  email_type     TEXT NOT NULL CHECK (email_type IN
                 ('launch','day14','day7','day2','thank_you','receipt','impact','digest')),
  recipient      TEXT NOT NULL,
  resend_id      TEXT,
  sent_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_femail_contact_type
  ON public.fundraiser_email_log(contact_id, email_type);

CREATE OR REPLACE FUNCTION public.block_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'fundraiser_email_log is insert-only'; END $$;

DROP TRIGGER IF EXISTS trg_femail_immutable ON public.fundraiser_email_log;
CREATE TRIGGER trg_femail_immutable
  BEFORE UPDATE OR DELETE ON public.fundraiser_email_log
  FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

-- ---------- 6. Feed fundraising_totals on completion ----------
-- Keeps the existing dues-credit model (fundraising_totals.athlete_name)
-- in sync automatically. Refunds decrement.
CREATE OR REPLACE FUNCTION public.sync_fundraising_totals()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_name TEXT;
  v_delta NUMERIC(10,2);
BEGIN
  IF NEW.participant_id IS NULL THEN RETURN NEW; END IF;
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  IF NEW.status = 'completed' AND OLD.status = 'pending' THEN
    v_delta := NEW.amount;
  ELSIF NEW.status = 'refunded' AND OLD.status = 'completed' THEN
    v_delta := -NEW.amount;
  ELSE
    RETURN NEW;
  END IF;

  SELECT athlete_name INTO v_name FROM campaign_participants WHERE id = NEW.participant_id;

  IF EXISTS (SELECT 1 FROM fundraising_totals WHERE athlete_name ILIKE v_name) THEN
    UPDATE fundraising_totals
       SET total_raised = GREATEST(total_raised + v_delta, 0)
     WHERE athlete_name ILIKE v_name;
  ELSE
    INSERT INTO fundraising_totals (athlete_name, total_raised)
    VALUES (v_name, GREATEST(v_delta, 0));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_donation_totals ON public.donations;
CREATE TRIGGER trg_donation_totals
  AFTER UPDATE ON public.donations
  FOR EACH ROW EXECUTE FUNCTION public.sync_fundraising_totals();

-- ---------- 7. Views ----------
CREATE OR REPLACE VIEW public.campaign_progress
WITH (security_invoker = true) AS
SELECT c.id AS campaign_id, c.slug, c.title, c.goal_amount, c.status, c.ends_at,
       COALESCE(SUM(d.amount) FILTER (WHERE d.status = 'completed'), 0) AS total_raised,
       COUNT(d.id) FILTER (WHERE d.status = 'completed') AS donor_count
FROM fundraising_campaigns c
LEFT JOIN donations d ON d.campaign_id = c.id
GROUP BY c.id;

CREATE OR REPLACE VIEW public.participant_leaderboard
WITH (security_invoker = true) AS
SELECT p.id AS participant_id, p.campaign_id, p.athlete_name, p.slug,
       p.photo_url, p.personal_goal, p.display_order,
       COALESCE(SUM(d.amount) FILTER (WHERE d.status = 'completed'), 0) AS raised,
       COUNT(d.id) FILTER (WHERE d.status = 'completed') AS donor_count
FROM campaign_participants p
LEFT JOIN donations d ON d.participant_id = p.id
GROUP BY p.id;

-- ---------- 8. Public read RPC (sanitized, anon-safe) ----------
-- Single round trip for the public pages. Never exposes donor emails.
CREATE OR REPLACE FUNCTION public.get_campaign_public(p_slug TEXT)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v JSONB;
BEGIN
  SELECT jsonb_build_object(
    'campaign', jsonb_build_object(
      'slug', c.slug, 'title', c.title, 'subtitle', c.subtitle,
      'story', c.story, 'goal', c.goal_amount, 'status', c.status,
      'starts_at', c.starts_at, 'ends_at', c.ends_at,
      'cover_image_url', c.cover_image_url,
      'raised', (SELECT COALESCE(SUM(amount),0) FROM donations
                 WHERE campaign_id = c.id AND status = 'completed'),
      'donor_count', (SELECT COUNT(*) FROM donations
                      WHERE campaign_id = c.id AND status = 'completed')
    ),
    'participants', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'slug', l.slug, 'name', l.athlete_name, 'photo', l.photo_url,
        'goal', l.personal_goal, 'raised', l.raised,
        'donors', l.donor_count, 'order', l.display_order,
        'story', cp.personal_story
      ) ORDER BY l.raised DESC, l.display_order)
      FROM participant_leaderboard l
      JOIN campaign_participants cp ON cp.id = l.participant_id
      WHERE l.campaign_id = c.id), '[]'::jsonb),
    'donor_wall', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'name', CASE WHEN d.is_anonymous THEN 'Anonymous'
                     ELSE COALESCE(NULLIF(d.display_name,''), d.donor_name) END,
        'amount', d.amount, 'message', d.message,
        'participant', cp2.athlete_name, 'at', d.completed_at
      ) ORDER BY d.completed_at DESC)
      FROM (SELECT * FROM donations
            WHERE campaign_id = c.id AND status = 'completed'
            ORDER BY completed_at DESC LIMIT 50) d
      LEFT JOIN campaign_participants cp2 ON cp2.id = d.participant_id), '[]'::jsonb)
  ) INTO v
  FROM fundraising_campaigns c
  WHERE c.slug = p_slug AND c.status IN ('live','ended','paid_out');
  RETURN COALESCE(v, '{}'::jsonb);
END $$;

GRANT EXECUTE ON FUNCTION public.get_campaign_public(TEXT) TO anon, authenticated;

-- ---------- 9. RLS ----------
ALTER TABLE public.fundraising_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fundraiser_contacts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.donations             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fundraiser_email_log  ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT; r RECORD;
BEGIN
  FOREACH t IN ARRAY ARRAY['fundraising_campaigns','campaign_participants',
                           'fundraiser_contacts','donations','fundraiser_email_log']
  LOOP
    FOR r IN SELECT policyname FROM pg_policies WHERE tablename = t LOOP
      EXECUTE format('DROP POLICY %I ON %I', r.policyname, t);
    END LOOP;
  END LOOP;
END $$;

-- Staff helper predicate (matches existing pattern)
-- coach/director: full management of everything
CREATE POLICY "Staff manage campaigns" ON public.fundraising_campaigns
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
                 AND role = ANY(ARRAY['director'::app_role,'coach'::app_role])))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
                 AND role = ANY(ARRAY['director'::app_role,'coach'::app_role])));

CREATE POLICY "Staff manage participants" ON public.campaign_participants
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
                 AND role = ANY(ARRAY['director'::app_role,'coach'::app_role])))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
                 AND role = ANY(ARRAY['director'::app_role,'coach'::app_role])));

CREATE POLICY "Staff manage contacts" ON public.fundraiser_contacts
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
                 AND role = ANY(ARRAY['director'::app_role,'coach'::app_role])))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
                 AND role = ANY(ARRAY['director'::app_role,'coach'::app_role])));

CREATE POLICY "Staff read donations" ON public.donations
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
                 AND role = ANY(ARRAY['director'::app_role,'coach'::app_role])));

CREATE POLICY "Staff read email log" ON public.fundraiser_email_log
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
                 AND role = ANY(ARRAY['director'::app_role,'coach'::app_role])));

-- Parents: manage contacts for their own athlete's participant rows
CREATE POLICY "Parents manage own contacts" ON public.fundraiser_contacts
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM campaign_participants cp
                 WHERE cp.id = participant_id AND cp.parent_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM campaign_participants cp
                 WHERE cp.id = participant_id AND cp.parent_id = auth.uid()));

CREATE POLICY "Parents read own participant" ON public.campaign_participants
  FOR SELECT TO authenticated USING (parent_id = auth.uid());

-- Service role (edge functions): full access everywhere
CREATE POLICY "Service role campaigns"    ON public.fundraising_campaigns FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role participants" ON public.campaign_participants FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role contacts"     ON public.fundraiser_contacts   FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role donations"    ON public.donations             FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role email log"    ON public.fundraiser_email_log  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- NOTE: no anon table policies. All public reads flow through
-- get_campaign_public() which returns sanitized JSON only.

-- ---------- 10. Seed: 10U Season Dues Offset pilot ----------
INSERT INTO public.fundraising_campaigns
  (slug, title, subtitle, story, goal_amount, starts_at, ends_at, status)
VALUES (
  '10u-season-2026',
  '10U Development Black: 2026 Season Fund',
  'Every dollar goes to the kids. Zero platform fees.',
  'Our 12 athletes are working toward a full AAU season: tournaments, training, travel, and gear. Unlike traditional fundraising platforms that keep up to 24 percent of what you give, Godspeed runs its own platform. Your donation, minus only card processing, lands directly in the program.',
  9000.00,
  now(), now() + interval '30 days',
  'draft'
) ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.campaign_participants (campaign_id, athlete_name, slug, personal_goal, display_order)
SELECT c.id, a.name, a.slug, 750.00, a.ord
FROM public.fundraising_campaigns c,
     (VALUES ('Aiden','aiden',1),('Quest','quest',2),('Cassius','cassius',3),
             ('A.D.','ad',4),('Howard','howard',5),('Anton','anton',6),
             ('Emory','emory',7),('Ashton','ashton',8),('Junior','junior',9),
             ('Khyrie','khyrie',10),('Oliver','oliver',11),('Khaliq','khaliq',12)
     ) AS a(name, slug, ord)
WHERE c.slug = '10u-season-2026'
ON CONFLICT (campaign_id, slug) DO NOTHING;
