-- =====================================================
-- EXPORTS & AUDIT LOG - DATABASE SCHEMA
-- =====================================================
-- Purpose: Server-side CSV export generation and audit logging
-- Features: Export job tracking, file storage, audit trail
-- =====================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- TABLE: exports
-- =====================================================
-- Tracks export job requests and status
CREATE TABLE IF NOT EXISTS exports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('parent', 'coach', 'admin')),
    athlete_id VARCHAR(100),
    export_type VARCHAR(50) NOT NULL CHECK (export_type IN ('sessions_csv', 'credits_csv', 'receipts_csv', 'invoices_csv')),
    status VARCHAR(20) DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'ready', 'failed')),
    from_date DATE,
    to_date DATE,
    file_url TEXT, -- Supabase Storage URL
    file_size BIGINT, -- File size in bytes
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_exports_user_id ON exports(user_id);
CREATE INDEX IF NOT EXISTS idx_exports_status ON exports(status);
CREATE INDEX IF NOT EXISTS idx_exports_athlete_id ON exports(athlete_id);
CREATE INDEX IF NOT EXISTS idx_exports_export_type ON exports(export_type);
CREATE INDEX IF NOT EXISTS idx_exports_created_at ON exports(created_at DESC);

-- =====================================================
-- TABLE: export_audit_log
-- =====================================================
-- Audit trail for all export operations
CREATE TABLE IF NOT EXISTS export_audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    role VARCHAR(20) NOT NULL,
    athlete_id VARCHAR(100),
    export_type VARCHAR(50) NOT NULL,
    export_id UUID REFERENCES exports(id) ON DELETE SET NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status VARCHAR(20) NOT NULL, -- 'requested', 'completed', 'failed', 'downloaded'
    ip_address INET,
    user_agent TEXT,
    metadata JSONB DEFAULT '{}' -- Additional context
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_export_audit_user_id ON export_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_export_audit_timestamp ON export_audit_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_export_audit_export_id ON export_audit_log(export_id);
CREATE INDEX IF NOT EXISTS idx_export_audit_status ON export_audit_log(status);

-- =====================================================
-- FUNCTION: Log export audit event
-- =====================================================
CREATE OR REPLACE FUNCTION log_export_audit(
    p_user_id UUID,
    p_role VARCHAR(20),
    p_athlete_id VARCHAR(100),
    p_export_type VARCHAR(50),
    p_export_id UUID,
    p_status VARCHAR(20),
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS UUID AS $$
DECLARE
    v_audit_id UUID;
BEGIN
    INSERT INTO export_audit_log (
        user_id,
        role,
        athlete_id,
        export_type,
        export_id,
        status,
        ip_address,
        user_agent,
        metadata
    ) VALUES (
        p_user_id,
        p_role,
        p_athlete_id,
        p_export_type,
        p_export_id,
        p_status,
        p_ip_address,
        p_user_agent,
        p_metadata
    )
    RETURNING id INTO v_audit_id;
    
    RETURN v_audit_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

ALTER TABLE exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE export_audit_log ENABLE ROW LEVEL SECURITY;

-- Exports: Users can only see their own exports
CREATE POLICY exports_select_own ON exports
    FOR SELECT
    USING (auth.uid() = user_id);

-- Exports: Users can create their own exports
CREATE POLICY exports_insert_own ON exports
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Exports: System can update exports (for status changes)
CREATE POLICY exports_update_own ON exports
    FOR UPDATE
    USING (auth.uid() = user_id);

-- Export Audit Log: Users can only see their own audit entries
CREATE POLICY export_audit_select_own ON export_audit_log
    FOR SELECT
    USING (auth.uid() = user_id);

-- Export Audit Log: System can insert audit entries
CREATE POLICY export_audit_insert ON export_audit_log
    FOR INSERT
    WITH CHECK (true); -- Allow system to log all exports
