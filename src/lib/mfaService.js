/**
 * Multi-Factor Authentication (MFA/2FA) Service
 * Uses TOTP (Time-based One-Time Password) via otplib
 */

import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { supabase } from './supabaseClient.js';

// Configure TOTP
authenticator.options = {
    window: [1, 1], // Allow 1 time step before and after
    step: 30 // 30-second time steps
};

/**
 * Generate MFA secret and QR code for user
 * @param {string} userId - User ID
 * @param {string} email - User email
 * @returns {Promise<Object>} { secret, qrCodeUrl, qrCodeDataUrl }
 */
export async function generateMFASecret(userId, email) {
    try {
        // Generate secret
        const secret = authenticator.generateSecret();
        const issuer = 'Godspeed Basketball';
        const serviceName = email;

        // Generate TOTP URL
        const otpAuthUrl = authenticator.keyuri(serviceName, issuer, secret);

        // Generate QR code data URL
        const qrCodeDataUrl = await QRCode.toDataURL(otpAuthUrl);

        // Store secret in database (via Supabase function)
        // Note: In production, encrypt the secret before storing
        const { error } = await supabase
            .from('user_mfa')
            .upsert({
                user_id: userId,
                secret: secret, // TODO: Encrypt in production
                enabled: false
            }, {
                onConflict: 'user_id'
            });

        if (error) throw error;

        return {
            secret,
            qrCodeUrl: otpAuthUrl,
            qrCodeDataUrl
        };
    } catch (error) {
        console.error('Failed to generate MFA secret:', error);
        throw error;
    }
}

/**
 * Verify TOTP token
 * @param {string} userId - User ID
 * @param {string} token - 6-digit TOTP token
 * @param {boolean} allowUnenabled - Allow verification even if MFA not enabled (for setup)
 * @returns {Promise<boolean>} Valid token
 */
export async function verifyMFAToken(userId, token, allowUnenabled = false) {
    try {
        // Get user's MFA secret from database
        const { data, error } = await supabase
            .from('user_mfa')
            .select('secret, enabled')
            .eq('user_id', userId)
            .single();

        if (error || !data) {
            throw new Error('MFA not configured for user');
        }

        if (!allowUnenabled && !data.enabled) {
            throw new Error('MFA not enabled for user');
        }

        // Verify token
        const isValid = authenticator.verify({
            token,
            secret: data.secret
        });

        if (isValid && data.enabled) {
            // Update last_used_at only if already enabled
            await supabase
                .from('user_mfa')
                .update({ last_used_at: new Date().toISOString() })
                .eq('user_id', userId);
        }

        return isValid;
    } catch (error) {
        console.error('Failed to verify MFA token:', error);
        return false;
    }
}

/**
 * Enable MFA for user (after verification)
 * @param {string} userId - User ID
 * @param {string} token - Verification token
 * @returns {Promise<boolean>} Success
 */
export async function enableMFA(userId, token) {
    try {
        // Verify token first (allow unenabled for setup flow)
        const isValid = await verifyMFAToken(userId, token, true);
        
        if (!isValid) {
            throw new Error('Invalid verification token');
        }

        // Get the secret from database (it was stored during generateMFASecret)
        const { data: mfaData, error: fetchError } = await supabase
            .from('user_mfa')
            .select('secret')
            .eq('user_id', userId)
            .single();

        if (fetchError || !mfaData) {
            throw new Error('MFA secret not found. Please generate a new secret.');
        }

        // Enable MFA via Supabase function (pass the secret)
        const { data, error } = await supabase.rpc('enable_user_mfa', {
            p_user_id: userId,
            p_secret: mfaData.secret
        });

        if (error) throw error;

        // Generate backup codes
        const backupCodes = await generateBackupCodes(userId);

        return {
            success: true,
            backupCodes
        };
    } catch (error) {
        console.error('Failed to enable MFA:', error);
        throw error;
    }
}

/**
 * Disable MFA for user
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} Success
 */
export async function disableMFA(userId) {
    try {
        const { data, error } = await supabase.rpc('disable_user_mfa', {
            p_user_id: userId
        });

        if (error) throw error;

        return data === true;
    } catch (error) {
        console.error('Failed to disable MFA:', error);
        return false;
    }
}

/**
 * Check if MFA is enabled for user
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} Enabled status
 */
export async function isMFAEnabled(userId) {
    try {
        const { data, error } = await supabase.rpc('is_mfa_enabled', {
            p_user_id: userId
        });

        if (error) throw error;

        return data === true;
    } catch (error) {
        console.error('Failed to check MFA status:', error);
        return false;
    }
}

/**
 * Generate backup codes
 * @param {string} userId - User ID
 * @param {number} count - Number of codes to generate (default: 10)
 * @returns {Promise<string[]>} Array of backup codes
 */
export async function generateBackupCodes(userId, count = 10) {
    try {
        const { data, error } = await supabase.rpc('generate_mfa_backup_codes', {
            p_user_id: userId,
            p_count: count
        });

        if (error) throw error;

        return data.map(row => row.code);
    } catch (error) {
        console.error('Failed to generate backup codes:', error);
        throw error;
    }
}

/**
 * Verify backup code
 * @param {string} userId - User ID
 * @param {string} code - Backup code
 * @returns {Promise<boolean>} Valid code
 */
export async function verifyBackupCode(userId, code) {
    try {
        const { data, error } = await supabase.rpc('verify_mfa_backup_code', {
            p_user_id: userId,
            p_code: code
        });

        if (error) throw error;

        return data === true;
    } catch (error) {
        console.error('Failed to verify backup code:', error);
        return false;
    }
}
