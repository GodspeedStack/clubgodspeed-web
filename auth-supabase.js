/**
 * Supabase Authentication Manager for Godspeed Basketball
 * Handles parent portal authentication with Supabase
 * Falls back to localStorage mock if Supabase is not configured
 */

(function () {
    'use strict';

    // Supabase configuration - can be overridden via window.SUPABASE_CONFIG
    const SUPABASE_CONFIG = window.SUPABASE_CONFIG || {
        url: window.VITE_SUPABASE_URL || '',
        anonKey: window.VITE_SUPABASE_ANON_KEY || ''
    };

    let supabaseClient = null;
    let isSupabaseAvailable = false;

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

            // Basic Supabase auth (fallback)
            if (await ensureSupabaseClient()) {
                try {
                    // Check email verification if required
                    const { data: { user: existingUser } } = await supabaseClient.auth.getUser();
                    if (existingUser && !existingUser.email_confirmed_at) {
                        throw new Error('Please verify your email before logging in. Check your inbox for the verification link.');
                    }

                    const { data, error } = await supabaseClient.auth.signInWithPassword({
                        email: email,
                        password: password
                    });

                    if (error) {
                        console.error('Login error:', error.message);
                        throw new Error(error.message);
                    }

                    if (data.session) {
                        const userId = data.user.id;

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

                        // Set role from user metadata
                        const role = data.user.user_metadata?.role || 'parent';
                        localStorage.setItem('gba_user_role', role);

                        // Create or update parent account
                        await this.ensureParentAccount(userId, email);

                        updateUI(true);
                        return { success: true };
                    }
                } catch (error) {
                    console.error('Supabase login failed:', error);
                    throw error;
                }
            } else {
                // Fallback to localStorage mock
                console.warn('Using localStorage fallback for login');
                localStorage.setItem(AUTH_KEY, 'valid_token_' + Date.now());
                localStorage.setItem('gba_user_email', email);
                updateUI(true);
                return { success: true };
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
         * Ensure parent account exists in database
         * @private
         */
        ensureParentAccount: async function (userId, email) {
            if (!isSupabaseAvailable || !supabaseClient) return;

            try {
                // Check if parent account exists
                const { data: existing } = await supabaseClient
                    .from('parent_accounts')
                    .select('id')
                    .eq('user_id', userId)
                    .single();

                if (!existing) {
                    // Create parent account
                    const { error } = await supabaseClient
                        .from('parent_accounts')
                        .insert({
                            user_id: userId,
                            email: email
                        });

                    if (error) {
                        console.error('Failed to create parent account:', error);
                    }
                }

                // Ensure user profile exists (for unified role system)
                const { data: profile } = await supabaseClient
                    .from('user_profiles')
                    .select('id')
                    .eq('id', userId)
                    .single();

                if (!profile) {
                    // Profile will be created by trigger, but ensure it exists
                    const { error: profileError } = await supabaseClient
                        .from('user_profiles')
                        .insert({
                            id: userId,
                            email: email,
                            role: 'parent'
                        });

                    if (profileError && !profileError.message.includes('duplicate')) {
                        console.error('Failed to create user profile:', profileError);
                    }
                }
            } catch (error) {
                console.error('Error ensuring parent account:', error);
            }
        },

        /**
         * Initialize auth state
         */
        init: async function () {
            if (isSupabaseAvailable && supabaseClient) {
                // Check for existing session
                const { data: { session } } = await supabaseClient.auth.getSession();
                if (session) {
                    localStorage.setItem(AUTH_KEY, 'supabase_session');
                    localStorage.setItem('gba_user_email', session.user.email);
                    localStorage.setItem('gba_user_id', session.user.id);
                    updateUI(true);
                } else {
                    updateUI(false);
                }

                // Listen for auth state changes
                supabaseClient.auth.onAuthStateChange((event, session) => {
                    if (event === 'SIGNED_IN' && session) {
                        localStorage.setItem(AUTH_KEY, 'supabase_session');
                        localStorage.setItem('gba_user_email', session.user.email);
                        localStorage.setItem('gba_user_id', session.user.id);
                        updateUI(true);
                    } else if (event === 'SIGNED_OUT') {
                        localStorage.removeItem(AUTH_KEY);
                        localStorage.removeItem('gba_user_email');
                        localStorage.removeItem('gba_user_id');
                        updateUI(false);
                    }
                });
            } else {
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
            if (await ensureSupabaseClient()) {
                try {
                    // Use SecureAuth wrapper if available
                    if (window.Security && window.Security.SecureAuth) {
                        return await window.Security.SecureAuth.signup(email, password, metadata);
                    }

                    // Basic signup
                    const { data, error } = await supabaseClient.auth.signUp({
                        email: email,
                        password: password,
                        options: {
                            data: metadata,
                            emailRedirectTo: 'https://clubgodspeed.com/verify-email.html'
                        }
                    });

                    if (error) {
                        throw new Error(error.message);
                    }

                    if (data.user) {
                        // User profile will be created by trigger
                        return {
                            success: true,
                            requiresVerification: true,
                            userId: data.user.id
                        };
                    }
                } catch (error) {
                    console.error('Signup failed:', error);
                    throw error;
                }
            }
            throw new Error('Supabase not available');
        },

        signInWithOAuth: async function (options) {
            if (await ensureSupabaseClient()) {
                return await supabaseClient.auth.signInWithOAuth(options);
            }
            return { error: { message: 'Supabase not available' } };
        }
    };

    function updateUI(isLoggedIn) {
        if (isLoggedIn) {
            document.body.classList.add(LOGGED_IN_CLASS);
        } else {
            document.body.classList.remove(LOGGED_IN_CLASS);
        }

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

