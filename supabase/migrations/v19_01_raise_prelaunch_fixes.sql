-- ============================================================
-- v19_01_raise_prelaunch_fixes.sql
-- Godspeed Raise pre-launch audit fixes (2026-09-07). Idempotent.
--
-- Findings fixed here (see fixes/2026-09-07-raise-prelaunch/README.md):
--   A1 get_campaign_public was overloaded (1-arg from v10_03, 2-arg with
--      p_preview added later). PostgREST returns HTTP 300 PGRST203 when
--      called with p_slug only, and the 2-arg copy the pages actually hit
--      never returned per-participant supporters (v10_03 regression).
--   A2 p_preview=true was honored for ANONYMOUS callers: any visitor with
--      ?preview=1 could read a draft campaign, including 12 minors' names,
--      photos and personal stories. Preview is now staff-only.
--   A3 Definer functions executable by anon/PUBLIC: link_participant_parent,
--      list_parent_profiles, sync_fundraising_totals, enforce_campaign_status_forward.
--   A4 donations had no forward-only state machine (contract 5) and the
--      engine DELETEd abandoned pending rows (financial rows are never
--      deleted). Adds 'expired' status; engine will flip instead of delete.
--   A5 fundraiser_email_log idempotency relied on check-then-insert. Adds
--      unique partial indexes so concurrent webhook retries cannot double-send.
--   A6 A parent with ALL on fundraiser_contacts could flip unsubscribed back
--      to false (CAN-SPAM). Trigger blocks re-subscribe except by service_role.
-- ============================================================

-- ---------- A1 + A2: one public RPC, supporters included, preview staff-gated ----------
DROP FUNCTION IF EXISTS public.get_campaign_public(TEXT);
DROP FUNCTION IF EXISTS public.get_campaign_public(TEXT, BOOLEAN);

CREATE OR REPLACE FUNCTION public.get_campaign_public(p_slug TEXT, p_preview BOOLEAN DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v JSONB;
  v_preview BOOLEAN := false;
BEGIN
  -- Preview of a draft campaign is a staff-only capability. Anonymous or
  -- parent callers passing p_preview=true are treated as public callers.
  IF p_preview THEN
    v_preview := public.current_user_is_staff();
  END IF;

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
  WHERE c.slug = p_slug
    AND (c.status IN ('live','ended','paid_out') OR (v_preview AND c.status = 'draft'));
  RETURN COALESCE(v, '{}'::jsonb);
END $$;

REVOKE ALL ON FUNCTION public.get_campaign_public(TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_campaign_public(TEXT, BOOLEAN) TO anon, authenticated, service_role;

-- ---------- A3: least-privilege grants on Raise definer functions ----------
REVOKE ALL ON FUNCTION public.link_participant_parent(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_participant_parent(UUID, UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.list_parent_profiles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_parent_profiles() TO authenticated, service_role;

-- Trigger functions are never called by API roles.
REVOKE ALL ON FUNCTION public.sync_fundraising_totals() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_campaign_status_forward() FROM PUBLIC, anon, authenticated;

-- ---------- A4: donations state machine (forward only, no deletes) ----------
-- pending -> completed -> refunded
-- pending -> expired   (abandoned checkout; replaces the engine's DELETE)
ALTER TABLE public.donations DROP CONSTRAINT IF EXISTS donations_status_check;
ALTER TABLE public.donations
  ADD CONSTRAINT donations_status_check
  CHECK (status = ANY (ARRAY['pending','completed','refunded','expired']));

CREATE OR REPLACE FUNCTION public.enforce_donation_status_forward()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  IF NOT (
       (OLD.status = 'pending'   AND NEW.status IN ('completed','expired'))
    OR (OLD.status = 'completed' AND NEW.status = 'refunded')
  ) THEN
    RAISE EXCEPTION 'Donation status cannot move % -> %', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.enforce_donation_status_forward() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_donation_status_forward ON public.donations;
CREATE TRIGGER trg_donation_status_forward
  BEFORE UPDATE OF status ON public.donations
  FOR EACH ROW EXECUTE FUNCTION public.enforce_donation_status_forward();

-- Financial rows are never deleted (contract 5). Only pending rows could be
-- deleted before; now nothing can be, by any API role.
CREATE OR REPLACE FUNCTION public.block_donation_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'donations is append-only; set status = expired instead of deleting'
    USING ERRCODE = 'insufficient_privilege';
END $$;
REVOKE ALL ON FUNCTION public.block_donation_delete() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_donation_no_delete ON public.donations;
CREATE TRIGGER trg_donation_no_delete
  BEFORE DELETE ON public.donations
  FOR EACH ROW EXECUTE FUNCTION public.block_donation_delete();

-- ---------- A5: email ledger idempotency at the database ----------
-- One receipt / impact email per donation; one cadence step per contact.
CREATE UNIQUE INDEX IF NOT EXISTS uq_femail_donation_type
  ON public.fundraiser_email_log (donation_id, email_type)
  WHERE donation_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_femail_contact_type
  ON public.fundraiser_email_log (contact_id, email_type)
  WHERE contact_id IS NOT NULL;

-- ---------- A6: unsubscribe is one-way for API roles ----------
CREATE OR REPLACE FUNCTION public.enforce_contact_unsubscribe_oneway()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.unsubscribed = true AND NEW.unsubscribed = false
     AND auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'A contact who unsubscribed cannot be re-subscribed from the portal'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.enforce_contact_unsubscribe_oneway() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_contact_unsub_oneway ON public.fundraiser_contacts;
CREATE TRIGGER trg_contact_unsub_oneway
  BEFORE UPDATE OF unsubscribed ON public.fundraiser_contacts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_contact_unsubscribe_oneway();

-- ============================================================
-- PROOF QUERIES (run after apply; every row must read PASS)
-- ============================================================
-- SELECT 'A1 single overload' AS chk, CASE WHEN count(*)=1 THEN 'PASS' ELSE 'FAIL' END
--   FROM pg_proc WHERE proname='get_campaign_public' AND pronamespace='public'::regnamespace;
-- SELECT 'A3 anon cannot exec link_participant_parent',
--   CASE WHEN has_function_privilege('anon','public.link_participant_parent(uuid,uuid)','execute') THEN 'FAIL' ELSE 'PASS' END;
-- SELECT 'A4 forward-only trigger present',
--   CASE WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_donation_status_forward') THEN 'PASS' ELSE 'FAIL' END;
-- SELECT 'A5 unique ledger indexes',
--   CASE WHEN count(*)=2 THEN 'PASS' ELSE 'FAIL' END FROM pg_indexes WHERE indexname IN ('uq_femail_donation_type','uq_femail_contact_type');
-- A2 is proven over HTTP: POST /rest/v1/rpc/get_campaign_public {"p_slug":"10u-season-2026","p_preview":true}
--   with the anon key must return {} while the campaign is draft.
