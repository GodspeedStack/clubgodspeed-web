-- =====================================================
-- TRAINING CREDITS LEDGER - DATABASE SCHEMA
-- =====================================================
-- Purpose: Track all credit transactions (purchases, usage, adjustments, refunds)
-- Features: Running balance calculation, event history, audit trail
-- =====================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- TABLE: training_credits_ledger
-- =====================================================
-- Tracks all credit transactions with running balance
CREATE TABLE IF NOT EXISTS training_credits_ledger (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    athlete_id VARCHAR(100) NOT NULL,
    purchase_id UUID REFERENCES training_purchases(id) ON DELETE SET NULL,
    attendance_id UUID REFERENCES training_attendance(id) ON DELETE SET NULL,
    
    -- Transaction details
    date DATE NOT NULL,
    event_type VARCHAR(50) NOT NULL CHECK (event_type IN ('purchase', 'session_used', 'adjustment', 'refund')),
    hours_delta DECIMAL(10, 2) NOT NULL, -- Positive for purchases, negative for usage
    running_balance DECIMAL(10, 2) NOT NULL,
    reference_id VARCHAR(100), -- Links to purchase, session, or adjustment record
    notes TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_credits_ledger_athlete_id ON training_credits_ledger(athlete_id);
CREATE INDEX IF NOT EXISTS idx_credits_ledger_date ON training_credits_ledger(date);
CREATE INDEX IF NOT EXISTS idx_credits_ledger_event_type ON training_credits_ledger(event_type);
CREATE INDEX IF NOT EXISTS idx_credits_ledger_purchase_id ON training_credits_ledger(purchase_id);
CREATE INDEX IF NOT EXISTS idx_credits_ledger_attendance_id ON training_credits_ledger(attendance_id);

-- =====================================================
-- FUNCTION: Calculate running balance for new ledger entry
-- =====================================================
CREATE OR REPLACE FUNCTION calculate_running_balance(
    p_athlete_id VARCHAR(100),
    p_date DATE,
    p_hours_delta DECIMAL(10, 2)
)
RETURNS DECIMAL(10, 2) AS $$
DECLARE
    previous_balance DECIMAL(10, 2) := 0;
BEGIN
    -- Get the most recent running balance for this athlete before the given date
    SELECT COALESCE(running_balance, 0)
    INTO previous_balance
    FROM training_credits_ledger
    WHERE athlete_id = p_athlete_id
      AND date < p_date
    ORDER BY date DESC, created_at DESC
    LIMIT 1;
    
    -- If no previous entry, start at 0
    IF previous_balance IS NULL THEN
        previous_balance := 0;
    END IF;
    
    -- Calculate new balance
    RETURN previous_balance + p_hours_delta;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNCTION: Create ledger entry for purchase
-- =====================================================
CREATE OR REPLACE FUNCTION create_purchase_ledger_entry(
    p_purchase_id UUID,
    p_athlete_id VARCHAR(100),
    p_hours_purchased DECIMAL(10, 2),
    p_reference_id VARCHAR(100)
)
RETURNS UUID AS $$
DECLARE
    v_date DATE := CURRENT_DATE;
    v_running_balance DECIMAL(10, 2);
    v_ledger_id UUID;
BEGIN
    -- Calculate running balance
    v_running_balance := calculate_running_balance(p_athlete_id, v_date, p_hours_purchased);
    
    -- Create ledger entry
    INSERT INTO training_credits_ledger (
        athlete_id,
        purchase_id,
        date,
        event_type,
        hours_delta,
        running_balance,
        reference_id
    ) VALUES (
        p_athlete_id,
        p_purchase_id,
        v_date,
        'purchase',
        p_hours_purchased,
        v_running_balance,
        p_reference_id
    )
    RETURNING id INTO v_ledger_id;
    
    RETURN v_ledger_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNCTION: Create ledger entry for session usage
-- =====================================================
CREATE OR REPLACE FUNCTION create_usage_ledger_entry(
    p_attendance_id UUID,
    p_athlete_id VARCHAR(100),
    p_hours_used DECIMAL(10, 2),
    p_reference_id VARCHAR(100)
)
RETURNS UUID AS $$
DECLARE
    v_date DATE := CURRENT_DATE;
    v_running_balance DECIMAL(10, 2);
    v_ledger_id UUID;
    v_hours_delta DECIMAL(10, 2) := -ABS(p_hours_used); -- Always negative
BEGIN
    -- Calculate running balance
    v_running_balance := calculate_running_balance(p_athlete_id, v_date, v_hours_delta);
    
    -- Create ledger entry
    INSERT INTO training_credits_ledger (
        athlete_id,
        attendance_id,
        date,
        event_type,
        hours_delta,
        running_balance,
        reference_id
    ) VALUES (
        p_athlete_id,
        p_attendance_id,
        v_date,
        'session_used',
        v_hours_delta,
        v_running_balance,
        p_reference_id
    )
    RETURNING id INTO v_ledger_id;
    
    RETURN v_ledger_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- TRIGGER: Auto-create ledger entry when purchase is created
-- =====================================================
CREATE OR REPLACE FUNCTION trigger_create_purchase_ledger()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'active' AND NEW.hours_purchased > 0 THEN
        PERFORM create_purchase_ledger_entry(
            NEW.id,
            NEW.athlete_id,
            NEW.hours_purchased,
            COALESCE(NEW.transaction_id, NEW.id::TEXT)
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_create_purchase_ledger ON training_purchases;
CREATE TRIGGER trigger_create_purchase_ledger
    AFTER INSERT ON training_purchases
    FOR EACH ROW
    WHEN (NEW.status = 'active')
    EXECUTE FUNCTION trigger_create_purchase_ledger();

-- =====================================================
-- TRIGGER: Auto-create ledger entry when attendance is recorded
-- =====================================================
CREATE OR REPLACE FUNCTION trigger_create_usage_ledger()
RETURNS TRIGGER AS $$
DECLARE
    v_athlete_id VARCHAR(100);
    v_purchase_id UUID;
BEGIN
    -- Get athlete_id from purchase
    SELECT athlete_id, id INTO v_athlete_id, v_purchase_id
    FROM training_purchases
    WHERE id = NEW.purchase_id;
    
    IF v_athlete_id IS NOT NULL AND NEW.hours_used > 0 THEN
        PERFORM create_usage_ledger_entry(
            NEW.id,
            v_athlete_id,
            NEW.hours_used,
            NEW.id::TEXT
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_create_usage_ledger ON training_attendance;
CREATE TRIGGER trigger_create_usage_ledger
    AFTER INSERT ON training_attendance
    FOR EACH ROW
    EXECUTE FUNCTION trigger_create_usage_ledger();

-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

ALTER TABLE training_credits_ledger ENABLE ROW LEVEL SECURITY;

-- Parents can only see ledger entries for their athletes
CREATE POLICY credits_ledger_select_own ON training_credits_ledger
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM training_purchases
            JOIN parent_accounts ON parent_accounts.id = training_purchases.parent_id
            WHERE training_purchases.athlete_id = training_credits_ledger.athlete_id
            AND parent_accounts.user_id = auth.uid()
        )
    );
