# 🚀 Run Security Migrations - Quick Guide

## Option 1: Combined SQL File (Easiest) ⭐

1. **Generate combined migration file:**
   ```bash
   node scripts/combine-migrations.js
   ```

2. **Run in Supabase SQL Editor:**
   - Go to https://app.supabase.com
   - Select your project
   - Go to **SQL Editor** (left sidebar)
   - Click **"New Query"**
   - Open `supabase/migrations/combined_security_migrations.sql`
   - Copy **ALL** contents
   - Paste into SQL Editor
   - Click **"Run"** (or press Cmd/Ctrl + Enter)
   - Wait for "Success" ✅

## Option 2: Direct Database Connection (Automated)

1. **Add database password to .env:**
   ```bash
   # Get password from: Supabase Dashboard → Settings → Database
   SUPABASE_DB_PASSWORD=your-database-password-here
   ```

2. **Run migrations:**
   ```bash
   node scripts/run-migrations-direct.js
   ```

## Option 3: Individual Migrations (Manual)

Run each migration file **IN ORDER** in Supabase SQL Editor:

1. `supabase/migrations/009_email_verification.sql`
2. `supabase/migrations/010_mfa_system.sql`
3. `supabase/migrations/011_unified_auth_roles.sql`

## ✅ Verification

After running migrations, verify in Supabase Dashboard:

1. **Table Editor** → Check these tables exist:
   - `email_verification_tokens`
   - `user_mfa`
   - `mfa_backup_codes`
   - `user_profiles`
   - `rate_limiting`

2. **SQL Editor** → Run this query:
   ```sql
   SELECT 
     tablename 
   FROM pg_tables 
   WHERE schemaname = 'public' 
   AND tablename IN (
     'email_verification_tokens',
     'user_mfa',
     'mfa_backup_codes',
     'user_profiles',
     'rate_limiting'
   );
   ```
   
   Should return 5 rows.

## 🎯 Next Steps

After migrations are complete:

1. Test email verification: `docs/SECURITY_SETUP_CHECKLIST.md`
2. Test 2FA setup: `enable-2fa.html`
3. Test security audit: `security-audit.html`
