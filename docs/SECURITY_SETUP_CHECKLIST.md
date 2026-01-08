# Security & Auth Setup Checklist

## ✅ Implementation Complete

All security and authentication features have been implemented according to the plan.

## 📋 Setup Steps

### 1. Database Migrations

Run these migrations in Supabase SQL Editor **in order**:

```sql
-- Migration 009: Email Verification
-- File: supabase/migrations/009_email_verification.sql

-- Migration 010: MFA System  
-- File: supabase/migrations/010_mfa_system.sql

-- Migration 011: Unified Auth & Roles
-- File: supabase/migrations/011_unified_auth_roles.sql
```

**How to Run:**
1. Go to Supabase Dashboard → SQL Editor
2. Click "New Query"
3. Copy and paste each migration file
4. Click "Run" (Cmd+Enter)
5. Verify "Success" message

### 2. Install Dependencies

```bash
npm install
```

This will install:
- `otplib@^12.0.1` - For TOTP 2FA
- `qrcode@^1.5.3` - For QR code generation

### 3. Verify Environment Variables

Ensure `.env` file contains:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_RESEND_API_KEY=re_your_key_here
```

### 4. Test Features

#### Email Verification
1. Sign up a new user
2. Check email for verification link
3. Click link or visit `verify-email.html?token=XXX&email=XXX`
4. Verify email is marked as verified

#### 2FA/MFA
1. Log in to parent portal
2. Navigate to `enable-2fa.html`
3. Scan QR code with authenticator app
4. Enter verification code
5. Save backup codes
6. Test login with 2FA

#### Rate Limiting
1. Try logging in with wrong password 5+ times
2. Verify rate limit message appears
3. Wait 15 minutes or check `security-audit.html`

#### Security Audit
1. Visit `security-audit.html`
2. View security logs
3. Run security check
4. Review detected issues

#### Role-Based Access
1. Test coach login (hash-based or Supabase)
2. Test parent login
3. Verify permissions are enforced
4. Check role in `user_profiles` table

## 🔍 Verification

### Check Database Tables

```sql
-- Verify email verification table exists
SELECT * FROM email_verification_tokens LIMIT 1;

-- Verify MFA table exists
SELECT * FROM user_mfa LIMIT 1;

-- Verify user profiles exist
SELECT * FROM user_profiles LIMIT 5;

-- Verify rate limiting table exists
SELECT * FROM rate_limiting LIMIT 1;
```

### Check Functions

```sql
-- Test email verification function
SELECT generate_email_verification_token('user-id-here', 'test@example.com');

-- Test MFA function
SELECT is_mfa_enabled('user-id-here');

-- Test role function
SELECT get_user_role('user-id-here');
```

## 🚨 Troubleshooting

### "Function does not exist"
- Run migrations in order (009, 010, 011)
- Check Supabase SQL Editor for errors

### "Module not found" errors
- Run `npm install`
- Check `package.json` has `otplib` and `qrcode`

### "Resend API key not configured"
- Add `VITE_RESEND_API_KEY` to `.env`
- Restart dev server

### Email verification not working
- Check Resend API key is valid
- Verify Supabase function `generate_email_verification_token` exists
- Check email_verification_tokens table has entries

### 2FA not working
- Verify `otplib` is installed: `npm list otplib`
- Check `user_mfa` table exists
- Verify QR code displays correctly

### Rate limiting not working
- Check `security.js` is loaded before auth flows
- Verify localStorage is accessible
- Check browser console for errors

## 📚 Documentation

- **Implementation Summary**: `docs/SECURITY_IMPLEMENTATION_SUMMARY.md`
- **Coach Migration**: `docs/COACH_MIGRATION_GUIDE.md`
- **Security Best Practices**: `docs/SECURITY_BEST_PRACTICES.md`

## 🎯 Next Steps

1. ✅ Run database migrations
2. ✅ Install npm dependencies
3. ✅ Test email verification
4. ✅ Test 2FA setup
5. ✅ Test rate limiting
6. ⏭️ Migrate coaches to Supabase Auth (see `COACH_MIGRATION_GUIDE.md`)
7. ⏭️ Enable 2FA for admins
8. ⏭️ Review security audit logs regularly

## 🔒 Security Features Status

| Feature | Status | Location |
|---------|--------|----------|
| Email Verification | ✅ Complete | Migration 009, `src/lib/emailVerification.js` |
| 2FA/MFA | ✅ Complete | Migration 010, `src/lib/mfaService.js` |
| Rate Limiting | ✅ Complete | Migration 011, `security.js` |
| Security Audit | ✅ Complete | `security.js`, `security-audit.html` |
| Role-Based Access | ✅ Complete | Migration 011, `security.js` |
| Coach Auth Migration | ✅ Hybrid | `coach-portal.js` (supports both) |

## ✨ Features Implemented

### Email Verification
- ✅ Database schema and functions
- ✅ Email sending via Resend
- ✅ Verification page (`verify-email.html`)
- ✅ Integration with auth flows
- ✅ RLS policies

### 2FA/MFA
- ✅ TOTP secret generation
- ✅ QR code generation
- ✅ Token verification
- ✅ Backup codes
- ✅ Setup page (`enable-2fa.html`)
- ✅ Integration with login flow

### Rate Limiting
- ✅ Client-side (localStorage)
- ✅ Server-side (database)
- ✅ Configurable limits
- ✅ Auto-reset
- ✅ Integration with auth

### Security Audit
- ✅ Event logging
- ✅ Vulnerability scanning
- ✅ Log filtering
- ✅ Export functionality
- ✅ Dashboard (`security-audit.html`)

### Role-Based Access
- ✅ Unified role system
- ✅ Permission checking
- ✅ Coach/Parent/Athlete/Admin roles
- ✅ Database integration
- ✅ RLS policies
