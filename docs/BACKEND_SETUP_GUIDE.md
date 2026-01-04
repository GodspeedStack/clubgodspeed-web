# Backend Setup Guide - Godspeed Basketball

This guide walks you through setting up all backend components for the Godspeed Basketball site.

## Prerequisites

- Supabase account (free tier available)
- Node.js installed (for local development)
- Git (for version control)

## Step 1: Supabase Setup

### 1.1 Create Supabase Project

1. Go to [https://app.supabase.com](https://app.supabase.com)
2. Sign up or log in
3. Click "New Project"
4. Fill in:
   - **Name**: Godspeed Basketball
   - **Database Password**: (save this securely)
   - **Region**: Choose closest to your users
5. Click "Create new project"
6. Wait 2-3 minutes for project to initialize

### 1.2 Get API Credentials

1. In your Supabase project dashboard, go to **Settings → API**
2. Copy the following:
   - **Project URL** (e.g., `https://xxxxx.supabase.co`)
   - **anon public** key (starts with `eyJ...`)

### 1.3 Run Database Migrations

1. Go to **SQL Editor** in Supabase dashboard
2. Run migrations in order:
   - `supabase/migrations/001_comms_center_schema.sql`
   - `supabase/migrations/002_ecommerce_schema.sql`
   - `supabase/migrations/003_store_schema.sql`
   - `supabase/migrations/004_supplier_sync.sql`
   - `supabase/migrations/005_emergency_product_seed.sql`
   - `supabase/migrations/006_parent_portal_training.sql`
   - `supabase/migrations/007_product_variants_rls_fix.sql`
   - `supabase/migrations/008_seed_training_data.sql` (optional - for sample data)

3. Verify tables were created:
   - Go to **Table Editor**
   - You should see: `parent_accounts`, `training_packages`, `training_purchases`, `training_sessions`, `training_attendance`, `receipts`, `invoices`, `products`, `product_variants`, `cart`, `cart_items`, etc.

### 1.4 Configure Row Level Security (RLS)

RLS policies are included in the migrations. Verify they're active:

1. Go to **Authentication → Policies**
2. Check that RLS is enabled on all tables
3. Verify policies match your requirements

## Step 2: Environment Variables

### 2.1 Create .env File

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and add your Supabase credentials:
   ```env
   VITE_SUPABASE_URL=https://your-project-id.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key-here
   ```

### 2.2 Verify .env is in .gitignore

Make sure `.env` is listed in `.gitignore` to prevent committing secrets.

## Step 3: Test Authentication

### 3.1 Test Parent Portal Login

1. Open `parent-portal.html` in your browser
2. Try to create an account or log in
3. Verify you can access the portal dashboard

### 3.2 Test Supabase Connection

Open browser console and run:
```javascript
// Check if Supabase is configured
console.log('Supabase URL:', window.VITE_SUPABASE_URL || 'Not set');
console.log('Supabase Client:', window.auth?.getSupabaseClient?.());
```

## Step 4: Seed Sample Data (Optional)

### 4.1 Seed Training Data

1. Go to Supabase SQL Editor
2. Run `supabase/migrations/008_seed_training_data.sql`
3. This creates:
   - Sample training packages
   - Sample training sessions for next 30 days

### 4.2 Create Test Parent Account

1. Register a test account via parent portal
2. Note the `parent_account_id` from `parent_accounts` table
3. Create a test purchase:
   ```sql
   INSERT INTO training_purchases (
       parent_id,
       athlete_id,
       package_id,
       hours_purchased,
       price_paid,
       status
   ) VALUES (
       '<your-parent-id>',
       'test-athlete-1',
       '550e8400-e29b-41d4-a716-446655440001', -- 10 hour package
       10.00,
       500.00,
       'active'
   );
   ```

## Step 5: Verify Features

### 5.1 PDF Generation

1. Log into parent portal
2. Go to Documents tab
3. Click "Generate PDF" on a receipt or invoice
4. Verify PDF downloads correctly

### 5.2 Training Hours Calculation

1. View training dashboard in parent portal
2. Verify hours remaining is calculated correctly
3. Record attendance and verify hours update

### 5.3 Cart Functionality

1. Go to store page
2. Add items to cart
3. Verify cart updates correctly
4. Check cart persists across page refreshes

## Step 6: Production Deployment

### 6.1 Vercel Deployment

1. Push code to GitHub
2. Import project in Vercel
3. Add environment variables in Vercel dashboard:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy

### 6.2 Netlify Deployment

1. Push code to GitHub
2. Import site in Netlify
3. Add environment variables:
   - Go to Site Settings → Build & Deploy → Environment
   - Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
4. Deploy

## Troubleshooting

### Issue: "Supabase not configured" error

**Solution**: 
- Check `.env` file exists and has correct values
- Verify environment variables are loaded (check browser console)
- For production, ensure variables are set in deployment platform

### Issue: RLS policies blocking queries

**Solution**:
- Check RLS is enabled on tables
- Verify policies allow the operation you're trying
- Check user role in JWT claims if using role-based policies

### Issue: PDF generation not working

**Solution**:
- Check browser console for errors
- Verify jsPDF library is loaded (check Network tab)
- Ensure receipt/invoice data exists in database

### Issue: Cart not persisting

**Solution**:
- Check if user is authenticated (cart requires auth for Supabase)
- Verify cart table exists and RLS policies allow user access
- Check browser console for Supabase errors

## Next Steps

- [ ] Set up email notifications (Resend)
- [ ] Configure payment processing (Stripe)
- [ ] Set up analytics
- [ ] Configure backup strategy
- [ ] Set up monitoring/alerts

## Support

For issues or questions:
1. Check migration files for schema details
2. Review RLS policies in migrations
3. Check browser console for errors
4. Review Supabase logs in dashboard
