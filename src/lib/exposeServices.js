/**
 * Expose security services to window for use in HTML pages
 * This allows HTML pages to access ES modules without import statements
 */

import { generateAndSendVerificationToken, verifyEmailToken, isEmailVerified, resendVerificationEmail } from './emailVerification.js';
import { generateMFASecret, verifyMFAToken, enableMFA, disableMFA, isMFAEnabled, generateBackupCodes, verifyBackupCode } from './mfaService.js';

// Expose email verification service
window.emailVerification = {
 generateAndSendVerificationToken,
 verifyEmailToken,
 isEmailVerified,
 resendVerificationEmail
};

// Expose MFA service
window.mfaService = {
 generateMFASecret,
 verifyMFAToken,
 enableMFA,
 disableMFA,
 isMFAEnabled,
 generateBackupCodes,
 verifyBackupCode
};

// Expose otplib if available (for security.js)
if (typeof window !== 'undefined') {
 // Try to import otplib dynamically
 import('otplib').then(otplib => {
 window.otplib = otplib;
 }).catch(error => {
 console.warn('otplib not available. 2FA features may be limited:', error);
 });
}
