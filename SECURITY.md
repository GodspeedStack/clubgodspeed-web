# Security & Authentication System

## Overview
Enterprise-grade security system for Godspeed Basketball with email verification, 2FA/MFA, rate limiting, security auditing, and role-based access control.

## Features

### 1. Email Verification
- **Status**: ✅ Implemented
- **Location**: `security.js` → `EmailVerification`
- **Usage**: 
  ```javascript
  // Generate verification token
  const token = window.Security.EmailVerification.generateToken(email);
  
  // Send verification email
  await window.Security.EmailVerification.sendVerificationEmail(email, token);
  
  // Verify email
  const verified = window.Security.EmailVerification.verify(email, token);
  
  // Check if verified
  const isVerified = window.Security.EmailVerification.isVerified(email);
  ```
- **Pages**: `verify-email.html` for email verification flow

### 2. Two-Factor Authentication (2FA/MFA)
- **Status**: ✅ Implemented
- **Location**: `security.js` → `TwoFactorAuth`
- **Usage**:
  ```javascript
  // Generate 2FA secret
  const { secret, qrCodeUrl } = window.Security.TwoFactorAuth.generateSecret(userId, email);
  
  // Verify token
  const valid = window.Security.TwoFactorAuth.verifyToken(userId, token);
  
  // Enable 2FA
  window.Security.TwoFactorAuth.enable(userId, token);
  
  // Check if enabled
  const enabled = window.Security.TwoFactorAuth.isEnabled(userId);
  ```
- **Pages**: `enable-2fa.html` for 2FA setup

### 3. Rate Limiting
- **Status**: ✅ Implemented
- **Location**: `security.js` → `RateLimiter`
- **Configuration**: 
  - Max attempts: 5 per 15 minutes
  - Auto-reset after 24 hours
- **Usage**:
  ```javascript
  // Check rate limit
  const check = window.Security.RateLimiter.check('login', identifier);
  if (!check.allowed) {
    throw new Error(check.message);
  }
  
  // Record attempt
  window.Security.RateLimiter.recordAttempt('login', identifier);
  
  // Reset on success
  window.Security.RateLimiter.reset('login', identifier);
  ```

### 4. Security Audit
- **Status**: ✅ Implemented
- **Location**: `security.js` → `SecurityAudit`
- **Features**:
  - Event logging (login, signup, 2FA, etc.)
  - Vulnerability scanning
  - Log filtering and export
- **Usage**:
  ```javascript
  // Log event
  window.Security.SecurityAudit.log('info', 'login_success', { email });
  
  // Get logs
  const logs = window.Security.SecurityAudit.getLogs({ level: 'error' });
  
  // Run security check
  const issues = window.Security.SecurityAudit.runSecurityCheck();
  ```
- **Pages**: `security-audit.html` for audit dashboard

### 5. Role-Based Access Control (RBAC)
- **Status**: ✅ Implemented
- **Location**: `security.js` → `RBAC`
- **Roles**:
  - `admin` - Full system access
  - `coach` - Coach portal access
  - `parent` - Parent portal access
  - `athlete` - Limited profile access
  - `guest` - No access
- **Usage**:
  ```javascript
  // Set role
  window.Security.RBAC.setRole('parent');
  
  // Check permission
  if (window.Security.RBAC.hasPermission('view_parent_portal')) {
    // Allow access
  }
  
  // Require permission (throws if not authorized)
  window.Security.RBAC.requirePermission('manage_athletes');
  
  // Get user permissions
  const permissions = window.Security.RBAC.getUserPermissions();
  ```

## Integration

### Login Flow with Security
```javascript
// Enhanced login with rate limiting, email verification, and 2FA
try {
    const result = await window.Security.SecureAuth.login(email, password);
    
    if (result.requires2FA) {
        // Show 2FA input
        show2FAInput();
    } else if (result.success) {
        // Set role
        window.Security.RBAC.setRole('parent');
        // Redirect to portal
    }
} catch (error) {
    // Handle error (rate limited, unverified email, etc.)
    showError(error.message);
}
```

### Permission Checks in Code
```javascript
// Before accessing protected content
try {
    window.Security.RBAC.requirePermission('view_coach_portal');
    // Show coach portal
} catch (error) {
    // Redirect or show error
    window.location.href = 'index.html';
}
```

## Configuration

Edit `SECURITY_CONFIG` in `security.js`:
```javascript
const SECURITY_CONFIG = {
    rateLimit: {
        loginAttempts: 5,
        windowMinutes: 15,
        resetAfterHours: 24
    },
    twoFactor: {
        enabled: true,
        issuer: 'Godspeed Basketball',
        tokenLength: 6,
        expiryMinutes: 10
    },
    emailVerification: {
        required: true,
        expiryHours: 24
    }
};
```

## Security Best Practices

1. **Always verify email before allowing login**
2. **Enable 2FA for admin and coach accounts**
3. **Use rate limiting on all auth endpoints**
4. **Log all security events for auditing**
5. **Check permissions before rendering protected content**
6. **Never store passwords in localStorage**
7. **Use HTTPS in production**
8. **Regularly review audit logs**

## Files

- `security.js` - Core security system
- `verify-email.html` - Email verification page
- `enable-2fa.html` - 2FA setup page
- `security-audit.html` - Security audit dashboard

## Production Notes

1. **Replace mock TOTP** with proper library (e.g., `otplib`)
2. **Integrate with Supabase Auth** for email verification
3. **Use server-side rate limiting** for production
4. **Store 2FA secrets securely** (encrypted, server-side)
5. **Implement proper session management**
6. **Add CSRF protection**
7. **Use secure cookies** for session tokens
