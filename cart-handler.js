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

        // Try to load cart context
        const script = document.createElement('script');
        script.src = '/src/lib/cartContext.js';
        script.onload = () => {
            if (window.cartManager) {
                cartManager = window.cartManager;
                updateCartBadges();
                setupCartListeners();
            }
        };
        document.head.appendChild(script);
        return false;
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
                alert(`Added ${programName} to cart!`);
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
                alert(`Added ${productName} to cart!`);
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
    function showCartNotification(message) {
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
    function updateCartBadges() {
        if (!cartManager) return;

        const count = cartManager.getItemCount();
        const badges = document.querySelectorAll('.cart-badge, .cart-count, [data-cart-count]');

        badges.forEach(badge => {
            badge.textContent = count;
            badge.style.display = count > 0 ? 'block' : 'none';
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
            alert("Your cart is empty!");
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
                alert("Checkout Simulation Successful!\n(Configure Supabase Function URL in cart-handler.js for real payments)");
                cartManager.clear();
                updateCartBadges();

                // Close cart
                const overlay = document.getElementById('cart-overlay');
                if (overlay) overlay.style.display = 'none';

                button.innerText = originalText;
                button.disabled = false;
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
            alert("Checkout failed: " + error.message);
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

        // Update badges on load
        setTimeout(updateCartBadges, 500);
    }

    // Add CSS animations
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
    `;
    document.head.appendChild(style);

    // Initialize
    init();
})();
