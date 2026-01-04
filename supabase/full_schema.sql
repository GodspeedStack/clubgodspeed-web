-- =====================================================
-- GODSPEED COMMS CENTER - DATABASE SCHEMA
-- =====================================================
-- Purpose: Secure internal messaging system for Coach-to-Parent communication
-- Features: Dual delivery (in-app + email), read tracking, reply management
-- =====================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- TABLE: messages
-- =====================================================
-- Stores all messages sent by coaches
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('email', 'internal', 'both')),
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Metadata
    recipient_count INTEGER DEFAULT 0,
    read_count INTEGER DEFAULT 0,
    
    -- Soft delete
    deleted_at TIMESTAMP WITH TIME ZONE,
    
    -- Indexes
    CONSTRAINT messages_sender_id_idx CHECK (sender_id IS NOT NULL)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_sent_at ON messages(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_deleted_at ON messages(deleted_at) WHERE deleted_at IS NULL;

-- =====================================================
-- TABLE: message_recipients
-- =====================================================
-- Tracks delivery and read status for each parent recipient
CREATE TABLE IF NOT EXISTS message_recipients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Status tracking
    status VARCHAR(20) NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'read', 'failed')),
    
    -- Timestamps
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    delivered_at TIMESTAMP WITH TIME ZONE,
    read_at TIMESTAMP WITH TIME ZONE,
    
    -- Email tracking (for Resend webhook integration)
    email_id TEXT, -- Resend email ID
    email_opened_at TIMESTAMP WITH TIME ZONE,
    email_clicked_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure one record per message-user combination
    CONSTRAINT unique_message_recipient UNIQUE (message_id, user_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_recipients_message_id ON message_recipients(message_id);
CREATE INDEX IF NOT EXISTS idx_recipients_user_id ON message_recipients(user_id);
CREATE INDEX IF NOT EXISTS idx_recipients_status ON message_recipients(status);
CREATE INDEX IF NOT EXISTS idx_recipients_read_at ON message_recipients(read_at);

-- =====================================================
-- TABLE: message_replies
-- =====================================================
-- Stores 1-on-1 replies from parents to coaches (no "Reply All")
CREATE TABLE IF NOT EXISTS message_replies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    body TEXT NOT NULL,
    
    -- Read tracking for replies
    read_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Soft delete
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_replies_parent_message_id ON message_replies(parent_message_id);
CREATE INDEX IF NOT EXISTS idx_replies_sender_id ON message_replies(sender_id);
CREATE INDEX IF NOT EXISTS idx_replies_recipient_id ON message_replies(recipient_id);
CREATE INDEX IF NOT EXISTS idx_replies_created_at ON message_replies(created_at DESC);

-- =====================================================
-- FUNCTION: Update read count trigger
-- =====================================================
-- Automatically update the read_count on messages table when a recipient marks as read
CREATE OR REPLACE FUNCTION update_message_read_count()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'read' AND (OLD.status IS NULL OR OLD.status != 'read') THEN
        UPDATE messages
        SET read_count = read_count + 1,
            updated_at = NOW()
        WHERE id = NEW.message_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_update_read_count ON message_recipients;
CREATE TRIGGER trigger_update_read_count
    AFTER UPDATE ON message_recipients
    FOR EACH ROW
    EXECUTE FUNCTION update_message_read_count();

-- =====================================================
-- FUNCTION: Auto-update updated_at timestamp
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables
DROP TRIGGER IF EXISTS update_messages_updated_at ON messages;
CREATE TRIGGER update_messages_updated_at
    BEFORE UPDATE ON messages
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_recipients_updated_at ON message_recipients;
CREATE TRIGGER update_recipients_updated_at
    BEFORE UPDATE ON message_recipients
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_replies_updated_at ON message_replies;
CREATE TRIGGER update_replies_updated_at
    BEFORE UPDATE ON message_replies
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_replies ENABLE ROW LEVEL SECURITY;

-- MESSAGES POLICIES
-- Coaches can view their own sent messages
CREATE POLICY "Coaches can view their own messages"
    ON messages FOR SELECT
    USING (auth.uid() = sender_id);

-- Coaches can insert their own messages
CREATE POLICY "Coaches can send messages"
    ON messages FOR INSERT
    WITH CHECK (auth.uid() = sender_id);

-- Coaches can update their own messages
CREATE POLICY "Coaches can update their messages"
    ON messages FOR UPDATE
    USING (auth.uid() = sender_id);

-- MESSAGE_RECIPIENTS POLICIES
-- Parents can view messages sent to them
CREATE POLICY "Parents can view their messages"
    ON message_recipients FOR SELECT
    USING (auth.uid() = user_id);

-- Parents can update their own recipient records (mark as read)
CREATE POLICY "Parents can mark messages as read"
    ON message_recipients FOR UPDATE
    USING (auth.uid() = user_id);

-- Coaches can view recipients of their messages
CREATE POLICY "Coaches can view message recipients"
    ON message_recipients FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM messages
            WHERE messages.id = message_recipients.message_id
            AND messages.sender_id = auth.uid()
        )
    );

-- Coaches can insert recipients when sending messages
CREATE POLICY "Coaches can add recipients"
    ON message_recipients FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM messages
            WHERE messages.id = message_recipients.message_id
            AND messages.sender_id = auth.uid()
        )
    );

-- MESSAGE_REPLIES POLICIES
-- Users can view replies they sent or received
CREATE POLICY "Users can view their replies"
    ON message_replies FOR SELECT
    USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

-- Users can send replies
CREATE POLICY "Users can send replies"
    ON message_replies FOR INSERT
    WITH CHECK (auth.uid() = sender_id);

-- Users can update replies they received (mark as read)
CREATE POLICY "Users can mark replies as read"
    ON message_replies FOR UPDATE
    USING (auth.uid() = recipient_id);

-- =====================================================
-- HELPER VIEWS
-- =====================================================

-- View: Coach message analytics
CREATE OR REPLACE VIEW coach_message_analytics AS
SELECT 
    m.id,
    m.subject,
    m.sent_at,
    m.recipient_count,
    m.read_count,
    CASE 
        WHEN m.recipient_count > 0 
        THEN ROUND((m.read_count::NUMERIC / m.recipient_count::NUMERIC) * 100, 1)
        ELSE 0 
    END AS read_percentage,
    COUNT(mr.id) FILTER (WHERE mr.status = 'read') AS confirmed_reads,
    COUNT(mr.id) FILTER (WHERE mr.status = 'sent') AS unread
FROM messages m
LEFT JOIN message_recipients mr ON m.id = mr.message_id
GROUP BY m.id, m.subject, m.sent_at, m.recipient_count, m.read_count;

-- =====================================================
-- COMMENTS
-- =====================================================
COMMENT ON TABLE messages IS 'Stores all messages sent by coaches to parents';
COMMENT ON TABLE message_recipients IS 'Tracks delivery and read status for each parent recipient';
COMMENT ON TABLE message_replies IS 'Stores 1-on-1 replies from parents to coaches (no Reply All)';
COMMENT ON COLUMN message_recipients.status IS 'Message delivery status: sent, delivered, read, failed';
COMMENT ON COLUMN message_recipients.email_id IS 'Resend email ID for webhook tracking';
-- =====================================================
-- THE PRO SHOP - E-COMMERCE DATABASE SCHEMA
-- =====================================================
-- Purpose: Headless e-commerce system for Godspeed Basketball
-- Features: Product variants, cart management, order processing
-- Payment: Stripe Connect integration
-- =====================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- TABLE: categories
-- =====================================================
-- Product categories for organization
CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    parent_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    image_url TEXT,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);
CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_categories_active ON categories(is_active) WHERE is_active = true;

-- =====================================================
-- TABLE: products
-- =====================================================
-- Main product catalog
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    base_price DECIMAL(10, 2) NOT NULL CHECK (base_price >= 0),
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    
    -- Product details
    brand VARCHAR(100),
    featured_image_url TEXT,
    images JSONB DEFAULT '[]', -- Array of image URLs
    
    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
    is_featured BOOLEAN DEFAULT false,
    
    -- SEO
    meta_title VARCHAR(255),
    meta_description TEXT,
    
    -- Inventory tracking
    track_inventory BOOLEAN DEFAULT true,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    published_at TIMESTAMP WITH TIME ZONE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);
CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_featured ON products(is_featured) WHERE is_featured = true;
CREATE INDEX IF NOT EXISTS idx_products_published ON products(published_at) WHERE published_at IS NOT NULL;

-- =====================================================
-- TABLE: product_variants
-- =====================================================
-- Product variations (size, color, etc.)
CREATE TABLE IF NOT EXISTS product_variants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    
    -- Variant identification
    sku VARCHAR(100) UNIQUE NOT NULL,
    barcode VARCHAR(100),
    
    -- Variant attributes
    size VARCHAR(50),
    color VARCHAR(50),
    material VARCHAR(100),
    
    -- Pricing
    price_override DECIMAL(10, 2) CHECK (price_override >= 0),
    compare_at_price DECIMAL(10, 2) CHECK (compare_at_price >= 0),
    
    -- Inventory
    inventory_count INTEGER NOT NULL DEFAULT 0 CHECK (inventory_count >= 0),
    low_stock_threshold INTEGER DEFAULT 5,
    
    -- Physical attributes
    weight DECIMAL(10, 2), -- in pounds
    dimensions JSONB, -- {length, width, height}
    
    -- Images
    image_url TEXT,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure unique combinations
    CONSTRAINT unique_variant_attributes UNIQUE (product_id, size, color)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_variants_product_id ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_variants_sku ON product_variants(sku);
CREATE INDEX IF NOT EXISTS idx_variants_active ON product_variants(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_variants_inventory ON product_variants(inventory_count);

-- =====================================================
-- TABLE: cart
-- =====================================================
-- Shopping cart sessions
CREATE TABLE IF NOT EXISTS cart (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Session tracking for guest carts
    session_id VARCHAR(255),
    
    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'abandoned', 'converted')),
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '30 days'),
    
    -- Ensure one active cart per user
    CONSTRAINT unique_active_cart_per_user UNIQUE (user_id, status)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cart_user_id ON cart(user_id);
CREATE INDEX IF NOT EXISTS idx_cart_session_id ON cart(session_id);
CREATE INDEX IF NOT EXISTS idx_cart_status ON cart(status);
CREATE INDEX IF NOT EXISTS idx_cart_expires ON cart(expires_at);

-- =====================================================
-- TABLE: cart_items
-- =====================================================
-- Items in shopping cart
CREATE TABLE IF NOT EXISTS cart_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cart_id UUID NOT NULL REFERENCES cart(id) ON DELETE CASCADE,
    variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    
    -- Quantity
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure unique variant per cart
    CONSTRAINT unique_variant_per_cart UNIQUE (cart_id, variant_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cart_items_cart_id ON cart_items(cart_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_variant_id ON cart_items(variant_id);

-- =====================================================
-- TABLE: orders
-- =====================================================
-- Customer orders
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_number VARCHAR(50) UNIQUE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    
    -- Pricing
    subtotal DECIMAL(10, 2) NOT NULL CHECK (subtotal >= 0),
    tax_amount DECIMAL(10, 2) DEFAULT 0 CHECK (tax_amount >= 0),
    shipping_amount DECIMAL(10, 2) DEFAULT 0 CHECK (shipping_amount >= 0),
    discount_amount DECIMAL(10, 2) DEFAULT 0 CHECK (discount_amount >= 0),
    total_amount DECIMAL(10, 2) NOT NULL CHECK (total_amount >= 0),
    
    -- Payment
    stripe_payment_intent_id VARCHAR(255),
    stripe_charge_id VARCHAR(255),
    payment_method VARCHAR(50),
    
    -- Shipping
    shipping_address JSONB NOT NULL,
    billing_address JSONB NOT NULL,
    shipping_method VARCHAR(100),
    tracking_number VARCHAR(255),
    
    -- Customer info
    customer_email VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(50),
    
    -- Status
    payment_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
    fulfillment_status VARCHAR(20) NOT NULL DEFAULT 'unfulfilled' CHECK (fulfillment_status IN ('unfulfilled', 'processing', 'shipped', 'delivered', 'cancelled')),
    
    -- Notes
    customer_notes TEXT,
    internal_notes TEXT,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    paid_at TIMESTAMP WITH TIME ZONE,
    shipped_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_fulfillment_status ON orders(fulfillment_status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_stripe_payment_intent ON orders(stripe_payment_intent_id);

-- =====================================================
-- TABLE: order_items
-- =====================================================
-- Line items in orders
CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL,
    
    -- Product snapshot (in case product is deleted)
    product_title VARCHAR(255) NOT NULL,
    variant_title VARCHAR(255),
    sku VARCHAR(100),
    
    -- Pricing at time of purchase
    price_at_purchase DECIMAL(10, 2) NOT NULL CHECK (price_at_purchase >= 0),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    subtotal DECIMAL(10, 2) NOT NULL CHECK (subtotal >= 0),
    
    -- Fulfillment
    fulfillment_status VARCHAR(20) DEFAULT 'unfulfilled' CHECK (fulfillment_status IN ('unfulfilled', 'fulfilled', 'cancelled')),
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_variant_id ON order_items(variant_id);

-- =====================================================
-- FUNCTION: Generate unique order number
-- =====================================================
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TEXT AS $$
DECLARE
    new_number TEXT;
    number_exists BOOLEAN;
BEGIN
    LOOP
        -- Generate format: GS-YYYYMMDD-XXXX (e.g., GS-20251222-1234)
        new_number := 'GS-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');
        
        -- Check if number exists
        SELECT EXISTS(SELECT 1 FROM orders WHERE order_number = new_number) INTO number_exists;
        
        -- Exit loop if unique
        EXIT WHEN NOT number_exists;
    END LOOP;
    
    RETURN new_number;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNCTION: Auto-update updated_at timestamp
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables
DROP TRIGGER IF EXISTS update_categories_updated_at ON categories;
CREATE TRIGGER update_categories_updated_at
    BEFORE UPDATE ON categories
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_products_updated_at ON products;
CREATE TRIGGER update_products_updated_at
    BEFORE UPDATE ON products
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_variants_updated_at ON product_variants;
CREATE TRIGGER update_variants_updated_at
    BEFORE UPDATE ON product_variants
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_cart_updated_at ON cart;
CREATE TRIGGER update_cart_updated_at
    BEFORE UPDATE ON cart
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_cart_items_updated_at ON cart_items;
CREATE TRIGGER update_cart_items_updated_at
    BEFORE UPDATE ON cart_items
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_orders_updated_at ON orders;
CREATE TRIGGER update_orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- FUNCTION: Decrease inventory on order
-- =====================================================
CREATE OR REPLACE FUNCTION decrease_inventory_on_order()
RETURNS TRIGGER AS $$
BEGIN
    -- Only decrease inventory when order is paid
    IF NEW.payment_status = 'paid' AND (OLD.payment_status IS NULL OR OLD.payment_status != 'paid') THEN
        UPDATE product_variants pv
        SET inventory_count = inventory_count - oi.quantity
        FROM order_items oi
        WHERE oi.order_id = NEW.id
        AND oi.variant_id = pv.id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_decrease_inventory ON orders;
CREATE TRIGGER trigger_decrease_inventory
    AFTER UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION decrease_inventory_on_order();

-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- CATEGORIES: Public read, admin write
CREATE POLICY "Anyone can view active categories"
    ON categories FOR SELECT
    USING (is_active = true);

CREATE POLICY "Admins can manage categories"
    ON categories FOR ALL
    USING (auth.jwt() ->> 'role' = 'admin');

-- PRODUCTS: Public read active, admin write
CREATE POLICY "Anyone can view active products"
    ON products FOR SELECT
    USING (status = 'active');

CREATE POLICY "Admins can manage products"
    ON products FOR ALL
    USING (auth.jwt() ->> 'role' = 'admin');

-- VARIANTS: Public read active, admin write
CREATE POLICY "Anyone can view active variants"
    ON product_variants FOR SELECT
    USING (is_active = true);

CREATE POLICY "Admins can manage variants"
    ON product_variants FOR ALL
    USING (auth.jwt() ->> 'role' = 'admin');

-- CART: Users can manage their own cart
CREATE POLICY "Users can view their own cart"
    ON cart FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own cart"
    ON cart FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own cart"
    ON cart FOR UPDATE
    USING (auth.uid() = user_id);

-- CART ITEMS: Users can manage items in their cart
CREATE POLICY "Users can view their cart items"
    ON cart_items FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM cart
            WHERE cart.id = cart_items.cart_id
            AND cart.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can add items to their cart"
    ON cart_items FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM cart
            WHERE cart.id = cart_items.cart_id
            AND cart.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update their cart items"
    ON cart_items FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM cart
            WHERE cart.id = cart_items.cart_id
            AND cart.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete their cart items"
    ON cart_items FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM cart
            WHERE cart.id = cart_items.cart_id
            AND cart.user_id = auth.uid()
        )
    );

-- ORDERS: Users can view their own orders
CREATE POLICY "Users can view their own orders"
    ON orders FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create orders"
    ON orders FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all orders"
    ON orders FOR SELECT
    USING (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "Admins can update orders"
    ON orders FOR UPDATE
    USING (auth.jwt() ->> 'role' = 'admin');

-- ORDER ITEMS: Users can view items in their orders
CREATE POLICY "Users can view their order items"
    ON order_items FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM orders
            WHERE orders.id = order_items.order_id
            AND orders.user_id = auth.uid()
        )
    );

CREATE POLICY "Admins can view all order items"
    ON order_items FOR SELECT
    USING (auth.jwt() ->> 'role' = 'admin');

-- =====================================================
-- HELPER VIEWS
-- =====================================================

-- View: Product catalog with variant info
CREATE OR REPLACE VIEW product_catalog AS
SELECT 
    p.id,
    p.title,
    p.slug,
    p.description,
    p.base_price,
    p.featured_image_url,
    p.brand,
    p.status,
    p.is_featured,
    c.name AS category_name,
    c.slug AS category_slug,
    COUNT(DISTINCT pv.id) AS variant_count,
    MIN(COALESCE(pv.price_override, p.base_price)) AS min_price,
    MAX(COALESCE(pv.price_override, p.base_price)) AS max_price,
    SUM(pv.inventory_count) AS total_inventory
FROM products p
LEFT JOIN categories c ON p.category_id = c.id
LEFT JOIN product_variants pv ON p.id = pv.product_id AND pv.is_active = true
WHERE p.status = 'active'
GROUP BY p.id, c.name, c.slug;

-- =====================================================
-- COMMENTS
-- =====================================================
COMMENT ON TABLE products IS 'Main product catalog for The Pro Shop';
COMMENT ON TABLE product_variants IS 'Product variations (size, color, etc.) with individual inventory tracking';
COMMENT ON TABLE cart IS 'Shopping cart sessions for users';
COMMENT ON TABLE cart_items IS 'Line items in shopping carts';
COMMENT ON TABLE orders IS 'Customer orders with Stripe payment integration';
COMMENT ON TABLE order_items IS 'Line items in orders with price snapshot';
-- =====================================================
-- PRO SHOP - SIMPLIFIED E-COMMERCE SCHEMA
-- =====================================================
-- Purpose: Streamlined store for Godspeed Basketball
-- Features: Products, variants, cart, RLS policies
-- =====================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- TABLE: products
-- =====================================================
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    price INTEGER NOT NULL CHECK (price >= 0), -- Price in cents
    images TEXT[] DEFAULT '{}', -- Array of image URLs
    category VARCHAR(100),
    is_member_exclusive BOOLEAN DEFAULT false,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'draft')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_member_exclusive ON products(is_member_exclusive);

-- =====================================================
-- TABLE: product_variants
-- =====================================================
CREATE TABLE IF NOT EXISTS product_variants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    size VARCHAR(50),
    color VARCHAR(50),
    stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
    sku VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure unique size/color combination per product
    CONSTRAINT unique_variant UNIQUE (product_id, size, color)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_variants_product_id ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_variants_sku ON product_variants(sku);
CREATE INDEX IF NOT EXISTS idx_variants_stock ON product_variants(stock_quantity);

-- =====================================================
-- TABLE: cart
-- =====================================================
CREATE TABLE IF NOT EXISTS cart (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'abandoned', 'converted')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cart_user_id ON cart(user_id);
CREATE INDEX IF NOT EXISTS idx_cart_status ON cart(status);

-- =====================================================
-- TABLE: cart_items
-- =====================================================
CREATE TABLE IF NOT EXISTS cart_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cart_id UUID NOT NULL REFERENCES cart(id) ON DELETE CASCADE,
    variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure unique variant per cart
    CONSTRAINT unique_cart_variant UNIQUE (cart_id, variant_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cart_items_cart_id ON cart_items(cart_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_variant_id ON cart_items(variant_id);

-- =====================================================
-- FUNCTION: Auto-update updated_at timestamp
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers
DROP TRIGGER IF EXISTS update_products_updated_at ON products;
CREATE TRIGGER update_products_updated_at
    BEFORE UPDATE ON products
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_variants_updated_at ON product_variants;
CREATE TRIGGER update_variants_updated_at
    BEFORE UPDATE ON product_variants
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_cart_updated_at ON cart;
CREATE TRIGGER update_cart_updated_at
    BEFORE UPDATE ON cart
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_cart_items_updated_at ON cart_items;
CREATE TRIGGER update_cart_items_updated_at
    BEFORE UPDATE ON cart_items
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items ENABLE ROW LEVEL SECURITY;

-- PRODUCTS: Everyone can view active products, only admins can edit
CREATE POLICY "Anyone can view active products"
    ON products FOR SELECT
    USING (status = 'active');

CREATE POLICY "Admins can manage all products"
    ON products FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.raw_user_meta_data->>'role' = 'admin'
        )
    );

-- VARIANTS: Everyone can view, only admins can edit
CREATE POLICY "Anyone can view product variants"
    ON product_variants FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM products
            WHERE products.id = product_variants.product_id
            AND products.status = 'active'
        )
    );

CREATE POLICY "Admins can manage variants"
    ON product_variants FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.raw_user_meta_data->>'role' = 'admin'
        )
    );

-- CART: Users can manage their own cart
CREATE POLICY "Users can view their own cart"
    ON cart FOR SELECT
    USING (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can create cart"
    ON cart FOR INSERT
    WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can update their cart"
    ON cart FOR UPDATE
    USING (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can delete their cart"
    ON cart FOR DELETE
    USING (auth.uid() = user_id OR user_id IS NULL);

-- CART ITEMS: Users can manage items in their cart
CREATE POLICY "Users can view their cart items"
    ON cart_items FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM cart
            WHERE cart.id = cart_items.cart_id
            AND (cart.user_id = auth.uid() OR cart.user_id IS NULL)
        )
    );

CREATE POLICY "Users can add items to cart"
    ON cart_items FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM cart
            WHERE cart.id = cart_items.cart_id
            AND (cart.user_id = auth.uid() OR cart.user_id IS NULL)
        )
    );

CREATE POLICY "Users can update cart items"
    ON cart_items FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM cart
            WHERE cart.id = cart_items.cart_id
            AND (cart.user_id = auth.uid() OR cart.user_id IS NULL)
        )
    );

CREATE POLICY "Users can delete cart items"
    ON cart_items FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM cart
            WHERE cart.id = cart_items.cart_id
            AND (cart.user_id = auth.uid() OR cart.user_id IS NULL)
        )
    );

-- =====================================================
-- SEED DATA: 3 Mock Products
-- =====================================================

-- Insert Products
INSERT INTO products (id, title, description, price, images, category, is_member_exclusive, status) VALUES
(
    'prod-001',
    'Godspeed Pro Hoodie',
    'Premium heavyweight hoodie with embroidered Godspeed logo. Perfect for pre-game warmups and casual wear.',
    6500, -- $65.00
    ARRAY['/images/products/hoodie-black.jpg', '/images/products/hoodie-detail.jpg'],
    'Apparel',
    false,
    'active'
),
(
    'prod-002',
    'Elite Performance Socks',
    'High-performance basketball socks with arch support and moisture-wicking technology.',
    1800, -- $18.00
    ARRAY['/images/products/socks-black.jpg'],
    'Apparel',
    true,
    'active'
),
(
    'prod-003',
    'Shooter Shirt',
    'Lightweight shooting shirt designed for pre-game warmups. Breathable mesh fabric.',
    4500, -- $45.00
    ARRAY['/images/products/shooter-black.jpg', '/images/products/shooter-white.jpg'],
    'Apparel',
    false,
    'active'
);

-- Insert Variants for Godspeed Pro Hoodie
INSERT INTO product_variants (product_id, size, color, stock_quantity, sku) VALUES
('prod-001', 'S', 'Black', 15, 'GS-HOOD-BLK-S'),
('prod-001', 'M', 'Black', 25, 'GS-HOOD-BLK-M'),
('prod-001', 'L', 'Black', 30, 'GS-HOOD-BLK-L'),
('prod-001', 'XL', 'Black', 20, 'GS-HOOD-BLK-XL');

-- Insert Variants for Elite Performance Socks
INSERT INTO product_variants (product_id, size, color, stock_quantity, sku) VALUES
('prod-002', 'S/M', 'Black', 50, 'GS-SOCK-BLK-SM'),
('prod-002', 'L/XL', 'Black', 45, 'GS-SOCK-BLK-LXL'),
('prod-002', 'S/M', 'White', 40, 'GS-SOCK-WHT-SM'),
('prod-002', 'L/XL', 'White', 35, 'GS-SOCK-WHT-LXL');

-- Insert Variants for Shooter Shirt
INSERT INTO product_variants (product_id, size, color, stock_quantity, sku) VALUES
('prod-003', 'M', 'Black', 20, 'GS-SHOOT-BLK-M'),
('prod-003', 'L', 'Black', 25, 'GS-SHOOT-BLK-L'),
('prod-003', 'XL', 'Black', 18, 'GS-SHOOT-BLK-XL'),
('prod-003', 'M', 'White', 22, 'GS-SHOOT-WHT-M'),
('prod-003', 'L', 'White', 28, 'GS-SHOOT-WHT-L');

-- =====================================================
-- COMMENTS
-- =====================================================
COMMENT ON TABLE products IS 'Product catalog for Pro Shop';
COMMENT ON TABLE product_variants IS 'Product variants with size, color, and inventory';
COMMENT ON TABLE cart IS 'Shopping cart sessions';
COMMENT ON TABLE cart_items IS 'Line items in shopping carts';
COMMENT ON COLUMN products.price IS 'Price in cents (e.g., 6500 = $65.00)';
COMMENT ON COLUMN products.is_member_exclusive IS 'Only available to Godspeed members';
-- =====================================================
-- SUPPLIER SYNC ARCHITECTURE - EXTERNAL INVENTORY
-- =====================================================
-- Purpose: Add supplier tracking to product variants
-- Use Case: Manage custom Godspeed apparel on Nike/NB blanks
-- =====================================================

-- Add supplier columns to product_variants table
ALTER TABLE product_variants
ADD COLUMN IF NOT EXISTS supplier_name VARCHAR(100),
ADD COLUMN IF NOT EXISTS supplier_url TEXT,
ADD COLUMN IF NOT EXISTS supplier_sku VARCHAR(100),
ADD COLUMN IF NOT EXISTS low_stock_threshold INTEGER DEFAULT 5;

-- Add indexes for supplier queries
CREATE INDEX IF NOT EXISTS idx_variants_supplier_name ON product_variants(supplier_name);
CREATE INDEX IF NOT EXISTS idx_variants_supplier_sku ON product_variants(supplier_sku);
CREATE INDEX IF NOT EXISTS idx_variants_low_stock ON product_variants(stock_quantity, low_stock_threshold);

-- Add comments
COMMENT ON COLUMN product_variants.supplier_name IS 'External supplier (e.g., Nike, New Balance, Fourthwall)';
COMMENT ON COLUMN product_variants.supplier_url IS 'Link to source item for reordering';
COMMENT ON COLUMN product_variants.supplier_sku IS 'Supplier-specific style code';
COMMENT ON COLUMN product_variants.low_stock_threshold IS 'Alert threshold for low inventory';

-- =====================================================
-- LOW STOCK ALERT VIEW
-- =====================================================
-- View to easily identify variants that need reordering
CREATE OR REPLACE VIEW low_stock_variants AS
SELECT 
    pv.id,
    pv.sku,
    p.title AS product_title,
    pv.size,
    pv.color,
    pv.stock_quantity,
    pv.low_stock_threshold,
    pv.supplier_name,
    pv.supplier_url,
    pv.supplier_sku,
    (pv.low_stock_threshold - pv.stock_quantity) AS units_needed
FROM product_variants pv
JOIN products p ON pv.product_id = p.id
WHERE pv.stock_quantity <= pv.low_stock_threshold
AND pv.is_active = true
ORDER BY pv.stock_quantity ASC;

COMMENT ON VIEW low_stock_variants IS 'Variants that need reordering based on low stock threshold';

-- =====================================================
-- UPDATE EXISTING SEED DATA WITH SUPPLIER INFO
-- =====================================================

-- Update Godspeed Pro Hoodie variants (custom printed on Nike blanks)
UPDATE product_variants
SET 
    supplier_name = 'Nike',
    supplier_url = 'https://www.nike.com/t/sportswear-club-fleece-pullover-hoodie',
    supplier_sku = 'BV2654-010',
    low_stock_threshold = 5
WHERE product_id = 'prod-001';

-- Update Elite Performance Socks (custom printed on Nike socks)
UPDATE product_variants
SET 
    supplier_name = 'Nike',
    supplier_url = 'https://www.nike.com/t/everyday-plus-cushioned-training-crew-socks',
    supplier_sku = 'SX7666-010',
    low_stock_threshold = 10
WHERE product_id = 'prod-002';

-- Update Shooter Shirt (custom printed on New Balance blanks)
UPDATE product_variants
SET 
    supplier_name = 'New Balance',
    supplier_url = 'https://www.newbalance.com/pd/nb-athletics-shooting-shirt',
    supplier_sku = 'MT11550-BK',
    low_stock_threshold = 8
WHERE product_id = 'prod-003';

-- =====================================================
-- FUNCTION: Check if variant needs reordering
-- =====================================================
CREATE OR REPLACE FUNCTION needs_reorder(variant_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    current_stock INTEGER;
    threshold INTEGER;
BEGIN
    SELECT stock_quantity, low_stock_threshold
    INTO current_stock, threshold
    FROM product_variants
    WHERE id = variant_id;
    
    RETURN current_stock <= threshold;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION needs_reorder IS 'Check if a variant needs to be reordered from supplier';

-- =====================================================
-- STRICT COLOR FILTER: Black & White Only
-- =====================================================
-- This ensures only Black and White variants are shown in storefront

-- Add check constraint to enforce color policy (optional, can be removed if you want flexibility)
-- ALTER TABLE product_variants
-- ADD CONSTRAINT check_color_policy 
-- CHECK (color IN ('Black', 'White') OR color IS NULL);

-- Create view for storefront products (Black & White only)
CREATE OR REPLACE VIEW storefront_products AS
SELECT 
    p.*,
    json_agg(
        json_build_object(
            'id', pv.id,
            'size', pv.size,
            'color', pv.color,
            'stock_quantity', pv.stock_quantity,
            'sku', pv.sku,
            'price_override', pv.price_override
        )
    ) AS variants
FROM products p
LEFT JOIN product_variants pv ON p.id = pv.product_id
WHERE p.status = 'active'
AND pv.is_active = true
AND pv.color IN ('Black', 'White')
GROUP BY p.id;

COMMENT ON VIEW storefront_products IS 'Products with Black & White variants only for public storefront';
-- =====================================================
-- EMERGENCY PRODUCT RECOVERY - SEED DATA
-- =====================================================
-- Purpose: Restore 3 visible products to Store immediately
-- Run this in Supabase SQL Editor NOW
-- =====================================================

-- Insert 3 products with working Unsplash images
INSERT INTO products (title, description, price, status, images, category, is_member_exclusive)
VALUES
(
    'Godspeed Pro Hoodie',
    'Heavyweight cotton blend hoodie designed for comfort and warmth. Features the signature Godspeed branding.',
    6500, -- $65.00
    'active',
    ARRAY['https://images.unsplash.com/photo-1556906781-9a412961c28c?auto=format&fit=crop&w=800&q=80'],
    'Apparel',
    false
),
(
    'Elite Shooter Shirt',
    'Pre-game warmup shirt with moisture-wicking fabric. Perfect for training sessions.',
    4500, -- $45.00
    'active',
    ARRAY['https://images.unsplash.com/photo-1519861531473-920026393112?auto=format&fit=crop&w=800&q=80'],
    'Apparel',
    false
),
(
    'Court Performance Shorts',
    'Mesh performance shorts built for the daily grind. Deep pockets and secure waistband.',
    3500, -- $35.00
    'active',
    ARRAY['https://images.unsplash.com/photo-1591191538573-86c477e6fa3a?auto=format&fit=crop&w=800&q=80'],
    'Apparel',
    false
)
ON CONFLICT (id) DO NOTHING;

-- Add variants for each product
INSERT INTO product_variants (product_id, sku, size, color, stock_quantity, is_active)
SELECT 
    p.id,
    'GS-' || UPPER(SUBSTRING(p.title FROM 1 FOR 4)) || '-' || s.size || '-BLK',
    s.size,
    'Black',
    25,
    true
FROM products p
CROSS JOIN (VALUES ('S'), ('M'), ('L'), ('XL')) AS s(size)
WHERE p.title IN ('Godspeed Pro Hoodie', 'Elite Shooter Shirt', 'Court Performance Shorts')
ON CONFLICT (sku) DO NOTHING;

-- Verify products are visible
SELECT 
    p.id,
    p.title,
    p.price,
    p.status,
    COUNT(pv.id) as variant_count
FROM products p
LEFT JOIN product_variants pv ON p.id = pv.product_id
WHERE p.status = 'active'
GROUP BY p.id, p.title, p.price, p.status;
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
DECLARE
    affected_purchase_id UUID;
BEGIN
    -- Handle both INSERT/UPDATE (NEW) and DELETE (OLD)
    IF TG_OP = 'DELETE' THEN
        affected_purchase_id := OLD.purchase_id;
    ELSE
        affected_purchase_id := NEW.purchase_id;
    END IF;
    
    -- Update hours_used for the affected purchase
    UPDATE training_purchases
    SET hours_used = (
        SELECT COALESCE(SUM(hours_used), 0)
        FROM training_attendance
        WHERE purchase_id = affected_purchase_id
    ),
    updated_at = NOW()
    WHERE id = affected_purchase_id;
    
    -- Return appropriate row
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
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
-- =====================================================
-- PRODUCT VARIANTS RLS POLICY FIX
-- =====================================================
-- Purpose: Update RLS policies for product_variants table
-- Changes:
--   - Allow public viewing of ALL variants (not just active)
--   - Only admin users (via JWT claim) can modify
--   - Service_role automatically bypasses RLS (no policy needed)
-- =====================================================

-- Step 1: Ensure RLS is enabled (should already be enabled, but safe to run)
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;

-- Step 2: Drop existing conflicting policies from migration 002
DROP POLICY IF EXISTS "Anyone can view active variants" ON public.product_variants;
DROP POLICY IF EXISTS "Admins can manage variants" ON public.product_variants;

-- Step 3: Allow everyone (even not logged in) to see all product variants
-- This replaces the previous policy that only showed active variants
CREATE POLICY product_variants_public_select 
ON public.product_variants 
FOR SELECT 
TO anon, authenticated 
USING (true);

-- Step 4: Allow admin users (via JWT claim) to insert variants
-- Matches existing pattern in 002_ecommerce_schema.sql for products table
CREATE POLICY product_variants_admin_insert
ON public.product_variants 
FOR INSERT 
TO authenticated 
WITH CHECK ((auth.jwt() ->> 'role') = 'admin');

-- Step 5: Allow admin users (via JWT claim) to update variants
CREATE POLICY product_variants_admin_update
ON public.product_variants 
FOR UPDATE 
TO authenticated 
USING ((auth.jwt() ->> 'role') = 'admin')
WITH CHECK ((auth.jwt() ->> 'role') = 'admin');

-- Step 6: Allow admin users (via JWT claim) to delete variants
CREATE POLICY product_variants_admin_delete
ON public.product_variants 
FOR DELETE 
TO authenticated 
USING ((auth.jwt() ->> 'role') = 'admin');

-- Step 7: Add performance index (already exists, but safe with IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS idx_product_variants_product_id 
ON public.product_variants(product_id);
-- =====================================================
-- SEED TRAINING DATA
-- =====================================================
-- Purpose: Populate sample training packages, purchases, and attendance
-- Run this after migration 006_parent_portal_training.sql
-- =====================================================

-- =====================================================
-- TRAINING PACKAGES
-- =====================================================

-- Insert sample training packages
INSERT INTO training_packages (id, name, description, total_hours, price, program_type, is_active)
VALUES
    ('550e8400-e29b-41d4-a716-446655440001', 'Skills Development - 10 Hours', 'Individual skills training package', 10.00, 500.00, 'skills', true),
    ('550e8400-e29b-41d4-a716-446655440002', 'Skills Development - 20 Hours', 'Extended skills training package', 20.00, 900.00, 'skills', true),
    ('550e8400-e29b-41d4-a716-446655440003', 'Elite Training - 15 Hours', 'Advanced training for competitive players', 15.00, 750.00, 'elite', true),
    ('550e8400-e29b-41d4-a716-446655440004', 'Practice Sessions - 5 Hours', 'Team practice sessions', 5.00, 250.00, 'practice', true),
    ('550e8400-e29b-41d4-a716-446655440005', 'Monthly Training Pass', 'Unlimited training for one month', 30.00, 1200.00, 'monthly', true)
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- SAMPLE TRAINING SESSIONS
-- =====================================================

-- Insert sample training sessions for the next 30 days
-- Note: These will need parent_accounts and training_purchases to be created first
-- This is a template - adjust dates as needed

DO $$
DECLARE
    session_date DATE;
    session_id UUID;
BEGIN
    -- Create sessions for next 30 days
    FOR i IN 0..29 LOOP
        session_date := CURRENT_DATE + i;
        
        -- Skip weekends (optional - remove if you want weekend sessions)
        IF EXTRACT(DOW FROM session_date) IN (0, 6) THEN
            CONTINUE;
        END IF;
        
        -- Morning Skills Session (9:00 AM - 10:30 AM)
        INSERT INTO training_sessions (
            session_date,
            start_time,
            end_time,
            session_type,
            title,
            location,
            description,
            status
        ) VALUES (
            session_date,
            '09:00:00',
            '10:30:00',
            'skills',
            'Skills Development Session',
            'Main Gym',
            'Individual skills training focusing on fundamentals',
            'scheduled'
        );
        
        -- Afternoon Practice Session (4:00 PM - 6:00 PM)
        IF EXTRACT(DOW FROM session_date) IN (1, 3, 5) THEN
            INSERT INTO training_sessions (
                session_date,
                start_time,
                end_time,
                session_type,
                title,
                location,
                description,
                status
            ) VALUES (
                session_date,
                '16:00:00',
                '18:00:00',
                'practice',
                'Team Practice',
                'Main Gym',
                'Team practice session',
                'scheduled'
            );
        END IF;
        
        -- Evening Elite Session (6:30 PM - 8:00 PM) - Tuesdays and Thursdays
        IF EXTRACT(DOW FROM session_date) IN (2, 4) THEN
            INSERT INTO training_sessions (
                session_date,
                start_time,
                end_time,
                session_type,
                title,
                location,
                description,
                status
            ) VALUES (
                session_date,
                '18:30:00',
                '20:00:00',
                'elite',
                'Elite Training Session',
                'Main Gym',
                'Advanced training for competitive players',
                'scheduled'
            );
        END IF;
    END LOOP;
END $$;

-- =====================================================
-- NOTES FOR MANUAL DATA ENTRY
-- =====================================================

-- To create sample purchases and attendance:
-- 1. First, ensure you have parent_accounts created (via user registration)
-- 2. Then create training_purchases:
-- 
-- INSERT INTO training_purchases (
--     parent_id,
--     athlete_id,
--     package_id,
--     hours_purchased,
--     price_paid,
--     status,
--     purchase_date
-- ) VALUES (
--     '<parent_account_id>',
--     '<athlete_id>',
--     '550e8400-e29b-41d4-a716-446655440001', -- 10 hour package
--     10.00,
--     500.00,
--     'active',
--     NOW()
-- );
--
-- 3. To record attendance:
--
-- INSERT INTO training_attendance (
--     purchase_id,
--     session_id,
--     athlete_id,
--     hours_used,
--     attendance_status
-- ) VALUES (
--     '<purchase_id>',
--     '<session_id>',
--     '<athlete_id>',
--     1.5,
--     'present'
-- );
--
-- Note: The hours_used in training_purchases will automatically update
-- via the trigger when attendance is recorded.

-- =====================================================
-- HELPER QUERIES FOR TESTING
-- =====================================================

-- View all training packages
-- SELECT * FROM training_packages WHERE is_active = true;

-- View upcoming sessions
-- SELECT * FROM training_sessions 
-- WHERE session_date >= CURRENT_DATE 
-- AND status = 'scheduled'
-- ORDER BY session_date, start_time;

-- View purchases for a parent (replace with actual parent_id)
-- SELECT tp.*, tpk.name as package_name
-- FROM training_purchases tp
-- LEFT JOIN training_packages tpk ON tp.package_id = tpk.id
-- WHERE tp.parent_id = '<parent_id>'
-- ORDER BY tp.purchase_date DESC;

-- View attendance for a purchase
-- SELECT ta.*, ts.session_date, ts.title as session_title
-- FROM training_attendance ta
-- JOIN training_sessions ts ON ta.session_id = ts.id
-- WHERE ta.purchase_id = '<purchase_id>'
-- ORDER BY ts.session_date DESC;
