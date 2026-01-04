import React, { useState, useEffect } from 'react';

/**
 * Cart Sidebar Component
 * Displays shopping cart with items, quantities, and checkout
 */

export default function CartSidebar({ isOpen, onClose }) {
    const [cart, setCart] = useState([]);
    const [total, setTotal] = useState(0);

    useEffect(() => {
        if (!isOpen) return;

        // Load cart from cart manager
        if (window.cartManager) {
            updateCart();
            const unsubscribe = window.cartManager.subscribe((cartItems, count, cartTotal) => {
                setCart(cartItems);
                setTotal(cartTotal);
            });
            return unsubscribe;
        } else {
            // Try to load cart manager
            const script = document.createElement('script');
            script.src = '/src/lib/cartContext.js';
            script.onload = () => {
                if (window.cartManager) {
                    updateCart();
                    window.cartManager.subscribe((cartItems, count, cartTotal) => {
                        setCart(cartItems);
                        setTotal(cartTotal);
                    });
                }
            };
            document.head.appendChild(script);
        }
    }, [isOpen]);

    const updateCart = () => {
        if (window.cartManager) {
            const items = window.cartManager.getItems();
            const cartTotal = window.cartManager.getTotal();
            setCart(items);
            setTotal(cartTotal);
        }
    };

    const updateQuantity = (productId, variantId, newQuantity) => {
        if (window.cartManager) {
            window.cartManager.updateQuantity(productId, variantId, newQuantity);
        }
    };

    const removeItem = (productId, variantId) => {
        if (window.cartManager) {
            window.cartManager.removeItem(productId, variantId);
        }
    };

    const handleCheckout = () => {
        // TODO: Implement checkout flow
        alert('Checkout functionality coming soon!');
    };

    if (!isOpen) return null;

    return (
        <>
            {/* Backdrop */}
            <div
                style={styles.backdrop}
                onClick={onClose}
            />

            {/* Sidebar */}
            <div style={styles.sidebar}>
                {/* Header */}
                <div style={styles.header}>
                    <h2 style={styles.title}>Your Cart</h2>
                    <button
                        onClick={onClose}
                        style={styles.closeButton}
                        aria-label="Close cart"
                    >
                        ×
                    </button>
                </div>

                {/* Cart Items */}
                <div style={styles.itemsContainer}>
                    {cart.length === 0 ? (
                        <div style={styles.empty}>
                            <p style={styles.emptyText}>Your cart is empty.</p>
                        </div>
                    ) : (
                        cart.map((item, index) => (
                            <div key={index} style={styles.item}>
                                <img
                                    src={item.image || '/assets/placeholder.png'}
                                    alt={item.productName}
                                    style={styles.itemImage}
                                />
                                <div style={styles.itemDetails}>
                                    <h3 style={styles.itemName}>{item.productName}</h3>
                                    {item.variantName && (
                                        <p style={styles.itemVariant}>{item.variantName}</p>
                                    )}
                                    <div style={styles.itemControls}>
                                        <div style={styles.quantityControls}>
                                            <button
                                                onClick={() => updateQuantity(item.productId, item.variantId, item.quantity - 1)}
                                                style={styles.quantityButton}
                                            >
                                                −
                                            </button>
                                            <span style={styles.quantity}>{item.quantity}</span>
                                            <button
                                                onClick={() => updateQuantity(item.productId, item.variantId, item.quantity + 1)}
                                                style={styles.quantityButton}
                                            >
                                                +
                                            </button>
                                        </div>
                                        <div style={styles.itemPrice}>
                                            ${(item.price * item.quantity).toFixed(2)}
                                        </div>
                                    </div>
                                </div>
                                <button
                                    onClick={() => removeItem(item.productId, item.variantId)}
                                    style={styles.removeButton}
                                    aria-label="Remove item"
                                >
                                    ×
                                </button>
                            </div>
                        ))
                    )}
                </div>

                {/* Footer */}
                {cart.length > 0 && (
                    <div style={styles.footer}>
                        <div style={styles.total}>
                            <span style={styles.totalLabel}>Total:</span>
                            <span style={styles.totalAmount}>${total.toFixed(2)}</span>
                        </div>
                        <button
                            onClick={handleCheckout}
                            style={styles.checkoutButton}
                        >
                            CHECKOUT
                        </button>
                    </div>
                )}
            </div>
        </>
    );
}

const styles = {
    backdrop: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        zIndex: 9998,
        animation: 'fadeIn 0.3s ease'
    },
    sidebar: {
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: '100%',
        maxWidth: '400px',
        backgroundColor: '#ffffff',
        boxShadow: '-4px 0 20px rgba(0, 0, 0, 0.1)',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        animation: 'slideInRight 0.3s ease'
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '24px',
        borderBottom: '1px solid #e5e5e5'
    },
    title: {
        fontSize: '24px',
        fontWeight: '700',
        color: '#000000',
        margin: 0,
        fontFamily: 'Inter, sans-serif'
    },
    closeButton: {
        background: 'none',
        border: 'none',
        fontSize: '32px',
        color: '#666',
        cursor: 'pointer',
        padding: '0',
        width: '32px',
        height: '32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '50%',
        transition: 'all 0.2s ease'
    },
    itemsContainer: {
        flex: 1,
        overflowY: 'auto',
        padding: '16px'
    },
    empty: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '200px'
    },
    emptyText: {
        fontSize: '16px',
        color: '#999',
        fontFamily: 'Inter, sans-serif'
    },
    item: {
        display: 'flex',
        gap: '16px',
        padding: '16px',
        borderBottom: '1px solid #f0f0f0',
        position: 'relative'
    },
    itemImage: {
        width: '80px',
        height: '80px',
        objectFit: 'cover',
        borderRadius: '8px',
        backgroundColor: '#f5f5f5'
    },
    itemDetails: {
        flex: 1
    },
    itemName: {
        fontSize: '14px',
        fontWeight: '600',
        color: '#000',
        margin: '0 0 4px 0',
        fontFamily: 'Inter, sans-serif'
    },
    itemVariant: {
        fontSize: '12px',
        color: '#666',
        margin: '0 0 8px 0',
        fontFamily: 'Inter, sans-serif'
    },
    itemControls: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
    },
    quantityControls: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        border: '1px solid #e5e5e5',
        borderRadius: '8px',
        padding: '4px'
    },
    quantityButton: {
        background: 'none',
        border: 'none',
        width: '28px',
        height: '28px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        fontSize: '18px',
        color: '#000',
        fontFamily: 'Inter, sans-serif'
    },
    quantity: {
        fontSize: '14px',
        fontWeight: '600',
        minWidth: '24px',
        textAlign: 'center',
        fontFamily: 'Inter, sans-serif'
    },
    itemPrice: {
        fontSize: '16px',
        fontWeight: '700',
        color: '#000',
        fontFamily: 'Inter, sans-serif'
    },
    removeButton: {
        position: 'absolute',
        top: '8px',
        right: '8px',
        background: 'none',
        border: 'none',
        fontSize: '24px',
        color: '#999',
        cursor: 'pointer',
        width: '24px',
        height: '24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '50%',
        transition: 'all 0.2s ease'
    },
    footer: {
        padding: '24px',
        borderTop: '1px solid #e5e5e5',
        backgroundColor: '#f9f9f9'
    },
    total: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '16px'
    },
    totalLabel: {
        fontSize: '18px',
        fontWeight: '600',
        color: '#000',
        fontFamily: 'Inter, sans-serif'
    },
    totalAmount: {
        fontSize: '24px',
        fontWeight: '700',
        color: '#000',
        fontFamily: 'Inter, sans-serif'
    },
    checkoutButton: {
        width: '100%',
        padding: '16px',
        backgroundColor: '#2563eb',
        color: '#ffffff',
        border: 'none',
        borderRadius: '12px',
        fontSize: '16px',
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        cursor: 'pointer',
        transition: 'all 0.3s ease',
        fontFamily: 'Inter, sans-serif',
        boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)'
    }
};
