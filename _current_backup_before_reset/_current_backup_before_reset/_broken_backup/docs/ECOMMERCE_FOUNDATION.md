# 🛍️ The Pro Shop - E-Commerce Foundation

## Overview

Headless e-commerce system built on **Supabase** (PostgreSQL) + **Stripe Connect** for payments.

---

## 🏗️ Architecture

### Tech Stack

- **Database**: Supabase (PostgreSQL)
- **Payments**: Stripe Connect
- **Frontend**: React (existing app)
- **API**: Supabase Auto-generated REST API

### Design Philosophy

- **Headless**: Decoupled backend and frontend
- **Scalable**: Support for variants, inventory, and complex pricing
- **Secure**: Row Level Security (RLS) policies
- **Modern**: Real-time updates via Supabase subscriptions

---

## 📊 Database Schema

### Core Tables

#### 1. **categories**

Product organization and hierarchy.

```sql
- id (UUID)
- name (VARCHAR)
- slug (VARCHAR, unique)
- description (TEXT)
- parent_id (UUID) → Self-referencing for subcategories
- image_url (TEXT)
- is_active (BOOLEAN)
```

#### 2. **products**

Main product catalog.

```sql
- id (UUID)
- title (VARCHAR)
- slug (VARCHAR, unique)
- description (TEXT)
- base_price (DECIMAL)
- category_id (UUID) → categories
- brand (VARCHAR)
- featured_image_url (TEXT)
- images (JSONB) → Array of image URLs
- status (VARCHAR) → 'draft', 'active', 'archived'
- is_featured (BOOLEAN)
- track_inventory (BOOLEAN)
```

#### 3. **product_variants**

Product variations (size, color, etc.) with individual inventory.

```sql
- id (UUID)
- product_id (UUID) → products
- sku (VARCHAR, unique)
- size (VARCHAR)
- color (VARCHAR)
- price_override (DECIMAL) → Override base_price
- compare_at_price (DECIMAL) → For sale pricing
- inventory_count (INTEGER)
- low_stock_threshold (INTEGER)
- is_active (BOOLEAN)
```

**Key Feature**: Unique constraint on `(product_id, size, color)` prevents duplicate variants.

#### 4. **cart**

Shopping cart sessions.

```sql
- id (UUID)
- user_id (UUID) → auth.users
- session_id (VARCHAR) → For guest carts
- status (VARCHAR) → 'active', 'abandoned', 'converted'
- expires_at (TIMESTAMP)
```

#### 5. **cart_items**

Line items in carts.

```sql
- id (UUID)
- cart_id (UUID) → cart
- variant_id (UUID) → product_variants
- quantity (INTEGER)
```

#### 6. **orders**

Customer orders with Stripe integration.

```sql
- id (UUID)
- order_number (VARCHAR, unique) → Auto-generated: GS-YYYYMMDD-XXXX
- user_id (UUID) → auth.users
- subtotal, tax_amount, shipping_amount, discount_amount, total_amount (DECIMAL)
- stripe_payment_intent_id (VARCHAR)
- stripe_charge_id (VARCHAR)
- shipping_address, billing_address (JSONB)
- payment_status → 'pending', 'paid', 'failed', 'refunded'
- fulfillment_status → 'unfulfilled', 'processing', 'shipped', 'delivered', 'cancelled'
```

#### 7. **order_items**

Line items in orders with price snapshot.

```sql
- id (UUID)
- order_id (UUID) → orders
- variant_id (UUID) → product_variants
- product_title, variant_title, sku (VARCHAR) → Snapshot
- price_at_purchase (DECIMAL) → Price at time of order
- quantity (INTEGER)
- fulfillment_status (VARCHAR)
```

---

## 🔐 Security (Row Level Security)

### Public Access

- ✅ Anyone can **view** active products, variants, and categories
- ❌ No public write access

### User Access

- ✅ Users can **manage their own cart** (view, create, update)
- ✅ Users can **view their own orders**
- ✅ Users can **create orders** (checkout)

### Admin Access

- ✅ Admins can **manage all products, variants, categories**
- ✅ Admins can **view and update all orders**

---

## 🚀 Key Features

### 1. **Variant Support (Day 1)**

- Multiple sizes, colors, materials per product
- Individual inventory tracking per variant
- Price overrides per variant
- Unique SKU per variant

### 2. **Inventory Management**

- Real-time inventory tracking
- Low stock alerts
- Automatic inventory decrease on order payment
- Prevent overselling

### 3. **Pricing Flexibility**

- Base price at product level
- Price override at variant level
- Compare-at pricing for sales
- Automatic discount calculation

### 4. **Order Processing**

- Auto-generated order numbers: `GS-YYYYMMDD-XXXX`
- Stripe payment integration
- Separate payment and fulfillment status
- Address storage (shipping + billing)
- Order history with price snapshots

### 5. **Cart Management**

- Persistent carts for logged-in users
- Session-based carts for guests
- 30-day cart expiration
- Automatic cart conversion on checkout

---

## 📁 Files Created

### 1. Database Schema

**File**: `supabase/migrations/002_ecommerce_schema.sql`

**Contents**:

- All 7 tables with indexes
- RLS policies
- Triggers (auto-update timestamps, inventory management)
- Helper functions (order number generation)
- Views (product catalog)

### 2. Mock Data

**File**: `src/data/products.json`

**Contents**:

- 8 sample products
- 3 categories (Apparel, Footwear, Equipment)
- 30+ variants
- Realistic inventory counts
- Multiple brands (Godspeed, Anta, New Balance)

### 3. UI Component

**File**: `src/components/ProductCard.jsx`

**Features**:

- Godspeed Design System
- 4:5 aspect ratio images
- Black background, white text
- Variant selection (size, color)
- Add to cart functionality
- Sale badges
- Low stock indicators
- Hover effects

---

## 🎨 Design System Compliance

### ProductCard Component

**Colors**:

- Background: `#000000` (Pure Black)
- Text: `#FFFFFF` (White)
- Muted: `#86868b` (Gray)
- Primary: `#0071e3` (Godspeed Blue)
- Sale: `#ff3b30` (Red)
- Featured: `#ffd60a` (Yellow)

**Typography**:

- Font: Inter, sans-serif
- Weights: 600 (title), 700 (price, buttons)
- Uppercase labels with letter-spacing

**Interactions**:

- Smooth transitions (0.3s cubic-bezier)
- Hover scale effect on images
- Quick add overlay on hover
- Touch-optimized buttons

---

## 🔄 Next Steps

### Phase 1: Setup (Now)

1. **Run Database Migration**:

   ```bash
   # In Supabase SQL Editor
   # Copy and run: supabase/migrations/002_ecommerce_schema.sql
   ```

2. **Test with Mock Data**:

   ```jsx
   import products from './src/data/products.json';
   import ProductCard from './src/components/ProductCard';
   
   products.products.map(product => (
       <ProductCard key={product.id} product={product} />
   ))
   ```

### Phase 2: Stripe Integration

1. Create Stripe Connect account
2. Set up webhook endpoints
3. Implement checkout flow
4. Add payment processing

### Phase 3: Cart & Checkout

1. Build cart UI component
2. Implement cart state management
3. Create checkout page
4. Add shipping calculator

### Phase 4: Admin Dashboard

1. Product management UI
2. Order management
3. Inventory tracking
4. Analytics dashboard

---

## 📝 Usage Examples

### Display Product Grid

```jsx
import React, { useEffect, useState } from 'react';
import { supabase } from './lib/supabaseClient';
import ProductCard from './components/ProductCard';

function ProductGrid() {
    const [products, setProducts] = useState([]);
    
    useEffect(() => {
        loadProducts();
    }, []);
    
    const loadProducts = async () => {
        const { data, error } = await supabase
            .from('products')
            .select(`
                *,
                variants:product_variants(*)
            `)
            .eq('status', 'active');
        
        if (!error) setProducts(data);
    };
    
    return (
        <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '24px',
            padding: '24px'
        }}>
            {products.map(product => (
                <ProductCard key={product.id} product={product} />
            ))}
        </div>
    );
}
```

### Add to Cart

```javascript
async function addToCart(variantId, quantity = 1) {
    const userId = (await supabase.auth.getUser()).data.user?.id;
    
    // Get or create cart
    let { data: cart } = await supabase
        .from('cart')
        .select('id')
        .eq('user_id', userId)
        .eq('status', 'active')
        .single();
    
    if (!cart) {
        const { data: newCart } = await supabase
            .from('cart')
            .insert({ user_id: userId })
            .select()
            .single();
        cart = newCart;
    }
    
    // Add item to cart
    const { error } = await supabase
        .from('cart_items')
        .upsert({
            cart_id: cart.id,
            variant_id: variantId,
            quantity
        });
    
    if (!error) {
        console.log('Added to cart!');
    }
}
```

### Create Order

```javascript
async function createOrder(cartId, shippingAddress, billingAddress) {
    const userId = (await supabase.auth.getUser()).data.user?.id;
    
    // Get cart items
    const { data: cartItems } = await supabase
        .from('cart_items')
        .select(`
            *,
            variant:product_variants(
                *,
                product:products(*)
            )
        `)
        .eq('cart_id', cartId);
    
    // Calculate total
    const subtotal = cartItems.reduce((sum, item) => {
        const price = item.variant.price_override || item.variant.product.base_price;
        return sum + (price * item.quantity);
    }, 0);
    
    // Create order
    const { data: order } = await supabase
        .from('orders')
        .insert({
            user_id: userId,
            order_number: await generateOrderNumber(),
            subtotal,
            total_amount: subtotal, // Add tax/shipping later
            shipping_address: shippingAddress,
            billing_address: billingAddress,
            customer_email: user.email
        })
        .select()
        .single();
    
    // Create order items
    const orderItems = cartItems.map(item => ({
        order_id: order.id,
        variant_id: item.variant_id,
        product_title: item.variant.product.title,
        sku: item.variant.sku,
        price_at_purchase: item.variant.price_override || item.variant.product.base_price,
        quantity: item.quantity,
        subtotal: (item.variant.price_override || item.variant.product.base_price) * item.quantity
    }));
    
    await supabase.from('order_items').insert(orderItems);
    
    // Mark cart as converted
    await supabase
        .from('cart')
        .update({ status: 'converted' })
        .eq('id', cartId);
    
    return order;
}
```

---

## 🐛 Troubleshooting

### "Products not showing"

- Check that `status = 'active'`
- Verify RLS policies allow public read
- Check Supabase connection

### "Can't add to cart"

- Ensure user is authenticated
- Check RLS policies for cart table
- Verify variant has inventory

### "Order creation fails"

- Check all required fields
- Verify Stripe payment intent
- Check inventory availability

---

## 📚 Resources

- **Supabase Docs**: <https://supabase.com/docs>
- **Stripe Connect**: <https://stripe.com/docs/connect>
- **Product Schema**: `supabase/migrations/002_ecommerce_schema.sql`
- **Mock Data**: `src/data/products.json`
- **Component**: `src/components/ProductCard.jsx`

---

**Status**: ✅ **FOUNDATION COMPLETE**

All database tables, mock data, and UI components are ready. Next step: Run the migration and start building the shop UI!
