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
