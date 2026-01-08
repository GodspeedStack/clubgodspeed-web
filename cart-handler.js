/**
 * Cart Handler - Unified cart functionality for HTML pages
 * Works with training programs, products, and store items
 */

(function () {
    'use strict';

    // Load cart context if available
    let cartManager = null;

    function initCartManager() {
        if (typeof window.cartManager !== 'undefined') {
            cartManager = window.cartManager;
            return true;
        }

        // Create cart manager inline if not loaded
        if (!window.cartManager) {
            window.cartManager = {
                cart: JSON.parse(localStorage.getItem('godspeed_cart') || '[]'),
                addItem: function (item, variant, qty) {
                    const existingIndex = this.cart.findIndex(
                        cartItem => cartItem.productId === item.id && cartItem.variantId === variant.id
                    );
                    if (existingIndex >= 0) {
                        this.cart[existingIndex].quantity += qty;
                    } else {
                        this.cart.push({
                            productId: item.id,
                            variantId: variant.id,
                            productName: item.title,
                            variantName: variant.size || variant.color || '',
                            price: variant.price_override || item.base_price,
                            image: variant.image_url || item.featured_image_url || '',
                            quantity: qty,
                            addedAt: new Date().toISOString()
                        });
                    }
                    localStorage.setItem('godspeed_cart', JSON.stringify(this.cart));
                    this.notifyListeners();
                },
                getItems: function () { return [...this.cart]; },
                getItemCount: function () { return this.cart.reduce((sum, item) => sum + item.quantity, 0); },
                getTotal: function () { return this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0); },
                clear: function () { this.cart = []; localStorage.removeItem('godspeed_cart'); this.notifyListeners(); },
                removeItem: function (productId, variantId) {
                    this.cart = this.cart.filter(item => !(item.productId === productId && item.variantId === variantId));
                    localStorage.setItem('godspeed_cart', JSON.stringify(this.cart));
                    this.notifyListeners();
                },
                updateQuantity: function (productId, variantId, qty) {
                    const item = this.cart.find(i => i.productId === productId && i.variantId === variantId);
                    if (item) {
                        if (qty <= 0) {
                            this.removeItem(productId, variantId);
                        } else {
                            item.quantity = qty;
                            localStorage.setItem('godspeed_cart', JSON.stringify(this.cart));
                            this.notifyListeners();
                        }
                    }
                },
                listeners: [],
                subscribe: function (listener) {
                    this.listeners.push(listener);
                    return () => { this.listeners = this.listeners.filter(l => l !== listener); };
                },
                notifyListeners: function () {
                    this.listeners.forEach(listener => {
                        try {
                            listener(this.cart, this.getItemCount(), this.getTotal());
                        } catch (e) {
                            console.error('Cart listener error:', e);
                        }
                    });
                }
            };
        }
        cartManager = window.cartManager;
        return true;
    }

    /**
     * Handle add to cart for training programs
     */
    function handleProgramAddToCart(button) {
        const programId = button.getAttribute('data-id');
        const programName = button.getAttribute('data-name');
        const programPrice = parseFloat(button.getAttribute('data-price')) || 0;
        const programType = button.getAttribute('data-program');

        if (!cartManager) {
            if (!initCartManager()) {
                // Fallback: show alert
                godspeedAlert(`${programName} added to cart!`, 'Added to Cart');
                return;
            }
        }

        // Add program as cart item
        const programItem = {
            id: programId,
            title: programName,
            base_price: programPrice
        };

        const variant = {
            id: programId + '-default',
            price_override: programPrice,
            size: null,
            color: null
        };

        cartManager.addItem(programItem, variant, 1);
        showCartNotification(`${programName} added to cart`);
        updateCartBadges();

        // Also update cart overlay if open
        if (typeof window.renderCartItems === 'function') {
            window.renderCartItems();
        }
    }

    /**
     * Handle add to cart for products
     */
    function handleProductAddToCart(button) {
        // Check if using Snipcart (store.html)
        if (button.classList.contains('snipcart-add-item')) {
            // Let Snipcart handle it
            return;
        }

        // Get product data from data attributes
        const productId = button.getAttribute('data-id');
        const productName = button.getAttribute('data-name');
        const productPrice = parseFloat(button.getAttribute('data-price')) || 0;

        if (!cartManager) {
            if (!initCartManager()) {
                godspeedAlert(`${productName} added to cart!`, 'Added to Cart');
                return;
            }
        }

        const productItem = {
            id: productId,
            title: productName,
            base_price: productPrice
        };

        const variant = {
            id: productId + '-default',
            price_override: productPrice
        };

        cartManager.addItem(productItem, variant, 1);
        showCartNotification(`${productName} added to cart`);
        updateCartBadges();
    }

    /**
     * Show cart notification
     */
    window.showCartNotification = function (message) {
        const notification = document.createElement('div');
        notification.className = 'cart-notification';
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #000;
            color: #fff;
            padding: 16px 24px;
            border-radius: 8px;
            font-weight: 600;
            font-size: 14px;
            z-index: 10000;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            animation: slideInRight 0.3s ease;
            font-family: 'Inter', sans-serif;
        `;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'slideOutRight 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 2000);
    }

    /**
     * Update cart badges across the site
     */
    window.updateCartBadges = function () {
        if (!cartManager) {
            // Try to initialize if not already done
            initCartManager();
            if (!cartManager) return;
        }

        const count = cartManager.getItemCount();
        const badges = document.querySelectorAll('.cart-badge, .cart-count, [data-cart-count]');

        badges.forEach(badge => {
            badge.textContent = count;
            if (count > 0) {
                badge.style.display = 'block';
                badge.classList.add('badge-bounce');
                // Remove animation class after animation completes
                setTimeout(() => badge.classList.remove('badge-bounce'), 500);
            } else {
                badge.style.display = 'none';
            }
        });
    }

    /**
     * Setup cart listeners
     */
    function setupCartListeners() {
        if (!cartManager) return;

        // Subscribe to cart changes
        cartManager.subscribe((cart, count, total) => {
            updateCartBadges();
        });
    }

    /**
     * Initialize cart functionality
     */
    /**
     * Handle Checkout
     */
    async function handleCheckout(button) {
        if (!cartManager || cartManager.getItemCount() === 0) {
            godspeedAlert("Your cart is empty!", "Cart");
            return;
        }

        const originalText = button.innerText;
        button.innerText = "Processing...";
        button.disabled = true;

        try {
            // 1. Get Cart Items
            const items = cartManager.getItems();

            // 2. Call Backend to Create Session
            // Note: Replace with your actual Supabase Function URL
            const SUPABASE_FUNCTION_URL = "https://nnqokhqennuxalamnvps.supabase.co/functions/v1/create-checkout-session";

            // For now, check if we are in "Demo Mode" (no backend)
            // If the URL is placeholder, mock the success
            if (SUPABASE_FUNCTION_URL.includes("your-project-ref")) {
                console.warn("Stripe Backend not configured. Simulating checkout.");
                await new Promise(r => setTimeout(r, 1500));

                // Simulation Success
                godspeedAlert("Checkout Simulation Successful!\n\nRedirecting to success page...", "Checkout Complete");

                setTimeout(() => {
                    cartManager.clear();
                    updateCartBadges();
                    window.location.href = "success.html";
                }, 1500);

                return;
            }

            const response = await fetch(SUPABASE_FUNCTION_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    // 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY // If needed
                },
                body: JSON.stringify({
                    items: items,
                    success_url: window.location.origin + "/success.html",
                    cancel_url: window.location.href
                })
            });

            const data = await response.json();

            if (data.error) throw new Error(data.error);
            if (data.url) {
                window.location.href = data.url;
            } else {
                throw new Error("No checkout URL returned");
            }

        } catch (error) {
            console.error("Checkout Error:", error);
            godspeedAlert("Checkout failed: " + error.message, "Error");
            button.innerText = originalText;
            button.disabled = false;
        }
    }

    /**
     * Initialize cart functionality
     */
    function init() {
        // Wait for DOM
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
            return;
        }

        // Initialize cart manager
        initCartManager();

        // Setup cart listeners for badge updates
        setupCartListeners();

        // Setup add to cart handlers
        document.addEventListener('click', (e) => {
            const button = e.target.closest('.add-to-cart-btn, .select-program-btn');
            const checkoutBtn = e.target.closest('.checkout-btn');

            if (checkoutBtn) {
                e.preventDefault();
                handleCheckout(checkoutBtn);
                return;
            }

            if (!button) return;

            // Check if it's a program button
            if (button.classList.contains('select-program-btn') || button.hasAttribute('data-program')) {
                e.preventDefault();
                handleProgramAddToCart(button);
            }
            // Check if it's a product button
            else if (button.classList.contains('add-to-cart-btn') && !button.classList.contains('snipcart-add-item')) {
                e.preventDefault();
                handleProductAddToCart(button);
            }
        });

        // Setup cart overlay handlers
        setupCartOverlay();

        // Update badges on load
        setTimeout(updateCartBadges, 500);
    }

    /**
     * Setup cart overlay functionality
     */
    function setupCartOverlay() {
        const overlay = document.getElementById('cart-overlay');
        const closeBtn = document.getElementById('close-cart');
        const cartBtn = document.getElementById('cart-btn');

        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                if (overlay) overlay.style.display = 'none';
            });
        }

        if (cartBtn) {
            cartBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (overlay) {
                    overlay.style.display = 'flex';
                    renderCartItems();
                }
            });
        }

        if (overlay) {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    overlay.style.display = 'none';
                }
            });
        }

        // Render cart items
        function renderCartItems() {
            if (!cartManager) return;
            const container = document.getElementById('cart-items');
            const totalEl = document.getElementById('cart-total-price');
            if (!container) return;

            const items = cartManager.getItems();
            const total = cartManager.getTotal();

            if (items.length === 0) {
                container.innerHTML = '<p class="empty-cart-msg">Your cart is empty.</p>';
            } else {
                let html = '';
                items.forEach((item, index) => {
                    html += `
                        <div class="cart-item" style="display: flex; gap: 1rem; padding: 1rem; border-bottom: 1px solid #eee;">
                            <div style="flex: 1;">
                                <div style="font-weight: 600; margin-bottom: 0.25rem;">${item.productName}</div>
                                <div style="font-size: 0.875rem; color: #666;">$${item.price.toFixed(2)} × ${item.quantity}</div>
                            </div>
                            <div style="display: flex; align-items: center; gap: 0.5rem;">
                                <button onclick="window.cartManager.updateQuantity('${item.productId}', '${item.variantId}', ${item.quantity - 1})" style="width: 28px; height: 28px; border: 1px solid #ddd; background: white; border-radius: 4px; cursor: pointer;">−</button>
                                <span>${item.quantity}</span>
                                <button onclick="window.cartManager.updateQuantity('${item.productId}', '${item.variantId}', ${item.quantity + 1})" style="width: 28px; height: 28px; border: 1px solid #ddd; background: white; border-radius: 4px; cursor: pointer;">+</button>
                                <button onclick="window.cartManager.removeItem('${item.productId}', '${item.variantId}'); renderCartItems(); updateCartBadges();" style="margin-left: 0.5rem; color: #ef4444; background: none; border: none; cursor: pointer;">×</button>
                            </div>
                        </div>
                    `;
                });
                container.innerHTML = html;
            }

            if (totalEl) {
                totalEl.textContent = `$${total.toFixed(2)}`;
            }
        }

        // Subscribe to cart changes
        if (cartManager) {
            cartManager.subscribe(() => {
                renderCartItems();
                updateCartBadges();
            });
        }

        // Make renderCartItems globally available
        window.renderCartItems = renderCartItems;
    }

    // Add CSS animations and cart overlay styles
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideInRight {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
        @keyframes slideOutRight {
            from {
                transform: translateX(0);
                opacity: 1;
            }
            to {
                transform: translateX(100%);
                opacity: 0;
            }
        }
        .cart-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            backdrop-filter: blur(4px);
            z-index: 10000;
            display: none;
            align-items: center;
            justify-content: flex-end;
        }
        .cart-sidebar {
            background: white;
            width: 100%;
            max-width: 400px;
            height: 100%;
            display: flex;
            flex-direction: column;
            box-shadow: -4px 0 20px rgba(0, 0, 0, 0.1);
            animation: slideInRight 0.3s ease;
        }
        .cart-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 1.5rem;
            border-bottom: 1px solid #eee;
        }
        .cart-header h2 {
            font-size: 1.5rem;
            font-weight: 700;
            margin: 0;
        }
        .close-cart-btn {
            background: none;
            border: none;
            font-size: 2rem;
            cursor: pointer;
            width: 44px;
            height: 44px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            transition: background 0.2s;
        }
        .close-cart-btn:hover {
            background: #f5f5f5;
        }
        .cart-items {
            flex: 1;
            overflow-y: auto;
            padding: 1rem;
        }
        .empty-cart-msg {
            text-align: center;
            padding: 3rem 1rem;
            color: #999;
        }
        .cart-footer {
            padding: 1.5rem;
            border-top: 1px solid #eee;
        }
        .cart-total {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 1rem;
            font-size: 1.25rem;
            font-weight: 700;
        }
        .checkout-btn {
            width: 100%;
            padding: 1rem;
            background: #2563eb;
            color: white;
            border: none;
            border-radius: 9999px;
            font-weight: 700;
            text-transform: uppercase;
            cursor: pointer;
            transition: background 0.2s;
        }
        .checkout-btn:hover {
            background: #1d4ed8;
        }
    `;
    document.head.appendChild(style);

    // Initialize
    init();
})();

// Load branded modal system if not already loaded
if (typeof window.godspeedAlert === 'undefined') {
    const script = document.createElement('script');
    script.src = 'branded-modal.js';
    document.head.appendChild(script);
}
