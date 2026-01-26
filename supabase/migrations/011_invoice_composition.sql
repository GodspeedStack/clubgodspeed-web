-- =====================================================
-- INVOICE COMPOSITION MODEL
-- =====================================================
-- Purpose: Support purchase-based and balance-based invoices
-- =====================================================

-- Add invoiceType to invoices table
ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS invoice_type VARCHAR(20) DEFAULT 'purchase' 
  CHECK (invoice_type IN ('purchase', 'balance', 'mixed'));

-- Create index
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_type ON invoices(invoice_type);

-- =====================================================
-- TABLE: invoice_purchases
-- =====================================================
-- Join table linking invoices to purchases
CREATE TABLE IF NOT EXISTS invoice_purchases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    purchase_id UUID NOT NULL REFERENCES training_purchases(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(invoice_id, purchase_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_invoice_purchases_invoice_id ON invoice_purchases(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_purchases_purchase_id ON invoice_purchases(purchase_id);

-- =====================================================
-- RULES ENFORCEMENT
-- =====================================================
-- Purchase invoice: invoice_purchases has 1+ rows
-- Balance invoice: invoice_purchases has 0 rows
-- Mixed: can have purchase rows plus adjustments

-- Function to validate invoice type consistency
CREATE OR REPLACE FUNCTION validate_invoice_type()
RETURNS TRIGGER AS $$
DECLARE
    purchase_count INTEGER;
BEGIN
    -- Count linked purchases
    SELECT COUNT(*) INTO purchase_count
    FROM invoice_purchases
    WHERE invoice_id = NEW.invoice_id;
    
    -- Validate consistency
    IF NEW.invoice_type = 'purchase' AND purchase_count = 0 THEN
        RAISE EXCEPTION 'Purchase invoice must have at least one linked purchase';
    END IF;
    
    IF NEW.invoice_type = 'balance' AND purchase_count > 0 THEN
        RAISE EXCEPTION 'Balance invoice cannot have linked purchases';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to validate on invoice update
DROP TRIGGER IF EXISTS trigger_validate_invoice_type ON invoices;
CREATE TRIGGER trigger_validate_invoice_type
    BEFORE UPDATE ON invoices
    FOR EACH ROW
    EXECUTE FUNCTION validate_invoice_type();

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================
ALTER TABLE invoice_purchases ENABLE ROW LEVEL SECURITY;

-- Parents can only see invoice_purchases for their invoices
CREATE POLICY invoice_purchases_select_own ON invoice_purchases
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM invoices
            JOIN parent_accounts ON parent_accounts.id = invoices.parent_id
            WHERE invoices.id = invoice_purchases.invoice_id
            AND parent_accounts.user_id = auth.uid()
        )
    );
