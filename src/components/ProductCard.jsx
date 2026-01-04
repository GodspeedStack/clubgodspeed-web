import React, { useState } from 'react';

/**
 * ProductCard - E-Commerce Product Display Component
 * 
 * Features:
 * - Godspeed Design System (Black background, white text)
 * - 4:5 aspect ratio for product images
 * - Variant selection (size, color)
 * - Add to cart functionality
 * - Hover effects and animations
 * - Low stock indicators
 * - Sale price display
 */

export default function ProductCard({ product }) {
    const [selectedVariant, setSelectedVariant] = useState(product.variants[0]);
    const [isHovered, setIsHovered] = useState(false);

    // Calculate price
    const price = selectedVariant.price_override || product.base_price;
    const comparePrice = selectedVariant.compare_at_price;
    const onSale = comparePrice && comparePrice > price;
    const discount = onSale ? Math.round(((comparePrice - price) / comparePrice) * 100) : 0;

    // Get unique sizes and colors
    const sizes = [...new Set(product.variants.map(v => v.size))];
    const colors = [...new Set(product.variants.map(v => v.color))];

    // Check stock
    const inStock = selectedVariant.inventory_count > 0;
    const lowStock = selectedVariant.inventory_count > 0 && selectedVariant.inventory_count <= selectedVariant.low_stock_threshold;

    const handleAddToCart = () => {
        // Load cart manager
        if (typeof window.cartManager === 'undefined') {
            // Try to load cart context
            const script = document.createElement('script');
            script.src = '/src/lib/cartContext.js';
            script.onload = () => {
                if (window.cartManager) {
                    window.cartManager.addItem(product, selectedVariant, 1);
                    showCartNotification();
                }
            };
            document.head.appendChild(script);
        } else {
            window.cartManager.addItem(product, selectedVariant, 1);
            showCartNotification();
        }
    };

    const showCartNotification = () => {
        // Show a brief notification that item was added
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #000;
            color: #fff;
            padding: 16px 24px;
            border-radius: 8px;
            font-weight: 600;
            z-index: 10000;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            animation: slideIn 0.3s ease;
        `;
        notification.textContent = 'Added to cart';
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 2000);
    };

    return (
        <div
            className="product-card"
            style={styles.card}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {/* Product Image */}
            <div style={styles.imageContainer}>
                <img
                    src={selectedVariant.image_url || product.featured_image_url}
                    alt={product.title}
                    style={{
                        ...styles.image,
                        transform: isHovered ? 'scale(1.05)' : 'scale(1)'
                    }}
                />

                {/* Badges */}
                <div style={styles.badges}>
                    {onSale && (
                        <span style={styles.saleBadge}>
                            -{discount}%
                        </span>
                    )}
                    {product.is_featured && (
                        <span style={styles.featuredBadge}>
                            ⚡ FEATURED
                        </span>
                    )}
                    {lowStock && (
                        <span style={styles.lowStockBadge}>
                            LOW STOCK
                        </span>
                    )}
                </div>

                {/* Quick Add Overlay */}
                {isHovered && inStock && (
                    <div style={styles.quickAddOverlay}>
                        <button
                            onClick={handleAddToCart}
                            style={styles.quickAddButton}
                        >
                            QUICK ADD
                        </button>
                    </div>
                )}
            </div>

            {/* Product Info */}
            <div style={styles.info}>
                {/* Brand */}
                {product.brand && (
                    <div style={styles.brand}>{product.brand}</div>
                )}

                {/* Title */}
                <h3 style={styles.title}>{product.title}</h3>

                {/* Price */}
                <div style={styles.priceContainer}>
                    <span style={styles.price}>
                        ${price.toFixed(2)}
                    </span>
                    {onSale && (
                        <span style={styles.comparePrice}>
                            ${comparePrice.toFixed(2)}
                        </span>
                    )}
                </div>

                {/* Variant Selectors */}
                <div style={styles.variantSection}>
                    {/* Size Selector */}
                    {sizes.length > 1 && (
                        <div style={styles.variantGroup}>
                            <label style={styles.variantLabel}>SIZE</label>
                            <div style={styles.variantOptions}>
                                {sizes.map(size => {
                                    const variant = product.variants.find(v =>
                                        v.size === size &&
                                        v.color === selectedVariant.color
                                    );
                                    const isSelected = selectedVariant.size === size;
                                    const isAvailable = variant && variant.inventory_count > 0;

                                    return (
                                        <button
                                            key={size}
                                            onClick={() => variant && setSelectedVariant(variant)}
                                            disabled={!isAvailable}
                                            style={{
                                                ...styles.variantButton,
                                                ...(isSelected ? styles.variantButtonSelected : {}),
                                                ...(!isAvailable ? styles.variantButtonDisabled : {})
                                            }}
                                        >
                                            {size}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Color Selector */}
                    {colors.length > 1 && (
                        <div style={styles.variantGroup}>
                            <label style={styles.variantLabel}>COLOR</label>
                            <div style={styles.variantOptions}>
                                {colors.map(color => {
                                    const variant = product.variants.find(v =>
                                        v.color === color &&
                                        v.size === selectedVariant.size
                                    );
                                    const isSelected = selectedVariant.color === color;
                                    const isAvailable = variant && variant.inventory_count > 0;

                                    return (
                                        <button
                                            key={color}
                                            onClick={() => variant && setSelectedVariant(variant)}
                                            disabled={!isAvailable}
                                            style={{
                                                ...styles.variantButton,
                                                ...(isSelected ? styles.variantButtonSelected : {}),
                                                ...(!isAvailable ? styles.variantButtonDisabled : {})
                                            }}
                                        >
                                            {color}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* Add to Cart Button */}
                <button
                    onClick={handleAddToCart}
                    disabled={!inStock}
                    style={{
                        ...styles.addToCartButton,
                        ...(!inStock ? styles.addToCartButtonDisabled : {})
                    }}
                >
                    {inStock ? 'ADD TO CART' : 'OUT OF STOCK'}
                </button>
            </div>
        </div>
    );
}

// Godspeed Design System Styles
const styles = {
    card: {
        backgroundColor: '#000000',
        borderRadius: '16px',
        overflow: 'hidden',
        transition: 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        cursor: 'pointer'
    },
    imageContainer: {
        position: 'relative',
        width: '100%',
        paddingBottom: '125%', // 4:5 aspect ratio
        overflow: 'hidden',
        backgroundColor: '#1c1c1e'
    },
    image: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        transition: 'transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
    },
    badges: {
        position: 'absolute',
        top: '12px',
        left: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        zIndex: 2
    },
    saleBadge: {
        backgroundColor: '#ff3b30',
        color: '#ffffff',
        padding: '4px 10px',
        borderRadius: '4px',
        fontSize: '11px',
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: '0.05em'
    },
    featuredBadge: {
        backgroundColor: '#ffd60a',
        color: '#000000',
        padding: '4px 10px',
        borderRadius: '4px',
        fontSize: '11px',
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: '0.05em'
    },
    lowStockBadge: {
        backgroundColor: '#ff9500',
        color: '#ffffff',
        padding: '4px 10px',
        borderRadius: '4px',
        fontSize: '11px',
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: '0.05em'
    },
    quickAddOverlay: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: '20px',
        background: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-end',
        zIndex: 3
    },
    quickAddButton: {
        backgroundColor: '#ffffff',
        color: '#000000',
        border: 'none',
        padding: '12px 32px',
        borderRadius: '999px',
        fontSize: '13px',
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        fontFamily: 'Inter, sans-serif'
    },
    info: {
        padding: '20px'
    },
    brand: {
        fontSize: '11px',
        fontWeight: '700',
        color: '#86868b',
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        marginBottom: '8px'
    },
    title: {
        fontSize: '16px',
        fontWeight: '600',
        color: '#ffffff',
        margin: '0 0 12px 0',
        lineHeight: '1.3',
        minHeight: '40px'
    },
    priceContainer: {
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        marginBottom: '16px'
    },
    price: {
        fontSize: '20px',
        fontWeight: '700',
        color: '#ffffff',
        letterSpacing: '-0.02em'
    },
    comparePrice: {
        fontSize: '16px',
        fontWeight: '500',
        color: '#86868b',
        textDecoration: 'line-through'
    },
    variantSection: {
        marginBottom: '16px'
    },
    variantGroup: {
        marginBottom: '12px'
    },
    variantLabel: {
        fontSize: '10px',
        fontWeight: '700',
        color: '#86868b',
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        display: 'block',
        marginBottom: '8px'
    },
    variantOptions: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: '8px'
    },
    variantButton: {
        backgroundColor: 'transparent',
        color: '#ffffff',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        padding: '8px 16px',
        borderRadius: '8px',
        fontSize: '13px',
        fontWeight: '600',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        fontFamily: 'Inter, sans-serif'
    },
    variantButtonSelected: {
        backgroundColor: '#ffffff',
        color: '#000000',
        borderColor: '#ffffff'
    },
    variantButtonDisabled: {
        opacity: 0.3,
        cursor: 'not-allowed',
        textDecoration: 'line-through'
    },
    addToCartButton: {
        width: '100%',
        backgroundColor: '#0071e3',
        color: '#ffffff',
        border: 'none',
        padding: '14px',
        borderRadius: '12px',
        fontSize: '14px',
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        cursor: 'pointer',
        transition: 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        fontFamily: 'Inter, sans-serif',
        boxShadow: '0 4px 12px rgba(0, 113, 227, 0.3)'
    },
    addToCartButtonDisabled: {
        backgroundColor: '#2c2c2e',
        color: '#86868b',
        cursor: 'not-allowed',
        boxShadow: 'none'
    }
};
