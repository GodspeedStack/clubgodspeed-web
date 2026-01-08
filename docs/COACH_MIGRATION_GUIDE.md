# Coach Portal Migration Guide

## Overview
This guide explains how to migrate coaches from the hash-based authentication system to Supabase Auth for better scalability and security.

## Current State
- **Hash-based auth**: Coaches use access codes (G0DSP33D_ADMIN!, G0DSP33D_EL1T3!)
- **Client-side only**: No server-side validation
- **Limited scalability**: Doesn't scale well for multiple coaches

## Target State
- **Supabase Auth**: All coaches authenticate via Supabase
- **Server-side validation**: Secure, scalable authentication
- **Role-based access**: Unified role system (admin, coach, parent, athlete)
- **Security features**: Email verification, 2FA, rate limiting

## Migration Steps

### Step 1: Create Coach Accounts in Supabase

For each coach, create a Supabase account:

```sql
-- Option A: Use Supabase Dashboard
-- Go to Authentication → Users → Add User
-- Enter email and password
-- Set metadata: { "role": "coach" } or { "role": "admin" }

-- Option B: Use SQL (admin only)
INSERT INTO auth.users (email, encrypted_password, email_confirmed_at, raw_user_meta_data)
VALUES (
    'coach@example.com',
    crypt('password123', gen_salt('bf')),
    NOW(),
    '{"role": "coach"}'::jsonb
);

-- Then create user profile
INSERT INTO user_profiles (id, email, role, first_name, last_name)
SELECT id, email, 'coach', 'First', 'Last'
FROM auth.users
WHERE email = 'coach@example.com';
```

### Step 2: Update Coach Portal Login

The coach portal now supports both methods:

1. **Supabase Auth** (preferred):
   - Enter email address
   - Enter password
   - If 2FA enabled, enter 2FA code

2. **Hash-based** (fallback):
   - Enter access code (G0DSP33D_ADMIN! or G0DSP33D_EL1T3!)
   - Works for backward compatibility

### Step 3: Migrate Existing Coaches

Use the migration script or manually create accounts:

```javascript
// In browser console or migration script
import { migrateCoachToSupabase } from './src/lib/coachAuth.js';

// For each coach:
await migrateCoachToSupabase(
    'coach@example.com',
    'newSecurePassword123',
    'coach' // or 'admin'
);
```

### Step 4: Update Coach Portal HTML

Ensure these scripts are loaded in `coach-portal.html`:

```html
<script src="security.js"></script>
<script src="auth-supabase.js"></script>
<script type="module" src="src/lib/exposeServices.js"></script>
<script src="coach-portal.js"></script>
```

### Step 5: Test Migration

1. Test Supabase login with coach email/password
2. Test hash-based fallback still works
3. Verify role-based permissions
4. Test 2FA if enabled

## Benefits of Migration

1. **Scalability**: Supports unlimited coaches
2. **Security**: Server-side validation, email verification, 2FA
3. **Unified System**: Same auth system for coaches, parents, athletes
4. **Better UX**: Password reset, account recovery
5. **Audit Trail**: All logins tracked in Supabase

## Rollback Plan

If issues occur:
1. Hash-based auth still works as fallback
2. Coaches can use access codes temporarily
3. Fix issues and retry migration

## Support

For questions or issues:
- Check `docs/SECURITY_IMPLEMENTATION_SUMMARY.md`
- Review Supabase authentication logs
- Check security audit dashboard: `security-audit.html`
