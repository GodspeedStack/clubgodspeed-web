-- ============================================================
-- GODSPEED BASKETBALL — Season Dues & Payment Plans Schema
-- Supabase / PostgreSQL
-- Total season dues: $745 (tiered by program)
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. SEASON DUES CONFIGURATION
--    Admin-managed fee structure per season/program
-- ============================================================
CREATE TABLE public.season_dues_config (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    season          TEXT NOT NULL,                   -- e.g. 'Summer 2026'
    program         TEXT NOT NULL,                   -- e.g. 'AAU', 'Training', 'Full Program'
    description     TEXT,
    total_amount    NUMERIC(10,2) NOT NULL,          -- e.g. 745.00
    currency        TEXT NOT NULL DEFAULT 'usd',
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (season, program)
);

-- ============================================================
-- 2. PAYMENT PLAN TEMPLATES
--    Defines available installment structures for each dues config
-- ============================================================
CREATE TABLE public.payment_plan_templates (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dues_config_id      UUID NOT NULL REFERENCES public.season_dues_config(id) ON DELETE CASCADE,
    plan_name           TEXT NOT NULL,               -- e.g. 'Pay in Full', '3-Month Plan', '5-Month Plan'
    num_installments    INTEGER NOT NULL DEFAULT 1,  -- 1 = pay in full
    installment_amount  NUMERIC(10,2) NOT NULL,      -- per-installment amount
    frequency_days      INTEGER NOT NULL DEFAULT 30, -- days between installments
    convenience_fee     NUMERIC(10,2) NOT NULL DEFAULT 0.00, -- optional fee for plans
    sort_order          INTEGER NOT NULL DEFAULT 0,
    is_active           BOOLEAN NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT valid_installments CHECK (num_installments >= 1),
    CONSTRAINT valid_amount CHECK (installment_amount > 0)
);

-- ============================================================
-- 3. PARENT DUES ENROLLMENT
--    Tracks which parent enrolled in which dues + plan
-- ============================================================
CREATE TABLE public.parent_dues_enrollment (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_email        TEXT NOT NULL,
    parent_name         TEXT,
    athlete_name        TEXT,
    athlete_id          UUID REFERENCES public.athletes(id) ON DELETE SET NULL,
    dues_config_id      UUID NOT NULL REFERENCES public.season_dues_config(id),
    plan_template_id    UUID NOT NULL REFERENCES public.payment_plan_templates(id),
    total_owed          NUMERIC(10,2) NOT NULL,
    total_paid          NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    status              TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'paid_in_full', 'past_due', 'cancelled', 'refunded')),
    enrolled_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (parent_email, dues_config_id)
);

-- ============================================================
-- 4. SCHEDULED INSTALLMENTS
--    Individual payment milestones for each enrollment
-- ============================================================
CREATE TABLE public.dues_installments (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enrollment_id       UUID NOT NULL REFERENCES public.parent_dues_enrollment(id) ON DELETE CASCADE,
    installment_number  INTEGER NOT NULL,
    amount              NUMERIC(10,2) NOT NULL,
    due_date            DATE NOT NULL,
    status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'paid', 'past_due', 'grace_period', 'waived')),
    paid_at             TIMESTAMPTZ,
    stripe_payment_id   TEXT,                        -- Stripe PaymentIntent ID
    reminder_sent_at    TIMESTAMPTZ,                 -- last reminder timestamp
    reminder_count      INTEGER NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (enrollment_id, installment_number)
);

-- ============================================================
-- 5. PAYMENT RECORDS
--    Immutable ledger of all Stripe transactions
-- ============================================================
CREATE TABLE public.dues_payments (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enrollment_id           UUID NOT NULL REFERENCES public.parent_dues_enrollment(id),
    installment_id          UUID REFERENCES public.dues_installments(id),
    stripe_payment_intent   TEXT NOT NULL,
    stripe_checkout_session TEXT,
    amount                  NUMERIC(10,2) NOT NULL,
    currency                TEXT NOT NULL DEFAULT 'usd',
    status                  TEXT NOT NULL DEFAULT 'succeeded'
                            CHECK (status IN ('succeeded', 'pending', 'failed', 'refunded')),
    receipt_url             TEXT,
    paid_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (stripe_payment_intent)
);

-- ============================================================
-- 6. REMINDER LOG
--    Tracks every reminder sent (audit trail)
-- ============================================================
CREATE TABLE public.dues_reminder_log (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enrollment_id       UUID NOT NULL REFERENCES public.parent_dues_enrollment(id),
    installment_id      UUID REFERENCES public.dues_installments(id),
    reminder_type       TEXT NOT NULL
                        CHECK (reminder_type IN (
                            'upcoming',        -- 5 days before due
                            'due_today',       -- day of
                            'grace_period',    -- 1-3 days after
                            'past_due',        -- 7+ days after
                            'final_notice'     -- 14+ days after
                        )),
    channel             TEXT NOT NULL DEFAULT 'email',
    recipient_email     TEXT NOT NULL,
    subject             TEXT NOT NULL,
    message_preview     TEXT,
    sent_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    resend_message_id   TEXT                         -- Resend API message ID
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_enrollment_email ON public.parent_dues_enrollment(parent_email);
CREATE INDEX idx_enrollment_status ON public.parent_dues_enrollment(status);
CREATE INDEX idx_installments_due ON public.dues_installments(due_date, status);
CREATE INDEX idx_installments_enrollment ON public.dues_installments(enrollment_id);
CREATE INDEX idx_payments_enrollment ON public.dues_payments(enrollment_id);
CREATE INDEX idx_reminder_log_enrollment ON public.dues_reminder_log(enrollment_id);
CREATE INDEX idx_reminder_log_installment ON public.dues_reminder_log(installment_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE public.season_dues_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_plan_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parent_dues_enrollment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dues_installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dues_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dues_reminder_log ENABLE ROW LEVEL SECURITY;

-- Public read on active dues config (parents need to see pricing)
CREATE POLICY "Anyone can read active dues config"
    ON public.season_dues_config FOR SELECT
    USING (is_active = true);

-- Public read on active plan templates
CREATE POLICY "Anyone can read active plan templates"
    ON public.payment_plan_templates FOR SELECT
    USING (is_active = true);

-- Parents can read their own enrollment
CREATE POLICY "Parents read own enrollment"
    ON public.parent_dues_enrollment FOR SELECT
    USING (parent_email = auth.jwt()->>'email');

-- Parents can read their own installments
CREATE POLICY "Parents read own installments"
    ON public.dues_installments FOR SELECT
    USING (
        enrollment_id IN (
            SELECT id FROM public.parent_dues_enrollment
            WHERE parent_email = auth.jwt()->>'email'
        )
    );

-- Parents can read their own payments
CREATE POLICY "Parents read own payments"
    ON public.dues_payments FOR SELECT
    USING (
        enrollment_id IN (
            SELECT id FROM public.parent_dues_enrollment
            WHERE parent_email = auth.jwt()->>'email'
        )
    );

-- Service role (edge functions) can do everything
CREATE POLICY "Service role full access on dues_config"
    ON public.season_dues_config FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on plan_templates"
    ON public.payment_plan_templates FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on enrollment"
    ON public.parent_dues_enrollment FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on installments"
    ON public.dues_installments FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on payments"
    ON public.dues_payments FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on reminder_log"
    ON public.dues_reminder_log FOR ALL
    USING (auth.role() = 'service_role');

-- ============================================================
-- SEED: Summer 2026 Season Dues — $745 Total
-- Tiered: AAU ($495) + Training ($250)
-- ============================================================
INSERT INTO public.season_dues_config (season, program, description, total_amount) VALUES
    ('Summer 2026', 'Full Program', 'AAU + Training combined season dues', 745.00),
    ('Summer 2026', 'AAU',          'AAU league registration and tournament fees', 495.00),
    ('Summer 2026', 'Training',     'Skill development sessions and court time', 250.00);

-- Payment plans for Full Program ($745)
WITH full AS (SELECT id FROM public.season_dues_config WHERE season = 'Summer 2026' AND program = 'Full Program')
INSERT INTO public.payment_plan_templates (dues_config_id, plan_name, num_installments, installment_amount, frequency_days, sort_order) VALUES
    ((SELECT id FROM full), 'Pay in Full',    1, 745.00, 0,  1),
    ((SELECT id FROM full), '2-Payment Plan', 2, 372.50, 30, 2),
    ((SELECT id FROM full), '3-Payment Plan', 3, 248.33, 30, 3);

-- Payment plans for AAU only ($495)
WITH aau AS (SELECT id FROM public.season_dues_config WHERE season = 'Summer 2026' AND program = 'AAU')
INSERT INTO public.payment_plan_templates (dues_config_id, plan_name, num_installments, installment_amount, frequency_days, sort_order) VALUES
    ((SELECT id FROM aau), 'Pay in Full',    1, 495.00, 0,  1),
    ((SELECT id FROM aau), '2-Payment Plan', 2, 247.50, 30, 2),
    ((SELECT id FROM aau), '3-Payment Plan', 3, 165.00, 30, 3);

-- Payment plans for Training only ($250)
WITH trn AS (SELECT id FROM public.season_dues_config WHERE season = 'Summer 2026' AND program = 'Training')
INSERT INTO public.payment_plan_templates (dues_config_id, plan_name, num_installments, installment_amount, frequency_days, sort_order) VALUES
    ((SELECT id FROM trn), 'Pay in Full',    1, 250.00, 0,  1),
    ((SELECT id FROM trn), '2-Payment Plan', 2, 125.00, 30, 2);

-- ============================================================
-- HELPER: Auto-update updated_at timestamps
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_dues_config_updated
    BEFORE UPDATE ON public.season_dues_config
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_enrollment_updated
    BEFORE UPDATE ON public.parent_dues_enrollment
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
