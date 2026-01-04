import React, { useState, useEffect } from 'react';

/**
 * Cart Sidebar Component
 * Displays shopping cart with items, quantities, and checkout flow
 */

export default function CartSidebar({ isOpen, onClose }) {
    const [cart, setCart] = useState([]);
    const [total, setTotal] = useState(0);
    const [view, setView] = useState('cart'); // 'cart', 'checkout', 'success'
    const [loading, setLoading] = useState(false);

    // Checkout Form State
    const [formData, setFormData] = useState({
        email: '',
        name: '',
        address: '',
        city: '',
        zip: '',
        cardNumber: '',
        expiry: '',
        cvc: ''
    });

    const paymentKey = (typeof window !== 'undefined' && window.VITE_PAYMENT_PUBLISHABLE_KEY)
        ? window.VITE_PAYMENT_PUBLISHABLE_KEY
        : 'sb_publishable_T-kU6lCkgtioCub_2_NI0A_rWL27an0'; // Fallback to provided key

    useEffect(() => {
        if (!isOpen) return;
        setView('cart'); // Reset view on open

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

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const handleCheckout = () => {
        setView('checkout');
    };

    const handlePlaceOrder = async (e) => {
        e.preventDefault();
        setLoading(true);

        // Simulate API call / Payment Processing
        try {
            // In a real app, this would call your backend endpoint
            // const response = await fetch('/api/create-order', { ... });

            await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate network delay

            console.log('Order Data:', {
                items: cart,
                customer: formData,
                total: total
            });

            // Success
            if (window.cartManager) {
                window.cartManager.clear();
            }
            setView('success');
        } catch (error) {
            console.error('Checkout error:', error);
            alert('Payment failed. Please try again.');
        } finally {
            setLoading(false);
        }
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
                    <h2 style={styles.title}>
                        {view === 'cart' ? 'Your Cart' : view === 'checkout' ? 'Checkout' : 'Order Confirmed'}
                    </h2>
                    <button
                        onClick={onClose}
                        style={styles.closeButton}
                        aria-label="Close cart"
                    >
                        ×
                    </button>
                </div>

                {/* Content based on View */}
                <div style={styles.itemsContainer}>
                    {view === 'cart' && (
                        cart.length === 0 ? (
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
                        )
                    )}

                    {view === 'checkout' && (
                        <form id="checkout-form" onSubmit={handlePlaceOrder} style={styles.form}>
                            <h3 style={styles.sectionTitle}>Shipping Information</h3>
                            <input
                                type="email"
                                name="email"
                                placeholder="Email"
                                required
                                style={styles.input}
                                value={formData.email}
                                onChange={handleInputChange}
                            />
                            <input
                                type="text"
                                name="name"
                                placeholder="Full Name"
                                required
                                style={styles.input}
                                value={formData.name}
                                onChange={handleInputChange}
                            />
                            <input
                                type="text"
                                name="address"
                                placeholder="Address"
                                required
                                style={styles.input}
                                value={formData.address}
                                onChange={handleInputChange}
                            />
                            <div style={styles.row}>
                                <input
                                    type="text"
                                    name="city"
                                    placeholder="City"
                                    required
                                    style={{ ...styles.input, flex: 2 }}
                                    value={formData.city}
                                    onChange={handleInputChange}
                                />
                                <input
                                    type="text"
                                    name="zip"
                                    placeholder="ZIP"
                                    required
                                    style={{ ...styles.input, flex: 1 }}
                                    value={formData.zip}
                                    onChange={handleInputChange}
                                />
                            </div>

                            <h3 style={styles.sectionTitle}>Payment Details</h3>
                            <div style={styles.cardBox}>
                                <input
                                    type="text"
                                    name="cardNumber"
                                    placeholder="Card Number"
                                    required
                                    style={styles.cardInput}
                                    value={formData.cardNumber}
                                    onChange={handleInputChange}
                                />
                                <div style={styles.cardRow}>
                                    <input
                                        type="text"
                                        name="expiry"
                                        placeholder="MM/YY"
                                        required
                                        style={styles.cardInputSmall}
                                        value={formData.expiry}
                                        onChange={handleInputChange}
                                    />
                                    <input
                                        type="text"
                                        name="cvc"
                                        placeholder="CVC"
                                        required
                                        style={styles.cardInputSmall}
                                        value={formData.cvc}
                                        onChange={handleInputChange}
                                    />
                                </div>
                            </div>
                            <p style={styles.securedBy}>
                                <span style={{ fontSize: '12px', color: '#666' }}>🔒 Secure Payment Processing</span>
                            </p>

                            <div style={styles.orderSummary}>
                                <div style={styles.summaryRow}>
                                    <span>Subtotal</span>
                                    <span>${total.toFixed(2)}</span>
                                </div>
                                <div style={styles.summaryRow}>
                                    <span>Shipping</span>
                                    <span>Free</span>
                                </div>
                                <div style={{ ...styles.summaryRow, fontWeight: '700', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #eee' }}>
                                    <span>Total</span>
                                    <span>${total.toFixed(2)}</span>
                                </div>
                            </div>
                        </form>
                    )}

                    {view === 'success' && (
                        <div style={styles.successContainer}>
                            <div style={styles.successIcon}>✓</div>
                            <h3 style={styles.successTitle}>Order Placed!</h3>
                            <p style={styles.successText}>
                                Thank you for your order. We've sent a confirmation email to {formData.email}.
                            </p>
                            <button onClick={onClose} style={styles.secondaryButton}>
                                Continue Shopping
                            </button>
                        </div>
                    )}
                </div>

                {/* Footer */}
                {view !== 'success' && (
                    <div style={styles.footer}>
                        {view === 'cart' ? (
                            cart.length > 0 && (
                                <>
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
                                </>
                            )
                        ) : (
                            <div style={{ width: '100%' }}>
                                <button
                                    type="submit"
                                    form="checkout-form"
                                    style={{ ...styles.checkoutButton, opacity: loading ? 0.7 : 1 }}
                                    disabled={loading}
                                >
                                    {loading ? 'PROCESSING...' : `PAY $${total.toFixed(2)}`}
                                </button>
                                <button
                                    onClick={() => setView('cart')}
                                    style={styles.backButton}
                                    disabled={loading}
                                >
                                    Back to Cart
                                </button>
                            </div>
                        )}
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
        animation: 'slideInRight 0.3s ease',
        fontFamily: 'Inter, sans-serif'
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
        margin: 0
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
        color: '#999'
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
        margin: '0 0 4px 0'
    },
    itemVariant: {
        fontSize: '12px',
        color: '#666',
        margin: '0 0 8px 0'
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
        color: '#000'
    },
    quantity: {
        fontSize: '14px',
        fontWeight: '600',
        minWidth: '24px',
        textAlign: 'center'
    },
    itemPrice: {
        fontSize: '16px',
        fontWeight: '700',
        color: '#000'
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
        color: '#000'
    },
    totalAmount: {
        fontSize: '24px',
        fontWeight: '700',
        color: '#000'
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
        boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)'
    },
    form: {
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
    },
    input: {
        width: '100%',
        padding: '12px',
        borderRadius: '8px',
        border: '1px solid #e5e5e5',
        fontSize: '14px',
        fontFamily: 'inherit',
        outline: 'none',
        transition: 'border-color 0.2s'
    },
    row: {
        display: 'flex',
        gap: '12px'
    },
    sectionTitle: {
        fontSize: '14px',
        fontWeight: '700',
        color: '#666',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        margin: '16px 0 8px 0'
    },
    cardBox: {
        border: '1px solid #e5e5e5',
        borderRadius: '8px',
        padding: '12px',
        backgroundColor: '#fff'
    },
    cardInput: {
        width: '100%',
        padding: '8px',
        border: 'none',
        borderBottom: '1px solid #eee',
        marginBottom: '8px',
        fontSize: '14px',
        outline: 'none'
    },
    cardInputSmall: {
        flex: 1,
        padding: '8px',
        border: 'none',
        fontSize: '14px',
        outline: 'none'
    },
    cardRow: {
        display: 'flex',
        gap: '12px'
    },
    securedBy: {
        textAlign: 'center',
        margin: '8px 0'
    },
    orderSummary: {
        backgroundColor: '#f5f5f5',
        padding: '12px',
        borderRadius: '8px',
        marginTop: '12px'
    },
    summaryRow: {
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: '14px',
        marginBottom: '4px',
        color: '#333'
    },
    backButton: {
        width: '100%',
        marginTop: '12px',
        padding: '12px',
        background: 'none',
        border: 'none',
        color: '#666',
        fontSize: '14px',
        fontWeight: '600',
        cursor: 'pointer'
    },
    successContainer: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 20px',
        textAlign: 'center'
    },
    successIcon: {
        width: '64px',
        height: '64px',
        borderRadius: '50%',
        backgroundColor: '#22c55e',
        color: '#fff',
        fontSize: '32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: '24px',
        fontWeight: 'bold'
    },
    successTitle: {
        fontSize: '24px',
        fontWeight: '800',
        marginBottom: '12px',
        color: '#000'
    },
    successText: {
        fontSize: '16px',
        color: '#666',
        lineHeight: '1.5',
        marginBottom: '32px'
    },
    secondaryButton: {
        padding: '12px 24px',
        backgroundColor: '#f5f5f5',
        color: '#000',
        border: '1px solid #e5e5e5',
        borderRadius: '8px',
        fontWeight: '600',
        cursor: 'pointer'
    }
};
