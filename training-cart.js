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
            const sbClient = window.auth?.getSupabaseClient?.();
            if (!sbClient) throw new Error('We cannot reach the payment system. Please refresh and try again.');

            // create-checkout requires a real signed-in user — it prices the cart and
            // records the purchase against whoever the token says you are. No session,
            // no checkout (this used to fall back to a fake "anonymous" user).
            const { data: sessionData } = await sbClient.auth.getSession();
            if (!sessionData || !sessionData.session) {
                throw new Error('Your sign-in expired. Please sign in again, then check out.');
            }

            // Attempt to get selected athlete
            const athleteSelect = document.getElementById('training-athlete-select');
            const athleteId = (athleteSelect && athleteSelect.value) ? athleteSelect.value : null;

            const { data, error } = await sbClient.functions.invoke('create-checkout', {
                body: {
                    paymentType: 'training_package',
                    // Only ids + quantities matter: the function prices every item
                    // from its own catalog, so a tampered price is ignored.
                    items: this.items.map(i => ({ id: i.id, quantity: i.quantity })),
                    athleteId: athleteId
                }
            });

            if (error) {
                let msg = error.message;
                try {
                    if (error.context && typeof error.context.json === 'function') {
                        const body = await error.context.json();
                        if (body && body.error) msg = body.error;
                    }
                } catch (_) { /* body not JSON — keep the generic message */ }
                throw new Error(msg);
            }
            
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
    'unlimited': { id: 'unlimited', name: 'Unlimited Monthly', price: 250.00, hours: 'unlimited', recurring: true }
};

window.initiateTrainingPayment = function(planKey) {
    const product = SESSION_PRODUCTS[planKey];
    if (product) {
        TrainingCart.addItem(product);
        openTrainingCart();
    }
};
