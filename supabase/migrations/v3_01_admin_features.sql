-- =====================================================
-- V3.01 ADMIN FEATURES MIGRATION
-- =====================================================
-- 1. E-Commerce Orders (separate from Dues)
-- 2. Parent Broadcast Messaging
-- 3. Calendar Events
-- 4. Admin Data-Entry RPCs (training, games)
-- =====================================================
-- Deployed: 2026-03-28
-- =====================================================

-- =====================================================
-- 1. ORDERS + ORDER ITEMS (E-Commerce, NOT Dues)
-- =====================================================
-- Products/product_variants already exist.
-- Orders = merchandise purchases via Stripe.
-- Dues remain in season_dues_config / dues_installments / dues_payments.

CREATE TABLE IF NOT EXISTS public.orders (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number    text UNIQUE NOT NULL,
    user_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,

    -- Pricing
    subtotal        numeric(10,2) NOT NULL CHECK (subtotal >= 0),
    tax_amount      numeric(10,2) DEFAULT 0 CHECK (tax_amount >= 0),
    shipping_amount numeric(10,2) DEFAULT 0 CHECK (shipping_amount >= 0),
    discount_amount numeric(10,2) DEFAULT 0 CHECK (discount_amount >= 0),
    total_amount    numeric(10,2) NOT NULL CHECK (total_amount >= 0),

    -- Stripe
    stripe_payment_intent_id text,
    stripe_charge_id         text,
    payment_method           text,

    -- Shipping
    shipping_address jsonb,
    billing_address  jsonb,
    shipping_method  text,
    tracking_number  text,

    -- Customer
    customer_email text NOT NULL,
    customer_phone text,

    -- Status
    payment_status     text NOT NULL DEFAULT 'pending'
        CHECK (payment_status IN ('pending','paid','failed','refunded')),
    fulfillment_status text NOT NULL DEFAULT 'unfulfilled'
        CHECK (fulfillment_status IN ('unfulfilled','processing','shipped','delivered','cancelled')),

    -- Notes
    customer_notes text,
    internal_notes text,

    -- Timestamps
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    paid_at      timestamptz,
    shipped_at   timestamptz,
    delivered_at timestamptz,
    cancelled_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON public.orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_fulfillment_status ON public.orders(fulfillment_status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_stripe_pi ON public.orders(stripe_payment_intent_id);

CREATE TABLE IF NOT EXISTS public.order_items (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    variant_id      uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,

    -- Snapshot at purchase time
    product_title  text NOT NULL,
    variant_title  text,
    sku            text,

    -- Pricing
    price_at_purchase numeric(10,2) NOT NULL CHECK (price_at_purchase >= 0),
    quantity          int NOT NULL CHECK (quantity > 0),
    subtotal          numeric(10,2) NOT NULL CHECK (subtotal >= 0),

    -- Fulfillment
    fulfillment_status text DEFAULT 'unfulfilled'
        CHECK (fulfillment_status IN ('unfulfilled','fulfilled','cancelled')),

    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_variant_id ON public.order_items(variant_id);

-- Order number generator
CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
    new_number text;
    exists_flag boolean;
BEGIN
    LOOP
        new_number := 'GS-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(floor(random() * 10000)::text, 4, '0');
        SELECT EXISTS(SELECT 1 FROM public.orders WHERE order_number = new_number) INTO exists_flag;
        EXIT WHEN NOT exists_flag;
    END LOOP;
    RETURN new_number;
END;
$$;

-- Auto-decrement inventory on payment
CREATE OR REPLACE FUNCTION public.decrease_inventory_on_order()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.payment_status = 'paid' AND (OLD.payment_status IS NULL OR OLD.payment_status != 'paid') THEN
        UPDATE public.product_variants pv
        SET inventory_count = inventory_count - oi.quantity
        FROM public.order_items oi
        WHERE oi.order_id = NEW.id AND oi.variant_id = pv.id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_decrease_inventory ON public.orders;
CREATE TRIGGER trg_decrease_inventory
    AFTER UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.decrease_inventory_on_order();

-- RLS: Orders
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own orders" ON public.orders
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users create own orders" ON public.orders
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Directors view all orders" ON public.orders
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'director')
    );
CREATE POLICY "Directors update orders" ON public.orders
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'director')
    );
CREATE POLICY "Service role full orders" ON public.orders
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Users view own order items" ON public.order_items
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.orders WHERE orders.id = order_items.order_id AND orders.user_id = auth.uid())
    );
CREATE POLICY "Directors view all order items" ON public.order_items
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'director')
    );
CREATE POLICY "Service role full order items" ON public.order_items
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');


-- =====================================================
-- 2. BROADCAST MESSAGING (Admin -> Parents)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.broadcast_messages (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id       uuid NOT NULL REFERENCES auth.users(id),
    subject         text NOT NULL,
    body            text NOT NULL,
    channel         text NOT NULL DEFAULT 'email' CHECK (channel IN ('email','in_app','both')),

    -- Targeting
    audience        text NOT NULL DEFAULT 'all_parents'
        CHECK (audience IN ('all_parents','team','individual')),
    team_id         uuid REFERENCES public.teams(id),

    -- Delivery stats (updated by edge function)
    recipient_count int DEFAULT 0,
    delivered_count int DEFAULT 0,
    opened_count    int DEFAULT 0,

    -- Status
    status          text NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft','sending','sent','failed')),

    scheduled_at    timestamptz,
    sent_at         timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_broadcast_sender ON public.broadcast_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_status ON public.broadcast_messages(status);
CREATE INDEX IF NOT EXISTS idx_broadcast_sent_at ON public.broadcast_messages(sent_at DESC);

CREATE TABLE IF NOT EXISTS public.broadcast_recipients (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id      uuid NOT NULL REFERENCES public.broadcast_messages(id) ON DELETE CASCADE,
    user_id         uuid NOT NULL REFERENCES auth.users(id),
    email           text NOT NULL,

    -- Delivery tracking
    status          text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','sent','delivered','opened','failed')),
    resend_id       text,              -- Resend message ID for webhook tracking
    delivered_at    timestamptz,
    opened_at       timestamptz,
    failed_reason   text,

    created_at      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT unique_broadcast_recipient UNIQUE (message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_broadcast_recip_msg ON public.broadcast_recipients(message_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_recip_user ON public.broadcast_recipients(user_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_recip_status ON public.broadcast_recipients(status);

-- RLS: Broadcasts
ALTER TABLE public.broadcast_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broadcast_recipients ENABLE ROW LEVEL SECURITY;

-- Directors/coaches can manage broadcasts
CREATE POLICY "Directors manage broadcasts" ON public.broadcast_messages
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('director','coach'))
    );

-- Parents see broadcasts sent to them
CREATE POLICY "Parents view own broadcast receipts" ON public.broadcast_recipients
    FOR SELECT USING (auth.uid() = user_id);

-- Directors can manage recipients
CREATE POLICY "Directors manage broadcast recipients" ON public.broadcast_recipients
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('director','coach'))
    );

CREATE POLICY "Service role full broadcasts" ON public.broadcast_messages
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY "Service role full broadcast recipients" ON public.broadcast_recipients
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');


-- =====================================================
-- 3. CALENDAR EVENTS
-- =====================================================

CREATE TABLE IF NOT EXISTS public.calendar_events (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Event details
    title           text NOT NULL,
    description     text,
    event_type      text NOT NULL CHECK (event_type IN (
        'practice','game','tournament','meeting','camp','tryout','fundraiser','other'
    )),

    -- Timing
    start_date      date NOT NULL,
    start_time      time,
    end_date        date,
    end_time        time,
    all_day         boolean DEFAULT false,

    -- Location
    location        text,
    location_url    text,             -- Google Maps / address link

    -- Association
    team_id         uuid REFERENCES public.teams(id) ON DELETE SET NULL,
    game_id         uuid REFERENCES public.games(id) ON DELETE SET NULL,
    session_id      uuid REFERENCES public.training_sessions(id) ON DELETE SET NULL,

    -- Recurrence (iCal RRULE format for future use)
    rrule           text,
    recurrence_id   uuid REFERENCES public.calendar_events(id) ON DELETE CASCADE,

    -- Visibility
    visibility      text NOT NULL DEFAULT 'public'
        CHECK (visibility IN ('public','team_only','coaches_only')),
    is_cancelled    boolean DEFAULT false,

    -- Metadata
    color           text,             -- Hex color for UI rendering
    created_by      uuid REFERENCES auth.users(id),
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cal_events_start ON public.calendar_events(start_date);
CREATE INDEX IF NOT EXISTS idx_cal_events_type ON public.calendar_events(event_type);
CREATE INDEX IF NOT EXISTS idx_cal_events_team ON public.calendar_events(team_id);
CREATE INDEX IF NOT EXISTS idx_cal_events_game ON public.calendar_events(game_id);
CREATE INDEX IF NOT EXISTS idx_cal_events_session ON public.calendar_events(session_id);
CREATE INDEX IF NOT EXISTS idx_cal_events_vis ON public.calendar_events(visibility);

-- RLS: Calendar
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

-- Public events visible to all authenticated users
CREATE POLICY "Authenticated users view public events" ON public.calendar_events
    FOR SELECT USING (
        visibility = 'public'
        OR (visibility = 'team_only' AND auth.uid() IS NOT NULL)
        OR (visibility = 'coaches_only' AND EXISTS (
            SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('director','coach')
        ))
    );

-- Directors/coaches manage events
CREATE POLICY "Directors manage calendar" ON public.calendar_events
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('director','coach'))
    );

CREATE POLICY "Service role full calendar" ON public.calendar_events
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');


-- =====================================================
-- 4. ADMIN DATA-ENTRY RPCs
-- =====================================================

-- RPC: Log a training session + attendance in one call
CREATE OR REPLACE FUNCTION public.log_training_session(
    p_session_date    date,
    p_session_type    text,
    p_title           text DEFAULT NULL,
    p_team_id         uuid DEFAULT NULL,
    p_location        text DEFAULT NULL,
    p_start_time      time DEFAULT NULL,
    p_end_time        time DEFAULT NULL,
    p_duration_minutes smallint DEFAULT NULL,
    p_focus_areas     text[] DEFAULT '{}',
    p_session_notes   text DEFAULT NULL,
    p_attendance      jsonb DEFAULT '[]'::jsonb  -- [{athlete_id, status, effort_rating, coach_notes}]
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_session_id uuid;
    v_record     jsonb;
BEGIN
    -- Insert training session
    INSERT INTO public.training_sessions (
        session_date, session_type, title, team_id, location,
        start_time, end_time, duration_minutes, focus_areas, session_notes,
        coach_id, created_by
    ) VALUES (
        p_session_date, p_session_type, p_title, p_team_id, p_location,
        p_start_time, p_end_time, p_duration_minutes, p_focus_areas, p_session_notes,
        auth.uid(), auth.uid()
    ) RETURNING id INTO v_session_id;

    -- Insert attendance records with full per-player training data
    FOR v_record IN SELECT * FROM jsonb_array_elements(p_attendance)
    LOOP
        INSERT INTO public.training_attendance (
            session_id, athlete_id, status, effort_rating, coach_notes,
            skill_ratings, drills_completed
        ) VALUES (
            v_session_id,
            (v_record ->> 'athlete_id')::uuid,
            COALESCE(v_record ->> 'status', 'present'),
            (v_record ->> 'effort_rating')::smallint,
            v_record ->> 'coach_notes',
            COALESCE(v_record -> 'skill_ratings', '{}'::jsonb),
            COALESCE(v_record -> 'drills_completed', '[]'::jsonb)
        )
        ON CONFLICT (session_id, athlete_id) DO UPDATE SET
            status = EXCLUDED.status,
            effort_rating = EXCLUDED.effort_rating,
            coach_notes = EXCLUDED.coach_notes,
            skill_ratings = EXCLUDED.skill_ratings,
            drills_completed = EXCLUDED.drills_completed;
    END LOOP;

    -- Auto-create calendar event
    INSERT INTO public.calendar_events (
        title, event_type, start_date, start_time, end_time,
        location, team_id, session_id, created_by
    ) VALUES (
        COALESCE(p_title, initcap(replace(p_session_type, '_', ' '))),
        'practice',
        p_session_date, p_start_time, p_end_time,
        p_location, p_team_id, v_session_id, auth.uid()
    );

    RETURN v_session_id;
END;
$$;

-- RPC: Log a game + player stats in one call
CREATE OR REPLACE FUNCTION public.log_game(
    p_game_date      date,
    p_game_type      text,
    p_opponent_name  text,
    p_team_id        uuid DEFAULT NULL,
    p_is_home        boolean DEFAULT true,
    p_location       text DEFAULT NULL,
    p_team_score     smallint DEFAULT NULL,
    p_opponent_score smallint DEFAULT NULL,
    p_game_notes     text DEFAULT NULL,
    p_game_time      time DEFAULT NULL,
    p_player_stats   jsonb DEFAULT '[]'::jsonb  -- [{athlete_id, points, total_rebounds, assists, steals, blocks, coach_notes}]
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_game_id uuid;
    v_record  jsonb;
BEGIN
    -- Insert game
    INSERT INTO public.games (
        game_date, game_time, game_type, team_id, opponent_name,
        is_home, location, team_score, opponent_score, game_notes,
        created_by
    ) VALUES (
        p_game_date, p_game_time, p_game_type, p_team_id, p_opponent_name,
        p_is_home, p_location, p_team_score, p_opponent_score, p_game_notes,
        auth.uid()
    ) RETURNING id INTO v_game_id;

    -- Insert player stats
    FOR v_record IN SELECT * FROM jsonb_array_elements(p_player_stats)
    LOOP
        INSERT INTO public.player_game_stats (
            game_id, athlete_id, points, total_rebounds, assists, steals, blocks, coach_notes
        ) VALUES (
            v_game_id,
            (v_record ->> 'athlete_id')::uuid,
            COALESCE((v_record ->> 'points')::smallint, 0),
            COALESCE((v_record ->> 'total_rebounds')::smallint, 0),
            COALESCE((v_record ->> 'assists')::smallint, 0),
            COALESCE((v_record ->> 'steals')::smallint, 0),
            COALESCE((v_record ->> 'blocks')::smallint, 0),
            v_record ->> 'coach_notes'
        );
    END LOOP;

    -- Auto-create calendar event
    INSERT INTO public.calendar_events (
        title, event_type, start_date, start_time,
        location, team_id, game_id, created_by
    ) VALUES (
        CASE WHEN p_is_home THEN 'vs ' ELSE '@ ' END || p_opponent_name,
        'game',
        p_game_date, p_game_time,
        p_location, p_team_id, v_game_id, auth.uid()
    );

    RETURN v_game_id;
END;
$$;

-- RPC: Send broadcast message (creates message + recipients)
CREATE OR REPLACE FUNCTION public.send_broadcast(
    p_subject   text,
    p_body      text,
    p_audience  text DEFAULT 'all_parents',
    p_team_id   uuid DEFAULT NULL,
    p_channel   text DEFAULT 'email'
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_message_id uuid;
    v_count      int := 0;
BEGIN
    -- Create the broadcast
    INSERT INTO public.broadcast_messages (
        sender_id, subject, body, channel, audience, team_id, status
    ) VALUES (
        auth.uid(), p_subject, p_body, p_channel, p_audience, p_team_id, 'sending'
    ) RETURNING id INTO v_message_id;

    -- Populate recipients based on audience
    IF p_audience = 'all_parents' THEN
        INSERT INTO public.broadcast_recipients (message_id, user_id, email)
        SELECT v_message_id, p.id, p.email
        FROM public.profiles p
        WHERE p.role = 'parent' AND p.email IS NOT NULL;
    ELSIF p_audience = 'team' AND p_team_id IS NOT NULL THEN
        INSERT INTO public.broadcast_recipients (message_id, user_id, email)
        SELECT DISTINCT v_message_id, p.id, p.email
        FROM public.profiles p
        JOIN public.parent_accounts pa ON pa.user_id = p.id
        JOIN public.athletes a ON a.parent_account_id = pa.id
        JOIN public.team_rosters tr ON tr.athlete_id = a.id AND tr.team_id = p_team_id
        WHERE p.email IS NOT NULL;
    END IF;

    -- Update recipient count
    GET DIAGNOSTICS v_count = ROW_COUNT;
    UPDATE public.broadcast_messages
    SET recipient_count = v_count
    WHERE id = v_message_id;

    RETURN v_message_id;
END;
$$;

-- RPC: Create/update calendar event
CREATE OR REPLACE FUNCTION public.upsert_calendar_event(
    p_id            uuid DEFAULT NULL,
    p_title         text DEFAULT NULL,
    p_description   text DEFAULT NULL,
    p_event_type    text DEFAULT 'other',
    p_start_date    date DEFAULT NULL,
    p_start_time    time DEFAULT NULL,
    p_end_date      date DEFAULT NULL,
    p_end_time      time DEFAULT NULL,
    p_all_day       boolean DEFAULT false,
    p_location      text DEFAULT NULL,
    p_location_url  text DEFAULT NULL,
    p_team_id       uuid DEFAULT NULL,
    p_visibility    text DEFAULT 'public',
    p_color         text DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_event_id uuid;
BEGIN
    IF p_id IS NOT NULL THEN
        -- Update existing
        UPDATE public.calendar_events SET
            title       = COALESCE(p_title, title),
            description = COALESCE(p_description, description),
            event_type  = COALESCE(p_event_type, event_type),
            start_date  = COALESCE(p_start_date, start_date),
            start_time  = COALESCE(p_start_time, start_time),
            end_date    = COALESCE(p_end_date, end_date),
            end_time    = COALESCE(p_end_time, end_time),
            all_day     = COALESCE(p_all_day, all_day),
            location    = COALESCE(p_location, location),
            location_url = COALESCE(p_location_url, location_url),
            team_id     = p_team_id,
            visibility  = COALESCE(p_visibility, visibility),
            color       = COALESCE(p_color, color),
            updated_at  = now()
        WHERE id = p_id
        RETURNING id INTO v_event_id;
    ELSE
        -- Insert new
        INSERT INTO public.calendar_events (
            title, description, event_type, start_date, start_time,
            end_date, end_time, all_day, location, location_url,
            team_id, visibility, color, created_by
        ) VALUES (
            p_title, p_description, p_event_type, p_start_date, p_start_time,
            p_end_date, p_end_time, p_all_day, p_location, p_location_url,
            p_team_id, p_visibility, p_color, auth.uid()
        ) RETURNING id INTO v_event_id;
    END IF;

    RETURN v_event_id;
END;
$$;

-- Updated_at triggers
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_orders_updated ON public.orders;
CREATE TRIGGER trg_orders_updated BEFORE UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_broadcast_updated ON public.broadcast_messages;
CREATE TRIGGER trg_broadcast_updated BEFORE UPDATE ON public.broadcast_messages
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_calendar_updated ON public.calendar_events;
CREATE TRIGGER trg_calendar_updated BEFORE UPDATE ON public.calendar_events
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- =====================================================
-- ADMIN SUMMARY VIEW: Orders vs Dues at a glance
-- =====================================================
CREATE OR REPLACE VIEW public.admin_financial_summary AS
SELECT
    'dues' AS category,
    COUNT(*) AS total_records,
    SUM(CASE WHEN di.status = 'paid' THEN di.amount ELSE 0 END) AS total_collected,
    SUM(CASE WHEN di.status IN ('pending','overdue') THEN di.amount ELSE 0 END) AS total_outstanding
FROM public.dues_installments di
UNION ALL
SELECT
    'orders' AS category,
    COUNT(*) AS total_records,
    SUM(CASE WHEN o.payment_status = 'paid' THEN o.total_amount ELSE 0 END) AS total_collected,
    SUM(CASE WHEN o.payment_status = 'pending' THEN o.total_amount ELSE 0 END) AS total_outstanding
FROM public.orders o;


-- =====================================================
-- 5. WELCOME EMAIL ON ACCOUNT APPROVAL
-- =====================================================
-- When profiles.approved flips to true, queue a welcome email.
-- The edge function `send-welcome-email` picks up pending rows.

CREATE TABLE IF NOT EXISTS public.welcome_email_queue (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES auth.users(id),
    email       text NOT NULL,
    full_name   text,
    status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
    sent_at     timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_welcome_queue_status ON public.welcome_email_queue(status)
    WHERE status = 'pending';

ALTER TABLE public.welcome_email_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages welcome queue" ON public.welcome_email_queue
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY "Directors view welcome queue" ON public.welcome_email_queue
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'director')
    );

-- Trigger: auto-queue welcome email when approved flips to true
CREATE OR REPLACE FUNCTION public.queue_welcome_email()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    IF NEW.approved = true AND (OLD.approved IS NULL OR OLD.approved = false) THEN
        INSERT INTO public.welcome_email_queue (user_id, email, full_name)
        VALUES (NEW.id, NEW.email, NEW.full_name)
        ON CONFLICT DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_queue_welcome ON public.profiles;
CREATE TRIGGER trg_queue_welcome
    AFTER UPDATE OF approved ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.queue_welcome_email();
