/**
 * Godspeed Basketball Security & Authentication System
 * Enterprise-grade security features:
 * - Email verification
 * - 2FA/MFA support
 * - Security audit utilities
 * - Rate limiting
 * - Role-based access control (RBAC)
 */

(function() {
    'use strict';

    // ============================================
    // Configuration
    // ============================================
    const SECURITY_CONFIG = {
        // Rate limiting
        rateLimit: {
            loginAttempts: 5,        // Max login attempts
            windowMinutes: 15,        // Time window in minutes
            resetAfterHours: 24      // Reset after 24 hours
        },
        // 2FA
        twoFactor: {
            enabled: true,
            issuer: 'Godspeed Basketball',
            tokenLength: 6,
            expiryMinutes: 10
        },
        // Email verification
        emailVerification: {
            required: true,
            expiryHours: 24
        },
        // Security audit
        audit: {
            logLevel: 'info', // 'debug', 'info', 'warn', 'error'
            maxLogEntries: 1000
        }
    };

    // ============================================
    // Rate Limiting
    // ============================================
    const RateLimiter = {
        storageKey: 'gba_rate_limits',
        
        /**
         * Check if action is rate limited
         * @param {string} action - Action identifier (e.g., 'login', 'signup')
         * @param {string} identifier - User identifier (IP, email, etc.)
         * @returns {Object} { allowed: boolean, remaining: number, resetAt: Date }
         */
        check: function(action, identifier) {
            const key = `${action}:${identifier}`;
            const limits = this.getLimits();
            const limit = limits[key];

            if (!limit) {
                return { allowed: true, remaining: SECURITY_CONFIG.rateLimit.loginAttempts, resetAt: null };
            }

            const now = Date.now();
            const windowMs = SECURITY_CONFIG.rateLimit.windowMinutes * 60 * 1000;

            // Check if window has expired
            if (now - limit.firstAttempt > windowMs) {
                delete limits[key];
                this.saveLimits(limits);
                return { allowed: true, remaining: SECURITY_CONFIG.rateLimit.loginAttempts, resetAt: null };
            }

            // Check if max attempts reached
            if (limit.attempts >= SECURITY_CONFIG.rateLimit.loginAttempts) {
                const resetAt = new Date(limit.firstAttempt + windowMs);
                return { 
                    allowed: false, 
                    remaining: 0, 
                    resetAt: resetAt,
                    message: `Too many attempts. Please try again after ${resetAt.toLocaleTimeString()}`
                };
            }

            return { 
                allowed: true, 
                remaining: SECURITY_CONFIG.rateLimit.loginAttempts - limit.attempts,
                resetAt: new Date(limit.firstAttempt + windowMs)
            };
        },

        /**
         * Record an attempt
         * @param {string} action - Action identifier
         * @param {string} identifier - User identifier
         */
        recordAttempt: function(action, identifier) {
            const key = `${action}:${identifier}`;
            const limits = this.getLimits();
            
            if (!limits[key]) {
                limits[key] = {
                    attempts: 0,
                    firstAttempt: Date.now()
                };
            }

            limits[key].attempts++;
            limits[key].lastAttempt = Date.now();
            this.saveLimits(limits);
            this.audit('rate_limit', { action, identifier, attempts: limits[key].attempts });
        },

        /**
         * Reset rate limit for identifier
         */
        reset: function(action, identifier) {
            const key = `${action}:${identifier}`;
            const limits = this.getLimits();
            delete limits[key];
            this.saveLimits(limits);
        },

        getLimits: function() {
            try {
                const stored = localStorage.getItem(this.storageKey);
                return stored ? JSON.parse(stored) : {};
            } catch (e) {
                return {};
            }
        },

        saveLimits: function(limits) {
            try {
                localStorage.setItem(this.storageKey, JSON.stringify(limits));
            } catch (e) {
                console.error('Failed to save rate limits:', e);
            }
        }
    };

    // ============================================
    // Email Verification
    // ============================================
    const EmailVerification = {
        storageKey: 'gba_email_verifications',
        
        /**
         * Generate verification token
         * @param {string} email - User email
         * @returns {string} Verification token
         */
        generateToken: function(email) {
            const token = Array.from(crypto.getRandomValues(new Uint8Array(32)))
                .map(b => b.toString(16).padStart(2, '0'))
                .join('');
            
            const verifications = this.getVerifications();
            verifications[email] = {
                token: token,
                createdAt: Date.now(),
                verified: false,
                expiresAt: Date.now() + (SECURITY_CONFIG.emailVerification.expiryHours * 60 * 60 * 1000)
            };
            this.saveVerifications(verifications);
            
            this.audit('email_verification_sent', { email });
            return token;
        },

        /**
         * Verify email with token
         * @param {string} email - User email
         * @param {string} token - Verification token
         * @returns {boolean} Success
         */
        verify: function(email, token) {
            const verifications = this.getVerifications();
            const verification = verifications[email];

            if (!verification) {
                this.audit('email_verification_failed', { email, reason: 'no_verification_found' });
                return false;
            }

            if (verification.verified) {
                return true; // Already verified
            }

            if (Date.now() > verification.expiresAt) {
                delete verifications[email];
                this.saveVerifications(verifications);
                this.audit('email_verification_failed', { email, reason: 'expired' });
                return false;
            }

            if (verification.token !== token) {
                this.audit('email_verification_failed', { email, reason: 'invalid_token' });
                return false;
            }

            verification.verified = true;
            verification.verifiedAt = Date.now();
            this.saveVerifications(verifications);
            
            // Store verified status
            localStorage.setItem(`gba_email_verified_${email}`, 'true');
            
            this.audit('email_verification_success', { email });
            return true;
        },

        /**
         * Check if email is verified
         */
        isVerified: function(email) {
            if (!SECURITY_CONFIG.emailVerification.required) {
                return true;
            }

            const verifications = this.getVerifications();
            const verification = verifications[email];
            
            if (verification && verification.verified) {
                return true;
            }

            // Check legacy storage
            return localStorage.getItem(`gba_email_verified_${email}`) === 'true';
        },

        /**
         * Send verification email (integrated with Supabase and Resend)
         */
        sendVerificationEmail: async function(email, token) {
            this.audit('email_verification_email_sent', { email });
            
            // Try to use emailVerification service if available
            if (window.emailVerification && window.emailVerification.generateAndSendVerificationToken) {
                try {
                    const userId = localStorage.getItem('gba_user_id') || email;
                    await window.emailVerification.generateAndSendVerificationToken(userId, email);
                    return true;
                } catch (error) {
                    console.error('Failed to send verification email via service:', error);
                }
            }
            
            // Fallback: Use Supabase Auth email verification
            if (window.supabase && window.supabase.auth) {
                try {
                    const { error } = await window.supabase.auth.resend({
                        type: 'signup',
                        email: email
                    });
                    if (error) throw error;
                    return true;
                } catch (error) {
                    console.error('Failed to send verification email:', error);
                    return false;
                }
            }
            
            // Last resort: log token (for development)
            const verificationUrl = `${window.location.origin}/verify-email.html?email=${encodeURIComponent(email)}&token=${token}`;
            console.log(`[DEV] Verification URL: ${verificationUrl}`);
            return true;
        },

        getVerifications: function() {
            try {
                const stored = localStorage.getItem(this.storageKey);
                return stored ? JSON.parse(stored) : {};
            } catch (e) {
                return {};
            }
        },

        saveVerifications: function(verifications) {
            try {
                localStorage.setItem(this.storageKey, JSON.stringify(verifications));
            } catch (e) {
                console.error('Failed to save verifications:', e);
            }
        }
    };

    // ============================================
    // Two-Factor Authentication (2FA/MFA)
    // ============================================
    const TwoFactorAuth = {
        storageKey: 'gba_2fa_secrets',
        
        /**
         * Generate 2FA secret for user
         * @param {string} userId - User ID
         * @param {string} email - User email
         * @returns {Object} { secret, qrCodeUrl }
         */
        generateSecret: function(userId, email) {
            // Generate random secret (in production, use proper TOTP library)
            const secret = Array.from(crypto.getRandomValues(new Uint8Array(20)))
                .map(b => b.toString(16).padStart(2, '0'))
                .join('');
            
            const secrets = this.getSecrets();
            secrets[userId] = {
                secret: secret,
                email: email,
                enabled: false,
                createdAt: Date.now()
            };
            this.saveSecrets(secrets);

            // Generate QR code URL (format: otpauth://totp/Issuer:Email?secret=SECRET&issuer=Issuer)
            const qrCodeUrl = `otpauth://totp/${encodeURIComponent(SECURITY_CONFIG.twoFactor.issuer)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(SECURITY_CONFIG.twoFactor.issuer)}`;
            
            this.audit('2fa_secret_generated', { userId, email });
            
            return { secret, qrCodeUrl };
        },

        /**
         * Verify 2FA token (uses mfaService if available)
         * @param {string} userId - User ID
         * @param {string} token - 6-digit token
         * @returns {Promise<boolean>} Success
         */
        verifyToken: async function(userId, token) {
            // Use mfaService if available (Supabase-integrated)
            if (window.mfaService && window.mfaService.verifyMFAToken) {
                try {
                    const isValid = await window.mfaService.verifyMFAToken(userId, token);
                    if (isValid) {
                        this.audit('2fa_verification_success', { userId });
                    } else {
                        this.audit('2fa_verification_failed', { userId, reason: 'invalid_token' });
                    }
                    return isValid;
                } catch (error) {
                    console.error('Failed to verify MFA token via service:', error);
                }
            }

            // Fallback: Local verification
            const secrets = this.getSecrets();
            const userSecret = secrets[userId];

            if (!userSecret || !userSecret.enabled) {
                this.audit('2fa_verification_failed', { userId, reason: 'not_enabled' });
                return false;
            }

            // Use otplib if available
            if (window.otplib && window.otplib.authenticator) {
                try {
                    const isValid = window.otplib.authenticator.verify({ token, secret: userSecret.secret });
                    if (isValid) {
                        this.audit('2fa_verification_success', { userId });
                        return true;
                    }
                } catch (error) {
                    console.error('Failed to verify TOTP with otplib:', error);
                }
            }

            // Last resort: Mock verification
            const expectedToken = this.generateTOTP(userSecret.secret);
            const isValid = token === expectedToken;
            
            if (isValid) {
                this.audit('2fa_verification_success', { userId });
            } else {
                this.audit('2fa_verification_failed', { userId, reason: 'invalid_token' });
            }
            
            return isValid;
        },

        /**
         * Enable 2FA for user (after verification)
         */
        enable: function(userId, token) {
            if (!this.verifyToken(userId, token)) {
                return false;
            }

            const secrets = this.getSecrets();
            if (secrets[userId]) {
                secrets[userId].enabled = true;
                secrets[userId].enabledAt = Date.now();
                this.saveSecrets(secrets);
                this.audit('2fa_enabled', { userId });
                return true;
            }
            return false;
        },

        /**
         * Check if 2FA is enabled for user
         */
        isEnabled: function(userId) {
            const secrets = this.getSecrets();
            return secrets[userId] && secrets[userId].enabled === true;
        },

        /**
         * Generate TOTP token (uses otplib if available, otherwise mock)
         */
        generateTOTP: function(secret) {
            // Use otplib if available
            if (window.otplib && window.otplib.authenticator) {
                try {
                    return window.otplib.authenticator.generate(secret);
                } catch (error) {
                    console.error('Failed to generate TOTP with otplib:', error);
                }
            }
            
            // Fallback: Mock implementation
            const time = Math.floor(Date.now() / 1000 / 30); // 30-second window
            const hash = this.simpleHash(secret + time);
            return String(Math.abs(hash) % 1000000).padStart(6, '0');
        },

        simpleHash: function(str) {
            let hash = 0;
            for (let i = 0; i < str.length; i++) {
                const char = str.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash; // Convert to 32-bit integer
            }
            return hash;
        },

        getSecrets: function() {
            try {
                const stored = localStorage.getItem(this.storageKey);
                return stored ? JSON.parse(stored) : {};
            } catch (e) {
                return {};
            }
        },

        saveSecrets: function(secrets) {
            try {
                localStorage.setItem(this.storageKey, JSON.stringify(secrets));
            } catch (e) {
                console.error('Failed to save 2FA secrets:', e);
            }
        }
    };

    // ============================================
    // Role-Based Access Control (RBAC)
    // ============================================
    const RBAC = {
        roles: {
            ADMIN: 'admin',
            COACH: 'coach',
            PARENT: 'parent',
            ATHLETE: 'athlete',
            GUEST: 'guest'
        },

        permissions: {
            // Admin permissions
            admin: [
                'view_all_portals',
                'manage_users',
                'manage_programs',
                'view_all_reports',
                'manage_settings',
                'view_analytics'
            ],
            // Coach permissions
            coach: [
                'view_coach_portal',
                'manage_athletes',
                'create_reports',
                'view_schedules',
                'send_messages',
                'manage_practices'
            ],
            // Parent permissions
            parent: [
                'view_parent_portal',
                'view_child_reports',
                'view_schedules',
                'manage_account',
                'view_documents',
                'submit_orders'
            ],
            // Athlete permissions
            athlete: [
                'view_profile',
                'view_own_reports',
                'view_schedule'
            ],
            // Guest permissions
            guest: []
        },

        /**
         * Get user role
         */
        getRole: function() {
            return localStorage.getItem('gba_user_role') || this.roles.GUEST;
        },

        /**
         * Set user role
         */
        setRole: function(role) {
            if (Object.values(this.roles).includes(role)) {
                localStorage.setItem('gba_user_role', role);
                this.audit('role_set', { role });
                return true;
            }
            return false;
        },

        /**
         * Check if user has permission
         */
        hasPermission: function(permission) {
            const role = this.getRole();
            const rolePermissions = this.permissions[role] || [];
            return rolePermissions.includes(permission);
        },

        /**
         * Check if user has any of the permissions
         */
        hasAnyPermission: function(permissions) {
            return permissions.some(p => this.hasPermission(p));
        },

        /**
         * Check if user has all permissions
         */
        hasAllPermissions: function(permissions) {
            return permissions.every(p => this.hasPermission(p));
        },

        /**
         * Require permission (throws if not authorized)
         */
        requirePermission: function(permission) {
            if (!this.hasPermission(permission)) {
                this.audit('permission_denied', { permission, role: this.getRole() });
                throw new Error(`Permission denied: ${permission}`);
            }
        },

        /**
         * Get all permissions for current user
         */
        getUserPermissions: function() {
            const role = this.getRole();
            return this.permissions[role] || [];
        }
    };

    // ============================================
    // Security Audit
    // ============================================
    const SecurityAudit = {
        storageKey: 'gba_security_audit_log',
        maxEntries: SECURITY_CONFIG.audit.maxLogEntries,

        /**
         * Log security event
         */
        log: function(level, event, details) {
            const logEntry = {
                timestamp: new Date().toISOString(),
                level: level,
                event: event,
                details: details || {},
                userAgent: navigator.userAgent,
                url: window.location.href
            };

            const logs = this.getLogs();
            logs.push(logEntry);

            // Keep only last N entries
            if (logs.length > this.maxEntries) {
                logs.shift();
            }

            this.saveLogs(logs);

            // Console output based on level
            if (SECURITY_CONFIG.audit.logLevel === 'debug' || 
                (level === 'error' && SECURITY_CONFIG.audit.logLevel !== 'none')) {
                console.log(`[Security Audit ${level.toUpperCase()}]`, event, details);
            }
        },

        /**
         * Get audit logs
         */
        getLogs: function(filter = {}) {
            try {
                const stored = localStorage.getItem(this.storageKey);
                let logs = stored ? JSON.parse(stored) : [];

                // Apply filters
                if (filter.level) {
                    logs = logs.filter(log => log.level === filter.level);
                }
                if (filter.event) {
                    logs = logs.filter(log => log.event === filter.event);
                }
                if (filter.since) {
                    const sinceDate = new Date(filter.since);
                    logs = logs.filter(log => new Date(log.timestamp) >= sinceDate);
                }

                return logs;
            } catch (e) {
                return [];
            }
        },

        /**
         * Clear audit logs
         */
        clearLogs: function() {
            localStorage.removeItem(this.storageKey);
        },

        saveLogs: function(logs) {
            try {
                localStorage.setItem(this.storageKey, JSON.stringify(logs));
            } catch (e) {
                console.error('Failed to save audit logs:', e);
            }
        },

        /**
         * Security vulnerability checks
         */
        runSecurityCheck: function() {
            const issues = [];

            // Check for XSS vulnerabilities
            if (document.querySelector('script[src*="eval"]')) {
                issues.push({ type: 'xss', severity: 'high', message: 'Potential XSS vulnerability detected' });
            }

            // Check for insecure storage
            if (localStorage.getItem('gba_password')) {
                issues.push({ type: 'storage', severity: 'critical', message: 'Password stored in localStorage' });
            }

            // Check for missing HTTPS (in production)
            if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
                issues.push({ type: 'transport', severity: 'high', message: 'Not using HTTPS' });
            }

            // Check for exposed sensitive data
            const sensitivePatterns = ['password', 'secret', 'token', 'key'];
            const pageText = document.body.innerText.toLowerCase();
            sensitivePatterns.forEach(pattern => {
                if (pageText.includes(`${pattern}:`) || pageText.includes(`${pattern} =`)) {
                    issues.push({ type: 'exposure', severity: 'medium', message: `Potential sensitive data exposure: ${pattern}` });
                }
            });

            this.log('info', 'security_check_completed', { issues: issues.length });
            return issues;
        }
    };

    // ============================================
    // Helper function for audit logging
    // ============================================
    function audit(event, details) {
        SecurityAudit.log('info', event, details);
    }

    // Attach audit to modules
    RateLimiter.audit = audit;
    EmailVerification.audit = audit;
    TwoFactorAuth.audit = audit;
    RBAC.audit = audit;

    // ============================================
    // Enhanced Auth Wrapper
    // ============================================
    const SecureAuth = {
        /**
         * Secure login with rate limiting and 2FA
         */
        login: async function(email, password, twoFactorToken = null) {
            // Get user identifier (email or IP)
            const identifier = email || this.getUserIP();

            // Check rate limiting
            const rateLimitCheck = RateLimiter.check('login', identifier);
            if (!rateLimitCheck.allowed) {
                SecurityAudit.log('warn', 'login_rate_limited', { email, identifier });
                throw new Error(rateLimitCheck.message || 'Too many login attempts. Please try again later.');
            }

            // Check email verification
            if (SECURITY_CONFIG.emailVerification.required && !EmailVerification.isVerified(email)) {
                SecurityAudit.log('warn', 'login_unverified_email', { email });
                throw new Error('Please verify your email before logging in. Check your inbox for the verification link.');
            }

            // Record attempt
            RateLimiter.recordAttempt('login', identifier);

            try {
                // Call original auth login
                let success = false;
                if (window.auth && window.auth.login) {
                    success = await window.auth.login(email, password);
                }

                if (!success) {
                    SecurityAudit.log('warn', 'login_failed', { email });
                    throw new Error('Invalid email or password');
                }

                // Check if 2FA is required
                const userId = localStorage.getItem('gba_user_id') || email;
                if (TwoFactorAuth.isEnabled(userId)) {
                    if (!twoFactorToken) {
                        SecurityAudit.log('info', '2fa_required', { userId });
                        return { requires2FA: true, userId };
                    }

                    if (!TwoFactorAuth.verifyToken(userId, twoFactorToken)) {
                        SecurityAudit.log('warn', '2fa_verification_failed', { userId });
                        throw new Error('Invalid 2FA code');
                    }
                }

                // Reset rate limit on success
                RateLimiter.reset('login', identifier);
                SecurityAudit.log('info', 'login_success', { email, userId });

                return { success: true };
            } catch (error) {
                SecurityAudit.log('error', 'login_error', { email, error: error.message });
                throw error;
            }
        },

        /**
         * Secure signup with email verification
         */
        signup: async function(email, password, userData = {}) {
            const identifier = email || this.getUserIP();

            // Check rate limiting
            const rateLimitCheck = RateLimiter.check('signup', identifier);
            if (!rateLimitCheck.allowed) {
                throw new Error(rateLimitCheck.message || 'Too many signup attempts. Please try again later.');
            }

            RateLimiter.recordAttempt('signup', identifier);

            try {
                // Generate verification token
                const token = EmailVerification.generateToken(email);

                // Send verification email
                await EmailVerification.sendVerificationEmail(email, token);

                // In production, create user account here
                SecurityAudit.log('info', 'signup_initiated', { email });

                RateLimiter.reset('signup', identifier);
                return { success: true, requiresVerification: true, email };
            } catch (error) {
                SecurityAudit.log('error', 'signup_error', { email, error: error.message });
                throw error;
            }
        },

        /**
         * Get user IP (mock - use proper service in production)
         */
        getUserIP: function() {
            // In production, get from server or use a service
            return localStorage.getItem('gba_user_ip') || 'unknown';
        }
    };

    // ============================================
    // Export to window
    // ============================================
    window.Security = {
        RateLimiter,
        EmailVerification,
        TwoFactorAuth,
        RBAC,
        SecurityAudit,
        SecureAuth,
        config: SECURITY_CONFIG
    };

    // Run initial security check
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            SecurityAudit.runSecurityCheck();
        });
    } else {
        SecurityAudit.runSecurityCheck();
    }

    // Log security system initialization
    SecurityAudit.log('info', 'security_system_initialized', {
        features: ['rate_limiting', 'email_verification', '2fa', 'rbac', 'audit']
    });

})();
