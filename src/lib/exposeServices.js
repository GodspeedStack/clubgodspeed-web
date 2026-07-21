/**
 * Expose security services to window for use in HTML pages
 * This allows HTML pages to access ES modules without import statements
 *
 * CONTRACT: emailVerification must ALWAYS be exposed, even if optional
 * services (MFA) fail to load. mfaService.js depends on bare specifiers
 * ('otplib', 'qrcode') that only resolve under a bundler — this site ships
 * unbundled ES modules, so that import chain throws at parse time. It is
 * therefore loaded dynamically and treated as optional. Never re-add a
 * static import of mfaService here: it takes emailVerification down with it
 * on every page load (P0 onboarding audit RC2, 2026-07-10).
 */

import { generateAndSendVerificationToken, verifyEmailToken, isEmailVerified, resendVerificationEmail } from './emailVerification.js';

// Expose email verification service (critical path — signup/verify/resend)
window.emailVerification = {
    generateAndSendVerificationToken,
    verifyEmailToken,
    isEmailVerified,
    resendVerificationEmail
};

// Optional: MFA service. Dead code for the parent portal today; load it
// dynamically so its bundler-only dependencies cannot break this module.
import('./mfaService.js')
    .then((mfa) => {
        window.mfaService = {
            generateMFASecret: mfa.generateMFASecret,
            verifyMFAToken: mfa.verifyMFAToken,
            enableMFA: mfa.enableMFA,
            disableMFA: mfa.disableMFA,
            isMFAEnabled: mfa.isMFAEnabled,
            generateBackupCodes: mfa.generateBackupCodes,
            verifyBackupCode: mfa.verifyBackupCode
        };
    })
    .catch(() => {
        // Expected in production (no bundler): otplib/qrcode cannot resolve.
        console.warn('[services] MFA service unavailable (optional, not loaded). Email verification is unaffected.');
    });

// Optional: otplib for security.js 2FA helpers (same bundler constraint)
import('otplib')
    .then((otplib) => { window.otplib = otplib; })
    .catch(() => {
        console.warn('[services] otplib unavailable. 2FA features are disabled.');
    });
