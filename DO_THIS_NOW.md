# ✅ DO THIS NOW - Simple 3-Step Setup

I've done all the coding. You just need to run the database setup. Here's the absolute simplest way:

## 🎯 Step 1: Create Supabase Account (2 minutes)

1. Go to: **https://app.supabase.com**
2. Click **"Start your project"** (or sign up)
3. Click **"New Project"**
4. Fill in:
   - **Name**: `Godspeed Basketball`
   - **Database Password**: (make one up, save it somewhere)
   - **Region**: Pick closest to you
5. Click **"Create new project"**
6. Wait 2 minutes for it to finish

## 🎯 Step 2: Get Your Keys (1 minute)

1. In your Supabase project, click **Settings** (gear icon)
2. Click **API** in the left menu
3. Copy these two things:
   - **Project URL** (looks like `https://xxxxx.supabase.co`)
   - **anon public** key (long string)

## 🎯 Step 3: Run Migrations (5 minutes)

1. In Supabase, click **SQL Editor** in the left menu
2. Click **"New Query"**

3. **For each file below**, do this:
   - Open the file in your code editor
   - Copy ALL the contents
   - Paste into Supabase SQL Editor
   - Click **"Run"** (or press Cmd/Ctrl + Enter)
   - Wait for "Success" ✅

   **Run these files IN ORDER:**

   ```
   supabase/migrations/001_comms_center_schema.sql
   supabase/migrations/002_ecommerce_schema.sql
   supabase/migrations/003_store_schema.sql
   supabase/migrations/004_supplier_sync.sql
   supabase/migrations/005_emergency_product_seed.sql
   supabase/migrations/006_parent_portal_training.sql
   supabase/migrations/007_product_variants_rls_fix.sql
   supabase/migrations/008_seed_training_data.sql  (optional - adds sample data)
   ```

4. **Set up your .env file:**
   - Copy `.env.example` to `.env`
   - Open `.env` in a text editor
   - Paste your Project URL and anon key:
     ```
     VITE_SUPABASE_URL=https://your-project-id.supabase.co
     VITE_SUPABASE_ANON_KEY=your-anon-key-here
     ```

## ✅ DONE!

That's it! Everything else is already coded and ready.

## 🧪 Test It

1. Open `parent-portal.html` in your browser
2. Open browser console (F12)
3. Type: `verifySetup()`
4. It will tell you if everything is working!

## 🆘 If Something Goes Wrong

- **"Table doesn't exist"**: Make sure you ran all migrations
- **"Environment variables missing"**: Check your `.env` file
- **"Connection failed"**: Double-check your Supabase URL and key

## 📞 Need Help?

Check `QUICK_START.md` for more detailed instructions, or `docs/BACKEND_SETUP_GUIDE.md` for the full guide.

---

**That's literally it!** All the code is done. You just need to:
1. Create Supabase project
2. Run 8 SQL files
3. Add credentials to .env

Total time: ~10 minutes 🚀
