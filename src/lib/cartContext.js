/**
 * Cart Context - Global Shopping Cart State Management
 * Provides cart functionality across the application
 */

class CartManager {
    constructor() {
        this.cart = this.loadCart();
        this.listeners = [];
    }

    /**
     * Load cart from localStorage
     */
    loadCart() {
        try {
            const saved = localStorage.getItem('godspeed_cart');
            return saved ? JSON.parse(saved) : [];
        } catch (e) {
            console.error('Error loading cart:', e);
            return [];
        }
    }

    /**
     * Save cart to localStorage
     */
    saveCart() {
        try {
            localStorage.setItem('godspeed_cart', JSON.stringify(this.cart));
            this.notifyListeners();
        } catch (e) {
            console.error('Error saving cart:', e);
        }
    }

    /**
     * Add item to cart
     */
    addItem(product, variant, quantity = 1) {
        const existingIndex = this.cart.findIndex(
            item => item.productId === product.id && item.variantId === variant.id
        );

        if (existingIndex >= 0) {
            // Update quantity
            this.cart[existingIndex].quantity += quantity;
        } else {
            // Add new item
            this.cart.push({
                productId: product.id,
                variantId: variant.id,
                productName: product.title,
                variantName: `${variant.size || ''} ${variant.color || ''}`.trim(),
                price: variant.price_override || product.base_price,
                image: variant.image_url || product.featured_image_url,
                quantity: quantity,
                addedAt: new Date().toISOString()
            });
        }

        this.saveCart();
        return this.cart;
    }

    /**
     * Remove item from cart
     */
    removeItem(productId, variantId) {
        this.cart = this.cart.filter(
            item => !(item.productId === productId && item.variantId === variantId)
        );
        this.saveCart();
        return this.cart;
    }

    /**
     * Update item quantity
     */
    updateQuantity(productId, variantId, quantity) {
        const item = this.cart.find(
            item => item.productId === productId && item.variantId === variantId
        );
        if (item) {
            if (quantity <= 0) {
                this.removeItem(productId, variantId);
            } else {
                item.quantity = quantity;
                this.saveCart();
            }
        }
        return this.cart;
    }

    /**
     * Get cart total
     */
    getTotal() {
        return this.cart.reduce((total, item) => {
            return total + (item.price * item.quantity);
        }, 0);
    }

    /**
     * Get cart item count
     */
    getItemCount() {
        return this.cart.reduce((count, item) => count + item.quantity, 0);
    }

    /**
     * Clear cart
     */
    clear() {
        this.cart = [];
        this.saveCart();
        return this.cart;
    }

    /**
     * Subscribe to cart changes
     */
    subscribe(listener) {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    /**
     * Notify all listeners of cart changes
     */
    notifyListeners() {
        this.listeners.forEach(listener => {
            try {
                listener(this.cart, this.getItemCount(), this.getTotal());
            } catch (e) {
                console.error('Error in cart listener:', e);
            }
        });
    }

    /**
     * Get cart items
     */
    getItems() {
        return [...this.cart];
    }
}

// Create singleton instance
const cartManager = new CartManager();

// Make it globally available
window.cartManager = cartManager;

// Export for ES modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = cartManager;
}
