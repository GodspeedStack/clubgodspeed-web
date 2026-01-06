# Security Best Practices - Godspeed Basketball

This document outlines the security measures implemented in the Godspeed Basketball application and best practices for maintaining security.

## 🔒 Security Measures Implemented

### 1. XSS (Cross-Site Scripting) Prevention

**Implementation:**
- All user input is sanitized before being rendered in HTML
- Security utility functions in `src/utils/security.js` provide:
  - `escapeHTML()` - Escapes HTML special characters
  - `validateURL()` - Validates and sanitizes URLs (blocks javascript: and data: protocols)
  - `sanitizeText()` - Sanitizes text for safe display
  - `setSafeText()` - Safe way to set text content

**Files Protected:**
- `parent-portal.js` - All user data sanitized before innerHTML usage
- `coach-portal.js` - Error messages sanitized
- All dynamic content rendering functions

**Best Practices:**
- Always use `escapeHTML()` when inserting user data into HTML
- Use `textContent` instead of `innerHTML` when possible
- Validate URLs before using them in `href` attributes
- Never trust user input - always sanitize

### 2. Input Validation

**Email Validation:**
- Format validation using regex: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`
- Implemented in login forms and registration

**Password Validation:**
- Minimum length requirement (6 characters)
- Implemented in authentication flows

**URL Validation:**
- Blocks dangerous protocols (javascript:, data:)
- Only allows safe protocols (http, https, mailto, tel, relative URLs)

### 3. Secrets Management

**Removed Hardcoded Secrets:**
- Snipcart API key moved from `store.html` to environment variable
- All API keys must be configured via environment variables

**Environment Variables:**
- `.env` file is in `.gitignore` (never committed)
- `.env.example` provides template without actual secrets
- Required variables documented in `docs/ENVIRONMENT_VARIABLES.md`

### 4. Database Security (Supabase)

**Row Level Security (RLS):**
- All tables have RLS enabled
- Policies enforce:
  - Users can only access their own data
  - Coaches can only view their own messages
  - Parents can only view messages sent to them
  - Admins have appropriate elevated permissions

**SQL Injection Prevention:**
- Using Supabase client library (parameterized queries)
- No raw SQL queries with user input
- All database operations go through Supabase API

### 5. Authentication Security

**Supabase Auth:**
- Secure token-based authentication
- Automatic token refresh
- Session management

**Fallback Authentication:**
- localStorage fallback for development only
- Production should always use Supabase Auth

## 🛡️ Security Checklist

Before deploying to production:

- [ ] All environment variables configured
- [ ] No hardcoded secrets in code
- [ ] `.env` file in `.gitignore`
- [ ] RLS policies enabled on all Supabase tables
- [ ] Input validation on all forms
- [ ] XSS protection on all user-generated content
- [ ] HTTPS enabled (required for Supabase)
- [ ] Error messages don't expose sensitive information
- [ ] API keys have minimal required permissions
- [ ] Regular security audits scheduled

## 🚨 Common Security Pitfalls to Avoid

1. **Never use `innerHTML` with user data directly**
   ```javascript
   // ❌ BAD
   element.innerHTML = userInput;
   
   // ✅ GOOD
   element.textContent = userInput;
   // OR
   element.innerHTML = escapeHTML(userInput);
   ```

2. **Always validate URLs**
   ```javascript
   // ❌ BAD
   link.href = userProvidedURL;
   
   // ✅ GOOD
   const safeURL = validateURL(userProvidedURL);
   if (safeURL) link.href = safeURL;
   ```

3. **Never expose error details to users**
   ```javascript
   // ❌ BAD
   errorMsg.textContent = error.message; // May contain sensitive info
   
   // ✅ GOOD
   errorMsg.textContent = 'An error occurred. Please try again.';
   console.error('Detailed error:', error); // Log for debugging
   ```

4. **Always sanitize before database queries**
   - Use Supabase client methods (they handle sanitization)
   - Never concatenate user input into SQL strings

## 📝 Security Maintenance

### Regular Tasks:
1. **Monthly:** Review and update dependencies for security patches
2. **Quarterly:** Rotate API keys
3. **Quarterly:** Review RLS policies
4. **Annually:** Full security audit

### Monitoring:
- Monitor Supabase access logs for suspicious activity
- Review error logs for potential security issues
- Track failed authentication attempts

## 🔗 Additional Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Supabase Security Guide](https://supabase.com/docs/guides/auth/security)
- [MDN Web Security](https://developer.mozilla.org/en-US/docs/Web/Security)

---

**Last Updated:** January 2025
**Maintained By:** Development Team
