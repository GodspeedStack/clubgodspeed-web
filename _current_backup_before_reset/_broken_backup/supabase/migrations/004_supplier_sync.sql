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
