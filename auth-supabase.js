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
    function initSupabase() {
        if (!SUPABASE_CONFIG.url || !SUPABASE_CONFIG.anonKey) {
            console.warn('Supabase not configured. Using localStorage fallback.');
            return false;
        }

        try {
            // Check if Supabase is loaded from CDN
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
            } else {
                console.warn('Supabase client library not loaded. Add: <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>');
                return false;
            }
        } catch (error) {
            console.error('Failed to initialize Supabase:', error);
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
         * Login with email and password
         * @param {string} email - User email
         * @param {string} password - User password
         * @returns {Promise<boolean>} Success status
         */
        login: async function (email, password) {
            if (isSupabaseAvailable && supabaseClient) {
                try {
                    const { data, error } = await supabaseClient.auth.signInWithPassword({
                        email: email,
                        password: password
                    });

                    if (error) {
                        console.error('Login error:', error.message);
                        throw new Error(error.message);
                    }

                    if (data.session) {
                        // Store session info
                        localStorage.setItem(AUTH_KEY, 'supabase_session');
                        localStorage.setItem('gba_user_email', email);
                        localStorage.setItem('gba_user_id', data.user.id);
                        
                        // Create or update parent account
                        await this.ensureParentAccount(data.user.id, email);
                        
                        updateUI(true);
                        return true;
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
                return true;
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
                // Check for active session
                const session = supabaseClient.auth.session();
                return !!session || !!localStorage.getItem(AUTH_KEY);
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
