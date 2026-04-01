-- ============================================================
-- MIGRATION: Fix dues_payments for Venmo payment path
-- The table was restructured for Stripe integration, adding
-- enrollment_id and stripe_payment_intent as NOT NULL.
-- Venmo payments don't have these values, so make them nullable.
-- Applied live 2026-03-31; this file captures the change for VCS.
-- ============================================================

ALTER TABLE dues_payments ALTER COLUMN enrollment_id DROP NOT NULL;
ALTER TABLE dues_payments ALTER COLUMN stripe_payment_intent DROP NOT NULL;
