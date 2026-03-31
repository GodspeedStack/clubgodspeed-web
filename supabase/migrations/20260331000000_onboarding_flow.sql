-- ============================================================
-- ONBOARDING FLOW SCHEMA
-- Tracks parent progression through multi-step onboarding
-- Enables drop-off analytics and automated reminders
-- ============================================================

-- Steps enum for type safety
CREATE TYPE onboarding_step AS ENUM (
    'welcome',          -- Read welcome letter
    'account_created',  -- Auth complete (Google or email/password)
    'parent_guide',     -- Viewed season guide
    'athletic_waiver',  -- Signed athletic liability waiver
    'medical_consent',  -- Signed medical consent
    'practice_consent', -- Signed practice consent
    'code_of_conduct',  -- Signed parental conduct policy
    'media_release',    -- Signed photo/video release
    'payment_setup',    -- Acknowledged payment info
    'complete'          -- All steps finished
);

-- Master onboarding record per parent
CREATE TABLE onboarding_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    email           TEXT NOT NULL,
    parent_name     TEXT,
    athlete_name    TEXT,
    current_step    onboarding_step NOT NULL DEFAULT 'welcome',
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at    TIMESTAMPTZ,
    last_activity   TIMESTAMPTZ NOT NULL DEFAULT now(),
    reminder_count  INT NOT NULL DEFAULT 0,
    last_reminder   TIMESTAMPTZ,
    invite_token    TEXT UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Immutable audit log of every step transition
CREATE TABLE onboarding_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      UUID NOT NULL REFERENCES onboarding_sessions(id) ON DELETE CASCADE,
    step            onboarding_step NOT NULL,
    event_type      TEXT NOT NULL CHECK (event_type IN ('entered', 'completed', 'skipped', 'reminder_sent')),
    user_agent      TEXT,
    ip_address      INET,
    event_metadata  JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for analytics queries
CREATE INDEX idx_onboarding_sessions_user    ON onboarding_sessions(user_id);
CREATE INDEX idx_onboarding_sessions_email   ON onboarding_sessions(email);
CREATE INDEX idx_onboarding_sessions_step    ON onboarding_sessions(current_step);
CREATE INDEX idx_onboarding_sessions_stale   ON onboarding_sessions(last_activity) WHERE completed_at IS NULL;
CREATE INDEX idx_onboarding_events_session   ON onboarding_events(session_id);
CREATE INDEX idx_onboarding_events_step      ON onboarding_events(step);

-- ── RPC: Advance onboarding step ──
CREATE OR REPLACE FUNCTION advance_onboarding_step(
    p_session_id UUID,
    p_step       onboarding_step,
    p_user_agent TEXT DEFAULT NULL
)
RETURNS onboarding_sessions
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    v_session onboarding_sessions;
BEGIN
    -- Mark current step as completed
    INSERT INTO onboarding_events (session_id, step, event_type, user_agent)
    VALUES (p_session_id, p_step, 'completed', p_user_agent);

    -- Advance to next step
    UPDATE onboarding_sessions
    SET current_step  = p_step,
        last_activity = now(),
        completed_at  = CASE WHEN p_step = 'complete' THEN now() ELSE NULL END
    WHERE id = p_session_id
    RETURNING * INTO v_session;

    -- Log entry into new step (if not complete)
    IF p_step <> 'complete' THEN
        INSERT INTO onboarding_events (session_id, step, event_type, user_agent)
        VALUES (p_session_id, p_step, 'entered', p_user_agent);
    END IF;

    RETURN v_session;
END;
$$;

-- ── RPC: Start or resume onboarding session ──
CREATE OR REPLACE FUNCTION get_or_create_onboarding(
    p_email       TEXT,
    p_user_id     UUID DEFAULT NULL,
    p_parent_name TEXT DEFAULT NULL,
    p_athlete_name TEXT DEFAULT NULL
)
RETURNS onboarding_sessions
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    v_session onboarding_sessions;
BEGIN
    -- Try to find existing incomplete session
    SELECT * INTO v_session
    FROM onboarding_sessions
    WHERE email = lower(trim(p_email))
      AND completed_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_session.id IS NOT NULL THEN
        -- Update with user_id if we now have it
        IF p_user_id IS NOT NULL AND v_session.user_id IS NULL THEN
            UPDATE onboarding_sessions
            SET user_id = p_user_id,
                last_activity = now()
            WHERE id = v_session.id
            RETURNING * INTO v_session;
        ELSE
            UPDATE onboarding_sessions
            SET last_activity = now()
            WHERE id = v_session.id;
        END IF;
        RETURN v_session;
    END IF;

    -- Create new session
    INSERT INTO onboarding_sessions (email, user_id, parent_name, athlete_name)
    VALUES (lower(trim(p_email)), p_user_id, p_parent_name, p_athlete_name)
    RETURNING * INTO v_session;

    -- Log welcome step entry
    INSERT INTO onboarding_events (session_id, step, event_type)
    VALUES (v_session.id, 'welcome', 'entered');

    RETURN v_session;
END;
$$;

-- ── View: Onboarding funnel analytics ──
CREATE OR REPLACE VIEW onboarding_funnel AS
SELECT
    current_step,
    count(*)                                         AS total,
    count(*) FILTER (WHERE completed_at IS NOT NULL) AS completed,
    count(*) FILTER (WHERE completed_at IS NULL
        AND last_activity < now() - interval '48 hours')  AS stale,
    round(avg(EXTRACT(EPOCH FROM (last_activity - started_at)) / 3600)::numeric, 1) AS avg_hours_in_step
FROM onboarding_sessions
GROUP BY current_step
ORDER BY
    CASE current_step
        WHEN 'welcome'          THEN 1
        WHEN 'account_created'  THEN 2
        WHEN 'parent_guide'     THEN 3
        WHEN 'athletic_waiver'  THEN 4
        WHEN 'medical_consent'  THEN 5
        WHEN 'practice_consent' THEN 6
        WHEN 'code_of_conduct'  THEN 7
        WHEN 'media_release'    THEN 8
        WHEN 'payment_setup'    THEN 9
        WHEN 'complete'         THEN 10
    END;

-- ── View: Per-parent onboarding status (admin) ──
CREATE OR REPLACE VIEW onboarding_status AS
SELECT
    os.id,
    os.email,
    os.parent_name,
    os.athlete_name,
    os.current_step,
    os.started_at,
    os.completed_at,
    os.last_activity,
    os.reminder_count,
    os.last_reminder,
    CASE
        WHEN os.completed_at IS NOT NULL THEN 'complete'
        WHEN os.last_activity < now() - interval '72 hours' THEN 'at_risk'
        WHEN os.last_activity < now() - interval '48 hours' THEN 'stale'
        ELSE 'active'
    END AS health,
    (SELECT count(*) FROM onboarding_events oe
     WHERE oe.session_id = os.id AND oe.event_type = 'completed') AS steps_completed
FROM onboarding_sessions os
ORDER BY
    CASE
        WHEN os.completed_at IS NOT NULL THEN 3
        WHEN os.last_activity < now() - interval '48 hours' THEN 1
        ELSE 2
    END,
    os.last_activity DESC;

-- ── RLS ──
ALTER TABLE onboarding_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_events ENABLE ROW LEVEL SECURITY;

-- Parents see only their own session
CREATE POLICY onboarding_sessions_parent_read ON onboarding_sessions
    FOR SELECT USING (
        user_id = auth.uid()
        OR email = (SELECT email FROM auth.users WHERE id = auth.uid())
    );

-- Parents can update their own session (step advancement via RPC)
CREATE POLICY onboarding_sessions_parent_update ON onboarding_sessions
    FOR UPDATE USING (
        user_id = auth.uid()
        OR email = (SELECT email FROM auth.users WHERE id = auth.uid())
    );

-- Service role (edge functions) gets full access
CREATE POLICY onboarding_sessions_service ON onboarding_sessions
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY onboarding_events_service ON onboarding_events
    FOR ALL USING (auth.role() = 'service_role');

-- Parents can read their own events
CREATE POLICY onboarding_events_parent_read ON onboarding_events
    FOR SELECT USING (
        session_id IN (
            SELECT id FROM onboarding_sessions
            WHERE user_id = auth.uid()
               OR email = (SELECT email FROM auth.users WHERE id = auth.uid())
        )
    );

-- Coach/director full read access
CREATE POLICY onboarding_sessions_coach_read ON onboarding_sessions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
              AND role IN ('coach', 'director')
        )
    );

CREATE POLICY onboarding_events_coach_read ON onboarding_events
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
              AND role IN ('coach', 'director')
        )
    );

-- Insert policy for RPCs (SECURITY DEFINER handles this, but belt+suspenders)
CREATE POLICY onboarding_sessions_insert ON onboarding_sessions
    FOR INSERT WITH CHECK (true);

CREATE POLICY onboarding_events_insert ON onboarding_events
    FOR INSERT WITH CHECK (true);
