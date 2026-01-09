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
