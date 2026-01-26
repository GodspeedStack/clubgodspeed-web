-- =====================================================
-- STANDARDIZED DOCUMENTS - DATABASE SCHEMA
-- =====================================================
-- Purpose: Unified document model for receipts, invoices, and syllabi
-- Features: Single source of truth for all document types
-- =====================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- TABLE: documents
-- =====================================================
-- Unified documents table for all document types
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type VARCHAR(20) NOT NULL CHECK (type IN ('receipt', 'invoice', 'syllabus')),
    title VARCHAR(255) NOT NULL,
    date DATE NOT NULL,
    amount DECIMAL(10, 2),
    status VARCHAR(20),
    athlete_id VARCHAR(100),
    payer_id UUID REFERENCES parent_accounts(id) ON DELETE SET NULL,
    pdf_url TEXT,
    metadata JSONB DEFAULT '{}', -- Store type-specific data (items, line_items, etc.)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(type);
CREATE INDEX IF NOT EXISTS idx_documents_athlete_id ON documents(athlete_id);
CREATE INDEX IF NOT EXISTS idx_documents_payer_id ON documents(payer_id);
CREATE INDEX IF NOT EXISTS idx_documents_date ON documents(date DESC);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);

-- =====================================================
-- LINK EXISTING RECEIPTS/INVOICES TO DOCUMENTS
-- =====================================================

-- Add document_id columns to existing tables
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS document_id UUID REFERENCES documents(id) ON DELETE SET NULL;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS document_id UUID REFERENCES documents(id) ON DELETE SET NULL;

-- Create indexes for document links
CREATE INDEX IF NOT EXISTS idx_receipts_document_id ON receipts(document_id);
CREATE INDEX IF NOT EXISTS idx_invoices_document_id ON invoices(document_id);

-- =====================================================
-- FUNCTION: Migrate existing receipt to documents table
-- =====================================================
CREATE OR REPLACE FUNCTION migrate_receipt_to_document(p_receipt_id UUID)
RETURNS UUID AS $$
DECLARE
    v_receipt RECORD;
    v_document_id UUID;
    v_parent_id UUID;
BEGIN
    -- Get receipt data
    SELECT * INTO v_receipt
    FROM receipts
    WHERE id = p_receipt_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Receipt not found: %', p_receipt_id;
    END IF;
    
    -- Get parent_id from receipt
    v_parent_id := v_receipt.parent_id;
    
    -- Create document entry
    INSERT INTO documents (
        type,
        title,
        date,
        amount,
        status,
        payer_id,
        pdf_url,
        metadata
    ) VALUES (
        'receipt',
        'Receipt #' || v_receipt.receipt_number,
        v_receipt.payment_date::DATE,
        v_receipt.amount,
        'paid',
        v_parent_id,
        v_receipt.pdf_url,
        jsonb_build_object(
            'receipt_number', v_receipt.receipt_number,
            'transaction_id', v_receipt.transaction_id,
            'payment_method', v_receipt.payment_method,
            'items', COALESCE(v_receipt.items, '[]'::JSONB)
        )
    )
    RETURNING id INTO v_document_id;
    
    -- Link receipt to document
    UPDATE receipts
    SET document_id = v_document_id
    WHERE id = p_receipt_id;
    
    RETURN v_document_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNCTION: Migrate existing invoice to documents table
-- =====================================================
CREATE OR REPLACE FUNCTION migrate_invoice_to_document(p_invoice_id UUID)
RETURNS UUID AS $$
DECLARE
    v_invoice RECORD;
    v_document_id UUID;
    v_parent_id UUID;
BEGIN
    -- Get invoice data
    SELECT * INTO v_invoice
    FROM invoices
    WHERE id = p_invoice_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invoice not found: %', p_invoice_id;
    END IF;
    
    -- Get parent_id from invoice
    v_parent_id := v_invoice.parent_id;
    
    -- Create document entry
    INSERT INTO documents (
        type,
        title,
        date,
        amount,
        status,
        payer_id,
        pdf_url,
        metadata
    ) VALUES (
        'invoice',
        'Invoice #' || v_invoice.invoice_number,
        v_invoice.issue_date,
        v_invoice.total_amount,
        v_invoice.status,
        v_parent_id,
        v_invoice.pdf_url,
        jsonb_build_object(
            'invoice_number', v_invoice.invoice_number,
            'issue_date', v_invoice.issue_date,
            'due_date', v_invoice.due_date,
            'tax_amount', v_invoice.tax_amount,
            'line_items', COALESCE(v_invoice.line_items, '[]'::JSONB)
        )
    )
    RETURNING id INTO v_document_id;
    
    -- Link invoice to document
    UPDATE invoices
    SET document_id = v_document_id
    WHERE id = p_invoice_id;
    
    RETURN v_document_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNCTION: Get athlete_id from document
-- =====================================================
CREATE OR REPLACE FUNCTION get_document_athlete_id(p_document_id UUID)
RETURNS VARCHAR(100) AS $$
DECLARE
    v_athlete_id VARCHAR(100);
BEGIN
    -- Try to get from document metadata or linked receipt/invoice
    SELECT 
        COALESCE(
            d.athlete_id,
            (SELECT athlete_id FROM training_purchases WHERE id = (r.purchase_id) LIMIT 1),
            NULL
        )
    INTO v_athlete_id
    FROM documents d
    LEFT JOIN receipts r ON r.document_id = d.id
    WHERE d.id = p_document_id;
    
    RETURN v_athlete_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Documents: Parents can only see their own documents
CREATE POLICY documents_select_own ON documents
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM parent_accounts
            WHERE parent_accounts.id = documents.payer_id
            AND parent_accounts.user_id = auth.uid()
        )
    );
