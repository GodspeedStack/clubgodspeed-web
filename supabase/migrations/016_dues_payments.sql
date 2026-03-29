-- ============================================================
-- MIGRATION 016: Dues Payments Table
-- Captures manual tuition payment submissions from parent portal.
-- Status flow: pending_stripe → completed (via Stripe webhook)
--              or pending_stripe → manual (if admin marks paid manually)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.dues_payments (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_email  TEXT NOT NULL,
    parent_name   TEXT,
    player_name   TEXT,
    amount        NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
    note          TEXT,
    receipt_id    TEXT UNIQUE NOT NULL,
    payment_date  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status        TEXT NOT NULL DEFAULT 'pending_stripe'
                      CHECK (status IN ('pending_stripe', 'completed', 'manual', 'refunded', 'failed')),
    season        TEXT DEFAULT 'Spring/Summer 2026',
    stripe_pi_id  TEXT,    -- Stripe PaymentIntent ID (populated by webhook)
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for admin portal queries
CREATE INDEX IF NOT EXISTS idx_dues_payments_email   ON dues_payments (parent_email);
CREATE INDEX IF NOT EXISTS idx_dues_payments_date    ON dues_payments (payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_dues_payments_status  ON dues_payments (status);

-- RLS
ALTER TABLE dues_payments ENABLE ROW LEVEL SECURITY;

-- Parents can read their own payments
CREATE POLICY "parent_read_own_payments" ON dues_payments
    FOR SELECT USING (parent_email = auth.jwt() ->> 'email');

-- Parents can insert their own payments
CREATE POLICY "parent_insert_own_payment" ON dues_payments
    FOR INSERT WITH CHECK (parent_email = auth.jwt() ->> 'email');

-- Directors can read all payments (admin portal)
CREATE POLICY "director_read_all_payments" ON dues_payments
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role = 'director' AND p.approved = true
        )
    );

-- Directors can update status (e.g. mark as manual/refunded)
CREATE POLICY "director_update_payment_status" ON dues_payments
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role = 'director' AND p.approved = true
        )
    );

-- Service role (Stripe webhook) can update any payment
-- (No RLS restriction needed for service_role key)

COMMENT ON TABLE dues_payments IS 
    'Tracks tuition payment submissions from the parent portal. 
     status=pending_stripe means submitted but not yet confirmed by Stripe.
     Enable Realtime on this table so the admin portal receives live updates.';

-- Add to Realtime publication so admin-os receives new payments instantly
ALTER PUBLICATION supabase_realtime ADD TABLE dues_payments;
