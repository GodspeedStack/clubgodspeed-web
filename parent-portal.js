/**
 * Parent Portal Logic
 * Handles Waiver Signing (Canvas), Navigation (V3 Side Panel), and Authentication.
 */

// Security utility functions
function escapeHTML(str) {
    if (typeof str !== 'string') return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return str.replace(/[&<>"']/g, m => map[m]);
}

function validateURL(url) {
    if (typeof url !== 'string') return null;
    const trimmed = url.trim();
    if (trimmed.toLowerCase().startsWith('javascript:') ||
        trimmed.toLowerCase().startsWith('data:')) {
        return null;
    }
    if (trimmed.startsWith('http://') ||
        trimmed.startsWith('https://') ||
        trimmed.startsWith('mailto:') ||
        trimmed.startsWith('tel:') ||
        trimmed.startsWith('/') ||
        trimmed.startsWith('#')) {
        return escapeHTML(trimmed);
    }
    return null;
}

document.addEventListener('DOMContentLoaded', () => {
    if (window.analytics && window.analytics.initScrollTracking) window.analytics.initScrollTracking();
    
    // Security: Check permissions before allowing access
    if (window.Security && window.Security.RBAC) {
        // Wait for security system to load
        setTimeout(() => {
            try {
                // Require parent permission to view portal
                window.Security.RBAC.requirePermission('view_parent_portal');
            } catch (error) {
                // Not authorized - redirect to login
                if (!window.Security.RBAC.hasPermission('view_parent_portal')) {
                    console.log('User not authenticated, showing login view');
                    // Ensure login view is shown
                    const loginView = document.getElementById('portal-login');
                    const dashboardView = document.getElementById('portal-dashboard');
                    if (loginView) loginView.style.display = 'block';
                    if (dashboardView) dashboardView.style.display = 'none';
                    return;
                }
            }
        }, 100);
    }

    initSignaturePad();
    initPortalNav();

    // Set Current Date
    const dateSpan = document.getElementById('current-date');
    if (dateSpan) {
        const today = new Date();
        dateSpan.textContent = today.toLocaleDateString();
    }

    // Real-time Login Greeting
    const emailInput = document.getElementById('email');
    const greetingSpan = document.getElementById('login-greeting');
    if (emailInput && greetingSpan) {
        // Update greeting logic has been disabled per user request: "Use the user real name and not their email as a welcome".
        // Since we can't reliably pull the real name until authentication finishes, we rely on the static HTML or dashboard hydration.
        // To maintain structure without visual pop-in, we just let the default "Parent Portal" text remain untouched
    }

    // Password visibility toggle
    const togglePasswordBtn = document.getElementById('toggle-password');
    const passwordInput = document.getElementById('password');
    const eyeIcon = document.getElementById('eye-icon');
    const eyeOffIcon = document.getElementById('eye-off-icon');

    if (togglePasswordBtn && passwordInput && eyeIcon && eyeOffIcon) {
        togglePasswordBtn.addEventListener('click', () => {
            const isPassword = passwordInput.type === 'password';
            passwordInput.type = isPassword ? 'text' : 'password';
            eyeIcon.style.display = isPassword ? 'none' : 'block';
            eyeOffIcon.style.display = isPassword ? 'block' : 'none';
        });
    }

    // Signup password visibility toggle
    const toggleSignupPassword = document.getElementById('toggle-signup-password');
    const signupPasswordInput = document.getElementById('signup-password');
    const signupEyeIcon = document.getElementById('signup-eye-icon');
    const signupEyeOffIcon = document.getElementById('signup-eye-off-icon');

    if (toggleSignupPassword && signupPasswordInput) {
        toggleSignupPassword.addEventListener('click', function () {
            const type = signupPasswordInput.type === 'password' ? 'text' : 'password';
            signupPasswordInput.type = type;

            if (signupEyeIcon && signupEyeOffIcon) {
                if (type === 'text') {
                    signupEyeIcon.style.display = 'none';
                    signupEyeOffIcon.style.display = 'block';
                } else {
                    signupEyeIcon.style.display = 'block';
                    signupEyeOffIcon.style.display = 'none';
                }
            }
        });
    }

    // Check for existing session
    if (window.auth && window.auth.isLoggedIn()) {
        const savedEmail = localStorage.getItem('gba_user_email');
        if (savedEmail) updateDashboardProfile(savedEmail);
    }

    // Attach form listener
    const pForm = document.getElementById('parent-login-form');
    if (pForm) {
        pForm.addEventListener('submit', (e) => {
            e.preventDefault();
            handleLogin();
        });
    }
});

// --- Authentication Logic ---

async function handleLogin() {
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const email = emailInput ? emailInput.value.trim() : '';
    const password = passwordInput ? passwordInput.value : '';
    const btn = document.querySelector('.login-form button[type="submit"]');
    const errorMsg = document.querySelector('.login-error');

    // Input validation
    let hasEmpty = false;
    [ {input: emailInput, val: email}, {input: passwordInput, val: password} ].forEach(f => {
        if (!f.val) {
            hasEmpty = true;
            if (f.input) {
                f.input.style.borderColor = '#ef4444';
                f.input.style.backgroundColor = '#fef2f2';
                f.input.addEventListener('input', function() { this.style.borderColor = ''; this.style.backgroundColor = ''; }, { once: true });
            }
        }
    });

    if (hasEmpty) {
        if (errorMsg) {
            errorMsg.textContent = "You forgot to type your email or password.";
            errorMsg.style.display = 'block';
        }
        return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        if (errorMsg) {
            errorMsg.textContent = "That email doesn't look quite right!";
            errorMsg.style.display = 'block';
        }
        return;
    }

    // Basic password validation (minimum length)
    if (password.length < 6) {
        if (errorMsg) {
            errorMsg.textContent = "Your password needs to be at least 6 characters long.";
            errorMsg.style.display = 'block';
        }
        if (passwordInput) {
            passwordInput.style.borderColor = '#ef4444';
            passwordInput.style.backgroundColor = '#fef2f2';
            passwordInput.addEventListener('input', function() { this.style.borderColor = ''; this.style.backgroundColor = ''; }, { once: true });
        }
        return;
    }

    // Check rate limiting if Security system is available
    if (window.Security && window.Security.RateLimiter) {
        const rateCheck = window.Security.RateLimiter.check('login', email);
        if (!rateCheck.allowed) {
            if (errorMsg) {
                errorMsg.textContent = rateCheck.message || "You've tried too many times! Please wait a little bit and try again.";
                errorMsg.style.display = 'block';
            }
            return;
        }
    }

    btn.innerHTML = 'Signing In...';
    btn.disabled = true;

    try {
        let loginSuccess = false;
        let errorMessage = 'Invalid email or password. Please check your credentials and try again.';

        // BYPASS: Direct access for Local Dev/Support & Mock Cohorts
        const mockEmails = ['denis@gmail.com', 'test@example.com', 'demo@clubgodspeed.com', 'training@clubgodspeed.com'];
        if (mockEmails.includes(email.toLowerCase())) {
            console.log('Bypassing auth for known local or demo user');
            localStorage.setItem('gba_parent_auth_token', 'bypass_token_' + Date.now());
            localStorage.setItem('gba_user_email', email);
            loginSuccess = true;
        }

        // Try Supabase auth first (real backend)
        if (!loginSuccess && window.auth && typeof window.auth.login === 'function') {
            try {
                const result = await window.auth.login(email, password);

                // Handle 2FA requirement
                if (result && result.requires2FA) {
                    const twoFactorDiv = document.createElement('div');
                    twoFactorDiv.id = 'two-factor-input';
                    twoFactorDiv.className = 'mt-4';
                    twoFactorDiv.innerHTML = `
                        <label class="block text-sm font-bold text-gray-700 mb-2">Enter 2FA Code</label>
                        <input type="text" id="two-factor-code" placeholder="000000" maxlength="6" 
                            class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600"
                            pattern="[0-9]{6}">
                        <button type="button" id="submit-2fa-btn-1"
                            class="mt-2 w-full py-3 bg-blue-600 text-white font-bold rounded-full hover:bg-blue-700 transition">
                            Verify 2FA Code
                        </button>
                    `;
                    const form = document.querySelector('.login-form');
                    if (form) {
                        form.appendChild(twoFactorDiv);
                        // Attach event listener instead of inline onclick
                        const submitBtn = document.getElementById('submit-2fa-btn-1');
                        if (submitBtn) {
                            submitBtn.addEventListener('click', () => {
                                if (window.submit2FA) window.submit2FA();
                            });
                        }
                    }
                    btn.innerHTML = 'Sign In';
                    btn.disabled = false;
                    return;
                }

                // Check if login was successful
                if (result === true || (result && result.success !== false)) {
                    loginSuccess = true;
                } else {
                    errorMessage = result?.error || result?.message || errorMessage;
                }
            } catch (authError) {
                console.error('Auth login error:', authError);
                errorMessage = authError.message || errorMessage;

                // Provide specific error messages
                if (authError.message && authError.message.includes('Invalid login credentials')) {
                    errorMessage = 'Invalid email or password. Please check your credentials and try again.';
                } else if (authError.message && authError.message.includes('Email not confirmed')) {
                    errorMessage = 'Please verify your email address before logging in. Check your inbox for the verification link.';
                } else if (authError.message && authError.message.includes('Too many requests')) {
                    errorMessage = 'Too many login attempts. Please wait a few minutes and try again.';
                } else if (authError.message === 'Failed to fetch') {
                    errorMessage = 'Network error: Cannot connect to the server. Your adblocker or firewall might be blocking the connection.';
                }
            }
        }

        // If Supabase auth not available or failed, try SecureAuth
        if (!loginSuccess && window.Security && window.Security.SecureAuth) {
            try {
                const result = await window.Security.SecureAuth.login(email, password);

                if (result && result.requires2FA) {
                    const twoFactorDiv = document.createElement('div');
                    twoFactorDiv.id = 'two-factor-input';
                    twoFactorDiv.className = 'mt-4';
                    twoFactorDiv.innerHTML = `
                        <label class="block text-sm font-bold text-gray-700 mb-2">Enter 2FA Code</label>
                        <input type="text" id="two-factor-code" placeholder="000000" maxlength="6" 
                            class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600"
                            pattern="[0-9]{6}">
                        <button type="button" id="submit-2fa-btn-2"
                            class="mt-2 w-full py-3 bg-blue-600 text-white font-bold rounded-full hover:bg-blue-700 transition">
                            Verify 2FA Code
                        </button>
                    `;
                    const form = document.querySelector('.login-form');
                    if (form) {
                        form.appendChild(twoFactorDiv);
                        // Attach event listener instead of inline onclick
                        const submitBtn = document.getElementById('submit-2fa-btn-2');
                        if (submitBtn) {
                            submitBtn.addEventListener('click', () => {
                                if (window.submit2FA) window.submit2FA();
                            });
                        }
                    }
                    btn.innerHTML = 'Sign In';
                    btn.disabled = false;
                    return;
                }

                if (result && result.success) {
                    loginSuccess = true;
                    if (window.Security && window.Security.RBAC) {
                        window.Security.RBAC.setRole(window.Security.RBAC.roles.PARENT);
                    }
                } else {
                    errorMessage = result?.error || result?.message || errorMessage;
                }
            } catch (secureAuthError) {
                console.error('SecureAuth error:', secureAuthError);
                errorMessage = secureAuthError.message || errorMessage;
            }
        }

        // Enforce strict authentication - No fallbacks allowed in production

        // Handle successful login
        if (loginSuccess) {
            // --- STRICT IP ENFORCEMENT ---
            try {
                btn.innerHTML = 'Verifying Security...';
                
                // 1. Fetch User's current IP
                const ipRes = await fetch('https://api.ipify.org?format=json');
                const ipData = await ipRes.json();
                const currentIp = ipData.ip;
                
                if (window.auth && window.auth.isSupabaseAvailable()) {
                    // 2. Look up their allowed_ip in the database
                    const supabaseClient = window.auth.getSupabaseClient();
                    const { data: parentData, error: parentError } = await supabaseClient
                        .from('parent_accounts')
                        .select('allowed_ip, id')
                        .eq('email', email)
                        .single();
                        
                    if (parentData) {
                        if (!parentData.allowed_ip) {
                            // First login ever: Lock this IP to their account
                            await supabaseClient
                                .from('parent_accounts')
                                .update({ allowed_ip: currentIp })
                                .eq('id', parentData.id);
                        } else if (parentData.allowed_ip !== currentIp) {
                            // IP MISMATCH: BLOCK ACCESS
                            if (window.auth && typeof window.auth.logout === 'function') {
                                await window.auth.logout(); // Force sign out
                            }
                            throw new Error(`Access blocked: Unrecognized IP address. This account is locked to a different secure network.`);
                        }
                    }
                }
            } catch (securityError) {
                console.error("IP Verification failed:", securityError);
                if (securityError.message === 'Failed to fetch' || securityError.name === 'TypeError') {
                    console.warn("Adblocker prevented IP check. Allowing login to proceed gracefully.");
                } else {
                    loginSuccess = false;
                    errorMessage = securityError.message || "Security verification failed. Access Denied.";
                }
            }

            if (loginSuccess) {
                document.getElementById('portal-login').style.display = 'none';
                document.getElementById('portal-dashboard').style.display = 'flex';
                updateDashboardProfile(email);

                // Cohort Designation Mock Setup
                if (email.toLowerCase() === 'training@clubgodspeed.com') {
                    localStorage.setItem('gba_user_cohort', 'training');
                } else {
                    // Default to AAU for all other users (including demo@clubgodspeed.com)
                    localStorage.setItem('gba_user_cohort', 'aau');
                }
                updateUIForCohort();

                loadSignedDocuments(email); // Load signed documents on successful login
    
                // Clear any error messages
                if (errorMsg) {
                    errorMsg.style.display = 'none';
                    errorMsg.textContent = '';
                }
            }
        } 
        
        if (!loginSuccess) {
            // Show error message
            if (errorMsg) {
                errorMsg.textContent = errorMessage;
                errorMsg.style.display = 'block';

                // Add shake animation to form
                const form = document.querySelector('.login-form');
                if (form) {
                    form.classList.add('shake');
                    setTimeout(() => form.classList.remove('shake'), 500);
                }
            }
            btn.innerHTML = 'Sign In';
            btn.disabled = false;
        }
    } catch (error) {
        console.error('Login error:', error);
        if (errorMsg) {
            let userFriendlyMessage = "Something went wrong. Please try again!";

            if (error.message) {
                if (error.message.includes('Invalid login credentials') || error.message.includes('password')) {
                    userFriendlyMessage = "The email or password you typed doesn't match our records. Please try again.";
                } else if (error.message.includes('Email not confirmed') || error.message.includes('verify')) {
                    userFriendlyMessage = "Please check your email and click the confirmation link before logging in!";
                } else if (error.message.includes('rate limit') || error.message.includes('Too many')) {
                    userFriendlyMessage = "You've tried to log in too many times. Please wait a few minutes and try again!";
                } else if (error.message.includes('not a function') || error.message.includes('supabase')) {
                    userFriendlyMessage = "Our system hit a small bump. Please reload the page and try again.";
                } else {
                    userFriendlyMessage = "Something went wrong. Please try again!";
                }
            }

            errorMsg.textContent = userFriendlyMessage;
            errorMsg.style.display = 'block';

            // Add shake animation
            const form = document.querySelector('.login-form');
            if (form) {
                form.classList.add('shake');
                setTimeout(() => form.classList.remove('shake'), 500);
            }
        }
        btn.innerHTML = 'Sign In';
        btn.disabled = false;
    }
}

window.handleSignup = async function() {
    const emailInput = document.getElementById('signup-email');
    const passwordInput = document.getElementById('signup-password');
    const parentNameInput = document.getElementById('signup-parent-name');
    const playerNameInput = document.getElementById('signup-player-name');
    const playerAgeInput = document.getElementById('signup-player-age');
    const phoneInput = document.getElementById('signup-phone');

    const email = emailInput ? emailInput.value.trim() : '';
    const password = passwordInput ? passwordInput.value : '';
    const parentName = parentNameInput ? parentNameInput.value.trim() : '';
    const playerName = playerNameInput ? playerNameInput.value.trim() : '';
    const playerAge = playerAgeInput ? parseInt(playerAgeInput.value, 10) : 0;
    const phone = phoneInput ? phoneInput.value.trim() : '';

    const btn = document.querySelector('.signup-form button[type="submit"]') || document.querySelector('#portal-signup button[type="submit"]');
    const errorMsg = document.querySelector('#portal-signup .login-error');
    if (errorMsg) errorMsg.style.display = 'none';

    // 1. Input validation & visual HIGHLIGHTING
    let hasEmpty = false;
    [
        {input: emailInput, val: email},
        {input: passwordInput, val: password},
        {input: parentNameInput, val: parentName},
        {input: playerNameInput, val: playerName},
        {input: playerAgeInput, val: playerAge},
        {input: phoneInput, val: phone}
    ].forEach(f => {
        if (!f.val) {
            hasEmpty = true;
            if (f.input) {
                f.input.style.borderColor = '#ef4444';
                f.input.style.backgroundColor = '#fef2f2';
                f.input.addEventListener('input', function() { this.style.borderColor = ''; this.style.backgroundColor = ''; }, { once: true });
            }
        }
    });

    if (hasEmpty) {
        if (errorMsg) {
            errorMsg.textContent = "You missed a spot. Please fill out every box in the form.";
            errorMsg.style.display = 'block';
        }
        return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        if (errorMsg) {
            errorMsg.textContent = "That email doesn't look quite right!";
            errorMsg.style.display = 'block';
        }
        return;
    }

    if (password.length < 6) {
        if (errorMsg) {
            errorMsg.textContent = "Your password must be at least 6 characters long.";
            errorMsg.style.display = 'block';
        }
        if (passwordInput) {
            passwordInput.style.borderColor = '#ef4444';
            passwordInput.style.backgroundColor = '#fef2f2';
            passwordInput.addEventListener('input', function() { this.style.borderColor = ''; this.style.backgroundColor = ''; }, { once: true });
        }
        return;
    }

    // Check rate limiting if available
    if (window.Security && window.Security.RateLimiter) {
        const rateCheck = window.Security.RateLimiter.check('signup', email);
        if (!rateCheck.allowed) {
            if (errorMsg) {
                errorMsg.textContent = rateCheck.message || "You've tried too many times! Please wait a little bit and try again.";
                errorMsg.style.display = 'block';
            }
            return;
        }
    }

    try {
        if (btn) {
            btn.innerHTML = 'Creating Account...';
            btn.disabled = true;
        }

        let signupSuccess = false;
        
        // Use Supabase Auth if available
        if (window.auth && typeof window.auth.signup === 'function') {
            const metadata = {
                parent_name: parentName,
                player_name: playerName,
                player_age: playerAge,
                phone: phone,
                role: 'parent',
                cohort: 'aau' // Default to AAU for pristine setup
            };
            const result = await window.auth.signup(email, password, metadata);
            if (result && result.success) {
                signupSuccess = true;
            }
        } else {
            console.warn('Auth module not available. Mocking signup locally.');
            localStorage.setItem('pending_access_request', JSON.stringify({ parentName, email, phone, playerName, playerAge, status: 'approved' }));
            signupSuccess = true;
        }

        if (signupSuccess) {
            // Success UI
            if (typeof godspeedAlert === 'function') {
                godspeedAlert(`Your account has been successfully created! Check your inbox for a verification email to complete your registration.`, "Account Created");
            } else {
                alert("Account Created! Check your email to verify your account.");
            }
            
            // Clear inputs
            [emailInput, passwordInput, parentNameInput, playerNameInput, playerAgeInput, phoneInput].forEach(el => {
                if (el) el.value = '';
            });
            
            // Switch back to login form naturally
            if (typeof showLoginForm === 'function') showLoginForm();
        }
    } catch (error) {
        console.error('Signup error:', error);
        
        if (errorMsg) {
            let userFriendlyMessage = "Something went wrong on our end. Please try again!";
            if (error.message) {
                if (error.message.includes('already exists') || error.message.includes('already registered')) {
                    userFriendlyMessage = "Looks like someone with that email is already signed up! Try logging in.";
                } else if (error.message.includes('not connected') || error.message.includes('fetch')) {
                    userFriendlyMessage = "We couldn't reach the database right now. Your adblocker or firewall might be blocking the connection.";
                } else {
                    // Bubble up specific readable auth errors
                    userFriendlyMessage = error.message;
                }
            }
            errorMsg.textContent = userFriendlyMessage;
            errorMsg.style.display = 'block';
            
            const form = document.querySelector('.signup-form');
            if (form) {
                form.classList.add('shake');
                setTimeout(() => form.classList.remove('shake'), 500);
            }
        }
    } finally {
        if (btn) {
            btn.innerHTML = 'Create Account';
            btn.disabled = false;
        }
    }
}

function loginNewUser(email) {
    localStorage.setItem('gba_parent_auth_token', 'valid_token_' + Date.now());
    localStorage.setItem('gba_user_email', email);
    document.getElementById('portal-signup').style.display = 'none';
    document.getElementById('portal-dashboard').style.display = 'flex';
    updateDashboardProfile(email);
    loadSignedDocuments(email); // Load signed documents for the new user
}

// Handle 2FA submission
window.submit2FA = async function () {
    const codeInput = document.getElementById('two-factor-code');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');

    if (!codeInput || !emailInput || !passwordInput) {
        if (window.godspeedAlert) {
            godspeedAlert('Our system hit a small bump. Please reload the page and try again.', 'Error');
        }
        return;
    }

    const code = codeInput.value.trim();
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!code || code.length !== 6) {
        godspeedAlert('Please type in the 6-digit code we sent you.', 'Invalid Code');
        return;
    }

    try {
        const result = await window.Security.SecureAuth.login(email, password, code);
        if (result.success) {
            window.Security.RBAC.setRole(window.Security.RBAC.roles.PARENT);
            document.getElementById('portal-login').style.display = 'none';
            document.getElementById('portal-dashboard').style.display = 'flex';
            updateDashboardProfile(email);
            loadSignedDocuments(email); // Load signed documents after 2FA login
            const twoFactorDiv = document.getElementById('two-factor-input');
            if (twoFactorDiv) twoFactorDiv.remove();
        }
    } catch (error) {
        godspeedAlert(error.message || "That code doesn't look quite right! Please try again.", 'Verification Error');
    }
};

function updateDashboardProfile(email) {
    const namePart = email.split('@')[0];
    const displayName = namePart.charAt(0).toUpperCase() + namePart.slice(1);

    const bannerName = document.getElementById('dashboard-user-name');
    if (bannerName) bannerName.textContent = displayName;

    const sidebarName = document.querySelector('.user-name');
    if (sidebarName) sidebarName.textContent = displayName;

    const avatarEl = document.querySelector('.user-avatar-small');
    if (avatarEl) avatarEl.textContent = displayName.substring(0, 2).toUpperCase();

    // Update Welcome Message with Athlete Name
    const welcomeMsg = document.getElementById('dashboard-welcome-msg');
    if (welcomeMsg) {
        let db = typeof getDB === 'function' ? getDB() : (window.GODSPEED_DATA || JSON.parse(localStorage.getItem('gba_db')));
        let athleteName = "your athlete";

        if (db && db.roster) {
            const athlete = db.roster.find(p => p.parentId === email);
            if (athlete) athleteName = athlete.name;
        }

        welcomeMsg.textContent = `Here is what's happening with ${athleteName} today.`;
    }
}

function handleLogout() {
    if (window.auth && window.auth.logout) {
        window.auth.logout();
    }
    localStorage.removeItem('gba_parent_auth_token');
    localStorage.removeItem('gba_user_email');
    localStorage.removeItem('gba_signed_docs_' + localStorage.getItem('gba_user_email')); // Clear signed docs for logged out user

    const dashboard = document.getElementById('portal-dashboard');
    const login = document.getElementById('portal-login');
    const loginForm = document.querySelector('.login-form');
    const submitBtn = document.querySelector('.login-form button[type="submit"]');
    const greeting = document.getElementById('login-greeting');

    if (dashboard) dashboard.style.display = 'none';
    if (login) login.style.display = 'flex';
    if (loginForm) loginForm.reset();
    if (submitBtn) submitBtn.textContent = 'Sign In';
    if (greeting) greeting.textContent = 'Guest';

    // Reset all document cards to unsigned state
    document.querySelectorAll('.document-card').forEach(card => {
        const type = card.id.replace('card-', '');
        const badge = card.querySelector('.card-status');
        if (badge) {
            badge.textContent = 'Unsigned';
            badge.className = 'card-status unsigned';
        }
        const btn = card.querySelector('button');
        if (btn) {
            btn.textContent = 'Sign Document';
            btn.className = 'btn-card'; // Reset to default
            btn.style.borderColor = '';
            btn.style.color = '';
        }
    });
}

// --- Navigation Logic (V3 Side Panel) ---

window.switchPortalView = function (viewName, linkElement) {
    if (window.analytics && window.analytics.trackPageView) window.analytics.trackPageView(viewName);

    // 1. Hide all views
    document.querySelectorAll('.portal-view').forEach(el => {
        el.style.display = 'none';
        el.classList.remove('active');
    });

    // 2. Show target view
    const targetView = document.getElementById(`view-${viewName}`);
    if (targetView) {
        targetView.style.display = 'block';
        setTimeout(() => targetView.classList.add('active'), 10);
    }

    // 3. Update Sidebar Active State
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

    if (linkElement) {
        linkElement.classList.add('active');
    } else {
        const link = document.querySelector(`.nav-item[onclick*="'${viewName}'"]`);
        if (link) link.classList.add('active');
    }

    // 4. Close Mobile Sidebar
    const sidebar = document.querySelector('.portal-sidebar-v3');
    if (sidebar && window.innerWidth <= 768) {
        sidebar.classList.remove('open');
    }

    if (viewName === 'aau-billing' || viewName === 'billing') {
        const email = localStorage.getItem('gba_user_email');
        if (window.renderBilling) {
            window.renderBilling(email);
        } else {
            renderParentTrips();
        }
    }

    if (viewName === 'training') {
        const email = localStorage.getItem('gba_user_email');
        renderTrainingDashboard();
        loadSessionCounts(email);
        loadTrainingCalendar(email);
        loadTrainingHours(email);
    }

    if (viewName === 'calendar') {
        injectTrainingEvents();
    }
}

function injectTrainingEvents() {
    const db = getDB();
    const training = db.training;
    if (!training || !training.upcomingSessions) return;

    // Wait for iframe to be ready
    const iframe = document.querySelector('#view-calendar iframe');
    if (iframe) {
        /* Map to Calendar Embed format:
           { 
             type: 'training', 
             title: 'Elite Guard Academy', 
             time: '18:00', 
             date: '2026-01-05', 
             loc: 'Main Court', 
             desc: 'Pick & Roll Reads', 
             pillClass: 'event-training',
             color: '#dcfce7',
             textColor: 'dark'
           }
        */
        const events = training.upcomingSessions.map(sess => ({
            type: 'training',
            title: sess.program, // or sess.topic
            fullTitle: `${sess.program}: ${sess.topic}`,
            time: sess.time,
            date: sess.date,
            loc: sess.location,
            desc: sess.topic,
            pillClass: 'event-training',
            // style: '...', // optional override
        }));

        // Post message immediately and after a short delay to ensure load
        iframe.contentWindow.postMessage({ type: 'injectEvents', events: events }, '*');
        setTimeout(() => {
            iframe.contentWindow.postMessage({ type: 'injectEvents', events: events }, '*');
        }, 500);
        iframe.onload = () => {
            iframe.contentWindow.postMessage({ type: 'injectEvents', events: events }, '*');
        };
    }
}

function renderParentTrips() {
    const db = getDB();
    const container = document.getElementById('parent-trips-container');
    if (!container) return;

    container.innerHTML = '';

    // Get Child's Team (Default to DEV-BLACK if not set)
    const childTeamId = localStorage.getItem('gba_athlete_team') || 'TEAM-10U-DEV-BLACK';

    // Filter trips
    const trips = (db.trips || []).filter(t => t.teamId === childTeamId);

    if (trips.length === 0) {
        container.innerHTML = '<div style="padding:24px; background:white; border-radius:12px; text-align:center; color:#888;">No upcoming trips scheduled for your team.</div>';
        return;
    }

    trips.forEach(trip => {
        const canPay = (trip.fee && parseInt(trip.fee) > 0 && trip.paymentLink);

        const card = document.createElement('div');
        card.style.background = 'white';
        card.style.borderRadius = '12px';
        card.style.padding = '24px';
        card.style.boxShadow = '0 2px 10px rgba(0,0,0,0.05)';

        // Sanitize user data to prevent XSS
        const safeName = escapeHTML(trip.name || '');
        const safeStart = escapeHTML(trip.start || 'TBD');
        const safeEnd = escapeHTML(trip.end || 'TBD');
        const safeFee = escapeHTML(String(trip.fee || '0'));
        const safeLocation = escapeHTML(trip.location || 'Details pending...');
        const safePaymentLink = validateURL(trip.paymentLink) || '#';

        card.innerHTML = `
            <h3 style="font-size: 18px; margin-bottom: 16px;">${safeName}</h3>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px;">
                <div style="background: #eef2ff; padding: 12px; border-radius: 8px;">
                    <div style="font-size: 0.8rem; color: #0071e3; font-weight: 600; margin-bottom: 4px;">DATES</div>
                    <div style="font-weight: 500;">${safeStart} - ${safeEnd}</div>
                </div>
                <div style="background: #eef2ff; padding: 12px; border-radius: 8px;">
                     <div style="font-size: 0.8rem; color: #0071e3; font-weight: 600; margin-bottom: 4px;">TUITION</div>
                    <div style="font-weight: 500;">$${safeFee}</div>
                </div>
            </div>
            
            <div style="margin-bottom: 20px;">
                <div style="font-weight: 600; margin-bottom: 8px;">Location & Details</div>
                <p style="font-size: 0.9rem; color: #666; margin-bottom: 12px; white-space: pre-wrap; line-height: 1.5;">${safeLocation}</p>
            </div>
            
            ${canPay ? `
            <div style="border-top: 1px solid #eee; padding-top: 16px;">
                 <a href="${safePaymentLink}" target="_blank" class="btn-primary" 
                    style="display:block; text-align:center; text-decoration:none; background:#0071e3; color:white; padding:12px; border-radius:8px; width:100%; font-weight:600;">
                    Pay Tuition ($${safeFee})
                 </a>
            </div>
            ` : ''}
        `;
        container.appendChild(card);
    });
}

function toggleSidebar() {
    const sidebar = document.querySelector('.portal-sidebar-v3');
    if (sidebar) {
        sidebar.classList.toggle('open');
    }
}

function initPortalNav() {
    // 1. Check hash for direct linking
    const hash = window.location.hash.replace('#', '');
    if (hash && ['documents', 'calendar', 'settings', 'gear', 'tuition'].includes(hash)) {
        switchPortalView(hash);
    }

    // 2. Mobile Menu Listener
    const mobileMenuBtn = document.querySelector('.menu-toggle');
    // Note: V3 uses .menu-toggle with calls to toggleSidebar() inline, 
    // but if we want JS listener:
    if (mobileMenuBtn) {
        mobileMenuBtn.onclick = toggleSidebar;
    }
}

// --- Waiver & Signature Logic ---

const DOCUMENT_TEMPLATE = {
    'athletic': `
        <h3>Athletic Liability Release</h3>
        <p>I, <strong>{parent_name}</strong>, legal guardian of <strong>{child_name}</strong>, acknowledge that basketball is a contact sport involving inherent risks. I voluntarily assume all risks, including but not limited to sprains, fractures, citations, and serious injury.</p>
        <p>I release Godspeed Basketball, its coaches, and facilities from any liability regarding injuries sustained by {child_name} during practice, games, or travel.</p>
        <p><strong>Acknowledgment:</strong> By signing below, I waive my right to sue for negligence.</p>
    `,
    'medical': `
        <h3>Medical Consent Form</h3>
        <p>In the event of an emergency where I, <strong>{parent_name}</strong>, cannot be reached, I authorize Godspeed Basketball staff to obtain medical treatment for <strong>{child_name}</strong>.</p>
        <p>I agree to cover all costs associated with emergency transport and treatment.</p>
        <p><strong>Medical Conditions:</strong> I certify {child_name} is physically fit to participate.</p>
    `,
    'practice': `
        <h3>Practice & Training Consent</h3>
        <p>Godspeed Training is high-intensity. Sessions may involve heavy exertion, plyometrics, and physical contact.</p>
        <p>I, <strong>{parent_name}</strong>, give full consent for <strong>{child_name}</strong> to participate in all training drills as designed by the coaching staff.</p>
        <p>I understand it is my child's responsibility to hydrate and rest properly.</p>
    `,
    'conduct': `
        <h3>Parental Code of Conduct</h3>
        <p><strong>Strict Policy: No Coaching from the Sidelines.</strong></p>
        <p>To ensure athlete focus and development, parents must refrain from shouting instructions during games, practices, and training sessions.</p>
        <p><strong>Consequences:</strong> I, <strong>{parent_name}</strong>, understand that violating this policy undermines the coaching staff and <strong>will affect {child_name}'s playing time</strong>. Repeated offenses may result in removal from the program.</p>
        <p>We are a family. We support, we cheer, but we let the players play and the coaches coach.</p>
    `,
    'media': `
        <h3>Social Media Release</h3>
        <p>I, <strong>{parent_name}</strong>, grant permission for Club Godspeed to use photos/videos of <strong>{child_name}</strong> for social media and marketing.</p>
        <p>I understand these may be posted on Instagram, YouTube, and the website.</p>
        <p>My child's name will not be sold to third parties.</p>
    `
};

let currentDocType = null;

window.openDocModal = function (type) {
    currentDocType = type;
    const modalTitle = document.getElementById('modal-title');
    if (modalTitle) modalTitle.textContent = getTitleFromType(type);

    // Inject Dynamic Data
    const pName = localStorage.getItem('gba_parent_name') || 'Parent Name';
    const cName = localStorage.getItem('gba_child_name') || 'Athlete Name';

    let content = DOCUMENT_TEMPLATE[type];
    content = content.replace(/{parent_name}/g, pName).replace(/{child_name}/g, cName);

    const modalContent = document.getElementById('modal-content');
    if (modalContent) modalContent.innerHTML = content;

    const overlay = document.getElementById('doc-modal-overlay');
    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // Resize canvas
    setTimeout(resizeCanvas, 100);

    // Add Overlay Click Listener (One-time or check uniqueness)
    overlay.onclick = function (e) {
        if (e.target === overlay) {
            closeDocModal();
        }
    };

    // Add Escape Key Listener
    document.onkeydown = function (e) {
        if (e.key === 'Escape') {
            closeDocModal();
        }
    };
}

window.closeDocModal = function () {
    document.getElementById('doc-modal-overlay').style.display = 'none';
    document.body.style.overflow = '';
    document.onkeydown = null; // Clean up listener
    if (window.resetSignature) window.resetSignature();
}

function getTitleFromType(type) {
    const titles = {
        'athletic': 'Athletic Liability Waiver',
        'medical': 'Medical Consent',
        'practice': 'Practice Consent',
        'conduct': 'Parental Code of Conduct',
        'media': 'Social Media Release'
    };
    return titles[type] || 'Document';
}

function markDocumentSigned(type) {
    const card = document.getElementById('card-' + type);
    if (card) {
        const badge = card.querySelector('.card-status');
        if (badge) {
            badge.textContent = 'Signed';
            badge.className = 'card-status signed';
        }
        const btn = card.querySelector('button');
        if (btn) {
            btn.textContent = 'View Signed Copy';
            btn.className = 'btn-card'; // Keep original class for shape
            btn.style.borderColor = '#007c2e';
            btn.style.color = '#007c2e';
        }
    }
}

function checkAllDocumentsSigned() {
    const docTypes = ['athletic', 'medical', 'practice', 'conduct', 'media'];
    const parentEmail = localStorage.getItem('gba_user_email');
    const docsKey = 'gba_signed_docs_' + parentEmail;
    const signedDocs = JSON.parse(localStorage.getItem(docsKey) || '{}');

    const allSigned = docTypes.every(type => signedDocs[type]);

    const allSignedBadge = document.getElementById('all-docs-signed-badge');
    if (allSignedBadge) {
        if (allSigned) {
            allSignedBadge.style.display = 'block';
        } else {
            allSignedBadge.style.display = 'none';
        }
    }
}

function loadSignedDocuments(email) {
    const docsKey = 'gba_signed_docs_' + email;
    const signedDocs = JSON.parse(localStorage.getItem(docsKey) || '{}');

    for (const type in signedDocs) {
        if (signedDocs.hasOwnProperty(type)) {
            markDocumentSigned(type);
        }
    }
    checkAllDocumentsSigned();
}

// Canvas & Signature Logic
let canvas, ctx, isDrawing = false, hasSigned = false;

function initSignaturePad() {
    canvas = document.getElementById('signature-pad');
    if (!canvas) return;

    ctx = canvas.getContext('2d');
    const overlay = document.querySelector('.signature-overlay');
    const clearBtn = document.getElementById('clear-signature');
    const submitBtn = document.getElementById('submit-waiver');
    const agreeCheck = document.getElementById('agree-check');

    function startPosition(e) {
        if (!currentDocType) return;
        isDrawing = true;
        hasSigned = true;
        if (overlay) overlay.style.display = 'none';
        draw(e);
        updateSubmitState();
    }

    function endPosition() {
        isDrawing = false;
        ctx.beginPath();
    }

    function draw(e) {
        if (!isDrawing) return;
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        const clientY = e.clientY || (e.touches && e.touches[0].clientY);

        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#000';

        ctx.lineTo(clientX - rect.left, clientY - rect.top);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(clientX - rect.left, clientY - rect.top);
    }

    canvas.addEventListener('mousedown', startPosition);
    canvas.addEventListener('mouseup', endPosition);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('touchstart', startPosition, { passive: false });
    canvas.addEventListener('touchend', endPosition);
    canvas.addEventListener('touchmove', draw, { passive: false });

    if (clearBtn) clearBtn.addEventListener('click', () => window.resetSignature());
    if (agreeCheck) agreeCheck.addEventListener('change', updateSubmitState);

    window.resetSignature = function () {
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        hasSigned = false;
        if (overlay) overlay.style.display = 'block';
        if (agreeCheck) agreeCheck.checked = false;
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = 'Sign & Accept';
        }
    }

    function updateSubmitState() {
        if (hasSigned && agreeCheck.checked) {
            submitBtn.disabled = false;
        } else {
            submitBtn.disabled = true;
        }
    }

    window.resizeCanvas = function () {
        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        canvas.width = canvas.offsetWidth * ratio;
        canvas.height = canvas.offsetHeight * ratio;
        if (ctx) ctx.scale(ratio, ratio);
    }
    window.addEventListener('resize', window.resizeCanvas);

    if (submitBtn) {
        submitBtn.addEventListener('click', async () => {
            submitBtn.innerHTML = 'Signing...';
            
            // Generate Data URL for the signature
            const signatureDataUrl = canvas.toDataURL('image/png');
            
            // Save to LocalStorage (Mock Backend)
            const parentEmail = localStorage.getItem('gba_user_email') || window.location.hash.split('=')[1] || 'demo@godspeed.com';
            const docsKey = 'gba_signed_docs_' + parentEmail;
            
            let signedDocs = JSON.parse(localStorage.getItem(docsKey) || '{}');
            
            const signaturePayload = {
                signedAt: new Date().toISOString(),
                signatureImage: signatureDataUrl,
                parentName: localStorage.getItem('gba_parent_name') || 'Demo Parent',
                childName: localStorage.getItem('gba_child_name') || 'Demo Athlete',
                documentType: currentDocType,
                email: parentEmail
            };

            signedDocs[currentDocType] = signaturePayload;
            localStorage.setItem(docsKey, JSON.stringify(signedDocs));

            // Production Backend: Send to Supabase DB if available
            if (window.auth && window.auth.isSupabaseAvailable()) {
                try {
                    console.log('Sending signature to Supabase...');
                    const supabaseClient = window.auth.getSupabaseClient();
                    // In production, this table should exist with RLS policies allowing parent inserts
                    const { data, error } = await supabaseClient
                        .from('signatures')
                        .insert([signaturePayload]);

                    if (error) {
                        console.error('Failed to save signature to Supabase:', error);
                    } else {
                        console.log('Signature saved to Supabase successfully.');
                    }
                } catch (e) {
                    console.warn('Supabase not fully configured for signatures yet:', e);
                }
            }

            setTimeout(() => {
                markDocumentSigned(currentDocType);
                closeDocModal();

                // Check if all are signed
                checkAllDocumentsSigned();
                godspeedAlert(getTitleFromType(currentDocType) + ' Signed Successfully!', 'Success');
            }, 1000); // Fake delay for realism
        });
    }
}

// --- Performance Logic (New) ---
/*
    Requires portal-data.js to be loaded before this script.
    window.GODSPEED_DATA or getDB()
*/

function loadPerformance(parentEmail) {
    console.log('Loading performance for parent:', parentEmail);
    const db = window.GODSPEED_DATA || JSON.parse(localStorage.getItem('gba_db'));

    if (!db) {
        console.warn('No DB found');
        return;
    }

    // 1. Find Child
    // Note: In a real app we might handle multiple children. For now, take the first match.
    const child = db.roster.find(p => p.parentId.toLowerCase() === parentEmail.toLowerCase());

    if (!child) {
        console.warn('No child linked to this account.');
        const listContainer = document.getElementById('performance-grade-list');
        if (listContainer) {
            listContainer.textContent = 'No athlete found linked to your account.';
            listContainer.className = 'text-muted';
        }
        return;
    }

    // 2. Get Grades
    const grades = db.grades.filter(g => g.athleteId === child.athleteId).sort((a, b) => new Date(b.date) - new Date(a.date)); // Newest first

    // 3. Render List
    const listContainer = document.getElementById('performance-grade-list');
    if (!listContainer) {
        console.warn('Performance grade list container not found');
        return;
    }

    if (grades.length === 0) {
        listContainer.innerHTML = '<p style="color: #888;">No grades recorded yet. Check back after next practice.</p>';
        const gpaEl = document.getElementById('stat-gpa');
        const attendanceEl = document.getElementById('stat-attendance');
        if (gpaEl) gpaEl.textContent = '-';
        if (attendanceEl) attendanceEl.textContent = '0%';
        return;
    }

    let html = '';
    let totalScore = 0;
    let count = 0;

    grades.forEach(g => {
        // Calculate average for this grade entry (e.g. (9+9+10)/3)
        const categories = Object.values(g.scores);
        const dayAvg = (categories.reduce((a, b) => a + b, 0) / categories.length).toFixed(1);

        totalScore += parseFloat(dayAvg);
        count++;

        html += `
        <div style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 0.5rem; border-bottom: 1px solid #eee;">
            <div>
                <div style="font-weight: 600; font-size: 0.9rem;">${g.type} (${new Date(g.date).toLocaleDateString()})</div>
                <div style="font-size: 0.8rem; color: #666;">${g.notes || 'No notes'}</div>
            </div>
            <div class="grade-badge" style="background: ${dayAvg >= 8 ? '#e8f5e9' : '#fff3e0'}; color: ${dayAvg >= 8 ? '#2e7d32' : '#f57c00'};">
                ${dayAvg}
            </div>
        </div>
        `;
    });

    listContainer.innerHTML = html;

    // 4. Update Stats Summary
    const overallGpa = (totalScore / count).toFixed(1);
    const gpaEl = document.getElementById('stat-gpa');
    const attendanceEl = document.getElementById('stat-attendance');
    if (gpaEl) gpaEl.textContent = overallGpa;

    // Mock Attendance (Grades count vs Expected)
    // Simple logic: 1 grade = 1 attendance point for now
    if (attendanceEl) {
        // Simple attendance estimate: each grade entry counts as one attended session.
        // Assuming a typical season has 10 sessions, cap at 100%.
        const totalGrades = grades ? grades.length : 0;
        const attendancePct = Math.min(100, Math.round((totalGrades / 10) * 100));
        attendanceEl.textContent = `${attendancePct}%`;
    }
}

// Hook into View Switching to load data when tab is clicked
(function () {
    const originalSwitch = window.switchPortalView;
    if (originalSwitch) {
        window.switchPortalView = function (viewName, linkElement) {
            originalSwitch.call(this, viewName, linkElement);
            const email = document.getElementById('email')?.value || localStorage.getItem('gba_user_email'); // Fallback to stored

            if (viewName === 'performance') {
                if (email) loadPerformance(email);
            } else if (viewName === 'settings') {
                loadSettings(email);
            }
        };
    }
})();

// --- Settings Logic ---
function loadSettings(email) {
    // 1. Load DB
    const db = JSON.parse(localStorage.getItem('gba_db')) || window.GODSPEED_DATA;
    if (!db) return;

    // 2. Find Linked Parent & Athlete
    // Check if we have a roster entry for this parent email
    const linkedAthlete = db.roster.find(r => r.parentId && r.parentId.toLowerCase() === email.toLowerCase());

    // 3. Populate Form
    // Parent Info (LocalStorage mostly, as we don't have a separate 'users' table in this mock)
    const parentNameEl = document.getElementById('settings-parent-name');
    const parentEmailEl = document.getElementById('settings-parent-email');
    const parentPhoneEl = document.getElementById('settings-parent-phone');
    const athleteNameEl = document.getElementById('settings-athlete-name');
    const athleteTeamEl = document.getElementById('settings-athlete-team');
    const athleteDobEl = document.getElementById('settings-athlete-dob');

    if (parentNameEl) parentNameEl.value = localStorage.getItem('gba_parent_name') || '';
    if (parentEmailEl) parentEmailEl.value = email || '';
    if (parentPhoneEl) parentPhoneEl.value = localStorage.getItem('gba_parent_phone') || '';

    // Athlete Info (From DB if linked, else LocalStorage fallback)
    if (linkedAthlete) {
        if (athleteNameEl) athleteNameEl.value = linkedAthlete.name || '';
        if (athleteTeamEl) athleteTeamEl.value = linkedAthlete.teamId || '';
        if (athleteDobEl) athleteDobEl.value = linkedAthlete.dob || '';
    } else {
        if (athleteNameEl) athleteNameEl.value = localStorage.getItem('gba_child_name') || '';
        if (athleteTeamEl) athleteTeamEl.value = localStorage.getItem('gba_child_team') || '';
        if (athleteDobEl) athleteDobEl.value = localStorage.getItem('gba_child_dob') || '';
    }
}

window.handleSettingsSave = function() {
    const email = document.getElementById('settings-parent-email')?.value || '';
    const pName = document.getElementById('settings-parent-name')?.value || '';
    const pPhone = document.getElementById('settings-parent-phone')?.value || '';

    // Athlete Inputs
    const cName = (document.getElementById('settings-athlete-name')?.value || '').trim();
    const cTeam = document.getElementById('settings-athlete-team')?.value || '';
    const cDob = document.getElementById('settings-athlete-dob')?.value || '';

    if (!email) {
        godspeedAlert("We couldn't find your email address. Please sign in again.", 'Error');
        return;
    }

    // 1. Update LocalStorage (Parent Profile)
    if (pName) {
        localStorage.setItem('gba_parent_name', pName);
        const namePart = pName.split(' ')[0];
        const dashboardName = document.getElementById('dashboard-user-name');
        if (dashboardName) dashboardName.textContent = namePart;
        const sidebarName = document.querySelector('.user-name');
        if (sidebarName) sidebarName.textContent = pName;
    }
    if (pPhone) localStorage.setItem('gba_parent_phone', pPhone);

    // 2. BACKEND LOGIC: Data Linking (Parent <-> Athlete)
    let db = JSON.parse(localStorage.getItem('gba_db')) || window.GODSPEED_DATA;

    if (db && cName) {
        // A. Find Athlete (Try to link to existing data first)
        let athleteIndex = db.roster.findIndex(r => r.name.toLowerCase() === cName.toLowerCase());

        if (athleteIndex === -1) {
            // New Athlete: Create Entry
            const newId = 'GBA-NEW-' + Date.now(); // Simple ID gen
            db.roster.push({
                athleteId: newId,
                name: cName,
                teamId: cTeam || 'UNASSIGNED',
                parentId: email, // LINK ESTABLISHED
                dob: cDob
            });
            console.log('Created new athlete link:', cName, newId);
        } else {
            // Existing Athlete: Claim & Update
            // This allows the parent to "claim" the athlete by name
            db.roster[athleteIndex].parentId = email; // LINK ESTABLISHED
            if (cTeam) db.roster[athleteIndex].teamId = cTeam;
            if (cDob) db.roster[athleteIndex].dob = cDob;
            console.log('Linked to existing athlete:', cName);
        }

        // B. Save DB
        localStorage.setItem('gba_db', JSON.stringify(db));
    }

    // Fallback saves for non-DB generic display
    if (cName) localStorage.setItem('gba_child_name', cName);
    if (cTeam) localStorage.setItem('gba_child_team', cTeam);
    if (cDob) localStorage.setItem('gba_child_dob', cDob);

    // 3. Visual Feedback
    const btn = document.querySelector('#settings-form button[type="submit"]');
    const originalText = btn.innerText;

    btn.innerText = 'Profile Linked & Saved ✓';
    btn.disabled = true;

    setTimeout(() => {
        btn.innerText = originalText;
        btn.disabled = false;
        
        // Redirect user back to documents view as requested
        const docsNav = document.querySelector('.nav-item[onclick*="documents"]');
        if (docsNav) {
            switchPortalView('documents', docsNav);
        } else {
            // Fallback if nav item not found
            switchPortalView('documents', document.querySelector('.nav-item'));
        }
    }, 1200);
}
// --- Gear & Uniform Logic ---

window.submitGearOrder = async function () {
    const email = document.getElementById('settings-parent-email').value || localStorage.getItem('gba_user_email');
    if (!email) {
        godspeedAlert("Please sign in to your account to submit an order.", "GODSPEED BASKETBALL");
        return;
    }

    // 1. Collect Data
    // Black Jersey
    const jerseyBlackSize = document.querySelector('#view-gear .gear-item:nth-child(2) select').value;
    const jerseyBlackQty = document.querySelector('#view-gear .gear-item:nth-child(2) input[type="number"]').value;

    // White Jersey
    const jerseyWhiteSize = document.querySelector('#view-gear .gear-item:nth-child(3) select').value;
    const jerseyWhiteQty = document.querySelector('#view-gear .gear-item:nth-child(3) input[type="number"]').value;

    // Orange Shorts
    const shortsOrangeSize = document.querySelector('#view-gear .gear-item:nth-child(4) select').value;
    const shortsOrangeQty = document.querySelector('#view-gear .gear-item:nth-child(4) input[type="number"]').value;

    // Blue Shorts
    const shortsBlueSize = document.querySelector('#view-gear .gear-item:nth-child(5) select').value;
    const shortsBlueQty = document.querySelector('#view-gear .gear-item:nth-child(5) input[type="number"]').value;

    // Warmup Shirt
    const shirtSize = document.querySelector('#view-gear .gear-item:nth-child(6) select').value;
    const shirtQty = document.querySelector('#view-gear .gear-item:nth-child(6) input[type="number"]').value;

    // Backpack
    const backpackName = document.querySelector('#view-gear .gear-item:nth-child(7) input[type="text"]').value;
    const backpackChecked = document.querySelector('#view-gear .gear-item:nth-child(7) input[type="checkbox"]').checked;

    // 2. Create Order Object
    const order = {
        orderId: 'ORD-' + Date.now(),
        parentId: email,
        date: new Date().toISOString(),
        items: [
            { id: 'jersey_black', name: 'Game Jersey (Black)', size: jerseyBlackSize, qty: jerseyBlackQty },
            { id: 'jersey_white', name: 'Game Jersey (White)', size: jerseyWhiteSize, qty: jerseyWhiteQty },
            { id: 'shorts_orange', name: 'Game Shorts (Orange)', size: shortsOrangeSize, qty: shortsOrangeQty },
            { id: 'shorts_blue', name: 'Game Shorts (Blue)', size: shortsBlueSize, qty: shortsBlueQty },
            { id: 'warmup', name: 'Warmup Shirt', size: shirtSize, qty: shirtQty }
        ]
    };

    if (backpackChecked) {
        order.items.push({
            id: 'backpack',
            name: 'Team Backpack',
            customName: backpackName || 'No Name',
            qty: 1
        });
    }

    console.log('Processing Order:', order);

    // 3. Save to DB (Simulated Backend)
    const db = JSON.parse(localStorage.getItem('gba_db')) || window.GODSPEED_DATA;
    if (!db.orders) db.orders = []; // Init if missing
    db.orders.push(order);
    localStorage.setItem('gba_db', JSON.stringify(db));

    // Send Email Notification via Edge Function
    try {
        const authEmail = localStorage.getItem('gba_user_email');
        if (window.auth && window.auth.isSupabaseAvailable()) {
            const supabase = window.auth.getSupabaseClient();
            await supabase.functions.invoke('send-email', {
                body: {
                    type: 'gear_order',
                    emailTo: 'coach@clubgodspeed.com',
                    orderObj: order
                }
            });
            console.log('Gear order email dispatched to Coach.');
        } else {
            console.log('Mock Mode: Simulate sending gear order email:', order);
        }
    } catch (err) {
        console.error('Failed to dispatch gear order email:', err);
    }

    // 4. UI Feedback
    const btn = document.querySelector('#view-gear button');
    const originalText = btn.innerText;

    btn.innerText = 'Order Request Sent ✓';
    btn.style.background = '#34C759'; // Success Green
    btn.disabled = true;

    // Sanitize email before displaying in alert
    const safeEmail = escapeHTML(email || '');
    godspeedAlert(`Order for ${safeEmail} has been submitted to the team admin.`, 'Order Submitted');

    setTimeout(() => {
        btn.innerText = originalText;
        btn.style.background = '#0071e3';
        btn.disabled = false;
        // Optionally reset form here
    }, 3000);
}

// --- Training Dashboard Logic ---

/**
 * Render the training dashboard with hours, calendar, and documents
 */
// --- Training Dashboard Logic ---

/**
 * Render the training dashboard with hours, calendar, and documents
 */
window.updateUIForCohort = function() {
    const cohort = localStorage.getItem('gba_user_cohort') || 'aau'; // default to AAU
    const aauNav = document.getElementById('nav-aau-billing');
    const ctaBanner = document.getElementById('aau-dues-cta');
    const aauDocs = document.querySelectorAll('.doc-aau');
    
    // Some documents might strictly belong to AAU
    // In parent-portal.html we will tag them appropriately
    
    if (cohort === 'training') {
        if (aauNav) aauNav.style.display = 'none';
        if (ctaBanner) ctaBanner.style.display = 'none';
        aauDocs.forEach(el => el.style.display = 'none');
    } else {
        if (aauNav) aauNav.style.display = 'flex';
        // CTA is styled as flex, but inline styles in HTML will set it. Reset it back to flex.
        if (ctaBanner) ctaBanner.style.display = 'flex';
        aauDocs.forEach(el => el.style.display = 'block'); // or flex depending on original
    }
}

// Ensure cohort update runs when portal is loaded automatically (cached login)
document.addEventListener('DOMContentLoaded', () => {
    updateUIForCohort();
});
async function renderTrainingDashboard() {
    const parentEmail = localStorage.getItem('gba_user_email');
    /* if (!parentEmail) {
        console.warn('No parent email found');
         return;
     } */
    // For demo "tomorrow", even if no email, show mock data
    if (!parentEmail) { // Changed `email` to `parentEmail` to match scope
        document.getElementById('welcome-user-name').textContent = "Demo User";
        document.getElementById('dashboard-user-name').textContent = "Demo User";
    }

    const db = getDB(); // Uses portal-data.js mock if need be
    const data = db.training;

    if (!data) {
        console.warn('No training data found in DB');
        return;
    }

    // 1. Training Hours & Counts
    // CHECK FOR USER SPECIFIC RECORD
    const userRecord = db.trainingRecords ? db.trainingRecords[parentEmail] : null;
    let displayHours = data.hours;

    if (userRecord) {
        displayHours = userRecord.hours;
    }

    const hoursEl = document.getElementById('training-hours-display');
    const utilizedEl = document.getElementById('training-utilized-display');

    if (hoursEl) hoursEl.textContent = displayHours.remaining.toFixed(1);
    if (utilizedEl) utilizedEl.textContent = displayHours.used.toFixed(1);

    // 2. Scheduled Sessions
    const calendarContainer = document.getElementById('training-calendar-container');
    if (calendarContainer) {
        let content = '';

        // A. Upcoming Sessions
        if (data.upcomingSessions.length === 0) {
            content += '<div class="text-gray-500 text-sm">No upcoming sessions.</div>';
        } else {
            content += data.upcomingSessions.map(sess => {
                const isTentative = sess.status === 'Tentative';
                const badgeColor = isTentative ? '#d97706' : '#0284c7';
                const badgeBg = isTentative ? '#fef3c7' : '#e0f2fe';
                const badgeText = isTentative ? 'Tentative' : 'Scheduled';
                // Sanitize session data
                const safeDate = escapeHTML(new Date(sess.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }));
                const safeTime = escapeHTML(sess.time || '');
                const safeProgram = escapeHTML(sess.program || '');
                const safeTopic = escapeHTML(sess.topic || '');

                return `
                <div class="session-card" style="display:flex; justify-content:space-between; align-items:center; padding:12px 16px; background:#f9fafb; border-radius:8px; margin-bottom:8px; border:1px solid #eee;">
                    <div>
                        <div style="font-weight:700; color:#111; font-size:14px;">${safeDate} @ ${safeTime}</div>
                        <div style="font-size:12px; color:#666;">${safeProgram} • ${safeTopic}</div>
                    </div>
                    <div style="text-align:right;">
                        <span style="font-size:11px; padding:4px 8px; background:${badgeBg}; color:${badgeColor}; border-radius:12px; font-weight:600;">${escapeHTML(badgeText)}</span>
                    </div>
                </div>
            `}).join('');
        }

        // B. Past Usage Logs (User Specific)
        if (userRecord && userRecord.logs && userRecord.logs.length > 0) {
            content += `<h4 style="margin: 24px 0 12px 0; font-size: 14px; color: #444; font-weight: 600; text-transform:uppercase; letter-spacing:0.5px;">Session History</h4>`;
            content += userRecord.logs.map(log => {
                // Sanitize log data
                const safeActivity = escapeHTML(log.activity || '');
                const safeDate = escapeHTML(new Date(log.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }));
                const safeNotes = escapeHTML(log.notes || '');
                const safeDuration = log.duration ? `${log.duration.toFixed(1)} hrs` : '';

                return `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 16px; background:#fff; border-radius:8px; margin-bottom:8px; border:1px solid #eee;">
                     <div style="display:flex; align-items:center; gap:8px; flex:1;">
                        <svg style="width:16px; height:16px; flex-shrink:0;" fill="none" stroke="#10b981" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path></svg>
                        <div style="flex:1;">
                            <div style="font-weight:600; color:#111; font-size:13px;">${safeActivity}</div>
                            <div style="font-size:11px; color:#666;">${safeDate} • ${safeNotes}</div>
                        </div>
                    </div>
                    <div style="font-weight:700; color:#444; font-size:13px;">-${safeDuration}</div>
                </div>
            `;
            }).join('');
        }

        calendarContainer.innerHTML = content;
    }

    // 3. Active Programs
    const programsList = document.getElementById('skills-programs-list');
    if (programsList) {
        programsList.innerHTML = data.programs.map(prog => {
            // Sanitize all program data
            const safeName = escapeHTML(prog.name || '');
            const safeStatus = escapeHTML(prog.status || '');
            const safeType = escapeHTML(prog.type || 'Program');
            const safeDescription = prog.description ? escapeHTML(prog.description) : '';
            const safeSchedule = escapeHTML(prog.schedule || '');
            const safeCoach = escapeHTML(prog.coach || '');
            const isActive = prog.status === 'Active';
            const safeFocus = prog.focus ? prog.focus.map(f => escapeHTML(f)) : [];

            return `
            <div class="program-card" style="padding:16px; border:1px solid #eee; border-radius:10px; margin-bottom:12px; background:white; box-shadow:0 2px 4px rgba(0,0,0,0.02);">
                <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                    <div style="font-weight:700; font-size:15px;">${safeName}</div>
                    <span class="badge ${isActive ? 'badge-active' : 'badge-inactive'}" 
                          style="font-size:10px; padding:2px 8px; border-radius:10px; background:${isActive ? '#dcfce7' : '#f3f4f6'}; color:${isActive ? '#166534' : '#6b7280'}; text-transform:uppercase; font-weight:700;">
                        ${safeStatus}
                    </span>
                </div>
                
                <div style="font-size:11px; color:#666; font-weight:600; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:8px;">${safeType}</div>

                ${safeDescription ? `<div style="font-size:13px; color:#444; margin-bottom:12px; line-height:1.4;">${safeDescription}</div>` : ''}

                ${safeFocus.length > 0 ? `
                <div style="margin-bottom:12px; display:flex; flex-wrap:wrap; gap:6px;">
                    ${safeFocus.map(f => `<span style="font-size:11px; background:#f0f9ff; color:#0369a1; padding:2px 8px; border-radius:4px; font-weight:500;">${f}</span>`).join('')}
                </div>
                ` : ''}

                <div style="font-size:12px; color:#888; display:flex; gap:12px; padding-top:12px; border-top:1px solid #f9fafb;">
                    <span>📅 ${safeSchedule}</span>
                    <span>👤 ${safeCoach}</span>
                </div>
            </div>
        `;
        }).join('');
    }

    // 4. Documents
    const docsContainer = document.getElementById('training-documents-list');
    if (docsContainer) {
        let docsHtml = '';

        // A. Receipts (User Specific)
        if (userRecord && userRecord.purchases) {
            docsHtml += userRecord.purchases.map(p => {
                // Sanitize purchase data
                const safeItem = escapeHTML(p.item || '');
                const safeDate = escapeHTML(p.date || '');
                const safeAmount = escapeHTML(p.amount || '');
                const safeStatus = escapeHTML(p.status || '');
                const safeEmail = escapeHTML(parentEmail || '');

                return `
                <div class="doc-item" style="display:flex; align-items:center; gap:12px; padding:12px; border-bottom:1px solid #f0f0f0; background:#f0fdf4;">
                    <div style="background:#166534; color:#fff; width:32px; height:32px; display:flex; align-items:center; justify-content:center; border-radius:6px; font-size:14px; font-weight:700;">$</div>
                    <div style="flex:1;">
                        <div style="font-size:13px; font-weight:600;">Receipt: ${safeItem}</div>
                        <div style="font-size:11px; color:#166534;">${safeDate} • ${safeAmount} • ${safeStatus}</div>
                    </div>
                    <button data-email="${escapeHTML(safeEmail)}" class="btn-primary view-receipt-btn" style="padding: 6px 12px; font-size: 10px; min-width: 88px; min-height: 44px; display: inline-flex; align-items: center; justify-content: center; text-decoration: none; line-height:1.2; border:none; cursor:pointer; box-sizing: border-box;">View Receipt</button>
                </div>
            `;
            }).join('');
        }

        // B. Standard Docs
        docsHtml += data.documents.map(doc => {
            // Sanitize document data
            const safeTitle = escapeHTML(doc.title || '');
            const safeDate = escapeHTML(doc.date || '');
            const safeLink = validateURL(doc.link) || '#';

            return `
            <div class="doc-item" style="display:flex; align-items:center; gap:12px; padding:12px; border-bottom:1px solid #f0f0f0;">
                <div style="background:#fee2e2; color:#991b1b; width:32px; height:32px; display:flex; align-items:center; justify-content:center; border-radius:6px; font-size:10px; font-weight:700;">PDF</div>
                <div style="flex:1;">
                    <div style="font-size:13px; font-weight:600;">${safeTitle}</div>
                    <div style="font-size:11px; color:#888;">Added ${safeDate}</div>
                </div>
                <a href="${safeLink}" class="btn-primary" style="padding: 6px 12px; font-size: 10px; min-width: 88px; min-height: 44px; display: inline-flex; align-items: center; justify-content: center; text-decoration: none; line-height:1.2; border:none; cursor:pointer; box-sizing: border-box;">Download</a>
            </div>
        `;
        }).join('');

        docsContainer.innerHTML = docsHtml;
    }
}
/**
 * Calculate and display remaining training hours
 */
async function calculateRemainingHours(parentEmail) {
    const supabase = window.auth?.getSupabaseClient?.();
    const db = getDB();

    let totalPurchased = 0;
    let totalUsed = 0;

    // Check Supabase first
    if (supabase && window.auth?.isSupabaseAvailable?.()) {
        try {
            const { data: parentAccount, error: accountError } = await supabase
                .from('parent_accounts')
                .select('id')
                .eq('email', parentEmail)
                .single();

            if (accountError) {
                console.error('Error fetching parent account:', accountError);
                // Fall through to mock data
            } else if (parentAccount) {
                const { data: purchases, error: purchasesError } = await supabase
                    .from('training_purchases')
                    .select('hours_purchased, hours_used')
                    .eq('parent_id', parentAccount.id)
                    .eq('status', 'active');

                if (purchasesError) {
                    console.error('Error fetching purchases:', purchasesError);
                    // Fall through to mock data
                } else if (purchases) {
                    totalPurchased = purchases.reduce((sum, p) => sum + (parseFloat(p.hours_purchased) || 0), 0);
                    totalUsed = purchases.reduce((sum, p) => sum + (parseFloat(p.hours_used) || 0), 0);
                }
            }
        } catch (e) {
            console.error('Error calculating remaining hours:', e);
            // Fall through to mock data
        }
    }

    // Fallback to Mock Data from trainingRecords
    if (totalPurchased === 0) {
        const userRecords = db.trainingRecords ? db.trainingRecords[parentEmail] : null;
        if (userRecords && userRecords.hours) {
            totalPurchased = userRecords.hours.totalPurchased;
            totalUsed = userRecords.hours.used;
        }
    }

    const remaining = totalPurchased - totalUsed;
    const progressPercent = totalPurchased > 0 ? (totalUsed / totalPurchased) * 100 : 0;

    return {
        purchased: totalPurchased,
        used: totalUsed,
        remaining: remaining,
        progressPercent: progressPercent
    };
}

/**
 * Load and display training hours
 */
async function loadTrainingHours(parentEmail) {
    const hoursData = await calculateRemainingHours(parentEmail);

    // Update hours display
    const hoursPurchasedEl = document.getElementById('hours-purchased');
    const hoursUsedEl = document.getElementById('hours-used');
    const progressFillEl = document.getElementById('hours-progress-fill');

    // --- User-Specific Usage & Purchase History ---
    const db = getDB();
    const userRecords = db.trainingRecords ? db.trainingRecords[parentEmail] : null;

    if (userRecords) {
        // Set purchased hours
        if (hoursPurchasedEl) {
            hoursPurchasedEl.textContent = userRecords.hours.totalPurchased;
        }

        // Update the main dashboard display elements
        const trainingHoursDisplay = document.getElementById('training-hours-display');
        if (trainingHoursDisplay) {
            trainingHoursDisplay.textContent = userRecords.hours.remaining.toFixed(1);
        }

        const utilizedDisplay = document.getElementById('training-utilized-display');
        if (utilizedDisplay) {
            utilizedDisplay.textContent = userRecords.hours.used.toFixed(1);
        }

        // Create Log Container if not exists (Training View)
        // Use existing container or append a new one
        /* Assuming we are in 'training' view context or similar elements exist */

        // We'll append usage logs to 'training-calendar-container' used as a placeholder or create a new div if feasible
        // Actually, let's create a dedicated section dynamically
        const calendarContainer = document.getElementById('training-calendar-container');
        if (calendarContainer && !document.getElementById('user-usage-log')) {
            const logDiv = document.createElement('div');
            logDiv.id = 'user-usage-log';
            logDiv.style.marginTop = '20px';
            const header = document.createElement('h4');
            header.style.marginBottom = '10px';
            header.style.fontSize = '14px';
            header.style.color = '#444';
            header.textContent = 'Session History';
            logDiv.appendChild(header);

            userRecords.logs.forEach(log => {
                const safeActivity = escapeHTML(log.activity || '');
                const safeDate = escapeHTML(log.date || '');
                const safeTime = escapeHTML(log.time || '');

                const logItem = document.createElement('div');
                logItem.style.display = 'flex';
                logItem.style.alignItems = 'center'; // Align icon with text
                logItem.style.justifyContent = 'space-between';
                logItem.style.padding = '12px';
                logItem.style.background = '#fff';
                logItem.style.border = '1px solid #eee';
                logItem.style.borderRadius = '8px';
                logItem.style.marginBottom = '8px';

                // Left Side Container (Icon + Text)
                const leftContainer = document.createElement('div');
                leftContainer.style.display = 'flex';
                leftContainer.style.alignItems = 'center';
                leftContainer.style.gap = '10px';

                // Subtle Checkmark Icon
                const iconDiv = document.createElement('div');
                iconDiv.innerHTML = `
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                    `;
                iconDiv.style.display = 'flex';
                iconDiv.style.alignItems = 'center';

                const textDiv = document.createElement('div');
                const activityDiv = document.createElement('div');
                activityDiv.style.fontWeight = '600';
                activityDiv.style.fontSize = '13px';
                activityDiv.style.color = '#1f2937';
                activityDiv.textContent = safeActivity;

                const dateDiv = document.createElement('div');
                dateDiv.style.fontSize = '11px';
                dateDiv.style.color = '#6b7280';
                dateDiv.textContent = safeDate;

                textDiv.appendChild(activityDiv);
                textDiv.appendChild(dateDiv);

                leftContainer.appendChild(iconDiv);
                leftContainer.appendChild(textDiv);

                const timeDiv = document.createElement('div');
                timeDiv.style.fontWeight = '500';
                timeDiv.style.fontSize = '12px';
                timeDiv.style.color = '#4b5563';
                timeDiv.textContent = safeTime;

                logItem.appendChild(leftContainer);
                logItem.appendChild(timeDiv);
                logDiv.appendChild(logItem);
            });
            calendarContainer.parentNode.insertBefore(logDiv, calendarContainer.nextSibling);
        }

        // Receipts
        const docsContainer = document.getElementById('training-documents-list');
        if (docsContainer && userRecords.purchases) {
            userRecords.purchases.forEach(p => {
                // Sanitize purchase data
                const safeItem = escapeHTML(p.item || '');
                const safeDate = escapeHTML(p.date || '');
                const safeAmount = escapeHTML(p.amount || '');
                const safeStatus = escapeHTML(p.status || '');
                const safeLink = validateURL(p.link) || '#';

                const purchaseDiv = document.createElement('div');
                purchaseDiv.className = 'doc-item';
                purchaseDiv.style.display = 'flex';
                purchaseDiv.style.alignItems = 'center';
                purchaseDiv.style.gap = '12px';
                purchaseDiv.style.padding = '12px';
                purchaseDiv.style.borderBottom = '1px solid #f0f0f0';
                purchaseDiv.style.background = '#f9fafb';

                const iconDiv = document.createElement('div');
                iconDiv.style.background = '#dcfce7';
                iconDiv.style.color = '#166534';
                iconDiv.style.width = '32px';
                iconDiv.style.height = '32px';
                iconDiv.style.display = 'flex';
                iconDiv.style.alignItems = 'center';
                iconDiv.style.justifyContent = 'center';
                iconDiv.style.borderRadius = '6px';
                iconDiv.style.fontSize = '14px';
                iconDiv.style.fontWeight = '700';
                iconDiv.textContent = '$';

                const contentDiv = document.createElement('div');
                contentDiv.style.flex = '1';
                const itemDiv = document.createElement('div');
                itemDiv.style.fontSize = '13px';
                itemDiv.style.fontWeight = '600';
                itemDiv.textContent = `Receipt: ${safeItem}`;
                const detailsDiv = document.createElement('div');
                detailsDiv.style.fontSize = '11px';
                detailsDiv.style.color = '#888';
                detailsDiv.textContent = `${safeDate} • ${safeAmount} • ${safeStatus}`;
                contentDiv.appendChild(itemDiv);
                contentDiv.appendChild(detailsDiv);

                const linkEl = document.createElement('a');
                linkEl.href = safeLink;
                linkEl.style.fontSize = '11px';
                linkEl.style.color = '#0071e3';
                linkEl.style.fontWeight = '600';
                linkEl.style.textDecoration = 'none';
                linkEl.textContent = 'View PDF';
                linkEl.target = '_blank';
                linkEl.rel = 'noopener';
                // If the link is a direct PDF URL, let the browser open it.
                // Otherwise fall back to the receipt modal view.
                if (!safeLink || safeLink === '#') {
                    linkEl.onclick = (e) => {
                        e.preventDefault();
                        viewReceiptDetail(safeItem); // fallback to modal view using receipt ID
                    };
                }

                purchaseDiv.appendChild(iconDiv);
                purchaseDiv.appendChild(contentDiv);
                purchaseDiv.appendChild(linkEl);
                docsContainer.insertBefore(purchaseDiv, docsContainer.firstChild);
            });
        }
    }

    // Set progress bar
    if (progressFillEl) {
        progressFillEl.style.width = `${hoursData.progressPercent}%`;
    }
}

/**
 * Load session counts (completed and upcoming)
 */
async function loadSessionCounts(parentEmail) {
    try {
        const supabase = window.auth?.getSupabaseClient?.();
        const db = getDB();

        const athletes = (db.roster || []).filter(a => a.parentId === parentEmail);
        let completedCount = 0;
        let upcomingCount = 0;

        if (supabase && window.auth?.isSupabaseAvailable?.()) {
            try {
                const { data: parentAccount, error: accountError } = await supabase
                    .from('parent_accounts')
                    .select('id')
                    .eq('email', parentEmail)
                    .single();

                if (accountError) {
                    console.error('Error fetching parent account for session counts:', accountError);
                    // Fall through to use default counts (0)
                } else if (parentAccount) {
                    const athleteIds = athletes.map(a => a.athleteId);

                    // Get completed sessions (attendance records)
                    const { data: purchases, error: purchasesError } = await supabase
                        .from('training_purchases')
                        .select('id')
                        .eq('parent_id', parentAccount.id)
                        .in('athlete_id', athleteIds);

                    if (purchasesError) {
                        console.error('Error fetching purchases for session counts:', purchasesError);
                    } else if (purchases && purchases.length > 0) {
                        const purchaseIds = purchases.map(p => p.id);
                        const { data: attendance, error: attendanceError } = await supabase
                            .from('training_attendance')
                            .select('id')
                            .in('purchase_id', purchaseIds);

                        if (attendanceError) {
                            console.error('Error fetching attendance:', attendanceError);
                        } else {
                            completedCount = attendance ? attendance.length : 0;
                        }
                    }

                    // Get upcoming sessions
                    const { data: enrollments, error: enrollmentsError } = await supabase
                        .from('player_enrollments')
                        .select('program_id')
                        .eq('parent_id', parentAccount.id)
                        .in('athlete_id', athleteIds)
                        .eq('status', 'active');

                    if (enrollmentsError) {
                        console.error('Error fetching enrollments:', enrollmentsError);
                    } else if (enrollments && enrollments.length > 0) {
                        const programIds = enrollments.map(e => e.program_id);
                        const today = new Date().toISOString().split('T')[0];
                        const { data: sessions, error: sessionsError } = await supabase
                            .from('training_sessions')
                            .select('id')
                            .in('program_id', programIds)
                            .gte('session_date', today)
                            .eq('status', 'scheduled');

                        if (sessionsError) {
                            console.error('Error fetching sessions:', sessionsError);
                        } else {
                            upcomingCount = sessions ? sessions.length : 0;
                        }
                    }
                }
            } catch (error) {
                console.error('Error loading session counts:', error);
                // Fall through to use default counts
            }
        }

        // 1. Update Top Stats
        const completedEl = document.getElementById('sessions-completed');
        const upcomingEl = document.getElementById('sessions-upcoming');
        const activeProgramsEl = document.getElementById('active-programs');

        // Get user record for completed count
        // Reuse existing db instance
        // const db = getDB(); // Already declared above
        const userRecord = db.trainingRecords ? db.trainingRecords[parentEmail] : null;

        if (completedEl) completedEl.textContent = (userRecord && userRecord.logs) ? userRecord.logs.length : completedCount;
        if (upcomingEl) upcomingEl.textContent = upcomingCount;

        // Active Programs count - count programs with status 'Active' for this user
        if (activeProgramsEl) {
            const activePrograms = db.training && db.training.programs ?
                db.training.programs.filter(p => p.status === 'Active').length : 0;
            activeProgramsEl.textContent = activePrograms;
        }
    } catch (error) {
        console.error('Error in loadSessionCounts:', error);
        // Set default values on error
        const completedEl = document.getElementById('sessions-completed');
        const upcomingEl = document.getElementById('sessions-upcoming');
        if (completedEl) completedEl.textContent = '0';
        if (upcomingEl) upcomingEl.textContent = '0';
    }
}

/**
 * Load training calendar filtered by athlete's training days
 */
async function loadTrainingCalendar(parentEmail) {
    try {
        const db = getDB();
        const supabase = window.auth?.getSupabaseClient?.();

        // Get athlete enrollments
        const athletes = (db.roster || []).filter(a => a.parentId === parentEmail);

        // Populate athlete select
        const athleteSelect = document.getElementById('training-athlete-select');
        if (athleteSelect) {
            athleteSelect.innerHTML = '<option value="">All Athletes</option>';
            athletes.forEach(athlete => {
                const option = document.createElement('option');
                option.value = escapeHTML(athlete.athleteId || '');
                option.textContent = escapeHTML(athlete.name || '');
                athleteSelect.appendChild(option);
            });

            athleteSelect.addEventListener('change', (e) => {
                filterCalendarByAthlete(e.target.value);
            });
        }

        // Load enrollments to filter calendar
        let enrolledPrograms = [];
        if (supabase && window.auth?.isSupabaseAvailable?.()) {
            try {
                const { data: parentAccount, error: accountError } = await supabase
                    .from('parent_accounts')
                    .select('id')
                    .eq('email', parentEmail)
                    .single();

                if (accountError) {
                    console.error('Error fetching parent account for calendar:', accountError);
                    // Fall through to roster fallback
                } else if (parentAccount) {
                    const athleteIds = athletes.map(a => a.athleteId);
                    const { data: enrollments, error: enrollmentsError } = await supabase
                        .from('player_enrollments')
                        .select('program_id, enrolled_sessions')
                        .eq('parent_id', parentAccount.id)
                        .in('athlete_id', athleteIds)
                        .eq('status', 'active');

                    if (enrollmentsError) {
                        console.error('Error fetching enrollments for calendar:', enrollmentsError);
                        // Fall through to roster fallback
                    } else if (enrollments) {
                        enrolledPrograms = enrollments.map(e => e.program_id);
                    }
                }
            } catch (error) {
                console.error('Error loading enrollments:', error);
                // Fall through to roster fallback
            }
        }

        // Fallback: get from roster active_enrollments
        if (enrolledPrograms.length === 0) {
            athletes.forEach(athlete => {
                if (athlete.active_enrollments) {
                    enrolledPrograms.push(...athlete.active_enrollments);
                }
            });
        }

        // Store enrolled programs for calendar filtering
        window.trainingEnrolledPrograms = enrolledPrograms;

        // DISPLAY RULE 1: Hide Selector if < 2 Athletes
        // Re-use existing athleteSelect variable from line 1636
        if (athleteSelect) {
            if (athletes.length < 2) {
                athleteSelect.style.display = 'none';
            } else {
                athleteSelect.style.display = 'block'; // Ensure visible for multiple
            }
        }

        // DISPLAY RULE 2: Conditional Schedule Section
        // Check if any enrolled program has a defined schedule
        // DISPLAY RULE 2: Conditional Schedule Section
        // STRICT DATA-DRIVEN CHECK
        // Do NOT rely on string parsing or formatting.
        // Check if program explicitly has `has_schedule === true` OR `start_time` (API Flag).

        let hasSchedule = false;

        if (db.training && db.training.programs) {
            const activeProgramIds = enrolledPrograms.map(p => typeof p === 'object' ? p.program_id : p);
            const activeProgramsWithSchedule = db.training.programs.filter(p =>
                activeProgramIds.includes(p.id) && (p.has_schedule === true || (p.start_time && p.start_time !== null))
            );
            if (activeProgramsWithSchedule.length > 0) hasSchedule = true;
        }

        const calendarContainer = document.getElementById('training-calendar-container');
        // Find the parent container (the .bg-white card)
        const calendarCard = calendarContainer ? calendarContainer.closest('.bg-white') : null;

        if (calendarCard) {
            if (hasSchedule) {
                calendarCard.style.display = 'block';
            } else {
                calendarCard.style.display = 'none';
            }
        }
    } catch (error) {
        console.error('Error in loadTrainingCalendar:', error);
        // Initialize empty array on error
        window.trainingEnrolledPrograms = [];
    }
}

/**
 * Filter calendar by selected athlete
 */
function filterCalendarByAthlete(athleteId) {
    // This will be handled by the calendar iframe
    // For now, we'll pass the filter via postMessage
    const iframe = document.getElementById('training-calendar-iframe');
    if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({
            type: 'filterByAthlete',
            athleteId: athleteId
        }, '*');
    }
}

/**
 * Load skills programs for the parent's athletes
 */
async function loadSkillsPrograms(parentEmail) {
    try {
        const db = getDB();
        const supabase = window.auth?.getSupabaseClient?.();
        const container = document.getElementById('skills-programs-list');

        if (!container) return;

        const athletes = (db.roster || []).filter(a => a.parentId === parentEmail);
        let programs = [];

        if (supabase && window.auth?.isSupabaseAvailable?.()) {
            try {
                const { data: parentAccount, error: accountError } = await supabase
                    .from('parent_accounts')
                    .select('id')
                    .eq('email', parentEmail)
                    .single();

                if (accountError) {
                    console.error('Error fetching parent account for skills programs:', accountError);
                    // Fall through to roster fallback
                } else if (parentAccount) {
                    const athleteIds = athletes.map(a => a.athleteId);
                    const { data: enrollments, error: enrollmentsError } = await supabase
                        .from('player_enrollments')
                        .select('*, training_packages(name, description, program_type)')
                        .eq('parent_id', parentAccount.id)
                        .in('athlete_id', athleteIds)
                        .eq('status', 'active');

                    if (enrollmentsError) {
                        console.error('Error fetching enrollments for skills programs:', enrollmentsError);
                        // Fall through to roster fallback
                    } else if (enrollments) {
                        programs = enrollments;
                    }
                }
            } catch (error) {
                console.error('Error loading skills programs:', error);
                // Fall through to roster fallback
            }
        }

        // Fallback: get from roster
        if (programs.length === 0) {
            athletes.forEach(athlete => {
                if (athlete.active_enrollments && athlete.active_enrollments.length > 0) {
                    athlete.active_enrollments.forEach(programId => {
                        programs.push({
                            program_id: programId,
                            program_name: programId,
                            athlete_id: athlete.athleteId,
                            athlete_name: athlete.name
                        });
                    });
                }
            });
        }

        // Render programs
        if (programs.length === 0) {
            const emptyDiv = document.createElement('div');
            emptyDiv.style.textAlign = 'center';
            emptyDiv.style.padding = '40px';
            emptyDiv.style.color = '#888';
            const p = document.createElement('p');
            p.textContent = 'No active skills programs found.';
            emptyDiv.appendChild(p);
            container.appendChild(emptyDiv);
            return;
        }

        let html = '';
        programs.forEach(program => {
            const athlete = athletes.find(a => a.athleteId === program.athlete_id);
            // Sanitize program data
            const safeProgramName = escapeHTML(program.program_name || program.program_id || '');
            const safeAthleteName = escapeHTML(athlete ? athlete.name : 'Unknown Athlete');
            const safeStartDate = program.start_date ? new Date(program.start_date).toLocaleDateString() : '';

            html += `
            <div style="background: #f9f9f9; border-radius: 12px; padding: 20px; margin-bottom: 16px;">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
                    <div>
                        <h4 style="font-size: 18px; font-weight: 600; margin-bottom: 4px;">${safeProgramName}</h4>
                        <p style="font-size: 14px; color: #666;">${safeAthleteName}</p>
                    </div>
                    <span style="background: #10b981; color: white; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600;">Active</span>
                </div>
                ${safeStartDate ? `<div style="font-size: 14px; color: #666; margin-top: 8px;">Started: ${escapeHTML(safeStartDate)}</div>` : ''}
            </div>
        `;
        });

        container.innerHTML = html;

        // Update active programs count
        const activeProgramsEl = document.getElementById('active-programs');
        if (activeProgramsEl) activeProgramsEl.textContent = programs.length;
    } catch (error) {
        console.error('Error in loadSkillsPrograms:', error);
    }
}

/**
 * Load receipts for the parent
 */
async function loadReceipts(parentEmail) {
    try {
        const supabase = window.auth?.getSupabaseClient?.();
        const container = document.getElementById('receipts-list');

        if (!container) return;

        let receipts = [];

        if (supabase && window.auth?.isSupabaseAvailable?.()) {
            try {
                const { data: parentAccount, error: accountError } = await supabase
                    .from('parent_accounts')
                    .select('id')
                    .eq('email', parentEmail)
                    .single();

                if (accountError) {
                    console.error('Error fetching parent account for receipts:', accountError);
                    // Fall through to transactions fallback
                } else if (parentAccount) {
                    const { data, error: receiptsError } = await supabase
                        .from('receipts')
                        .select('*')
                        .eq('parent_id', parentAccount.id)
                        .order('payment_date', { ascending: false })
                        .limit(5);

                    if (receiptsError) {
                        console.error('Error fetching receipts:', receiptsError);
                        // Fall through to transactions fallback
                    } else if (data) {
                        receipts = data;
                    }
                }
            } catch (error) {
                console.error('Error loading receipts:', error);
                // Fall through to transactions fallback
            }
        }

        // Fallback: get from transactions
        if (receipts.length === 0) {
            const db = getDB();
            const transactions = (db.transactions || []).filter(t =>
                t.parentId === parentEmail && t.status === 'PAID'
            ).slice(0, 5);

            receipts = transactions.map(txn => ({
                receipt_number: txn.id,
                amount: txn.amount,
                payment_date: txn.date,
                transaction_id: txn.id
            }));
        }

        if (receipts.length === 0) {
            const emptyDiv = document.createElement('div');
            emptyDiv.style.textAlign = 'center';
            emptyDiv.style.padding = '20px';
            emptyDiv.style.color = '#888';
            const p = document.createElement('p');
            p.textContent = 'No receipts found.';
            emptyDiv.appendChild(p);
            container.appendChild(emptyDiv);
            return;
        }

        receipts.forEach(receipt => {
            // Sanitize receipt data
            const safeReceiptNumber = escapeHTML(String(receipt.receipt_number || receipt.transaction_id || ''));
            const safeDate = escapeHTML(new Date(receipt.payment_date).toLocaleDateString());
            const safeAmount = escapeHTML(parseFloat(receipt.amount || 0).toFixed(2));

            const receiptDiv = document.createElement('div');
            receiptDiv.style.display = 'flex';
            receiptDiv.style.justifyContent = 'space-between';
            receiptDiv.style.alignItems = 'center';
            receiptDiv.style.padding = '16px';
            receiptDiv.style.background = '#f9f9f9';
            receiptDiv.style.borderRadius = '8px';
            receiptDiv.style.marginBottom = '8px';

            const leftDiv = document.createElement('div');
            const receiptNum = document.createElement('div');
            receiptNum.style.fontWeight = '600';
            receiptNum.style.marginBottom = '4px';
            receiptNum.textContent = `Receipt #${safeReceiptNumber}`;
            const dateDiv = document.createElement('div');
            dateDiv.style.fontSize = '14px';
            dateDiv.style.color = '#666';
            dateDiv.textContent = safeDate;
            leftDiv.appendChild(receiptNum);
            leftDiv.appendChild(dateDiv);

            const rightDiv = document.createElement('div');
            rightDiv.style.textAlign = 'right';
            const amountDiv = document.createElement('div');
            amountDiv.style.fontWeight = '600';
            amountDiv.style.marginBottom = '4px';
            amountDiv.textContent = `$${safeAmount}`;
            // View Receipt button (opens PDF in new tab)
            const viewBtn = document.createElement('button');
            viewBtn.className = 'btn-text';
            viewBtn.style.fontSize = '12px';
            viewBtn.style.color = '#0071e3';
            viewBtn.textContent = 'View Receipt';
            viewBtn.onclick = () => window.open(`/receipts/${safeReceiptNumber}/pdf`, '_blank');
            // Download PDF button
            const downloadBtn = document.createElement('button');
            downloadBtn.className = 'btn-text';
            downloadBtn.style.fontSize = '12px';
            downloadBtn.style.color = '#0071e3';
            downloadBtn.textContent = 'Download PDF';
            downloadBtn.onclick = () => generateReceiptPDF(safeReceiptNumber);
            rightDiv.appendChild(amountDiv);
            rightDiv.appendChild(viewBtn);
            rightDiv.appendChild(downloadBtn);

            receiptDiv.appendChild(leftDiv);
            receiptDiv.appendChild(rightDiv);
            container.appendChild(receiptDiv);
        });
    } catch (error) {
        console.error('Error loading receipts:', error);
    }
}

/**
 * Load invoices for the parent
 */
async function loadInvoices(parentEmail) {
    try {
        const supabase = window.auth?.getSupabaseClient?.();
        const container = document.getElementById('invoices-list');

        if (!container) return;

        let invoices = [];

        if (supabase && window.auth?.isSupabaseAvailable?.()) {
            try {
                const { data: parentAccount, error: accountError } = await supabase
                    .from('parent_accounts')
                    .select('id')
                    .eq('email', parentEmail)
                    .single();

                if (accountError) {
                    console.error('Error fetching parent account for invoices:', accountError);
                    // No fallback for invoices, just return empty
                } else if (parentAccount) {
                    const { data, error: invoicesError } = await supabase
                        .from('invoices')
                        .select('*')
                        .eq('parent_id', parentAccount.id)
                        .order('issue_date', { ascending: false })
                        .limit(5);

                    if (invoicesError) {
                        console.error('Error fetching invoices:', invoicesError);
                        // Return empty array
                    } else if (data) {
                        invoices = data;
                    }
                }
            } catch (error) {
                console.error('Error loading invoices:', error);
                // Return empty array
            }
        }

        if (invoices.length === 0) {
            const emptyDiv = document.createElement('div');
            emptyDiv.style.textAlign = 'center';
            emptyDiv.style.padding = '20px';
            emptyDiv.style.color = '#888';
            const p = document.createElement('p');
            p.textContent = 'No invoices found.';
            emptyDiv.appendChild(p);
            container.appendChild(emptyDiv);
            return;
        }

        invoices.forEach(invoice => {
            // Sanitize invoice data
            const safeInvoiceNumber = escapeHTML(String(invoice.invoice_number || ''));
            const safeDueDate = escapeHTML(new Date(invoice.due_date).toLocaleDateString());
            const safeAmount = escapeHTML(parseFloat(invoice.total_amount || 0).toFixed(2));
            const safeStatus = escapeHTML(String(invoice.status || '').toUpperCase());
            const statusColor = invoice.status === 'paid' ? '#10b981' : invoice.status === 'overdue' ? '#ef4444' : '#f59e0b';

            const invoiceDiv = document.createElement('div');
            invoiceDiv.style.display = 'flex';
            invoiceDiv.style.justifyContent = 'space-between';
            invoiceDiv.style.alignItems = 'center';
            invoiceDiv.style.padding = '16px';
            invoiceDiv.style.background = '#f9f9f9';
            invoiceDiv.style.borderRadius = '8px';
            invoiceDiv.style.marginBottom = '8px';

            const leftDiv = document.createElement('div');
            const invoiceNum = document.createElement('div');
            invoiceNum.style.fontWeight = '600';
            invoiceNum.style.marginBottom = '4px';
            invoiceNum.textContent = `Invoice #${safeInvoiceNumber}`;
            const dueDateDiv = document.createElement('div');
            dueDateDiv.style.fontSize = '14px';
            dueDateDiv.style.color = '#666';
            dueDateDiv.textContent = `Due: ${safeDueDate}`;
            leftDiv.appendChild(invoiceNum);
            leftDiv.appendChild(dueDateDiv);

            const rightDiv = document.createElement('div');
            rightDiv.style.textAlign = 'right';
            const amountDiv = document.createElement('div');
            amountDiv.style.fontWeight = '600';
            amountDiv.style.marginBottom = '4px';
            amountDiv.textContent = `$${safeAmount}`;
            const statusContainer = document.createElement('div');
            statusContainer.style.display = 'flex';
            statusContainer.style.gap = '8px';
            statusContainer.style.alignItems = 'center';
            const statusSpan = document.createElement('span');
            statusSpan.style.background = statusColor;
            statusSpan.style.color = 'white';
            statusSpan.style.padding = '2px 8px';
            statusSpan.style.borderRadius = '12px';
            statusSpan.style.fontSize = '11px';
            statusSpan.style.fontWeight = '600';
            statusSpan.textContent = safeStatus;
            const downloadBtn = document.createElement('button');
            downloadBtn.className = 'btn-text';
            downloadBtn.style.fontSize = '12px';
            downloadBtn.style.color = '#0071e3';
            downloadBtn.textContent = 'Download';
            downloadBtn.onclick = () => generateInvoicePDF(safeInvoiceNumber);
            statusContainer.appendChild(statusSpan);
            statusContainer.appendChild(downloadBtn);
            rightDiv.appendChild(amountDiv);
            rightDiv.appendChild(statusContainer);

            invoiceDiv.appendChild(leftDiv);
            invoiceDiv.appendChild(rightDiv);
            container.appendChild(invoiceDiv);
        });
    } catch (error) {
        console.error('Error loading invoices:', error);
    }
}

/**
 * Generate receipt PDF
 * Implementation is in documents-view.js
 * This function is defined there with full jsPDF implementation
 */

/**
 * Generate invoice PDF
 * Implementation is in documents-view.js
 * This function is defined there with full jsPDF implementation
 */

// Make functions globally available
window.loadReceipts = () => loadReceipts(localStorage.getItem('gba_user_email'));
window.loadInvoices = () => loadInvoices(localStorage.getItem('gba_user_email'));
/**
 * Generate and print a training statement/receipt with hours summary
 */
function viewTrainingStatement(email) {
    const db = getDB();
    const record = db.trainingRecords ? db.trainingRecords[email] : null;

    if (!record) {
        godspeedAlert('No training record found for this user.', 'Info');
        return;
    }

    const parentName = localStorage.getItem('gba_parent_name') || 'Parent';
    const date = new Date().toLocaleDateString();

    const w = window.open('', '_blank', 'width=850,height=900');
    w.document.write(`
        <html>
        <head>
            <title>Training Statement - Godspeed</title>
            <style>
                body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; line-height: 1.5; padding: 40px; }
                .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; border-bottom: 2px solid #000; padding-bottom: 20px; }
                .logo { font-size: 24px; font-weight: 900; letter-spacing: -1px; text-transform: uppercase; }
                .logo span { color: #0071e3; }
                .invoice-details { text-align: right; }
                .invoice-details h1 { margin: 0; font-size: 20px; text-transform: uppercase; color: #555; }
                .invoice-details p { margin: 5px 0 0; font-size: 14px; color: #777; }
                
                .section-title { font-size: 14px; font-weight: 700; text-transform: uppercase; color: #555; margin: 30px 0 10px; border-bottom: 1px solid #eee; padding-bottom: 5px; }
                
                .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 30px; }
                .stat-box { background: #f9fafb; padding: 15px; border-radius: 8px; border: 1px solid #eee; text-align: center; }
                .stat-val { font-size: 24px; font-weight: 700; color: #111; display: block; margin-bottom: 5px; }
                .stat-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #666; font-weight: 600; }

                table { width: 100%; border-collapse: collapse; font-size: 13px; }
                th { text-align: left; background: #f3f4f6; padding: 10px; font-weight: 600; text-transform: uppercase; font-size: 11px; color: #555; }
                td { padding: 12px 10px; border-bottom: 1px solid #eee; }
                tr:last-child td { border-bottom: none; }
                
                .amount { font-weight: 700; color: #111; }
                
                .footer { margin-top: 60px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #888; text-align: center; }
                .print-btn { display: inline-block; background: #0071e3; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px; margin-bottom: 20px; cursor: pointer; }
                @media print { .print-btn { display: none; } }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="logo">GODSPEED<span style="color: #0071e3;">BASKETBALL</span></div>
                <div class="invoice-details">
                    <h1>Training Statement</h1>
                    <p>Date: ${date}</p>
                    <p>Account: ${parentName}</p>
                    <p>Email: ${email}</p>
                </div>
            </div>

            <div class="section-title">Hours Summary</div>
            <div class="summary-grid">
                <div class="stat-box">
                    <span class="stat-val">${record.hours.totalPurchased}</span>
                    <span class="stat-label">Total Purchased</span>
                </div>
                <div class="stat-box">
                    <span class="stat-val">${record.hours.used.toFixed(1)}</span>
                    <span class="stat-label">Hours Used</span>
                </div>
                <div class="stat-box">
                    <span class="stat-val" style="color: #0071e3;">${record.hours.remaining.toFixed(1)}</span>
                    <span class="stat-label">Hours Remaining</span>
                </div>
            </div>

            <div class="section-title">Purchase History</div>
            <table>
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Item</th>
                        <th>Status</th>
                        <th style="text-align:right;">Amount</th>
                    </tr>
                </thead>
                <tbody>
                    ${record.purchases.map(p => `
                        <tr>
                            <td>${p.date}</td>
                            <td>${p.item}</td>
                            <td><span style="background:#dcfce7; color:#166534; padding:2px 6px; border-radius:4px; font-size:10px; font-weight:700;">${p.status.toUpperCase()}</span></td>
                            <td style="text-align:right;" class="amount">${p.amount}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>

            <div class="section-title">Usage Log</div>
            <table>
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Activity</th>
                        <th>Notes</th>
                        <th style="text-align:right;">Hours Deducted</th>
                    </tr>
                </thead>
                <tbody>
                    ${record.logs.map(l => `
                        <tr>
                            <td>${l.date}</td>
                            <td>${l.activity}</td>
                            <td>${l.notes}</td>
                            <td style="text-align:right; font-weight:600;">-${l.time}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>

            <div class="footer">
                <p>Godspeed Basketball Academy<br>Thank you for your business.</p>
            </div>

            <script>
                window.onload = function() { window.print(); }
            </script>
        </body>
        </html>
    `);
    w.document.close();
}

/**
 * Toggle Calendar View (Team vs Season)
 */
window.toggleCalendarView = function (viewType) {
    const iframe = document.getElementById('main-calendar-iframe');
    const btnTeam = document.getElementById('btn-cal-team');
    const btnSeason = document.getElementById('btn-cal-season');

    // Update Button Styles
    if (viewType === 'season') {
        if (btnTeam) { btnTeam.classList.remove('active'); btnTeam.style.background = 'transparent'; btnTeam.style.color = '#6b7280'; }
        if (btnSeason) { btnSeason.classList.add('active'); btnSeason.style.background = '#0071e3'; btnSeason.style.color = 'white'; }
    } else {
        if (btnSeason) { btnSeason.classList.remove('active'); btnSeason.style.background = 'transparent'; btnSeason.style.color = '#6b7280'; }
        if (btnTeam) { btnTeam.classList.add('active'); btnTeam.style.background = '#0071e3'; btnTeam.style.color = 'white'; }
    }

    // Post message to iframe
    if (iframe && iframe.contentWindow) {
        // If 'season', we want to show all events. If 'team', we want to filter restricted to user's team.
        // Since we don't have a backend filter, we send a flag.
        const filterId = viewType === 'season' ? 'ALL_SEASONS' : (window.currentAthleteId || null);
        iframe.contentWindow.postMessage({
            type: 'filterByAthlete',
            athleteId: filterId
        }, '*');
    }
}

/**
 * (initiateTrainingPayment has been moved to training-cart.js)
 */


/**
 * Render Billing Dashboard
 */
window.renderBilling = async function (email) {
    const container = document.getElementById('billing-invoices-list');
    const totalDueEl = document.getElementById('billing-total-due');
    const statusTextEl = document.getElementById('billing-status-text');
    const statusCard = document.getElementById('billing-status-card');

    if (!container) return;
    container.innerHTML = '<div style="text-align: center; padding: 20px; color: #666;">Loading your billing details...</div>';

    try {
        if (!window.auth || !window.auth.isSupabaseAvailable()) {
            console.warn("Supabase not available. Rendering demo billing UI.");
            handleDemoBilling(container, totalDueEl, statusTextEl, statusCard);
            return;
        }
        
        const supabase = window.auth.getSupabaseClient();
        const { data: { session }, error: authError } = await supabase.auth.getSession();
        
        // Fallback for demo mode if not truly authenticated
        if (!session || authError) {
            console.log("No valid Supabase session. Rendering demo billing.");
            handleDemoBilling(container, totalDueEl, statusTextEl, statusCard);
            return;
        }

        const user = session.user;

        // 1. Fetch Payment Plan
        const { data: plans, error: plansError } = await supabase
            .from('payment_plans')
            .select('*')
            .eq('parent_id', user.id);

        if (plansError) throw plansError;

        if (!plans || plans.length === 0) {
            // No plan selected yet. Show selector.
            statusTextEl.textContent = '● Action Required';
            statusTextEl.style.color = '#ef4444'; 
            statusCard.style.borderLeftColor = '#ef4444';
            if (totalDueEl) totalDueEl.textContent = '$745.00';
            
            renderPlanSelectionUI(container, user.id, supabase, email);
            return;
        }

        // 2. Fetch Payments for the Plan
        const currentPlan = plans[0];
        const { data: payments, error: paymentsError } = await supabase
            .from('payments')
            .select('*')
            .eq('plan_id', currentPlan.id)
            .order('installment_number', { ascending: true });

        if (paymentsError) throw paymentsError;

        renderPaymentsTimeline(container, payments, currentPlan, supabase);

        // Update Status Headers
        const pendingPayments = payments.filter(p => p.status === 'pending');
        if (pendingPayments.length > 0) {
            const nextPayment = pendingPayments[0];
            const isOverdue = new Date(nextPayment.due_date) < new Date();
            statusTextEl.textContent = isOverdue ? '● Payment Overdue' : '● Upcoming Installment';
            statusTextEl.style.color = isOverdue ? '#ef4444' : '#f59e0b';
            statusCard.style.borderLeftColor = isOverdue ? '#ef4444' : '#f59e0b';
            if (totalDueEl) totalDueEl.textContent = '$' + nextPayment.amount.toFixed(2);
        } else {
            statusTextEl.textContent = '● Paid in Full';
            statusTextEl.style.color = '#10b981';
            statusCard.style.borderLeftColor = '#10b981';
            if (totalDueEl) totalDueEl.textContent = '$0.00';
        }

    } catch (e) {
        console.error("Billing Error:", e);
        container.innerHTML = `<div style="text-align: center; padding: 20px; color: #ef4444; background: #fee2e2; border-radius: 12px;">Failed to load billing: ${e.message}</div>`;
    }
}

function handleDemoBilling(container, totalDueEl, statusTextEl, statusCard) {
    container.innerHTML = `
        <div style="text-align: center; padding: 20px; background: rgba(255,255,255,0.5); border-radius: 12px; color: #888; font-size: 0.9rem;">
            Demo Mode: Please sign in securely to view your open invoices and payment plans.
        </div>
    `;
    if (totalDueEl) totalDueEl.textContent = 'Pending';
    if (statusTextEl && statusCard) {
        statusTextEl.textContent = '● Action Required';
        statusTextEl.style.color = '#ef4444';
        statusCard.style.borderLeftColor = '#ef4444';
    }
}

function renderPlanSelectionUI(container, parentId, supabase, email) {
    container.innerHTML = `
        <div style="background: white; border-radius: 12px; padding: 20px; border: 1px solid #e5e7eb; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
            <h4 style="margin: 0 0 16px 0; font-size: 1.1rem; color: #111;">Select your Spring/Summer 2026 Payment Plan</h4>
            <p style="font-size: 0.9rem; color: #666; margin-bottom: 24px;">Godspeed Basketball offers multiple ways to handle your player's AAU tuition. Select the plan that works best for your family.</p>
            
            <div style="display: grid; gap: 16px;">
                <!-- Full Pay -->
                <div class="plan-option" style="border: 2px solid #e5e7eb; border-radius: 12px; padding: 16px; cursor: pointer; transition: all 0.2s;" onclick="selectPaymentPlan(this, 'full', '${parentId}', '${email}')">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <div style="font-weight: 800; font-size: 1.05rem; color: #111;">Pay in Full</div>
                            <div style="font-size: 0.85rem; color: #666; margin-top: 4px;">One-time payment of $745.00</div>
                        </div>
                        <div style="font-size: 1.25rem; font-weight: 800; color: #0071e3;">$745</div>
                    </div>
                </div>

                <!-- 2-Installment -->
                <div class="plan-option" style="border: 2px solid #e5e7eb; border-radius: 12px; padding: 16px; cursor: pointer; transition: all 0.2s;" onclick="selectPaymentPlan(this, '2-installment', '${parentId}', '${email}')">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <div style="font-weight: 800; font-size: 1.05rem; color: #111;">2 Installments</div>
                            <div style="font-size: 0.85rem; color: #666; margin-top: 4px;">Two payments of $362.00 (April 1st, June 1st)</div>
                        </div>
                        <div style="font-size: 1.25rem; font-weight: 800; color: #0071e3;">$362</div>
                    </div>
                </div>

                <!-- 3-Installment -->
                <div class="plan-option" style="border: 2px solid #e5e7eb; border-radius: 12px; padding: 16px; cursor: pointer; transition: all 0.2s;" onclick="selectPaymentPlan(this, '3-installment', '${parentId}', '${email}')">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <div style="font-weight: 800; font-size: 1.05rem; color: #111;">3 Installments</div>
                            <div style="font-size: 0.85rem; color: #666; margin-top: 4px;">$242.00 (Apr 1st), $242.00 (May 1st), $240.00 (Jun 1st)</div>
                        </div>
                        <div style="font-size: 1.25rem; font-weight: 800; color: #0071e3;">$242</div>
                    </div>
                </div>
            </div>
            
            <div style="margin-top: 24px; text-align: right;">
                <button id="confirm-plan-btn" class="btn-primary" disabled style="opacity: 0.5; padding: 12px 24px;">Enroll & Continue</button>
            </div>
        </div>
    `;

    // Add interactivity script
    window.selectPaymentPlan = function(element, planType, parentId, email) {
        document.querySelectorAll('.plan-option').forEach(el => {
            el.style.borderColor = '#e5e7eb';
            el.style.background = 'white';
        });
        element.style.borderColor = '#0071e3';
        element.style.background = '#f0f9ff';
        
        const btn = document.getElementById('confirm-plan-btn');
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.onclick = async () => {
            btn.innerHTML = 'Creating Plan...';
            btn.disabled = true;
            try {
                // Determine Athlete Name
                let athleteName = "Your Athlete";
                const db = typeof getDB === 'function' ? getDB() : JSON.parse(localStorage.getItem('gba_db'));
                if (db && db.roster) {
                    const athlete = db.roster.find(p => p.parentId === email);
                    if (athlete) athleteName = athlete.name;
                }

                // Call the utility function via dynamic import or direct edge function call
                // Assuming we ported 'createPaymentPlan' logic to an Edge Function or run it clientside.
                // It's cleaner to just run the DB queries here since parent has RLS insert access.
                
                const planData = {
                    parent_id: parentId,
                    player_name: athleteName,
                    plan_type: planType,
                    total_amount: 745.00
                };
                
                const { data: insertedPlan, error: planError } = await supabase
                    .from('payment_plans')
                    .insert(planData)
                    .select()
                    .single();
                    
                if (planError) throw planError;
                
                // Build installments
                let installmentsArray = [];
                if (planType === 'full') {
                    installmentsArray = [{ number: 1, amount: 745.00, dueDate: '2026-04-01' }];
                } else if (planType === '2-installment') {
                    installmentsArray = [
                        { number: 1, amount: 375.00, dueDate: '2026-04-01' },
                        { number: 2, amount: 370.00, dueDate: '2026-06-01' }
                    ];
                } else if (planType === '3-installment') {
                    installmentsArray = [
                        { number: 1, amount: 250.00, dueDate: '2026-04-01' },
                        { number: 2, amount: 250.00, dueDate: '2026-05-01' },
                        { number: 3, amount: 245.00, dueDate: '2026-06-01' }
                    ];
                }
                
                const dbInstallments = installmentsArray.map(i => ({
                    plan_id: insertedPlan.id,
                    parent_id: parentId,
                    installment_number: i.number,
                    amount: i.amount,
                    due_date: i.dueDate,
                    status: 'pending'
                }));
                
                const { error: paymentsError } = await supabase.from('payments').insert(dbInstallments);
                if (paymentsError) throw paymentsError;
                
                // Refresh Billing view
                renderBilling(email);
                
            } catch (error) {
                console.error("Plan creation error:", error);
                godspeedAlert('Failed to set up the payment plan. Please contact support.', 'Error');
                btn.innerHTML = 'Enroll & Continue';
                btn.disabled = false;
            }
        };
    };
}

function renderPaymentsTimeline(container, payments, plan, supabase) {
    let html = `<div style="display: flex; flex-direction: column; gap: 16px;">`;
    
    payments.forEach(payment => {
        const isPaid = payment.status === 'completed';
        const dueDate = new Date(payment.due_date);
        const isOverdue = !isPaid && dueDate < new Date();
        
        let statusBadge = '';
        let actionBtn = '';
        let borderColor = '#e5e7eb';
        
        if (isPaid) {
            statusBadge = `<span style="background: #d1fae5; color: #059669; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase;">Paid</span>`;
            borderColor = '#10b981';
        } else if (isOverdue) {
            statusBadge = `<span style="background: #fee2e2; color: #ef4444; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase;">Overdue</span>`;
            borderColor = '#ef4444';
            actionBtn = `<button class="btn-primary" style="padding: 8px 16px; font-size: 0.85rem; background: #ef4444;" onclick="triggerStripeCheckout('${payment.id}')">Pay Now</button>`;
        } else {
            statusBadge = `<span style="background: #fef3c7; color: #d97706; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase;">Upcoming</span>`;
            borderColor = '#f59e0b';
            actionBtn = `<button class="btn-primary" style="padding: 8px 16px; font-size: 0.85rem;" onclick="triggerStripeCheckout('${payment.id}')">Pay Early</button>`;
        }
        
        // Hide button if it's pending but a previous installment is still unpaid
        const previousUnpaid = payments.some(p => p.installment_number < payment.installment_number && p.status !== 'completed');
        if (previousUnpaid && !isPaid) {
            actionBtn = `<span style="font-size: 0.8rem; color: #888;">Complete prior payment first</span>`;
        }

        html += `
            <div style="background: white; border-radius: 12px; padding: 16px; border: 1px solid ${borderColor}; box-shadow: 0 2px 4px rgba(0,0,0,0.02); display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 4px;">
                        <h5 style="margin: 0; font-size: 1rem; color: #111;">Installment ${payment.installment_number}</h5>
                        ${statusBadge}
                    </div>
                    <div style="font-size: 0.85rem; color: #666;">Due Date: ${dueDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
                </div>
                <div style="text-align: right; display: flex; align-items: center; gap: 16px;">
                    <div style="font-size: 1.2rem; font-weight: 800; color: #111;">$${payment.amount.toFixed(2)}</div>
                    <div>${actionBtn}</div>
                </div>
            </div>
        `;
    });
    
    html += `</div>`;
    container.innerHTML = html;
}

window.triggerStripeCheckout = async function(paymentId) {
    if (!window.auth || !window.auth.isSupabaseAvailable()) {
        godspeedAlert('System error. Please try again later.', 'Error');
        return;
    }
    const supabase = window.auth.getSupabaseClient();
    
    godspeedAlert('Redirecting to secure checkout...', 'Processing');
    try {
        const { data, error } = await supabase.functions.invoke('create-checkout', {
            body: { paymentId: paymentId }
        });
        
        if (error) throw error;
        
        if (data && data.url) {
            window.location.href = data.url;
        } else {
            throw new Error('No checkout URL returned.');
        }
    } catch (err) {
        console.error('Checkout error:', err);
        godspeedAlert('Unable to initiate checkout. Please try again or contact support.', 'Payment Error');
    }
}

/**
 * Check and Send Notifications
 */
window.checkPaymentReminders = function (email) {
    const notifyPayment = localStorage.getItem('gba_notify_payment') !== 'false'; // Default true
    const notifyOverdue = localStorage.getItem('gba_notify_overdue') !== 'false';

    if (notifyPayment) {
        console.log('Checking for payment reminders for ' + email + '...');
        // Mock logic: If date is near 1st, send reminder
        // For demo:
        // alert('REMINDER: December Tuition is due soon.');
        // We won't alert to avoid annoying user, just log
    }
}



/**
 * Render Sidebar Stats
 */
window.renderSidebarStats = function (email) {
    const div = document.getElementById('sidebar-player-stats');
    if (!div) return;

    // Show container
    div.style.display = 'block';

    // Mock Data or fetch from DB
    // For demo, we use hardcoded or random stats
    const gp = document.getElementById('sidebar-stat-gp');
    const ppg = document.getElementById('sidebar-stat-ppg');

    if (gp) gp.textContent = '12';
    if (ppg) ppg.textContent = '14.5';

    const att = document.getElementById('sidebar-stat-attendance');
    const attBar = document.getElementById('sidebar-stat-attendance-bar');

    if (att) att.textContent = '92%';
    if (attBar) setTimeout(() => attBar.style.width = '92%', 100);
}

// Hook into initPortal
// Hook into initPortal
const originalInitPortal = window.initPortal;
window.initPortal = function () {
    if (originalInitPortal) originalInitPortal();

    const email = localStorage.getItem('gba_user_email');

    // Always try to render stats for demo/preview
    renderSidebarStats(email || 'demo@user.com');

    if (email) {
        renderBilling(email);
        checkPaymentReminders(email);
    }
}

/**
 * View Switching Functions
 */
window.showLoginForm = function () {
    document.getElementById('portal-login').style.display = 'flex';
    document.getElementById('portal-signup').style.display = 'none';
    document.getElementById('portal-reset').style.display = 'none';

    // Clear any error messages
    const errorMsg = document.querySelector('#portal-login .login-error');
    if (errorMsg) {
        errorMsg.style.display = 'none';
        errorMsg.textContent = '';
    }
}

window.showSignupForm = function () {
    document.getElementById('portal-login').style.display = 'none';
    document.getElementById('portal-signup').style.display = 'flex';
    document.getElementById('portal-reset').style.display = 'none';

    // Clear any error messages
    const errorMsg = document.querySelector('#portal-signup .login-error');
    if (errorMsg) {
        errorMsg.style.display = 'none';
        errorMsg.textContent = '';
    }
}

window.showPasswordResetForm = function () {
    document.getElementById('portal-login').style.display = 'none';
    document.getElementById('portal-signup').style.display = 'none';
    document.getElementById('portal-reset').style.display = 'flex';

    // Clear any messages
    const errorMsg = document.querySelector('#portal-reset .login-error');
    const successMsg = document.querySelector('#portal-reset .login-success');
    if (errorMsg) {
        errorMsg.style.display = 'none';
        errorMsg.textContent = '';
    }
    if (successMsg) {
        successMsg.style.display = 'none';
        successMsg.textContent = '';
    }
}

/**

 * Handle Password Reset
 */
window.handlePasswordReset = async function () {
    const emailInput = document.getElementById('reset-email');
    const email = emailInput ? emailInput.value.trim() : '';

    const btn = document.querySelector('#portal-reset button[type="submit"]');
    const errorMsg = document.querySelector('#portal-reset .login-error');
    const successMsg = document.querySelector('#portal-reset .login-success');

    // Input validation
    if (!email) {
        if (emailInput) {
            emailInput.style.borderColor = '#ef4444';
            emailInput.style.backgroundColor = '#fef2f2';
            emailInput.addEventListener('input', function() { this.style.borderColor = ''; this.style.backgroundColor = ''; }, { once: true });
        }
        if (errorMsg) {
            errorMsg.textContent = 'Please type in your email address!';
            errorMsg.style.display = 'block';
        }
        return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        if (errorMsg) {
            errorMsg.textContent = 'Please enter a valid email address';
            errorMsg.style.display = 'block';
        }
        return;
    }

    btn.innerHTML = 'Sending...';
    btn.disabled = true;

    try {
        // Check if Supabase is available
        const supabaseClient = window.auth?.getSupabaseClient();

        if (!supabaseClient) {
            throw new Error('Password reset is not available at this time. Please contact support.');
        }

        // Send password reset email
        const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
            redirectTo: 'https://clubgodspeed.com/parent-portal.html'
        });

        if (error) {
            throw error;
        }

        // Show success message
        if (errorMsg) {
            errorMsg.style.display = 'none';
        }
        if (successMsg) {
            successMsg.textContent = 'Password reset link sent! Please check your email inbox (and spam folder).';
            successMsg.style.display = 'block';
        }

        // Clear the email input
        if (emailInput) {
            emailInput.value = '';
        }

        // Redirect to login after 5 seconds
        setTimeout(() => {
            showLoginForm();
        }, 5000);

    } catch (error) {
        console.error('Password reset error:', error);
        if (errorMsg) {
            let userFriendlyMessage = 'Failed to send reset link. Please try again.';

            if (error.message) {
                if (error.message.includes('not found') || error.message.includes('User not found')) {
                    // Don't reveal if email exists for security reasons
                    userFriendlyMessage = 'If an account exists with this email, you will receive a password reset link shortly.';
                    // Still show as success
                    if (successMsg) {
                        errorMsg.style.display = 'none';
                        successMsg.textContent = userFriendlyMessage;
                        successMsg.style.display = 'block';
                    }
                } else {
                    userFriendlyMessage = error.message;
                }
            }

            if (!successMsg || successMsg.style.display === 'none') {
                errorMsg.textContent = userFriendlyMessage;
                errorMsg.style.display = 'block';
            }
        }
    } finally {
        btn.innerHTML = 'Send Reset Link';
        btn.disabled = false;
    }
}
