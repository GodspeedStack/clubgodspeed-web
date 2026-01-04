# 🚀 Quick Start Guide - Backend Setup

Everything is ready! Here's the simplest way to get everything running:

## Option 1: Automated Setup (Easiest)

1. **Run the setup script:**
   ```bash
   ./scripts/setup-backend.sh
   ```

2. **Follow the prompts** - it will guide you through everything!

## Option 2: Manual Setup (Step by Step)

### Step 1: Set Up Supabase (5 minutes)

1. Go to [https://app.supabase.com](https://app.supabase.com)
2. Sign up or log in
3. Click **"New Project"**
4. Fill in:
   - Name: `Godspeed Basketball`
   - Database Password: (save this!)
   - Region: Choose closest to you
5. Click **"Create new project"**
6. Wait 2-3 minutes for it to initialize

### Step 2: Get Your Credentials (1 minute)

1. In your Supabase project, go to **Settings → API**
2. Copy:
   - **Project URL** (looks like `https://xxxxx.supabase.co`)
   - **anon public** key (long string starting with `eyJ...`)

### Step 3: Configure Environment (2 minutes)

1. Copy the example file:
   ```bash
   cp .env.example .env
   ```

2. Open `.env` in a text editor and paste your credentials:
   ```env
   VITE_SUPABASE_URL=https://your-project-id.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key-here
   ```

### Step 4: Run Database Migrations (5 minutes)

1. In Supabase dashboard, go to **SQL Editor**
2. Click **"New Query"**
3. Run each migration file **in this order**:

   **Copy and paste each file's contents, then click "Run":**

   - `supabase/migrations/001_comms_center_schema.sql`
   - `supabase/migrations/002_ecommerce_schema.sql`
   - `supabase/migrations/003_store_schema.sql`
   - `supabase/migrations/004_supplier_sync.sql`
   - `supabase/migrations/005_emergency_product_seed.sql`
   - `supabase/migrations/006_parent_portal_training.sql`
   - `supabase/migrations/007_product_variants_rls_fix.sql`
   - `supabase/migrations/008_seed_training_data.sql` (optional - adds sample data)

4. After each migration, you should see "Success" ✅

### Step 5: Verify Setup (2 minutes)

1. In Supabase, go to **Table Editor**
2. You should see tables like:
   - `parent_accounts`
   - `training_packages`
   - `products`
   - `product_variants`
   - `cart`
   - etc.

3. Open `parent-portal.html` in your browser
4. Try creating an account - it should work! 🎉

## ✅ That's It!

Everything else is already implemented:
- ✅ PDF generation
- ✅ Cart functionality  
- ✅ Training hours tracking
- ✅ All backend code

## 🆘 Need Help?

- Check `docs/BACKEND_SETUP_GUIDE.md` for detailed instructions
- Check browser console for errors
- Verify `.env` file has correct credentials
- Make sure all migrations ran successfully

## 🎯 What's Already Done

All the code is complete:
- ✅ PDF generation for receipts/invoices
- ✅ Add to cart functionality
- ✅ Training hours calculation
- ✅ Sample data seeding
- ✅ All database migrations
- ✅ RLS policies configured

You just need to:
1. Create Supabase project
2. Add credentials to `.env`
3. Run the migrations

That's it! 🚀
