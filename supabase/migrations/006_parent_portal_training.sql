-- =====================================================
-- PARENT PORTAL TRAINING FEATURES - DATABASE SCHEMA
-- =====================================================
-- Purpose: Training hours tracking, calendar integration, documents
-- Features: Purchases, attendance, sessions, receipts, invoices
-- =====================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- TABLE: parent_accounts
-- =====================================================
-- Parent user profiles linked to Supabase auth
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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_parent_accounts_user_id ON parent_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_parent_accounts_email ON parent_accounts(email);

-- =====================================================
-- TABLE: training_packages
-- =====================================================
-- Available training packages/pricing
CREATE TABLE IF NOT EXISTS training_packages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    total_hours DECIMAL(10, 2) NOT NULL CHECK (total_hours > 0),
    price DECIMAL(10, 2) NOT NULL CHECK (price >= 0),
    program_type VARCHAR(100), -- 'skills', 'practice', 'elite', etc.
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- TABLE: training_purchases
-- =====================================================
-- Track purchased training hours/packages
CREATE TABLE IF NOT EXISTS training_purchases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_id UUID NOT NULL REFERENCES parent_accounts(id) ON DELETE CASCADE,
    athlete_id VARCHAR(100), -- References roster.athleteId
    package_id UUID REFERENCES training_packages(id) ON DELETE SET NULL,
    transaction_id VARCHAR(100), -- Links to orders/transactions
    
    -- Purchase details
    hours_purchased DECIMAL(10, 2) NOT NULL CHECK (hours_purchased > 0),
    hours_used DECIMAL(10, 2) DEFAULT 0 CHECK (hours_used >= 0),
    hours_remaining DECIMAL(10, 2) GENERATED ALWAYS AS (hours_purchased - hours_used) STORED,
    price_paid DECIMAL(10, 2) NOT NULL CHECK (price_paid >= 0),
    
    -- Status
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'expired', 'completed', 'cancelled')),
    purchase_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expiry_date TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_training_purchases_parent_id ON training_purchases(parent_id);
CREATE INDEX IF NOT EXISTS idx_training_purchases_athlete_id ON training_purchases(athlete_id);
CREATE INDEX IF NOT EXISTS idx_training_purchases_status ON training_purchases(status);
CREATE INDEX IF NOT EXISTS idx_training_purchases_transaction_id ON training_purchases(transaction_id);

-- =====================================================
-- TABLE: training_sessions
-- =====================================================
-- Scheduled training sessions
CREATE TABLE IF NOT EXISTS training_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    duration_hours DECIMAL(4, 2) GENERATED ALWAYS AS (
        EXTRACT(EPOCH FROM (end_time - start_time)) / 3600
    ) STORED,
    
    -- Session details
    session_type VARCHAR(50) NOT NULL, -- 'skills', 'practice', 'team-practice', 'mandatory-skills'
    title VARCHAR(255) NOT NULL,
    location VARCHAR(255),
    description TEXT,
    
    -- Program link
    program_id VARCHAR(100), -- Links to enrollment programId
    
    -- Status
    status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled')),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_training_sessions_date ON training_sessions(session_date);
CREATE INDEX IF NOT EXISTS idx_training_sessions_type ON training_sessions(session_type);
CREATE INDEX IF NOT EXISTS idx_training_sessions_program_id ON training_sessions(program_id);
CREATE INDEX IF NOT EXISTS idx_training_sessions_status ON training_sessions(status);

-- =====================================================
-- TABLE: training_attendance
-- =====================================================
-- Track actual attendance at sessions
CREATE TABLE IF NOT EXISTS training_attendance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    purchase_id UUID NOT NULL REFERENCES training_purchases(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
    athlete_id VARCHAR(100) NOT NULL,
    
    -- Attendance details
    hours_used DECIMAL(4, 2) NOT NULL CHECK (hours_used > 0),
    attendance_status VARCHAR(20) DEFAULT 'present' CHECK (attendance_status IN ('present', 'absent', 'excused')),
    notes TEXT,
    
    -- Timestamps
    attended_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_training_attendance_purchase_id ON training_attendance(purchase_id);
CREATE INDEX IF NOT EXISTS idx_training_attendance_session_id ON training_attendance(session_id);
CREATE INDEX IF NOT EXISTS idx_training_attendance_athlete_id ON training_attendance(athlete_id);

-- =====================================================
-- TABLE: player_enrollments
-- =====================================================
-- Active skills program enrollments
CREATE TABLE IF NOT EXISTS player_enrollments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_id UUID NOT NULL REFERENCES parent_accounts(id) ON DELETE CASCADE,
    athlete_id VARCHAR(100) NOT NULL,
    
    -- Enrollment details
    program_id VARCHAR(100) NOT NULL,
    program_name VARCHAR(255) NOT NULL,
    program_type VARCHAR(100), -- 'skills', 'elite', etc.
    
    -- Schedule
    enrolled_sessions JSONB DEFAULT '[]', -- Array of session day/time configs
    start_date DATE,
    end_date DATE,
    
    -- Status
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled', 'expired')),
    
    -- Purchase link
    purchase_id UUID REFERENCES training_purchases(id) ON DELETE SET NULL,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_player_enrollments_parent_id ON player_enrollments(parent_id);
CREATE INDEX IF NOT EXISTS idx_player_enrollments_athlete_id ON player_enrollments(athlete_id);
CREATE INDEX IF NOT EXISTS idx_player_enrollments_program_id ON player_enrollments(program_id);
CREATE INDEX IF NOT EXISTS idx_player_enrollments_status ON player_enrollments(status);

-- =====================================================
-- TABLE: receipts
-- =====================================================
-- Payment receipt records
CREATE TABLE IF NOT EXISTS receipts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_id UUID NOT NULL REFERENCES parent_accounts(id) ON DELETE CASCADE,
    transaction_id VARCHAR(100) NOT NULL,
    purchase_id UUID REFERENCES training_purchases(id) ON DELETE SET NULL,
    
    -- Receipt details
    receipt_number VARCHAR(50) UNIQUE NOT NULL,
    amount DECIMAL(10, 2) NOT NULL CHECK (amount >= 0),
    payment_method VARCHAR(50),
    payment_date TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- Items
    items JSONB DEFAULT '[]', -- Array of line items
    
    -- PDF storage
    pdf_url TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_receipts_parent_id ON receipts(parent_id);
CREATE INDEX IF NOT EXISTS idx_receipts_transaction_id ON receipts(transaction_id);
CREATE INDEX IF NOT EXISTS idx_receipts_receipt_number ON receipts(receipt_number);

-- =====================================================
-- TABLE: invoices
-- =====================================================
-- Generated invoice records
CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_id UUID NOT NULL REFERENCES parent_accounts(id) ON DELETE CASCADE,
    invoice_number VARCHAR(50) UNIQUE NOT NULL,
    
    -- Invoice details
    issue_date DATE NOT NULL,
    due_date DATE NOT NULL,
    amount DECIMAL(10, 2) NOT NULL CHECK (amount >= 0),
    tax_amount DECIMAL(10, 2) DEFAULT 0 CHECK (tax_amount >= 0),
    total_amount DECIMAL(10, 2) NOT NULL CHECK (total_amount >= 0),
    
    -- Status
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue', 'cancelled')),
    paid_at TIMESTAMP WITH TIME ZONE,
    
    -- Items
    line_items JSONB DEFAULT '[]', -- Array of invoice line items
    
    -- PDF storage
    pdf_url TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_invoices_parent_id ON invoices(parent_id);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_number ON invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date);

-- =====================================================
-- FUNCTION: Update hours_used when attendance is recorded
-- =====================================================
CREATE OR REPLACE FUNCTION update_training_purchase_hours()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE training_purchases
    SET hours_used = (
        SELECT COALESCE(SUM(hours_used), 0)
        FROM training_attendance
        WHERE purchase_id = NEW.purchase_id
    ),
    updated_at = NOW()
    WHERE id = NEW.purchase_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger
DROP TRIGGER IF EXISTS trigger_update_training_purchase_hours ON training_attendance;
CREATE TRIGGER trigger_update_training_purchase_hours
    AFTER INSERT OR UPDATE OR DELETE ON training_attendance
    FOR EACH ROW
    EXECUTE FUNCTION update_training_purchase_hours();

-- =====================================================
-- FUNCTION: Generate receipt number
-- =====================================================
CREATE OR REPLACE FUNCTION generate_receipt_number()
RETURNS TEXT AS $$
DECLARE
    new_number TEXT;
    number_exists BOOLEAN;
BEGIN
    LOOP
        new_number := 'RCP-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');
        SELECT EXISTS(SELECT 1 FROM receipts WHERE receipt_number = new_number) INTO number_exists;
        EXIT WHEN NOT number_exists;
    END LOOP;
    RETURN new_number;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNCTION: Generate invoice number
-- =====================================================
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TEXT AS $$
DECLARE
    new_number TEXT;
    number_exists BOOLEAN;
BEGIN
    LOOP
        new_number := 'INV-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');
        SELECT EXISTS(SELECT 1 FROM invoices WHERE invoice_number = new_number) INTO number_exists;
        EXIT WHEN NOT number_exists;
    END LOOP;
    RETURN new_number;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE parent_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- Parent accounts: Users can only see their own account
CREATE POLICY parent_accounts_select_own ON parent_accounts
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY parent_accounts_update_own ON parent_accounts
    FOR UPDATE
    USING (auth.uid() = user_id);

-- Training purchases: Parents can only see their own purchases
CREATE POLICY training_purchases_select_own ON training_purchases
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM parent_accounts
            WHERE parent_accounts.id = training_purchases.parent_id
            AND parent_accounts.user_id = auth.uid()
        )
    );

-- Training sessions: All authenticated parents can view (for calendar)
CREATE POLICY training_sessions_select_all ON training_sessions
    FOR SELECT
    TO authenticated
    USING (true);

-- Training attendance: Parents can only see attendance for their athletes
CREATE POLICY training_attendance_select_own ON training_attendance
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM training_purchases
            JOIN parent_accounts ON parent_accounts.id = training_purchases.parent_id
            WHERE training_purchases.id = training_attendance.purchase_id
            AND parent_accounts.user_id = auth.uid()
        )
    );

-- Player enrollments: Parents can only see their own enrollments
CREATE POLICY player_enrollments_select_own ON player_enrollments
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM parent_accounts
            WHERE parent_accounts.id = player_enrollments.parent_id
            AND parent_accounts.user_id = auth.uid()
        )
    );

-- Receipts: Parents can only see their own receipts
CREATE POLICY receipts_select_own ON receipts
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM parent_accounts
            WHERE parent_accounts.id = receipts.parent_id
            AND parent_accounts.user_id = auth.uid()
        )
    );

-- Invoices: Parents can only see their own invoices
CREATE POLICY invoices_select_own ON invoices
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM parent_accounts
            WHERE parent_accounts.id = invoices.parent_id
            AND parent_accounts.user_id = auth.uid()
        )
    );
