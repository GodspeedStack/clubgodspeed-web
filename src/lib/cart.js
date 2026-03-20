import { supabase } from './supabaseClient.js';

/**
 * Cart utility functions for Supabase cart management
 */

/**
 * Get or create active cart for current user
 */
async function getOrCreateCart() {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
            // For guest users, we could use session_id or localStorage
            // For now, return null and handle guest cart in localStorage
            return null;
        }

        // Try to get existing active cart
        let { data: cart, error } = await supabase
            .from('cart')
            .select('id')
            .eq('user_id', user.id)
            .eq('status', 'active')
            .single();

        // If no cart exists, create one
        if (error && error.code === 'PGRST116') {
            const { data: newCart, error: createError } = await supabase
                .from('cart')
                .insert({ user_id: user.id, status: 'active' })
                .select()
                .single();

            if (createError) throw createError;
            return newCart;
        }

        if (error) throw error;
        return cart;
    } catch (error) {
        console.error('Error getting/creating cart:', error);
        throw error;
    }
}

/**
 * Add item to cart
 * @param {string} variantId - Product variant ID
 * @param {number} quantity - Quantity to add (default: 1)
 */
export async function addToCart(variantId, quantity = 1) {
    try {
        const cart = await getOrCreateCart();

        if (!cart) {
            // Fallback to localStorage for guest users
            const guestCart = JSON.parse(localStorage.getItem('godspeed_cart') || '[]');
            const existingItem = guestCart.find(item => item.variantId === variantId);
            
            if (existingItem) {
                existingItem.quantity += quantity;
            } else {
                guestCart.push({ variantId, quantity });
            }
            
            localStorage.setItem('godspeed_cart', JSON.stringify(guestCart));
            return { success: true, guest: true };
        }

        // Add to Supabase cart
        const { error } = await supabase
            .from('cart_items')
            .upsert({
                cart_id: cart.id,
                variant_id: variantId,
                quantity
            }, {
                onConflict: 'cart_id,variant_id'
            });

        if (error) throw error;

        return { success: true, guest: false };
    } catch (error) {
        console.error('Error adding to cart:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get cart items
 */
export async function getCartItems() {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
            // Return guest cart from localStorage
            const guestCart = JSON.parse(localStorage.getItem('godspeed_cart') || '[]');
            return guestCart;
        }

        const cart = await getOrCreateCart();
        if (!cart) return [];

        const { data: items, error } = await supabase
            .from('cart_items')
            .select(`
                id,
                quantity,
                product_variants (
                    id,
                    size,
                    color,
                    stock_quantity,
                    products (
                        id,
                        title,
                        base_price,
                        featured_image_url
                    )
                )
            `)
            .eq('cart_id', cart.id);

        if (error) throw error;

        return items || [];
    } catch (error) {
        console.error('Error getting cart items:', error);
        return [];
    }
}

/**
 * Remove item from cart
 */
export async function removeFromCart(cartItemId) {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
            // Handle guest cart
            const guestCart = JSON.parse(localStorage.getItem('godspeed_cart') || '[]');
            const filtered = guestCart.filter(item => item.id !== cartItemId);
            localStorage.setItem('godspeed_cart', JSON.stringify(filtered));
            return { success: true };
        }

        const { error } = await supabase
            .from('cart_items')
            .delete()
            .eq('id', cartItemId);

        if (error) throw error;

        return { success: true };
    } catch (error) {
        console.error('Error removing from cart:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Update cart item quantity
 */
export async function updateCartItemQuantity(cartItemId, quantity) {
    try {
        if (quantity <= 0) {
            return await removeFromCart(cartItemId);
        }

        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
            // Handle guest cart
            const guestCart = JSON.parse(localStorage.getItem('godspeed_cart') || '[]');
            const item = guestCart.find(item => item.id === cartItemId);
            if (item) {
                item.quantity = quantity;
                localStorage.setItem('godspeed_cart', JSON.stringify(guestCart));
            }
            return { success: true };
        }

        const { error } = await supabase
            .from('cart_items')
            .update({ quantity })
            .eq('id', cartItemId);

        if (error) throw error;

        return { success: true };
    } catch (error) {
        console.error('Error updating cart item:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get cart count (total items)
 */
export async function getCartCount() {
    try {
        const items = await getCartItems();
        return items.reduce((total, item) => total + (item.quantity || 1), 0);
    } catch (error) {
        console.error('Error getting cart count:', error);
        return 0;
    }
}
