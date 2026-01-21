-- =====================================================
-- TRAINING SESSIONS API - DATABASE SCHEMA
-- =====================================================
-- Purpose: Model training sessions with optional schedule
-- Features: Session tracking, athlete context, API endpoints
-- =====================================================

-- =====================================================
-- TABLE: training_sessions_v2
-- =====================================================
-- New training sessions table matching API contract
CREATE TABLE IF NOT EXISTS training_sessions_v2 (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    athlete_id VARCHAR(100) NOT NULL,
    program_name VARCHAR(255) NOT NULL, -- e.g., "Elite Guard Academy"
    focus TEXT, -- Training focus/description
    status VARCHAR(20) NOT NULL DEFAULT 'scheduled' 
        CHECK (status IN ('completed', 'scheduled', 'tentative', 'canceled')),
    start_time TIMESTAMP WITH TIME ZONE, -- Nullable for unscheduled sessions
    end_time TIMESTAMP WITH TIME ZONE, -- Nullable for unscheduled sessions
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Computed column: has_schedule
    has_schedule BOOLEAN GENERATED ALWAYS AS (start_time IS NOT NULL) STORED
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_training_sessions_v2_athlete_id ON training_sessions_v2(athlete_id);
CREATE INDEX IF NOT EXISTS idx_training_sessions_v2_status ON training_sessions_v2(status);
CREATE INDEX IF NOT EXISTS idx_training_sessions_v2_start_time ON training_sessions_v2(start_time) WHERE start_time IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_training_sessions_v2_has_schedule ON training_sessions_v2(has_schedule);
CREATE INDEX IF NOT EXISTS idx_training_sessions_v2_program_name ON training_sessions_v2(program_name);

-- =====================================================
-- TABLE: parent_athletes
-- =====================================================
-- Links parents to their athletes (for athlete context)
CREATE TABLE IF NOT EXISTS parent_athletes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_id UUID NOT NULL REFERENCES parent_accounts(id) ON DELETE CASCADE,
    athlete_id VARCHAR(100) NOT NULL,
    athlete_name VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure one parent can't have duplicate athlete entries
    CONSTRAINT unique_parent_athlete UNIQUE (parent_id, athlete_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_parent_athletes_parent_id ON parent_athletes(parent_id);
CREATE INDEX IF NOT EXISTS idx_parent_athletes_athlete_id ON parent_athletes(athlete_id);

-- =====================================================
-- FUNCTION: Get athlete context for logged-in user
-- =====================================================
CREATE OR REPLACE FUNCTION get_athlete_context(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_athletes_count INTEGER;
    v_athletes JSONB;
    v_parent_id UUID;
BEGIN
    -- Get parent_id from user_id
    SELECT id INTO v_parent_id
    FROM parent_accounts
    WHERE user_id = p_user_id
    LIMIT 1;
    
    -- If no parent account found, return empty context
    IF v_parent_id IS NULL THEN
        RETURN jsonb_build_object(
            'athletes_count', 0,
            'athletes', '[]'::jsonb
        );
    END IF;
    
    -- Count athletes for this parent
    SELECT COUNT(*) INTO v_athletes_count
    FROM parent_athletes
    WHERE parent_id = v_parent_id;
    
    -- Get athletes list (only if count > 1, or always - frontend decides)
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', athlete_id,
            'name', athlete_name
        ) ORDER BY athlete_name
    ), '[]'::jsonb) INTO v_athletes
    FROM parent_athletes
    WHERE parent_id = v_parent_id;
    
    RETURN jsonb_build_object(
        'athletes_count', v_athletes_count,
        'athletes', v_athletes
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- FUNCTION: Get training sessions for athlete(s)
-- =====================================================
CREATE OR REPLACE FUNCTION get_training_sessions(
    p_user_id UUID,
    p_athlete_id VARCHAR DEFAULT NULL,
    p_include_all BOOLEAN DEFAULT false
)
RETURNS JSONB AS $$
DECLARE
    v_parent_id UUID;
    v_athletes_count INTEGER;
    v_sessions JSONB;
    v_athlete_ids VARCHAR[];
BEGIN
    -- Get parent_id from user_id
    SELECT id INTO v_parent_id
    FROM parent_accounts
    WHERE user_id = p_user_id
    LIMIT 1;
    
    -- If no parent account found, return empty
    IF v_parent_id IS NULL THEN
        RETURN jsonb_build_object(
            'sessions', '[]'::jsonb,
            'athletes_count', 0
        );
    END IF;
    
    -- Get athlete context
    SELECT athletes_count INTO v_athletes_count
    FROM get_athlete_context(p_user_id);
    
    -- Determine which athletes to query
    IF p_include_all AND v_athletes_count > 1 THEN
        -- Multi-athlete aggregation: ONLY return scheduled group programs
        -- This is the contract: multi-athlete aggregation is only valid for scheduled sessions
        -- Get all athlete IDs for this parent
        SELECT ARRAY_AGG(athlete_id) INTO v_athlete_ids
        FROM parent_athletes
        WHERE parent_id = v_parent_id;
        
        -- Get sessions for selected athletes - ONLY scheduled sessions (has_schedule = true)
        SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
                'id', id,
                'athlete_id', athlete_id,
                'program_name', program_name,
                'focus', focus,
                'status', status,
                'start_time', start_time,
                'end_time', end_time,
                'has_schedule', has_schedule,  -- Explicit source of truth for schedule presence
                'created_at', created_at,
                'updated_at', updated_at
            ) ORDER BY start_time DESC
        ), '[]'::jsonb) INTO v_sessions
        FROM training_sessions_v2
        WHERE athlete_id = ANY(v_athlete_ids)
        AND has_schedule = true;  -- CRITICAL: Only scheduled sessions for multi-athlete aggregation
        
    ELSIF p_athlete_id IS NOT NULL THEN
        -- Single athlete specified - return all sessions (scheduled and unscheduled)
        v_athlete_ids := ARRAY[p_athlete_id];
        
        -- Get sessions for selected athlete (all sessions)
        SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
                'id', id,
                'athlete_id', athlete_id,
                'program_name', program_name,
                'focus', focus,
                'status', status,
                'start_time', start_time,
                'end_time', end_time,
                'has_schedule', has_schedule,  -- Explicit source of truth for schedule presence
                'created_at', created_at,
                'updated_at', updated_at
            ) ORDER BY 
                CASE WHEN start_time IS NOT NULL THEN start_time ELSE created_at END DESC
        ), '[]'::jsonb) INTO v_sessions
        FROM training_sessions_v2
        WHERE athlete_id = ANY(v_athlete_ids);
        
    ELSE
        -- Default: get first athlete or all if only one
        IF v_athletes_count = 1 THEN
            SELECT ARRAY_AGG(athlete_id) INTO v_athlete_ids
            FROM parent_athletes
            WHERE parent_id = v_parent_id;
        ELSE
            -- Multiple athletes but no selection - return first athlete's sessions
            SELECT ARRAY_AGG(athlete_id) INTO v_athlete_ids
            FROM parent_athletes
            WHERE parent_id = v_parent_id
            LIMIT 1;
        END IF;
        
        -- Get sessions for selected athlete(s) (all sessions)
        SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
                'id', id,
                'athlete_id', athlete_id,
                'program_name', program_name,
                'focus', focus,
                'status', status,
                'start_time', start_time,
                'end_time', end_time,
                'has_schedule', has_schedule,  -- Explicit source of truth for schedule presence
                'created_at', created_at,
                'updated_at', updated_at
            ) ORDER BY 
                CASE WHEN start_time IS NOT NULL THEN start_time ELSE created_at END DESC
        ), '[]'::jsonb) INTO v_sessions
        FROM training_sessions_v2
        WHERE athlete_id = ANY(v_athlete_ids);
    END IF;
    
    RETURN jsonb_build_object(
        'sessions', v_sessions,
        'athletes_count', v_athletes_count,
        'athlete_ids', v_athlete_ids
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- FUNCTION: Create training session
-- =====================================================
CREATE OR REPLACE FUNCTION create_training_session(
    p_user_id UUID,
    p_athlete_id VARCHAR,
    p_program_name VARCHAR,
    p_focus TEXT DEFAULT NULL,
    p_status VARCHAR DEFAULT 'scheduled',
    p_start_time TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    p_end_time TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_parent_id UUID;
    v_session_id UUID;
    v_has_access BOOLEAN;
BEGIN
    -- Verify parent has access to this athlete
    SELECT pa.parent_id INTO v_parent_id
    FROM parent_athletes pa
    JOIN parent_accounts p ON p.id = pa.parent_id
    WHERE p.user_id = p_user_id
    AND pa.athlete_id = p_athlete_id
    LIMIT 1;
    
    IF v_parent_id IS NULL THEN
        RAISE EXCEPTION 'Access denied: Parent does not have access to athlete %', p_athlete_id;
    END IF;
    
    -- Validate status
    IF p_status NOT IN ('completed', 'scheduled', 'tentative', 'canceled') THEN
        RAISE EXCEPTION 'Invalid status: %', p_status;
    END IF;
    
    -- Validate times (if provided)
    IF (p_start_time IS NOT NULL AND p_end_time IS NOT NULL) AND (p_start_time >= p_end_time) THEN
        RAISE EXCEPTION 'start_time must be before end_time';
    END IF;
    
    -- Create session
    INSERT INTO training_sessions_v2 (
        athlete_id,
        program_name,
        focus,
        status,
        start_time,
        end_time
    ) VALUES (
        p_athlete_id,
        p_program_name,
        p_focus,
        p_status,
        p_start_time,
        p_end_time
    ) RETURNING id INTO v_session_id;
    
    -- Return created session
    RETURN jsonb_build_object(
        'id', v_session_id,
        'success', true
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- FUNCTION: Update training session
-- =====================================================
CREATE OR REPLACE FUNCTION update_training_session(
    p_user_id UUID,
    p_session_id UUID,
    p_program_name VARCHAR DEFAULT NULL,
    p_focus TEXT DEFAULT NULL,
    p_status VARCHAR DEFAULT NULL,
    p_start_time TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    p_end_time TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_parent_id UUID;
    v_athlete_id VARCHAR;
    v_has_access BOOLEAN;
BEGIN
    -- Get athlete_id from session
    SELECT ts.athlete_id INTO v_athlete_id
    FROM training_sessions_v2 ts
    WHERE ts.id = p_session_id;
    
    IF v_athlete_id IS NULL THEN
        RAISE EXCEPTION 'Session not found';
    END IF;
    
    -- Verify parent has access to this athlete
    SELECT pa.parent_id INTO v_parent_id
    FROM parent_athletes pa
    JOIN parent_accounts p ON p.id = pa.parent_id
    WHERE p.user_id = p_user_id
    AND pa.athlete_id = v_athlete_id
    LIMIT 1;
    
    IF v_parent_id IS NULL THEN
        RAISE EXCEPTION 'Access denied: Parent does not have access to this session';
    END IF;
    
    -- Validate status if provided
    IF p_status IS NOT NULL AND p_status NOT IN ('completed', 'scheduled', 'tentative', 'canceled') THEN
        RAISE EXCEPTION 'Invalid status: %', p_status;
    END IF;
    
    -- Validate times (if provided)
    IF (p_start_time IS NOT NULL AND p_end_time IS NOT NULL) AND (p_start_time >= p_end_time) THEN
        RAISE EXCEPTION 'start_time must be before end_time';
    END IF;
    
    -- Update session
    UPDATE training_sessions_v2
    SET
        program_name = COALESCE(p_program_name, program_name),
        focus = COALESCE(p_focus, focus),
        status = COALESCE(p_status, status),
        start_time = COALESCE(p_start_time, start_time),
        end_time = COALESCE(p_end_time, end_time),
        updated_at = NOW()
    WHERE id = p_session_id;
    
    RETURN jsonb_build_object(
        'id', p_session_id,
        'success', true
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS
ALTER TABLE training_sessions_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE parent_athletes ENABLE ROW LEVEL SECURITY;

-- Training sessions: Parents can only see sessions for their athletes
CREATE POLICY training_sessions_v2_select_own ON training_sessions_v2
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM parent_athletes pa
            JOIN parent_accounts p ON p.id = pa.parent_id
            WHERE pa.athlete_id = training_sessions_v2.athlete_id
            AND p.user_id = auth.uid()
        )
    );

-- Training sessions: Parents can insert sessions for their athletes
CREATE POLICY training_sessions_v2_insert_own ON training_sessions_v2
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM parent_athletes pa
            JOIN parent_accounts p ON p.id = pa.parent_id
            WHERE pa.athlete_id = training_sessions_v2.athlete_id
            AND p.user_id = auth.uid()
        )
    );

-- Training sessions: Parents can update sessions for their athletes
CREATE POLICY training_sessions_v2_update_own ON training_sessions_v2
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM parent_athletes pa
            JOIN parent_accounts p ON p.id = pa.parent_id
            WHERE pa.athlete_id = training_sessions_v2.athlete_id
            AND p.user_id = auth.uid()
        )
    );

-- Parent athletes: Parents can only see their own athlete links
CREATE POLICY parent_athletes_select_own ON parent_athletes
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM parent_accounts
            WHERE parent_accounts.id = parent_athletes.parent_id
            AND parent_accounts.user_id = auth.uid()
        )
    );

-- =====================================================
-- TRIGGER: Update updated_at timestamp
-- =====================================================
CREATE OR REPLACE FUNCTION update_training_sessions_v2_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_training_sessions_v2_updated_at ON training_sessions_v2;
CREATE TRIGGER trigger_update_training_sessions_v2_updated_at
    BEFORE UPDATE ON training_sessions_v2
    FOR EACH ROW
    EXECUTE FUNCTION update_training_sessions_v2_updated_at();

-- =====================================================
-- COMMENTS
-- =====================================================
COMMENT ON TABLE training_sessions_v2 IS 'Training sessions with optional schedule. has_schedule computed flag indicates if start_time is set.';
COMMENT ON COLUMN training_sessions_v2.has_schedule IS 'EXPLICIT SOURCE OF TRUTH: Computed flag (true if start_time IS NOT NULL, false otherwise). Frontend MUST use this field to determine whether to render "Training Schedule" section. If has_schedule = false, frontend MUST NOT show schedule UI.';
COMMENT ON COLUMN training_sessions_v2.start_time IS 'Nullable. If null, session has no predetermined time (has_schedule = false). Individual sessions without predetermined times return has_schedule = false.';
COMMENT ON COLUMN training_sessions_v2.end_time IS 'Nullable. If null, session has no schedule.';
COMMENT ON FUNCTION get_athlete_context IS 'Returns athlete context count and list for logged-in user. athletes[] always returned (frontend decides usage).';
COMMENT ON FUNCTION get_training_sessions IS 'Get training sessions. CONTRACT: Multi-athlete aggregation (p_include_all=true) ONLY returns scheduled sessions (has_schedule=true). Single athlete queries return all sessions (scheduled and unscheduled). Response ALWAYS includes has_schedule field as explicit source of truth.';
