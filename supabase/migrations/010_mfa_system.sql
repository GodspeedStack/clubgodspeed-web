-- =====================================================
-- MULTI-FACTOR AUTHENTICATION (MFA/2FA) SYSTEM
-- =====================================================
-- Purpose: Two-factor authentication using TOTP
-- Features: TOTP secrets, backup codes, MFA status tracking
-- =====================================================

-- Create user_mfa table
CREATE TABLE IF NOT EXISTS user_mfa (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    secret VARCHAR(255) NOT NULL, -- TOTP secret (encrypted in production)
    enabled BOOLEAN DEFAULT false,
    enabled_at TIMESTAMP WITH TIME ZONE,
    last_used_at TIMESTAMP WITH TIME ZONE,
    backup_codes_used INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create mfa_backup_codes table
CREATE TABLE IF NOT EXISTS mfa_backup_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    code_hash VARCHAR(255) NOT NULL, -- Hashed backup code
    used BOOLEAN DEFAULT false,
    used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_user_code UNIQUE (user_id, code_hash)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_mfa_user_id ON user_mfa(user_id);
CREATE INDEX IF NOT EXISTS idx_user_mfa_enabled ON user_mfa(enabled) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_mfa_backup_codes_user_id ON mfa_backup_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_mfa_backup_codes_used ON mfa_backup_codes(used) WHERE used = false;

-- Function to generate backup codes
CREATE OR REPLACE FUNCTION generate_mfa_backup_codes(p_user_id UUID, p_count INTEGER DEFAULT 10)
RETURNS TABLE(code VARCHAR) AS $$
DECLARE
    v_code VARCHAR;
    v_code_hash VARCHAR;
    i INTEGER;
BEGIN
    -- Delete old unused backup codes for this user
    DELETE FROM mfa_backup_codes
    WHERE user_id = p_user_id AND used = false;
    
    -- Generate new backup codes
    FOR i IN 1..p_count LOOP
        -- Generate 8-character alphanumeric code
        v_code := upper(
            substring(
                encode(gen_random_bytes(6), 'base64') 
                FROM 1 FOR 8
            )
        );
        
        -- Hash the code (simple hash for demo - use proper bcrypt in production)
        v_code_hash := encode(digest(v_code, 'sha256'), 'hex');
        
        -- Insert hashed code
        INSERT INTO mfa_backup_codes (user_id, code_hash)
        VALUES (p_user_id, v_code_hash);
        
        -- Return plain code (only shown once)
        RETURN QUERY SELECT v_code;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to verify backup code
CREATE OR REPLACE FUNCTION verify_mfa_backup_code(p_user_id UUID, p_code VARCHAR)
RETURNS BOOLEAN AS $$
DECLARE
    v_code_hash VARCHAR;
    v_backup_code_id UUID;
BEGIN
    -- Hash the provided code
    v_code_hash := encode(digest(upper(p_code), 'sha256'), 'hex');
    
    -- Find unused backup code
    SELECT id INTO v_backup_code_id
    FROM mfa_backup_codes
    WHERE user_id = p_user_id
      AND code_hash = v_code_hash
      AND used = false
    LIMIT 1;
    
    IF v_backup_code_id IS NULL THEN
        RETURN false;
    END IF;
    
    -- Mark as used
    UPDATE mfa_backup_codes
    SET used = true,
        used_at = NOW()
    WHERE id = v_backup_code_id;
    
    -- Update user_mfa backup_codes_used count
    UPDATE user_mfa
    SET backup_codes_used = backup_codes_used + 1,
        last_used_at = NOW()
    WHERE user_id = p_user_id;
    
    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to enable MFA for user
CREATE OR REPLACE FUNCTION enable_user_mfa(p_user_id UUID, p_secret VARCHAR)
RETURNS BOOLEAN AS $$
BEGIN
    INSERT INTO user_mfa (user_id, secret, enabled, enabled_at)
    VALUES (p_user_id, p_secret, true, NOW())
    ON CONFLICT (user_id) 
    DO UPDATE SET 
        secret = EXCLUDED.secret,
        enabled = true,
        enabled_at = NOW(),
        updated_at = NOW();
    
    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to disable MFA for user
CREATE OR REPLACE FUNCTION disable_user_mfa(p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE user_mfa
    SET enabled = false,
        updated_at = NOW()
    WHERE user_id = p_user_id;
    
    -- Delete all backup codes
    DELETE FROM mfa_backup_codes
    WHERE user_id = p_user_id;
    
    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if MFA is enabled
CREATE OR REPLACE FUNCTION is_mfa_enabled(p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM user_mfa
        WHERE user_id = p_user_id
          AND enabled = true
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enable RLS on user_mfa
ALTER TABLE user_mfa ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see their own MFA settings
CREATE POLICY user_mfa_select_own ON user_mfa
    FOR SELECT
    USING (auth.uid() = user_id);

-- RLS Policy: Users can insert their own MFA settings
CREATE POLICY user_mfa_insert_own ON user_mfa
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Users can update their own MFA settings (via functions)
CREATE POLICY user_mfa_update_own ON user_mfa
    FOR UPDATE
    USING (auth.uid() = user_id);

-- Enable RLS on mfa_backup_codes
ALTER TABLE mfa_backup_codes ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see their own backup codes
CREATE POLICY mfa_backup_codes_select_own ON mfa_backup_codes
    FOR SELECT
    USING (auth.uid() = user_id);

-- Add comments
COMMENT ON TABLE user_mfa IS 'Stores MFA/2FA settings and TOTP secrets for users';
COMMENT ON TABLE mfa_backup_codes IS 'Stores backup codes for MFA recovery';
COMMENT ON FUNCTION generate_mfa_backup_codes IS 'Generates backup codes for MFA recovery';
COMMENT ON FUNCTION verify_mfa_backup_code IS 'Verifies a backup code and marks it as used';
COMMENT ON FUNCTION enable_user_mfa IS 'Enables MFA for a user';
COMMENT ON FUNCTION disable_user_mfa IS 'Disables MFA for a user';
COMMENT ON FUNCTION is_mfa_enabled IS 'Checks if MFA is enabled for a user';
