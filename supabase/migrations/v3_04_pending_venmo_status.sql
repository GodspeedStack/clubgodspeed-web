-- v3_04: Add 'pending_venmo' to dues_payments status CHECK constraint
-- Allows Venmo payment confirmations to use a distinct status for admin review

ALTER TABLE dues_payments
  DROP CONSTRAINT IF EXISTS dues_payments_status_check;

ALTER TABLE dues_payments
  ADD CONSTRAINT dues_payments_status_check
  CHECK (status IN ('pending_stripe', 'pending_venmo', 'completed', 'manual', 'refunded', 'failed'));
