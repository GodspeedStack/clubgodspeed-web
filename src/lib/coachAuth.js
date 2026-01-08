/**
 * Coach Authentication Service
 * Migrates coach portal from hash-based to Supabase Auth
 * Maintains backward compatibility during transition
 */

import { supabase } from './supabaseClient';

/**
 * Authenticate coach using Supabase
 * @param {string} email - Coach email
 * @param {string} password - Coach password
 * @returns {Promise<Object>} { success: boolean, role: string, requires2FA?: boolean }
 */
export async function authenticateCoach(email, password) {
    try {
        // Sign in with Supabase
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (error) {
            throw error;
        }

        if (!data.user) {
            throw new Error('Authentication failed');
        }

        // Get user role from profile
        const { data: profile, error: profileError } = await supabase
            .from('user_profiles')
            .select('role')
            .eq('id', data.user.id)
            .single();

        if (profileError && !profileError.message.includes('No rows')) {
            console.error('Failed to get user profile:', profileError);
        }

        const role = profile?.role || data.user.user_metadata?.role || 'coach';

        // Check if role is coach or admin
        if (role !== 'coach' && role !== 'admin') {
            await supabase.auth.signOut();
            throw new Error('Access denied. Coach or admin role required.');
        }

        // Check if 2FA is required
        const { data: mfaData } = await supabase
            .from('user_mfa')
            .select('enabled')
            .eq('user_id', data.user.id)
            .single();

        if (mfaData?.enabled) {
            return {
                success: false,
                requires2FA: true,
                userId: data.user.id,
                role
            };
        }

        return {
            success: true,
            role,
            userId: data.user.id,
            email: data.user.email
        };
    } catch (error) {
        console.error('Coach authentication failed:', error);
        throw error;
    }
}

/**
 * Verify 2FA for coach login
 * @param {string} userId - User ID
 * @param {string} token - 2FA token
 * @returns {Promise<boolean>} Success
 */
export async function verifyCoach2FA(userId, token) {
    try {
        const { verifyMFAToken } = await import('./mfaService.js');
        return await verifyMFAToken(userId, token);
    } catch (error) {
        console.error('2FA verification failed:', error);
        return false;
    }
}

/**
 * Create coach account in Supabase
 * @param {string} email - Coach email
 * @param {string} password - Coach password
 * @param {string} firstName - First name
 * @param {string} lastName - Last name
 * @param {string} role - 'coach' or 'admin'
 * @returns {Promise<Object>} { success: boolean, userId?: string }
 */
export async function createCoachAccount(email, password, firstName, lastName, role = 'coach') {
    try {
        // Sign up coach
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    role,
                    first_name: firstName,
                    last_name: lastName
                }
            }
        });

        if (error) {
            throw error;
        }

        if (!data.user) {
            throw new Error('Failed to create coach account');
        }

        // Update user profile role (trigger should create it, but ensure role is set)
        const { error: profileError } = await supabase
            .from('user_profiles')
            .upsert({
                id: data.user.id,
                email,
                role,
                first_name: firstName,
                last_name: lastName
            }, {
                onConflict: 'id'
            });

        if (profileError) {
            console.error('Failed to update user profile:', profileError);
        }

        return {
            success: true,
            userId: data.user.id
        };
    } catch (error) {
        console.error('Failed to create coach account:', error);
        throw error;
    }
}

/**
 * Migrate existing coach from hash-based to Supabase
 * This function helps migrate coaches who were using the old hash-based system
 * @param {string} email - Coach email
 * @param {string} password - New password for Supabase
 * @param {string} role - 'coach' or 'admin'
 * @returns {Promise<Object>} Migration result
 */
export async function migrateCoachToSupabase(email, password, role = 'coach') {
    try {
        // Check if user already exists
        const { data: existing } = await supabase
            .from('user_profiles')
            .select('id, email')
            .eq('email', email)
            .single();

        if (existing) {
            return {
                success: true,
                migrated: false,
                message: 'Coach already exists in Supabase'
            };
        }

        // Create new account
        const result = await createCoachAccount(email, password, '', '', role);
        
        return {
            success: true,
            migrated: true,
            userId: result.userId
        };
    } catch (error) {
        console.error('Failed to migrate coach:', error);
        throw error;
    }
}
