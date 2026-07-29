-- ============================================================
-- v10_03_raise_hardening.sql
-- Production-hardening pass for Godspeed Raise. Idempotent.
--
-- Fixes:
--   #1 parent linkage : staff-gated RPCs to list parents and link a
--                        parent to a participant (campaign_participants.parent_id
--                        was previously never populated by any code path).
--   #3 digest scope   : add campaign_id to the email ledger so the daily
--                        admin digest can dedupe per-campaign, not globally.
--   #4/#9 supporters  : get_campaign_public() now returns per-participant
--                        supporters (keyed by participant id, not display
--                        name) so player pages show the right list and are
--                        not truncated by the global 50-row donor wall.
--   #5 totals match   : sync_fundraising_totals() matches on exact
--                        lower(name) equality instead of ILIKE, removing
--                        accidental %/_ wildcard behavior.
-- ============================================================

-- ---------- #3: campaign_id on the email ledger ----------
ALTER TABLE public.fundraiser_email_log
  ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES public.fundraising_campaigns(id);

CREATE INDEX IF NOT EXISTS idx_femail_campaign_type_sent
  ON public.fundraiser_email_log(campaign_id, email_type, sent_at);

-- ---------- #5: harden the dues-credit sync trigger ----------
-- NOTE: fundraising_totals still keys on athlete_name (the existing
-- dues-credit model shared with the parent portal). We cannot switch
-- that to an id without touching billing, so we at least make the match
-- exact and wildcard-safe. Residual limitation: two athletes that share
-- an identical name across campaigns will still share one totals row.
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
  IF v_name IS NULL THEN RETURN NEW; END IF;

  IF EXISTS (SELECT 1 FROM fundraising_totals WHERE lower(athlete_name) = lower(v_name)) THEN
    UPDATE fundraising_totals
       SET total_raised = GREATEST(total_raised + v_delta, 0)
     WHERE lower(athlete_name) = lower(v_name);
  ELSE
    INSERT INTO fundraising_totals (athlete_name, total_raised)
    VALUES (v_name, GREATEST(v_delta, 0));
  END IF;
  RETURN NEW;
END $$;

-- ---------- #4/#9: public RPC with per-participant supporters ----------
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
        'story', cp.personal_story,
        -- Per-participant supporters (latest 30), keyed by participant id
        -- so player pages never depend on the global donor-wall cap.
        'supporters', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'name', CASE WHEN d.is_anonymous THEN 'Anonymous'
                         ELSE COALESCE(NULLIF(d.display_name,''), d.donor_name) END,
            'amount', d.amount, 'message', d.message, 'at', d.completed_at
          ) ORDER BY d.completed_at DESC)
          FROM (SELECT * FROM donations
                WHERE participant_id = l.participant_id AND status = 'completed'
                ORDER BY completed_at DESC LIMIT 30) d
        ), '[]'::jsonb)
      ) ORDER BY l.raised DESC, l.display_order)
      FROM participant_leaderboard l
      JOIN campaign_participants cp ON cp.id = l.participant_id
      WHERE l.campaign_id = c.id), '[]'::jsonb),
    'donor_wall', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'name', CASE WHEN d.is_anonymous THEN 'Anonymous'
                     ELSE COALESCE(NULLIF(d.display_name,''), d.donor_name) END,
        'amount', d.amount, 'message', d.message,
        'participant', cp2.athlete_name,
        'participant_slug', cp2.slug, 'at', d.completed_at
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

-- ---------- #1: staff-gated parent linkage RPCs ----------
-- Reuses current_user_is_staff() (SECURITY DEFINER helper from
-- 20260419000001_fix_profiles_rls_self_read.sql) so the admin console
-- does not depend on profiles-table RLS to read the parent roster.

CREATE OR REPLACE FUNCTION public.list_parent_profiles()
RETURNS TABLE (id UUID, full_name TEXT, email TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'staff only';
  END IF;
  RETURN QUERY
    SELECT p.id, p.full_name, p.email
    FROM profiles p
    WHERE p.role = 'parent'
    ORDER BY p.full_name NULLS LAST, p.email;
END $$;

REVOKE ALL ON FUNCTION public.list_parent_profiles() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_parent_profiles() TO authenticated;

-- Link (or unlink, when p_parent_id IS NULL) a parent to a participant.
CREATE OR REPLACE FUNCTION public.link_participant_parent(
  p_participant_id UUID, p_parent_id UUID
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'staff only';
  END IF;
  IF p_parent_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = p_parent_id AND role = 'parent'
  ) THEN
    RAISE EXCEPTION 'not a parent profile';
  END IF;
  UPDATE campaign_participants
     SET parent_id = p_parent_id
   WHERE id = p_participant_id;
END $$;

REVOKE ALL ON FUNCTION public.link_participant_parent(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_participant_parent(UUID, UUID) TO authenticated;
