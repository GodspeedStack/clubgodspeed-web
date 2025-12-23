# 🏗️ Godspeed Basketball - Architecture

## **The Nike Store Analogy**

Think of your app like a physical Nike store:

### 🏢 **Vercel = The Building**

- The glass windows, doors, and shelves customers see
- **Role**: Frontend hosting
- **What it serves**: HTML, CSS, JavaScript, images
- **URL**: <https://clubgodspeed-web.vercel.app>

### 📦 **Supabase = The Stockroom**

- Where the boxes, customer lists, and inventory clipboards live
- **Role**: Backend database & authentication
- **What it stores**: Products, variants, users, orders, messages
- **Database**: PostgreSQL (Relational SQL)

### 💳 **Stripe = The Cash Register**

- Handles the money
- **Role**: Payment processing
- **What it does**: Checkout, subscriptions, refunds

---

## ✅ **Confirmed Deployment Strategy**

### **Frontend**

- **Platform**: Vercel
- **Repository**: <https://github.com/Jewellsco/clubgodspeed-web>
- **Auto-Deploy**: ✅ On push to `main` branch
- **Live URL**: <https://clubgodspeed-web.vercel.app>

### **Backend**

- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **URL**: <https://nnqokhqennuxalamnvps.supabase.co>
- **Schema**: Relational SQL (products, product_variants, cart, users)

### **Payments**

- **Platform**: Stripe Connect
- **Publishable Key**: `pk_test_51ShHrgE7EsBJ8KwAJn7HC8BV...`

### **Email**

- **Platform**: Resend
- **API Key**: `re_MELpnVZ2_N9oYxN9uKCJhQboruPK3t59o`

---

## 🚫 **What We're NOT Using**

### **Firebase** ❌

- **Reason**: Conflicts with Supabase PostgreSQL schema
- **Status**: Deprecated, no longer deploying
- **Note**: Firebase uses NoSQL (Firestore), we need SQL (PostgreSQL)

### **Netlify** ❌

- **Reason**: Persistent caching issues causing deployment problems
- **Status**: Migrated to Vercel on 2025-12-23
- **Note**: Vercel provides faster deploys and better cache management

---

## 📊 **Data Flow**

```text
Customer visits Vercel site
        ↓
Clicks "Add to Cart"
        ↓
Frontend sends request to Supabase
        ↓
Supabase stores cart item in PostgreSQL
        ↓
Customer clicks "Checkout"
        ↓
Frontend redirects to Stripe
        ↓
Stripe processes payment
        ↓
Webhook updates Supabase order status
```

---

## 🗂️ **Database Schema (Supabase)**

### **Tables**

1. **`products`** - Product catalog
   - id, title, description, price, images, category
2. **`product_variants`** - Size/color/stock
   - id, product_id, sku, size, color, stock_quantity
3. **`cart`** - Shopping carts
   - id, user_id, created_at
4. **`cart_items`** - Items in cart
   - id, cart_id, variant_id, quantity
5. **`messages`** - Comms center
   - id, sender_id, recipient_id, subject, body
6. **`users`** - User accounts (Supabase Auth)

---

## 🔐 **Environment Variables**

### **Set in Vercel Dashboard**

```bash
SUPABASE_URL=https://nnqokhqennuxalamnvps.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
RESEND_API_KEY=re_MELpnVZ2_N9oYxN9uKCJhQboruPK3t59o
STRIPE_PUBLISHABLE_KEY=pk_test_51ShHrgE7EsBJ8KwAJn7HC8BV...
```

---

## 🚀 **Deployment Workflow**

### **1. Local Development**

```bash
# Edit files
code store.html

# Test locally
open index.html
```

### **2. Commit & Push**

```bash
git add .
git commit -m "Update store hero image"
git push
```

### **3. Auto-Deploy**

- Vercel detects push to GitHub
- Builds and deploys automatically
- Live in ~30-60 seconds

### **4. Verify**

- Check: <https://clubgodspeed-web.vercel.app>
- Hard refresh: `Cmd + Shift + R`

---

## 📝 **Why This Stack?**

### **Vercel (Frontend)**

- ✅ GitHub integration
- ✅ Auto-deploy on push (30-60 seconds)
- ✅ Preview deployments
- ✅ Fast global CDN
- ✅ Easy rollbacks
- ✅ Better cache management than Netlify

### **Supabase (Backend)**

- ✅ PostgreSQL (Relational SQL)
- ✅ Built-in authentication
- ✅ Row Level Security (RLS)
- ✅ Real-time subscriptions
- ✅ RESTful API auto-generated

### **Stripe (Payments)**

- ✅ Industry standard
- ✅ PCI compliant
- ✅ Subscription support
- ✅ Connect for marketplace

---

## 🎯 **Key Principle**

**Frontend and Backend are SEPARATE**

- **Frontend** (Vercel): What customers see
- **Backend** (Supabase): Where data lives
- **Never mix**: Don't use Firebase when using Supabase

---

## 📚 **Documentation**

- [Deployment Guide](DEPLOY_TO_VERCEL.md)
- [Store Infrastructure](docs/STORE_INFRASTRUCTURE.md)
- [Database Migrations](supabase/migrations/)

---

**Architecture Status**: ✅ **CONFIRMED & DEPLOYED**

- Frontend: Vercel ✅
- Backend: Supabase ✅
- Payments: Stripe ✅
- Firebase: Deprecated ❌
- Netlify: Deprecated ❌ (Migrated to Vercel 2025-12-23)
