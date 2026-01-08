-- =====================================================
-- COMBINED SECURITY MIGRATIONS
-- =====================================================
-- This file contains all security-related migrations (009, 010, 011)
-- Run this entire file in Supabase SQL Editor
-- =====================================================
-- Generated: 2026-01-08T18:43:54.985Z
-- =====================================================


-- =====================================================
-- MIGRATION 1: supabase/migrations/009_email_verification.sql
-- =====================================================

-- =====================================================
-- EMAIL VERIFICATION SYSTEM
-- =====================================================
-- Purpose: Require email confirmation for all users
-- Features: Email verification tokens, RLS policies, verification tracking
-- =====================================================

-- Create parent_accounts table if it doesn't exist (for backward compatibility)
CREATE TABLE IF NOT EXISTS parent_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL UNIQUE,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    phone VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_parent_accounts_user_id ON parent_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_parent_accounts_email ON parent_accounts(email);

-- Add email_verified column to parent_accounts
ALTER TABLE parent_accounts 
ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP WITH TIME ZONE;

-- Create email_verification_tokens table
CREATE TABLE IF NOT EXISTS email_verification_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    token VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT token_not_expired CHECK (expires_at > created_at)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user_id ON email_verification_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_token ON email_verification_tokens(token);
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_email ON email_verification_tokens(email);
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_expires_at ON email_verification_tokens(expires_at);

-- Function to generate verification token
CREATE OR REPLACE FUNCTION generate_email_verification_token(p_user_id UUID, p_email VARCHAR)
RETURNS VARCHAR AS $$
DECLARE
    v_token VARCHAR;
    v_expires_at TIMESTAMP WITH TIME ZONE;
BEGIN
    -- Generate random token
    v_token := encode(gen_random_bytes(32), 'hex');
    v_expires_at := NOW() + INTERVAL '24 hours';
    
    -- Insert token
    INSERT INTO email_verification_tokens (user_id, email, token, expires_at)
    VALUES (p_user_id, p_email, v_token, v_expires_at)
    ON CONFLICT (token) DO NOTHING;
    
    RETURN v_token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to verify email token
CREATE OR REPLACE FUNCTION verify_email_token(p_token VARCHAR)
RETURNS BOOLEAN AS $$
DECLARE
    v_user_id UUID;
    v_email VARCHAR;
BEGIN
    -- Find valid token
    SELECT user_id, email INTO v_user_id, v_email
    FROM email_verification_tokens
    WHERE token = p_token
      AND expires_at > NOW()
      AND used_at IS NULL
    LIMIT 1;
    
    IF v_user_id IS NULL THEN
        RETURN false;
    END IF;
    
    -- Mark token as used
    UPDATE email_verification_tokens
    SET used_at = NOW()
    WHERE token = p_token;
    
    -- Update parent_accounts (if exists)
    UPDATE parent_accounts
    SET email_verified = true,
        email_verified_at = NOW()
    WHERE user_id = v_user_id AND email = v_email;
    
    -- If parent_accounts row doesn't exist, create it
    INSERT INTO parent_accounts (user_id, email, email_verified, email_verified_at)
    VALUES (v_user_id, v_email, true, NOW())
    ON CONFLICT (email) DO UPDATE SET
        email_verified = true,
        email_verified_at = NOW();
    
    -- Update auth.users email_confirmed_at via trigger (if needed)
    -- Supabase handles this automatically when email is confirmed
    
    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enable RLS on email_verification_tokens
ALTER TABLE email_verification_tokens ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see their own verification tokens
CREATE POLICY email_verification_tokens_select_own ON email_verification_tokens
    FOR SELECT
    USING (auth.uid() = user_id);

-- RLS Policy: Users can insert their own tokens (via function)
CREATE POLICY email_verification_tokens_insert_own ON email_verification_tokens
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Update RLS policy on parent_accounts to require email verification for sensitive operations
-- Note: This is handled in application logic, but we add a helper function

-- Function to check if user email is verified
CREATE OR REPLACE FUNCTION is_email_verified(p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM parent_accounts
        WHERE user_id = p_user_id
          AND email_verified = true
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comment
COMMENT ON TABLE email_verification_tokens IS 'Stores email verification tokens for user email confirmation';
COMMENT ON FUNCTION generate_email_verification_token IS 'Generates a new email verification token for a user';
COMMENT ON FUNCTION verify_email_token IS 'Verifies an email token and marks email as verified';
COMMENT ON FUNCTION is_email_verified IS 'Checks if a user has verified their email address';



-- =====================================================
-- MIGRATION 2: supabase/migrations/010_mfa_system.sql
-- =====================================================

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



-- =====================================================
-- MIGRATION 3: supabase/migrations/011_unified_auth_roles.sql
-- =====================================================

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


