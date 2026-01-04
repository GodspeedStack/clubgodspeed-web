import React, { useState } from 'react';
import { addToCart } from '../../lib/cart';

/**
 * ProductCard - Minimalist High-Contrast Product Display
 * 
 * Features:
 * - 4:5 aspect ratio portrait images
 * - Bold uppercase titles
 * - Subtle gray pricing
 * - "Quick Add" button on hover
 * - Variant selection
 */

export default function ProductCard({ product }) {
    const [selectedVariant, setSelectedVariant] = useState(product.variants?.[0]);
    const [isHovered, setIsHovered] = useState(false);

    // Format price from cents to dollars
    const formatPrice = (cents) => {
        return `$${(cents / 100).toFixed(2)}`;
    };

    // Get unique sizes and colors
    const sizes = product.variants ? [...new Set(product.variants.map(v => v.size))] : [];
    const colors = product.variants ? [...new Set(product.variants.map(v => v.color))] : [];

    // Check stock
    const inStock = selectedVariant && selectedVariant.stock_quantity > 0;

    const handleQuickAdd = async (e) => {
        e.stopPropagation();
        
        if (!selectedVariant) {
            console.error('No variant selected');
            return;
        }

        if (!inStock) {
            alert('This item is out of stock');
            return;
        }

        try {
            const result = await addToCart(selectedVariant.id, 1);
            if (result.success) {
                // Show success feedback
                const button = e.target;
                const originalText = button.textContent;
                button.textContent = 'ADDED!';
                button.style.backgroundColor = '#22c55e';
                
                setTimeout(() => {
                    button.textContent = originalText;
                    button.style.backgroundColor = '#ffffff';
                }, 1500);
                
                // Dispatch custom event to update cart count
                window.dispatchEvent(new CustomEvent('cartUpdated'));
            } else {
                alert('Failed to add to cart. Please try again.');
            }
        } catch (error) {
            console.error('Error adding to cart:', error);
            alert('An error occurred. Please try again.');
        }
    };

    return (
        <div
            className="product-card"
            style={styles.card}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {/* Product Image - 4:5 Aspect Ratio */}
            <div style={styles.imageContainer}>
                <img
                    src={product.images?.[0] || '/images/placeholder-product.jpg'}
                    alt={product.title}
                    style={styles.image}
                />

                {/* Member Exclusive Badge */}
                {product.is_member_exclusive && (
                    <div style={styles.memberBadge}>
                        MEMBERS ONLY
                    </div>
                )}

                {/* Quick Add Button (Hover) */}
                {isHovered && inStock && (
                    <div style={styles.quickAddOverlay}>
                        <button
                            onClick={handleQuickAdd}
                            style={styles.quickAddButton}
                        >
                            QUICK ADD
                        </button>
                    </div>
                )}

                {/* Out of Stock Overlay */}
                {!inStock && (
                    <div style={styles.outOfStockOverlay}>
                        <span style={styles.outOfStockText}>OUT OF STOCK</span>
                    </div>
                )}
            </div>

            {/* Product Info */}
            <div style={styles.info}>
                {/* Title - Bold Uppercase */}
                <h3 style={styles.title}>{product.title}</h3>

                {/* Price - Subtle Gray */}
                <div style={styles.price}>
                    {formatPrice(product.price)}
                </div>

                {/* Variant Selectors */}
                {(sizes.length > 1 || colors.length > 1) && (
                    <div style={styles.variants}>
                        {/* Size Selector */}
                        {sizes.length > 1 && (
                            <div style={styles.variantGroup}>
                                <label style={styles.variantLabel}>SIZE</label>
                                <div style={styles.variantOptions}>
                                    {sizes.map(size => {
                                        const variant = product.variants.find(v =>
                                            v.size === size &&
                                            v.color === (selectedVariant?.color || colors[0])
                                        );
                                        const isSelected = selectedVariant?.size === size;
                                        const isAvailable = variant && variant.stock_quantity > 0;

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
                                            v.size === (selectedVariant?.size || sizes[0])
                                        );
                                        const isSelected = selectedVariant?.color === color;
                                        const isAvailable = variant && variant.stock_quantity > 0;

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
                )}
            </div>
        </div>
    );
}

// Minimalist High-Contrast Styles
const styles = {
    card: {
        backgroundColor: '#ffffff',
        border: '1px solid #e5e5e5',
        borderRadius: '0',
        overflow: 'hidden',
        transition: 'all 0.3s ease',
        cursor: 'pointer'
    },
    imageContainer: {
        position: 'relative',
        width: '100%',
        paddingBottom: '125%', // 4:5 aspect ratio (5/4 = 1.25)
        overflow: 'hidden',
        backgroundColor: '#f5f5f5'
    },
    image: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        transition: 'transform 0.3s ease'
    },
    memberBadge: {
        position: 'absolute',
        top: '12px',
        right: '12px',
        backgroundColor: '#000000',
        color: '#ffffff',
        padding: '6px 12px',
        fontSize: '10px',
        fontWeight: '700',
        letterSpacing: '0.1em',
        zIndex: 2
    },
    quickAddOverlay: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: '20px',
        background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-end',
        zIndex: 3,
        animation: 'fadeIn 0.2s ease'
    },
    quickAddButton: {
        backgroundColor: '#ffffff',
        color: '#000000',
        border: 'none',
        padding: '12px 32px',
        fontSize: '12px',
        fontWeight: '700',
        letterSpacing: '0.1em',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        fontFamily: 'Inter, sans-serif'
    },
    outOfStockOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2
    },
    outOfStockText: {
        fontSize: '14px',
        fontWeight: '700',
        color: '#000000',
        letterSpacing: '0.1em'
    },
    info: {
        padding: '20px'
    },
    title: {
        fontSize: '14px',
        fontWeight: '700',
        color: '#000000',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        margin: '0 0 8px 0',
        lineHeight: '1.4',
        minHeight: '40px'
    },
    price: {
        fontSize: '14px',
        fontWeight: '400',
        color: '#666666',
        marginBottom: '16px'
    },
    variants: {
        marginTop: '12px'
    },
    variantGroup: {
        marginBottom: '12px'
    },
    variantLabel: {
        fontSize: '10px',
        fontWeight: '700',
        color: '#999999',
        letterSpacing: '0.1em',
        display: 'block',
        marginBottom: '8px'
    },
    variantOptions: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: '6px'
    },
    variantButton: {
        backgroundColor: '#ffffff',
        color: '#000000',
        border: '1px solid #e5e5e5',
        padding: '6px 12px',
        fontSize: '11px',
        fontWeight: '600',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        fontFamily: 'Inter, sans-serif'
    },
    variantButtonSelected: {
        backgroundColor: '#000000',
        color: '#ffffff',
        borderColor: '#000000'
    },
    variantButtonDisabled: {
        opacity: 0.3,
        cursor: 'not-allowed',
        textDecoration: 'line-through'
    }
};
