-- ============================================================
-- v7_01: Availability Check System (Twilio SMS)
-- One-tap availability checks sent to parents via SMS.
-- Responses captured via Twilio webhook.
-- ============================================================

-- -----------------------------------------------------------
-- TABLE: availability_checks
-- One row per check (e.g. "Practice 4/5" or "Game 4/12")
-- -----------------------------------------------------------
CREATE TABLE public.availability_checks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT NOT NULL,                         -- "Practice - Saturday 4/5"
  event_date    DATE NOT NULL,
  event_type    TEXT NOT NULL DEFAULT 'practice'
                  CHECK (event_type IN ('practice', 'game', 'tournament', 'other')),
  team_id       UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  message       TEXT NOT NULL,                         -- SMS body sent to parents
  status        TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'sent', 'closed')),
  sent_at       TIMESTAMPTZ,
  sent_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_avail_checks_date ON availability_checks(event_date DESC);
CREATE INDEX idx_avail_checks_status ON availability_checks(status);

-- -----------------------------------------------------------
-- TABLE: availability_responses
-- One row per parent response. Upsert on (check_id, profile_id).
-- -----------------------------------------------------------
CREATE TABLE public.availability_responses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  check_id      UUID NOT NULL REFERENCES public.availability_checks(id) ON DELETE CASCADE,
  profile_id    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  phone         TEXT NOT NULL,                         -- E.164 format
  player_name   TEXT,                                  -- resolved from parent_player_links
  response      TEXT NOT NULL CHECK (response IN ('available', 'unavailable', 'unknown')),
  raw_reply     TEXT,                                  -- exact SMS body from parent
  responded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  twilio_sid    TEXT,                                  -- Twilio message SID for audit
  UNIQUE(check_id, phone)                              -- one response per phone per check
);

CREATE INDEX idx_avail_resp_check ON availability_responses(check_id);
CREATE INDEX idx_avail_resp_profile ON availability_responses(profile_id);

-- -----------------------------------------------------------
-- VIEW: availability_summary
-- Per-check rollup for admin dashboard
-- -----------------------------------------------------------
CREATE OR REPLACE VIEW public.availability_summary AS
SELECT
  ac.id,
  ac.title,
  ac.event_date,
  ac.event_type,
  ac.status,
  ac.sent_at,
  COUNT(ar.id) AS total_responses,
  COUNT(ar.id) FILTER (WHERE ar.response = 'available') AS available_count,
  COUNT(ar.id) FILTER (WHERE ar.response = 'unavailable') AS unavailable_count,
  COUNT(ar.id) FILTER (WHERE ar.response = 'unknown') AS unknown_count
FROM availability_checks ac
LEFT JOIN availability_responses ar ON ar.check_id = ac.id
GROUP BY ac.id, ac.title, ac.event_date, ac.event_type, ac.status, ac.sent_at;

-- -----------------------------------------------------------
-- RPC: get_sms_eligible_parents
-- Returns parents with phone numbers + linked player names
-- Used by the Edge Function to build the send list
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION get_sms_eligible_parents(p_team_id UUID DEFAULT NULL)
RETURNS TABLE(
  profile_id UUID,
  full_name  TEXT,
  phone      TEXT,
  email      TEXT,
  player_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT ON (p.id)
    p.id AS profile_id,
    p.full_name,
    p.phone,
    p.email,
    a.first_name || ' ' || a.last_name AS player_name
  FROM profiles p
  JOIN parent_player_links ppl ON ppl.profile_id = p.id
  JOIN athletes a ON a.id = ppl.athlete_id
  LEFT JOIN team_rosters tr ON tr.athlete_id = a.id
  WHERE p.role = 'parent'
    AND p.approved = true
    AND p.phone IS NOT NULL
    AND p.phone <> ''
    AND (p_team_id IS NULL OR tr.team_id = p_team_id)
  ORDER BY p.id, ppl.is_primary DESC NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION get_sms_eligible_parents(UUID) TO authenticated;

-- -----------------------------------------------------------
-- RLS
-- -----------------------------------------------------------
ALTER TABLE availability_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability_responses ENABLE ROW LEVEL SECURITY;

-- Directors/coaches: full access
CREATE POLICY "Coach/director full access on availability_checks"
  ON availability_checks FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
      AND profiles.role = ANY(ARRAY['director'::app_role, 'coach'::app_role]))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
      AND profiles.role = ANY(ARRAY['director'::app_role, 'coach'::app_role]))
  );

CREATE POLICY "Coach/director full access on availability_responses"
  ON availability_responses FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
      AND profiles.role = ANY(ARRAY['director'::app_role, 'coach'::app_role]))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
      AND profiles.role = ANY(ARRAY['director'::app_role, 'coach'::app_role]))
  );

-- Parents: read own responses
CREATE POLICY "Parents read own availability responses"
  ON availability_responses FOR SELECT
  USING (profile_id = auth.uid());

-- Enable realtime for live response tracking on admin dashboard
ALTER PUBLICATION supabase_realtime ADD TABLE availability_responses;

COMMENT ON TABLE availability_checks IS
  'Admin-initiated availability checks sent to parents via Twilio SMS.';
COMMENT ON TABLE availability_responses IS
  'Parent SMS replies captured via Twilio webhook. One response per phone per check.';
