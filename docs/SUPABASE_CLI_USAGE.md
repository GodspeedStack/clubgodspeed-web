# Using Supabase CLI for Migrations

## ✅ Installation Complete

Supabase CLI has been installed locally in your project. You can use it via `npx`.

## 🚀 Quick Start: Run Security Migrations

### Option 1: Use the Helper Script (Easiest)

```bash
./scripts/run-migrations-with-cli.sh
```

This script will:
1. Check if project is linked
2. Link project if needed (will prompt for database password)
3. Run all 3 security migrations in order

### Option 2: Manual CLI Commands

#### Step 1: Link Your Project

First, you need to link your Supabase project. Get your project reference ID from your Supabase URL:

```
https://YOUR_PROJECT_REF.supabase.co
```

Then run:

```bash
npx supabase link --project-ref YOUR_PROJECT_REF
```

You'll be prompted for:
- **Database password** (the one you set when creating the project)

#### Step 2: Run Migrations

Run all migrations at once:

```bash
npx supabase db push
```

Or run individual migrations:

```bash
npx supabase db execute -f supabase/migrations/009_email_verification.sql
npx supabase db execute -f supabase/migrations/010_mfa_system.sql
npx supabase db execute -f supabase/migrations/011_unified_auth_roles.sql
```

## 📋 Available Commands

```bash
# Check CLI version
npx supabase --version

# Link project
npx supabase link --project-ref YOUR_PROJECT_REF

# Push all migrations
npx supabase db push

# Execute specific migration file
npx supabase db execute -f path/to/migration.sql

# Check migration status
npx supabase migration list

# Generate new migration
npx supabase migration new migration_name
```

## 🔍 Verify Installation

Check if Supabase CLI is installed:

```bash
npx supabase --version
```

You should see something like: `supabase 2.x.x`

## ⚠️ Troubleshooting

**Error: "command not found"**
- Make sure you're in the project directory
- Try: `npm install` to ensure dependencies are installed

**Error: "project not linked"**
- Run: `npx supabase link --project-ref YOUR_PROJECT_REF`
- You'll need your database password

**Error: "permission denied"**
- If using npx, it should work. If not, you may need to install globally:
  ```bash
  npm install -g supabase
  ```
  (May require `sudo` on Mac/Linux)

## 📝 Alternative: Manual SQL Editor

If CLI doesn't work, you can always use the Supabase SQL Editor:
- See `RUN_SECURITY_MIGRATIONS.md` for manual instructions

## 🎯 Next Steps

After running migrations:
1. Verify tables in Supabase Table Editor
2. Test features using `docs/SECURITY_SETUP_CHECKLIST.md`
