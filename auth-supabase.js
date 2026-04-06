/**
 * Supabase Authentication Manager for Godspeed Basketball
 * Handles parent portal authentication with Supabase
 * Falls back to localStorage mock if Supabase is not configured
 */

(function () {
    'use strict';

    // Supabase configuration — prefer window.SUPABASE_CONFIG (set by env-injector),
    // fall back to hardcoded anon credentials (safe for client-side).
    const _FALLBACK_URL  = 'https://nnqokhqennuxalamnvps.supabase.co';
    const _FALLBACK_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ucW9raHFlbm51eGFsYW1udnBzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0MzcwMDYsImV4cCI6MjA4MjAxMzAwNn0.hH9XR_tgi4Xl8nS__iHwiSkwjHUvwF88491q4O27cis';
    const SUPABASE_CONFIG = (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.url)
        ? window.SUPABASE_CONFIG
        : { url: _FALLBACK_URL, anonKey: _FALLBACK_KEY };

    let supabaseClient = null;
    let isSupabaseAvailable = false;

    /** Detect network/connectivity errors regardless of how the browser phrases them */
    function _isNetworkError(error) {
        if (!error) return false;
        const msg = (error.message || '').toLowerCase();
        // Only match genuine network/fetch failures — NOT any message that
        // happens to contain the substring "fetch" (e.g. Supabase DB errors).
        return msg === 'failed to fetch'
            || msg.includes('networkerror')
            || msg.includes('network error')
            || msg.includes('net::err_')
            || msg.includes('load failed')
            || msg.includes('econnrefused')
            || msg.includes('enotfound')
            || (error.name === 'TypeError' && msg.includes('fetch'));
    }

    /** Detect Supabase database/trigger errors that are transient and retryable */
    function _isDatabaseError(error) {
        if (!error) return false;
        const msg = (error.message || '').toLowerCase();
        return msg.includes('database error')
            || msg.includes('db error')
            || msg.includes('violates')
            || msg.includes('trigger')
            || msg.includes('transaction')
            || msg.includes('timeout');
    }

    // Initialize Supabase client if available
    // Lazy load supabase-js if it failed to load before the auth bootstrap
    let supabaseLoadPromise = null;
    function loadSupabaseScript() {
        if (supabaseLoadPromise) return supabaseLoadPromise;
        supabaseLoadPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
            script.defer = true;
            script.onload = () => resolve(true);
            script.onerror = () => reject(new Error('Failed to load supabase-js from CDN'));
            document.head.appendChild(script);
        });
        return supabaseLoadPromise;
    }

    function initSupabase() {
        if (!SUPABASE_CONFIG.url || !SUPABASE_CONFIG.anonKey) {
            console.warn('Supabase not configured. Using localStorage fallback.');
            return false;
        }

        try {
            if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
                supabaseClient = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey, {
                    auth: {
                        autoRefreshToken: true,
                        persistSession: true,
                        detectSessionInUrl: true,
                        storage: window.localStorage
                    }
                });
                isSupabaseAvailable = true;
                return true;
            }

            console.warn('Supabase client library not loaded. Attempting dynamic load...');
            return false;
        } catch (error) {
            console.error('Failed to initialize Supabase:', error);
            return false;
        }
    }

    async function ensureSupabaseClient() {
        if (isSupabaseAvailable && supabaseClient) return true;
        try {
            await loadSupabaseScript();
            return initSupabase();
        } catch (error) {
            console.error('Unable to load Supabase client:', error);
            return false;
        }
    }

    // Fallback localStorage auth
    const AUTH_KEY = 'gba_parent_auth_token';
    const LOGGED_IN_CLASS = 'logged-in';

    // Initialize on load
    initSupabase();

    // Expose Auth API globally
    window.auth = {
        /**
         * Login with email and password (with security features)
         * @param {string} email - User email
         * @param {string} password - User password
         * @param {string} twoFactorToken - Optional 2FA token
         * @returns {Promise<Object>} { success: boolean, requires2FA?: boolean, userId?: string }
         */
        login: async function (email, password, twoFactorToken = null) {
            // Use SecureAuth wrapper if available (integrates rate limiting, email verification, 2FA)
            if (window.Security && window.Security.SecureAuth) {
                try {
                    return await window.Security.SecureAuth.login(email, password, twoFactorToken);
                } catch (error) {
                    // If SecureAuth fails, fall through to basic auth
                    console.warn('SecureAuth failed, using basic auth:', error);
                }
            }

            // Clear any stale auth state before attempting login
            localStorage.removeItem('gba_user_approved');
            localStorage.removeItem('gba_user_role');

            // Basic Supabase auth (fallback)
            if (await ensureSupabaseClient()) {
                try {
                    const { data, error } = await supabaseClient.auth.signInWithPassword({
                        email: email,
                        password: password
                    });

                    if (error) {
                        console.error('[auth] login error:', error.message, error.status);
                        // Supabase returns "Email not confirmed" when email isn't verified
                        if (error.message && error.message.includes('Email not confirmed')) {
                            throw new Error('Email not confirmed');
                        }
                        throw new Error(error.message);
                    }

                    if (data.session) {
                        const userId = data.user.id;

                        // Post-login email verification check (belt + suspenders)
                        if (data.user && !data.user.email_confirmed_at) {
                            console.warn('[auth] User logged in but email not confirmed:', userId);
                            await supabaseClient.auth.signOut();
                            throw new Error('Please verify your email before logging in. Check your inbox for the verification link.');
                        }

                        // Check if 2FA is required
                        if (window.Security && window.Security.TwoFactorAuth) {
                            const mfaEnabled = window.Security.TwoFactorAuth.isEnabled(userId);
                            if (mfaEnabled && !twoFactorToken) {
                                return { requires2FA: true, userId };
                            }

                            if (mfaEnabled && twoFactorToken) {
                                const mfaValid = window.Security.TwoFactorAuth.verifyToken(userId, twoFactorToken);
                                if (!mfaValid) {
                                    throw new Error('Invalid 2FA code');
                                }
                            }
                        }

                        // Store session info
                        localStorage.setItem(AUTH_KEY, 'supabase_session');
                        localStorage.setItem('gba_user_email', email);
                        localStorage.setItem('gba_user_id', userId);

                        // Fetch role + approval status from profiles table with retry
                        let profile = null;
                        for (let attempt = 0; attempt < 3; attempt++) {
                            profile = await this.getProfile(userId);
                            if (profile) break;
                            // Profile may not exist yet if trigger is slow -- wait and retry
                            console.warn(`[auth] Profile not found for ${userId}, attempt ${attempt + 1}/3`);
                            await new Promise(r => setTimeout(r, 1000));
                        }

                        if (!profile) {
                            console.error('[auth] Profile missing after 3 attempts for user:', userId);
                            // Still let login succeed -- treat as unapproved parent
                            // The waiting room will handle the pending state
                        }

                        const role = profile?.role || data.user.user_metadata?.role || 'parent';
                        const approved = profile?.approved ?? false;
                        localStorage.setItem('gba_user_role', role);
                        localStorage.setItem('gba_user_approved', String(approved));

                        updateUI(true);
                        return { success: true, role, approved };
                    }
                } catch (error) {
                    console.error('[auth] Supabase login failed:', error);
                    if (_isNetworkError(error)) {
                        throw new Error('Cannot connect to the server. Please check your internet connection or disable your adblocker and try again.');
                    }
                    throw error;
                }
            } else {
                throw new Error('Our login system is temporarily unavailable. Please try again in a few minutes.');
            }
        },

        /**
         * Logout current user
         */
        logout: async function () {
            if (isSupabaseAvailable && supabaseClient) {
                try {
                    await supabaseClient.auth.signOut();
                } catch (error) {
                    console.error('Logout error:', error);
                }
            }

            localStorage.removeItem(AUTH_KEY);
            localStorage.removeItem('gba_user_email');
            localStorage.removeItem('gba_user_id');
            localStorage.removeItem('gba_user_role');
            localStorage.removeItem('gba_user_approved');
            updateUI(false);
            window.location.href = 'index.html';
        },

        /**
         * Check if user is logged in
         * @returns {boolean}
         */
        isLoggedIn: function () {
            if (isSupabaseAvailable && supabaseClient) {
                // Check for active session using getSession (async) or check localStorage
                // For synchronous check, use localStorage as fallback
                return !!localStorage.getItem(AUTH_KEY);
            }
            return !!localStorage.getItem(AUTH_KEY);
        },

        /**
         * Get current user
         * @returns {Promise<Object|null>}
         */
        getCurrentUser: async function () {
            if (isSupabaseAvailable && supabaseClient) {
                try {
                    const { data: { user } } = await supabaseClient.auth.getUser();
                    return user;
                } catch (error) {
                    console.error('Get user error:', error);
                    return null;
                }
            }
            return {
                email: localStorage.getItem('gba_user_email'),
                id: localStorage.getItem('gba_user_id')
            };
        },

        /**
         * Get current session
         * @returns {Promise<Object|null>}
         */
        getSession: async function () {
            if (isSupabaseAvailable && supabaseClient) {
                try {
                    const { data: { session } } = await supabaseClient.auth.getSession();
                    return session;
                } catch (error) {
                    console.error('Get session error:', error);
                    return null;
                }
            }
            return localStorage.getItem(AUTH_KEY) ? { access_token: 'mock_token' } : null;
        },

        /**
         * Fetch user profile from the profiles table.
         * Profile is auto-created by a database trigger on signup.
         * @param {string} userId
         * @returns {Promise<Object|null>} { role, approved, full_name, ... }
         */
        getProfile: async function (userId) {
            if (!userId) {
                console.warn('[auth] getProfile called without userId');
                return null;
            }
            if (!isSupabaseAvailable || !supabaseClient) {
                console.warn('[auth] getProfile: Supabase not available');
                return null;
            }
            try {
                const { data, error } = await supabaseClient
                    .from('profiles')
                    .select('role, approved, full_name, email, phone, player_name, grade')
                    .eq('id', userId)
                    .single();
                if (error) {
                    // PGRST116 = "No rows found" -- this is a real missing profile, not a DB error
                    if (error.code === 'PGRST116') {
                        console.warn('[auth] No profile row for user:', userId);
                        return null;
                    }
                    // Any other error is a DB/network issue -- log with detail
                    console.error('[auth] getProfile DB error for user:', userId, error.code, error.message);
                    return null;
                }
                return data;
            } catch (err) {
                console.error('[auth] getProfile exception for user:', userId, err);
                return null;
            }
        },

        /**
         * Initialize auth state
         */
        init: async function () {
            if (isSupabaseAvailable && supabaseClient) {
                try {
                    // Check for existing session
                    const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
                    if (sessionError) {
                        console.error('[auth] init getSession error:', sessionError.message);
                    }
                    if (session) {
                        localStorage.setItem(AUTH_KEY, 'supabase_session');
                        localStorage.setItem('gba_user_email', session.user.email);
                        localStorage.setItem('gba_user_id', session.user.id);
                        // Refresh profile data (role + approval) on every init
                        const profile = await this.getProfile(session.user.id);
                        if (profile) {
                            localStorage.setItem('gba_user_role', profile.role || 'parent');
                            localStorage.setItem('gba_user_approved', String(profile.approved ?? false));
                        } else {
                            // Profile missing -- default to unapproved so waiting room shows
                            console.warn('[auth] init: no profile for session user:', session.user.id);
                            localStorage.setItem('gba_user_approved', 'false');
                            localStorage.setItem('gba_user_role', 'parent');
                        }
                        updateUI(true);
                    } else {
                        // No session -- clean up any stale localStorage to prevent ghost logins
                        localStorage.removeItem(AUTH_KEY);
                        localStorage.removeItem('gba_user_email');
                        localStorage.removeItem('gba_user_id');
                        localStorage.removeItem('gba_user_role');
                        localStorage.removeItem('gba_user_approved');
                        updateUI(false);
                    }
                } catch (initErr) {
                    console.error('[auth] init session check failed:', initErr);
                    updateUI(false);
                }

                // Listen for auth state changes
                supabaseClient.auth.onAuthStateChange(async (event, session) => {
                    console.log('[auth] onAuthStateChange:', event);
                    if (event === 'SIGNED_IN' && session) {
                        localStorage.setItem(AUTH_KEY, 'supabase_session');
                        localStorage.setItem('gba_user_email', session.user.email);
                        localStorage.setItem('gba_user_id', session.user.id);
                        // Fetch approval status before routing -- prevents unapproved
                        // accounts from reaching the dashboard on email confirmation redirect
                        let profile = null;
                        for (let attempt = 0; attempt < 2; attempt++) {
                            profile = await window.auth.getProfile(session.user.id);
                            if (profile) break;
                            await new Promise(r => setTimeout(r, 500));
                        }
                        if (profile) {
                            localStorage.setItem('gba_user_role', profile.role || 'parent');
                            localStorage.setItem('gba_user_approved', String(profile.approved ?? false));
                        } else {
                            // Default deny: treat missing profile as unapproved
                            console.warn('[auth] onAuthStateChange: no profile for user:', session.user.id);
                            localStorage.setItem('gba_user_approved', 'false');
                            localStorage.setItem('gba_user_role', 'parent');
                        }
                        updateUI(true);
                    } else if (event === 'SIGNED_OUT') {
                        localStorage.removeItem(AUTH_KEY);
                        localStorage.removeItem('gba_user_email');
                        localStorage.removeItem('gba_user_id');
                        localStorage.removeItem('gba_user_role');
                        localStorage.removeItem('gba_user_approved');
                        updateUI(false);
                    } else if (event === 'TOKEN_REFRESHED' && session) {
                        // Session refreshed -- update stored email/id in case they changed
                        localStorage.setItem('gba_user_email', session.user.email);
                        localStorage.setItem('gba_user_id', session.user.id);
                    }
                });
            } else {
                // Supabase not available -- clear any stale session data
                // This prevents ghost logins when Supabase CDN fails to load
                const hasAuth = localStorage.getItem(AUTH_KEY);
                if (hasAuth === 'supabase_session') {
                    // Had a real Supabase session but client isn't available now
                    console.warn('[auth] Supabase unavailable but found stale session -- clearing');
                    localStorage.removeItem(AUTH_KEY);
                    localStorage.removeItem('gba_user_email');
                    localStorage.removeItem('gba_user_id');
                    localStorage.removeItem('gba_user_role');
                    localStorage.removeItem('gba_user_approved');
                }
                const isLoggedIn = !!localStorage.getItem(AUTH_KEY);
                updateUI(isLoggedIn);
            }
        },

        /**
         * Get Supabase client (for direct database access)
         * @returns {Object|null}
         */
        getSupabaseClient: function () {
            return supabaseClient;
        },

        /**
         * Check if Supabase is available
         * @returns {boolean}
         */
        isSupabaseAvailable: function () {
            return isSupabaseAvailable;
        },

        /**
         * Sign up new user with email verification
         * @param {string} email - User email
         * @param {string} password - User password
         * @param {Object} metadata - Additional user metadata
         * @returns {Promise<Object>} { success: boolean, requiresVerification: boolean }
         */
        signup: async function (email, password, metadata = {}) {
            if (!(await ensureSupabaseClient())) {
                throw new Error('Our signup system is temporarily unavailable. Please try again in a few minutes.');
            }

            const MAX_RETRIES = 2;
            let lastError = null;

            for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
                try {
                    console.log('[auth] signUp attempt', attempt, 'for:', email);
                    const { data, error } = await supabaseClient.auth.signUp({
                        email: email,
                        password: password,
                        options: {
                            data: metadata,
                            emailRedirectTo: 'https://www.clubgodspeed.com/parent-portal.html'
                        }
                    });

                    if (error) {
                        console.error('[auth] signUp error (attempt ' + attempt + '):', error.message, error.status, JSON.stringify(error));
                        // Retry on transient database/server errors
                        if (_isDatabaseError(error) && attempt < MAX_RETRIES) {
                            lastError = error;
                            console.warn('[auth] Retrying signup after database error...');
                            await new Promise(r => setTimeout(r, 1500 * attempt));
                            continue;
                        }
                        throw new Error(error.message);
                    }

                    // Supabase duplicate-email handling (email confirmation enabled):
                    // Case 1: data.user is null, no error — email already exists
                    // Case 2: data.user has empty identities array — confirmed user already exists
                    // Both are Supabase's email enumeration protection; surface as "already registered"
                    if (!data.user) {
                        console.warn('[auth] signUp returned null user for:', email);
                        throw new Error('An account with this email has already been registered.');
                    }

                    if (data.user.identities && data.user.identities.length === 0) {
                        console.warn('[auth] signUp returned empty identities (existing account) for:', email);
                        throw new Error('An account with this email has already been registered.');
                    }

                    // Genuine new user — profile will be created by handle_new_user() trigger.
                    // Fallback: ensure profile row exists even if trigger failed.
                    try {
                        const { error: profileCheckError } = await supabaseClient
                            .from('profiles')
                            .select('id')
                            .eq('id', data.user.id)
                            .single();

                        if (profileCheckError) {
                            console.warn('[auth] Profile not created by trigger, inserting fallback profile for:', email);
                            const { error: insertError } = await supabaseClient
                                .from('profiles')
                                .upsert({
                                    id: data.user.id,
                                    email: email,
                                    full_name: metadata.parent_name || metadata.full_name || null,
                                    phone: metadata.phone || null,
                                    player_name: metadata.player_name || null,
                                    grade: metadata.grade || null,
                                    role: 'parent',
                                    approved: false
                                }, { onConflict: 'id' });

                            if (insertError) {
                                // Non-fatal — signup succeeded, profile can be fixed later by admin
                                console.warn('[auth] Fallback profile insert failed (non-blocking):', insertError.message);
                            } else {
                                console.log('[auth] Fallback profile created successfully for:', email);
                            }
                        }
                    } catch (profileFallbackErr) {
                        // Non-fatal — the user IS signed up, profile will be reconciled
                        console.warn('[auth] Profile fallback check failed (non-blocking):', profileFallbackErr);
                    }

                    // Also ensure login_requests row exists for admin approval workflow
                    try {
                        // Check if a login_request already exists for this user
                        const { data: existingLR } = await supabaseClient
                            .from('login_requests')
                            .select('id')
                            .eq('user_id', data.user.id)
                            .maybeSingle();

                        if (!existingLR) {
                            const { error: lrError } = await supabaseClient
                                .from('login_requests')
                                .insert({
                                    user_id: data.user.id,
                                    email: email,
                                    full_name: metadata.parent_name || metadata.full_name || null,
                                    requested_role: 'parent',
                                    grade: metadata.grade || null,
                                    player_name: metadata.player_name || null
                                });

                            if (lrError) {
                                console.warn('[auth] Fallback login_request insert failed (non-blocking):', lrError.message);
                            }
                        }
                    } catch (lrFallbackErr) {
                        console.warn('[auth] login_request fallback failed (non-blocking):', lrFallbackErr);
                    }

                    return {
                        success: true,
                        requiresVerification: true,
                        userId: data.user.id
                    };
                } catch (error) {
                    lastError = error;
                    console.error('[auth] signup failed (attempt ' + attempt + '):', error.message, error);

                    // Retry on transient database/network errors (but not on user-facing errors)
                    if (attempt < MAX_RETRIES && (_isDatabaseError(error) || _isNetworkError(error))) {
                        console.warn('[auth] Retrying signup in', (1500 * attempt) + 'ms...');
                        await new Promise(r => setTimeout(r, 1500 * attempt));
                        continue;
                    }

                    if (_isNetworkError(error)) {
                        throw new Error('Cannot connect to the server. Please check your internet connection or disable your adblocker and try again.');
                    }
                    if (_isDatabaseError(error)) {
                        throw new Error('database_error: Our system hit a temporary issue saving your account. Please try again in a moment.');
                    }
                    throw error;
                }
            }

            // Should not reach here, but safety net
            throw lastError || new Error('Signup failed after multiple attempts. Please try again.');
        },

        signInWithOAuth: async function (options) {
            if (await ensureSupabaseClient()) {
                return await supabaseClient.auth.signInWithOAuth(options);
            }
            return { error: { message: 'Supabase not available' } };
        },

        /**
         * Server-side approval verification. Queries profiles table directly
         * and syncs localStorage. Returns { approved, denied, role } or null on error.
         * Call on every dashboard load and after OAuth redirect.
         */
        verifyApproval: async function () {
            if (!isSupabaseAvailable || !supabaseClient) {
                console.warn('[auth] verifyApproval: Supabase not available');
                // Return explicit unapproved instead of null so callers don't fall through
                return { approved: false, denied: false, role: 'parent', error: 'supabase_unavailable' };
            }
            try {
                const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
                if (userError) {
                    console.error('[auth] verifyApproval getUser error:', userError.message);
                    return { approved: false, denied: false, role: 'parent', error: 'auth_error' };
                }
                if (!user) {
                    console.warn('[auth] verifyApproval: no authenticated user');
                    return { approved: false, denied: false, role: 'parent', error: 'no_user' };
                }

                // Retry profile fetch up to 2 times for transient failures
                let profile = null;
                for (let attempt = 0; attempt < 2; attempt++) {
                    profile = await this.getProfile(user.id);
                    if (profile) break;
                    if (attempt === 0) await new Promise(r => setTimeout(r, 500));
                }

                if (!profile) {
                    // Profile missing -- treat as unapproved (trigger may not have fired)
                    console.warn('[auth] verifyApproval: no profile for user:', user.id);
                    localStorage.setItem('gba_user_approved', 'false');
                    return { approved: false, denied: false, role: 'parent', error: 'no_profile' };
                }

                localStorage.setItem('gba_user_approved', String(profile.approved ?? false));
                localStorage.setItem('gba_user_role', profile.role || 'parent');

                // Check denial status in login_requests
                let denied = false;
                try {
                    const { data: reqData } = await supabaseClient
                        .from('login_requests')
                        .select('status')
                        .eq('user_id', user.id)
                        .order('created_at', { ascending: false })
                        .limit(1)
                        .single();
                    if (reqData?.status === 'denied') denied = true;
                } catch (e) {
                    // login_requests check is non-critical
                    console.warn('[auth] login_requests check failed (non-critical):', e.message || e);
                }

                return {
                    approved: profile.approved === true,
                    denied: denied,
                    role: profile.role || 'parent'
                };
            } catch (err) {
                console.error('[auth] verifyApproval error:', err);
                // Return explicit unapproved -- NEVER return null
                return { approved: false, denied: false, role: 'parent', error: 'exception' };
            }
        }
    };

    function updateUI(isLoggedIn) {
        if (isLoggedIn) {
            document.body.classList.add(LOGGED_IN_CLASS);
        } else {
            document.body.classList.remove(LOGGED_IN_CLASS);
        }

        // Dispatch custom event so page-specific code (e.g. parent-portal.js) can react
        window.dispatchEvent(new CustomEvent('gba:authStateChanged', {
            detail: { isLoggedIn }
        }));

        // Dropdown Update
        const dropdown = document.querySelector('.login-dropdown');
        if (dropdown) {
            const oldLogout = dropdown.querySelector('.logout-option');
            if (oldLogout) oldLogout.remove();

            if (isLoggedIn) {
                const logoutLink = document.createElement('a');
                logoutLink.href = "#";
                logoutLink.className = "login-option logout-option";
                logoutLink.style.borderTop = "1px solid #eee";
                logoutLink.innerHTML = `
                    <span style="display: flex; align-items: center; gap: 10px; color: #ff3b30;">
                         <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                         Sign Out
                    </span>
                `;
                logoutLink.onclick = (e) => {
                    e.preventDefault();
                    window.auth.logout();
                };
                dropdown.appendChild(logoutLink);
            }
        }
    }

    // Auto-init on load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            window.auth.init();
        });
    } else {
        window.auth.init();
    }

})();

