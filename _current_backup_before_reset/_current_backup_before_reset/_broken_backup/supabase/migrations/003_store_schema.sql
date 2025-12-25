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
