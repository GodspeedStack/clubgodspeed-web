/**
 * Email Verification Service
 * Integrates with Supabase for email verification
 */

import { supabase } from './supabaseClient';

// Helper to get sendEmail function (lazy load)
async function getSendEmail() {
    try {
        const resendModule = await import('./resendClient.js');
        return resendModule.sendEmail;
    } catch (error) {
        // Fallback if Resend is not configured
        console.warn('Resend client not available, using Supabase Auth email verification');
        return null;
    }
}

/**
 * Generate and send email verification token
 * @param {string} userId - User ID
 * @param {string} email - User email
 * @returns {Promise<string>} Verification token
 */
export async function generateAndSendVerificationToken(userId, email) {
    try {
        // Call Supabase function to generate token
        const { data, error } = await supabase.rpc('generate_email_verification_token', {
            p_user_id: userId,
            p_email: email
        });

        if (error) throw error;

        const token = data;

        // Send verification email via Resend (if available) or Supabase Auth
        const verificationUrl = `${window.location.origin}/verify-email.html?token=${token}&email=${encodeURIComponent(email)}`;
        
        // Try Resend first
        const sendEmailFn = await getSendEmail();
        if (sendEmailFn) {
            try {
                await sendEmailFn({
            from: 'Godspeed Basketball <onboarding@resend.dev>',
            to: email,
            subject: 'Verify Your Email - Godspeed Basketball',
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                </head>
                <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <div style="background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); padding: 40px; text-align: center; border-radius: 12px 12px 0 0;">
                        <h1 style="color: white; margin: 0; font-size: 28px;">GODSPEED BASKETBALL</h1>
                    </div>
                    <div style="background: #ffffff; padding: 40px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                        <h2 style="color: #111827; margin-top: 0;">Verify Your Email Address</h2>
                        <p>Thank you for signing up! Please verify your email address to complete your registration.</p>
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="${verificationUrl}" style="display: inline-block; background-color: #2563eb; color: #ffffff; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600;">Verify Email Address</a>
                        </div>
                        <p style="color: #6b7280; font-size: 14px;">Or copy and paste this link into your browser:</p>
                        <p style="color: #6b7280; font-size: 12px; word-break: break-all;">${verificationUrl}</p>
                        <p style="color: #6b7280; font-size: 12px; margin-top: 30px;">This link will expire in 24 hours.</p>
                    </div>
                </body>
                </html>
            `
                });
                return token;
            } catch (error) {
                console.warn('Failed to send via Resend, trying Supabase Auth:', error);
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
            } catch (error) {
                console.error('Failed to send verification email:', error);
                throw error;
            }
        }

        return token;
    } catch (error) {
        console.error('Failed to generate verification token:', error);
        throw error;
    }
}

/**
 * Verify email token
 * @param {string} token - Verification token
 * @returns {Promise<boolean>} Success status
 */
export async function verifyEmailToken(token) {
    try {
        const { data, error } = await supabase.rpc('verify_email_token', {
            p_token: token
        });

        if (error) throw error;

        return data === true;
    } catch (error) {
        console.error('Failed to verify token:', error);
        return false;
    }
}

/**
 * Check if user email is verified
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} Verified status
 */
export async function isEmailVerified(userId) {
    try {
        const { data, error } = await supabase.rpc('is_email_verified', {
            p_user_id: userId
        });

        if (error) throw error;

        return data === true;
    } catch (error) {
        console.error('Failed to check email verification:', error);
        return false;
    }
}

/**
 * Resend verification email
 * @param {string} userId - User ID
 * @param {string} email - User email
 * @returns {Promise<boolean>} Success status
 */
export async function resendVerificationEmail(userId, email) {
    try {
        const token = await generateAndSendVerificationToken(userId, email);
        return !!token;
    } catch (error) {
        console.error('Failed to resend verification email:', error);
        return false;
    }
}
