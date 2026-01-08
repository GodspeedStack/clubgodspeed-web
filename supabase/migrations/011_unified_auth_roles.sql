-- =====================================================
-- UNIFIED AUTHENTICATION & ROLE SYSTEM
-- =====================================================
-- Purpose: Unified role-based access control for all users
-- Features: User profiles, role management, permission system
-- =====================================================

-- Create user_profiles table (extends auth.users)
CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'parent' CHECK (role IN ('admin', 'coach', 'parent', 'athlete', 'guest')),
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    phone VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_email UNIQUE (email)
);

-- Create rate_limiting table for server-side rate limiting
CREATE TABLE IF NOT EXISTS rate_limiting (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    identifier VARCHAR(255) NOT NULL, -- IP, email, or user_id
    action VARCHAR(100) NOT NULL, -- 'login', 'signup', 'api_call', etc.
    attempts INTEGER DEFAULT 1,
    first_attempt TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_attempt TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    blocked_until TIMESTAMP WITH TIME ZONE,
    
    CONSTRAINT unique_identifier_action UNIQUE (identifier, action)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles(email);
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON user_profiles(role);
CREATE INDEX IF NOT EXISTS idx_rate_limiting_identifier ON rate_limiting(identifier);
CREATE INDEX IF NOT EXISTS idx_rate_limiting_action ON rate_limiting(action);
CREATE INDEX IF NOT EXISTS idx_rate_limiting_blocked_until ON rate_limiting(blocked_until) WHERE blocked_until IS NOT NULL;

-- Function to create user profile on signup (trigger)
CREATE OR REPLACE FUNCTION create_user_profile()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO user_profiles (id, email, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'role', 'parent')
    )
    ON CONFLICT (id) DO NOTHING;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile when user signs up
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION create_user_profile();

-- Function to update user role
CREATE OR REPLACE FUNCTION update_user_role(p_user_id UUID, p_role VARCHAR)
RETURNS BOOLEAN AS $$
BEGIN
    -- Validate role
    IF p_role NOT IN ('admin', 'coach', 'parent', 'athlete', 'guest') THEN
        RAISE EXCEPTION 'Invalid role: %', p_role;
    END IF;
    
    -- Update profile
    UPDATE user_profiles
    SET role = p_role,
        updated_at = NOW()
    WHERE id = p_user_id;
    
    -- Update auth.users metadata
    UPDATE auth.users
    SET raw_user_meta_data = jsonb_set(
        COALESCE(raw_user_meta_data, '{}'::jsonb),
        '{role}',
        to_jsonb(p_role)
    )
    WHERE id = p_user_id;
    
    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user role
CREATE OR REPLACE FUNCTION get_user_role(p_user_id UUID)
RETURNS VARCHAR AS $$
DECLARE
    v_role VARCHAR;
BEGIN
    SELECT role INTO v_role
    FROM user_profiles
    WHERE id = p_user_id;
    
    RETURN COALESCE(v_role, 'guest');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check rate limit (server-side)
CREATE OR REPLACE FUNCTION check_rate_limit(
    p_identifier VARCHAR,
    p_action VARCHAR,
    p_max_attempts INTEGER DEFAULT 5,
    p_window_minutes INTEGER DEFAULT 15
)
RETURNS TABLE(allowed BOOLEAN, remaining INTEGER, reset_at TIMESTAMP WITH TIME ZONE) AS $$
DECLARE
    v_record rate_limiting%ROWTYPE;
    v_window_start TIMESTAMP WITH TIME ZONE;
    v_reset_at TIMESTAMP WITH TIME ZONE;
BEGIN
    -- Calculate window start
    v_window_start := NOW() - (p_window_minutes || ' minutes')::INTERVAL;
    
    -- Get or create rate limit record
    SELECT * INTO v_record
    FROM rate_limiting
    WHERE identifier = p_identifier
      AND action = p_action;
    
    -- If no record exists, allow
    IF v_record IS NULL THEN
        RETURN QUERY SELECT true, p_max_attempts, NOW() + (p_window_minutes || ' minutes')::INTERVAL;
        RETURN;
    END IF;
    
    -- Check if blocked
    IF v_record.blocked_until IS NOT NULL AND v_record.blocked_until > NOW() THEN
        RETURN QUERY SELECT false, 0, v_record.blocked_until;
        RETURN;
    END IF;
    
    -- Check if window has expired
    IF v_record.first_attempt < v_window_start THEN
        -- Reset
        UPDATE rate_limiting
        SET attempts = 0,
            first_attempt = NOW(),
            blocked_until = NULL
        WHERE identifier = p_identifier AND action = p_action;
        
        RETURN QUERY SELECT true, p_max_attempts, NOW() + (p_window_minutes || ' minutes')::INTERVAL;
        RETURN;
    END IF;
    
    -- Calculate reset time
    v_reset_at := v_record.first_attempt + (p_window_minutes || ' minutes')::INTERVAL;
    
    -- Check if max attempts reached
    IF v_record.attempts >= p_max_attempts THEN
        -- Block for window duration
        UPDATE rate_limiting
        SET blocked_until = v_reset_at
        WHERE identifier = p_identifier AND action = p_action;
        
        RETURN QUERY SELECT false, 0, v_reset_at;
        RETURN;
    END IF;
    
    -- Allow with remaining attempts
    RETURN QUERY SELECT true, p_max_attempts - v_record.attempts, v_reset_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to record rate limit attempt
CREATE OR REPLACE FUNCTION record_rate_limit_attempt(
    p_identifier VARCHAR,
    p_action VARCHAR
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO rate_limiting (identifier, action, attempts, first_attempt, last_attempt)
    VALUES (p_identifier, p_action, 1, NOW(), NOW())
    ON CONFLICT (identifier, action)
    DO UPDATE SET
        attempts = rate_limiting.attempts + 1,
        last_attempt = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to reset rate limit
CREATE OR REPLACE FUNCTION reset_rate_limit(
    p_identifier VARCHAR,
    p_action VARCHAR
)
RETURNS VOID AS $$
BEGIN
    DELETE FROM rate_limiting
    WHERE identifier = p_identifier AND action = p_action;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enable RLS on user_profiles
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view their own profile
CREATE POLICY user_profiles_select_own ON user_profiles
    FOR SELECT
    USING (auth.uid() = id);

-- RLS Policy: Users can update their own profile (except role)
CREATE POLICY user_profiles_update_own ON user_profiles
    FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (
        auth.uid() = id AND
        -- Prevent role changes via this policy (use function instead)
        role = (SELECT role FROM user_profiles WHERE id = auth.uid())
    );

-- RLS Policy: Admins can view all profiles
CREATE POLICY user_profiles_select_admin ON user_profiles
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Enable RLS on rate_limiting (admin only)
ALTER TABLE rate_limiting ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Only admins can view rate limiting data
CREATE POLICY rate_limiting_select_admin ON rate_limiting
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Migrate existing parent_accounts to user_profiles
INSERT INTO user_profiles (id, email, role, first_name, last_name, phone, created_at, updated_at)
SELECT 
    pa.user_id,
    pa.email,
    'parent'::VARCHAR,
    pa.first_name,
    pa.last_name,
    pa.phone,
    pa.created_at,
    pa.updated_at
FROM parent_accounts pa
WHERE NOT EXISTS (
    SELECT 1 FROM user_profiles up WHERE up.id = pa.user_id
)
ON CONFLICT (id) DO NOTHING;

-- Add comments
COMMENT ON TABLE user_profiles IS 'Unified user profiles with role-based access control';
COMMENT ON TABLE rate_limiting IS 'Server-side rate limiting for API endpoints and authentication';
COMMENT ON FUNCTION create_user_profile IS 'Automatically creates user profile when user signs up';
COMMENT ON FUNCTION update_user_role IS 'Updates user role (admin only)';
COMMENT ON FUNCTION get_user_role IS 'Gets user role';
COMMENT ON FUNCTION check_rate_limit IS 'Checks if action is rate limited';
COMMENT ON FUNCTION record_rate_limit_attempt IS 'Records a rate limit attempt';
COMMENT ON FUNCTION reset_rate_limit IS 'Resets rate limit for identifier/action';
