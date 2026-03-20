/**
 * Vanilla JS Cart Manager for Training Packages
 */
window.TrainingCart = {
    items: [],
    
    addItem(item) {
        const existing = this.items.find(i => i.id === item.id);
        if (existing) {
            // Already added? Maybe alert or just ignore since session packs shouldn't duplicate
            godspeedAlert('Package already in cart', 'Notice');
            return;
        }
        this.items.push({ ...item, quantity: 1 });
        this.updateBadge();
    },

    removeItem(id) {
        this.items = this.items.filter(i => i.id !== id);
        this.updateBadge();
        this.renderDrawer();
    },

    clearCart() {
        this.items = [];
        this.updateBadge();
        this.renderDrawer();
    },

    total() {
        return this.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    },

    count() {
        return this.items.length;
    },

    updateBadge() {
        const badge = document.getElementById('training-cart-badge');
        if (!badge) return;
        
        const c = this.count();
        if (c > 0) {
            badge.textContent = c;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    },

    renderDrawer() {
        const drawer = document.getElementById('training-cart-drawer');
        const overlay = document.getElementById('training-cart-overlay');
        const itemsContainer = document.getElementById('training-cart-items-container');
        const totalAmount = document.getElementById('training-cart-total-amount');
        const checkoutBtn = document.getElementById('training-cart-checkout-btn');

        if (!drawer) return;

        itemsContainer.innerHTML = '';

        if (this.items.length === 0) {
            itemsContainer.innerHTML = '<div style="padding: 20px 0; color: #666; text-align: center;">Nothing in your cart.</div>';
            checkoutBtn.disabled = true;
        } else {
            this.items.forEach(item => {
                const itemEl = document.createElement('div');
                itemEl.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid #eee;';
                itemEl.innerHTML = `
                    <div>
                        <div style="font-weight: 600; font-size: 15px; color: #111;">${item.name}</div>
                        <div style="font-size: 14px; color: #666;">$${item.price.toFixed(2)}${item.recurring ? '/mo' : ''}</div>
                    </div>
                    <button onclick="TrainingCart.removeItem('${item.id}')" style="background: none; border: none; color: #ef4444; font-size: 13px; font-weight: 600; cursor: pointer; padding: 4px;">Remove</button>
                `;
                itemsContainer.appendChild(itemEl);
            });
            checkoutBtn.disabled = false;
        }

        totalAmount.textContent = '$' + this.total().toFixed(2);
    },

    async handleCheckout() {
        const checkoutBtn = document.getElementById('training-cart-checkout-btn');
        const errorContainer = document.getElementById('training-cart-error');
        
        checkoutBtn.disabled = true;
        checkoutBtn.textContent = 'Redirecting to payment...';
        errorContainer.style.display = 'none';

        try {
            let user = null;
            if (window.supabase && supabase.auth && typeof supabase.auth.getUser === 'function') {
                const { data, error: authError } = await supabase.auth.getUser();
                if (data && data.user) user = data.user;
            }
            if (!user) user = { id: 'local-test-id' };

            // Attempt to get selected athlete
            const athleteSelect = document.getElementById('training-athlete-select');
            const athleteId = (athleteSelect && athleteSelect.value) ? athleteSelect.value : null;
            const email = localStorage.getItem('gba_user_email');
            
            const { data, error } = await supabase.functions.invoke('create-checkout', {
                body: {
                    items: this.items,
                    parentEmail: email,
                    userId: user.id,
                    athleteId: athleteId,
                    successUrl: `${window.location.origin}/parent-portal.html?payment=success&type=training`,
                    cancelUrl: `${window.location.origin}/parent-portal.html?payment=cancelled`
                }
            });

            if (error) throw error;
            
            if (data && data.url) {
                window.location.href = data.url;
            } else {
                throw new Error('Failed to generate secure checkout link from Stripe.');
            }

        } catch (e) {
            console.error('Checkout Error:', e);
            errorContainer.textContent = e.message || 'Something went wrong. Please try again.';
            errorContainer.style.display = 'block';
            checkoutBtn.disabled = false;
            checkoutBtn.textContent = 'Pay securely with card';
        }
    }
};

window.openTrainingCart = function() {
    TrainingCart.renderDrawer();
    document.getElementById('training-cart-drawer').style.right = '0';
    document.getElementById('training-cart-overlay').style.display = 'block';
};

window.closeTrainingCart = function() {
    document.getElementById('training-cart-drawer').style.right = '-400px';
    document.getElementById('training-cart-overlay').style.display = 'none';
};

// Replace old initiateTrainingPayment with 'Add to Cart' flow
const SESSION_PRODUCTS = {
    1: { id: '1-session', name: '1 Session', price: 45.00, hours: 1 },
    5: { id: '5-pack', name: '5 Pack', price: 200.00, hours: 5 },
    10: { id: '10-pack', name: '10 Pack', price: 350.00, hours: 10 },
    'unlimited': { id: 'unlimited', name: 'Unlimited', price: 250.00, hours: 'unlimited', recurring: true, stripePriceId: 'price_xxx_unlimited' }
};

window.initiateTrainingPayment = function(planKey) {
    const product = SESSION_PRODUCTS[planKey];
    if (product) {
        TrainingCart.addItem(product);
        openTrainingCart();
    }
};
