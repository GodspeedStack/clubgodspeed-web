-- =====================================================
-- RECEIPTS DATA MODEL - V1 SINGLE SOURCE OF TRUTH
-- =====================================================
-- Purpose: Make receipts the canonical source for receipt data
-- V1: Enforce required fields, safe backfill, complete schema
-- =====================================================

-- =====================================================
-- ENSURE ALL REQUIRED FIELDS EXIST
-- =====================================================
-- Required fields: id, parentId, athleteId, receiptNumber, paymentDate, amount, item, status, pdfUrl

-- athleteId (REQUIRED going forward)
ALTER TABLE receipts 
ADD COLUMN IF NOT EXISTS athlete_id VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_receipts_athlete_id ON receipts(athlete_id);

-- item (canonical "what they paid for")
ALTER TABLE receipts 
ADD COLUMN IF NOT EXISTS item TEXT;

-- status (ensure it exists, default to 'Paid')
ALTER TABLE receipts 
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'Paid' CHECK (status IN ('Paid', 'Pending', 'Refunded'));

-- pdfUrl (ensure it exists)
-- Note: pdf_url already exists in original schema

-- =====================================================
-- ADD OPTIONAL FIELDS (APPROVED FOR V1)
-- =====================================================
-- paymentMethod, transactionId, currency, refundedAt, refundAmount

-- Payment method (card, cash, check, etc.)
ALTER TABLE receipts 
ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50);

-- Transaction ID (should already exist, but ensure it)
-- Note: transaction_id already exists in original schema

-- Currency (defaults to USD)
ALTER TABLE receipts 
ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'USD';

-- Refund tracking
ALTER TABLE receipts 
ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE receipts 
ADD COLUMN IF NOT EXISTS refund_amount DECIMAL(10, 2);

-- =====================================================
-- SAFE BACKFILL: ATHLETE_ID FROM TRAINING_PURCHASES
-- =====================================================
-- Deterministic join: receipts.purchase_id → training_purchases.id → training_purchases.athlete_id
-- 
-- Note: receipts.purchase_id already exists in schema (FK to training_purchases.id)
-- This provides the deterministic link needed for safe backfill
--
-- Backfill rules:
-- 1. receipts.athlete_id is NULL (not already set)
-- 2. receipts.purchase_id exists (deterministic link exists)
-- 3. training_purchases.athlete_id is NOT NULL (source has athlete)

UPDATE receipts
SET athlete_id = training_purchases.athlete_id
FROM training_purchases
WHERE receipts.purchase_id = training_purchases.id
  AND receipts.athlete_id IS NULL
  AND receipts.purchase_id IS NOT NULL
  AND training_purchases.athlete_id IS NOT NULL;

-- =====================================================
-- ADD CONSTRAINT FOR NEW RECEIPTS (V1)
-- =====================================================
-- Note: We don't add a NOT NULL constraint to athlete_id because legacy receipts may not have it
-- Instead, we enforce at the application level (422 if missing for new receipts)

-- =====================================================
-- NOTES
-- =====================================================
-- Required fields (V1):
--   id, parent_id, athlete_id (required for new), receipt_number, payment_date, amount, item, status, pdf_url
--
-- Optional fields (approved):
--   payment_method, transaction_id, currency, refunded_at, refund_amount
--
-- Deterministic linkage:
--   receipts.purchase_id → training_purchases.id (already exists in schema)
--   This allows safe backfill of athlete_id from training_purchases
--
-- Legacy receipts:
--   - athlete_id can be NULL for legacy receipts
--   - New receipts MUST have athlete_id (enforced at API level with 422)
--   - Backfill uses purchase_id for deterministic join
