/**
 * Parent Portal Logic
 * Handles Waiver Signing (Canvas), Navigation (V3 Side Panel), and Authentication.
 */

/**
 * Set the icon shown next to an alert message.
 * @param {HTMLElement|null} el - .login-error or .login-success element
 * @param {string|null} kind - one of 'lock' | 'mail' | 'clock' | 'shield' | 'wifi-off' | null
 *                             null clears to the default icon (alert-circle / check-circle).
 * Icons are rendered via CSS mask; see parent-portal.css "ALERTS" section.
 */
function setAlertIcon(el, kind) {
    if (!el) return;
    if (kind) el.dataset.alertIcon = kind;
    else delete el.dataset.alertIcon;
}

/**
 * Flip the visual tone of a .login-error container.
 * @param {HTMLElement|null} el
 * @param {'success'|'info'|null} tone - null = default (error/red)
 * Used when the same container needs to render a non-error confirmation
 * (e.g. "verification email resent") without swapping the DOM node.
 */
function setAlertTone(el, tone) {
    if (!el) return;
    if (tone) el.dataset.alertTone = tone;
    else delete el.dataset.alertTone;
}

/**
 * Reset an alert container to a hidden, clean state.
 * Clears text, icon variant, tone override, and any stale inline color/background
 * left over from pre-tone-helper code paths.
 */
function resetAlert(el) {
    if (!el) return;
    el.style.display = 'none';
    el.textContent = '';
    delete el.dataset.alertIcon;
    delete el.dataset.alertTone;
    el.style.color = '';
    el.style.background = '';
}

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

    // Handle Venmo confirmation return — ?payment=venmo_pending
    (function handlePaymentReturn() {
        const params = new URLSearchParams(window.location.search);
        const paymentStatus = params.get('payment');
        if (!paymentStatus) return;

        const cleanUrl = window.location.pathname;
        history.replaceState(null, '', cleanUrl);

        if (paymentStatus === 'venmo_pending') {
            const onReady = () => {
                const email = localStorage.getItem('gba_user_email');
                const billingNav = document.querySelector('[data-view="aau-billing"], [onclick*="aau-billing"]');
                if (billingNav) billingNav.click();
                if (typeof showToast === 'function') {
                    showToast('Venmo payment recorded. Coach Scott will confirm within 24 hours.', 'success');
                }
                if (email && typeof window.renderBilling === 'function') {
                    setTimeout(() => window.renderBilling(email), 800);
                }
            };
            window.addEventListener('gba:authStateChanged', onReady, { once: true });
            setTimeout(onReady, 1500);
        }
    })();

    // ── Admin Impersonation Banner ─────────────────────────────────────
    (function injectImpersonationBanner() {
        const params = new URLSearchParams(window.location.search);
        if (!params.get('impersonating')) return;

        // Strip the flag from the URL so refreshes don't re-trigger
        history.replaceState(null, '', window.location.pathname);

        const banner = document.createElement('div');
        banner.id = 'admin-impersonation-banner';
        banner.style.cssText = [
            'position:fixed;top:0;left:0;right:0;z-index:999999',
            'background:linear-gradient(90deg,#f59e0b 0%,#d97706 100%)',
            'color:#000;font-family:inherit',
            'display:flex;align-items:center;justify-content:space-between',
            'padding:10px 20px;gap:12px',
            'box-shadow:0 2px 20px rgba(245,158,11,0.45)',
        ].join(';');

        banner.innerHTML = `
          <div style="display:flex;align-items:center;gap:10px;font-size:13px;font-weight:800;line-height:1.3">
            <span style="font-size:20px;flex-shrink:0">👁</span>
            <span>ADMIN VIEW &mdash; You are previewing this portal as the parent. Any actions taken are real and will affect their account.</span>
          </div>
          <button
            id="imp-banner-dismiss"
            style="flex-shrink:0;background:rgba(0,0,0,0.15);border:none;border-radius:6px;padding:5px 12px;font-weight:800;font-size:12px;cursor:pointer;color:#000;white-space:nowrap"
          >Dismiss ✕</button>`;

        document.body.style.paddingTop = '48px';
        document.body.insertBefore(banner, document.body.firstChild);

        document.getElementById('imp-banner-dismiss').addEventListener('click', () => {
            banner.remove();
            document.body.style.paddingTop = '';
        });
    })();

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

    // Auto-format phone number as user types: 555-555-5555
    const signupPhone = document.getElementById('signup-phone');
    if (signupPhone) {
        signupPhone.addEventListener('input', function () {
            const digits = this.value.replace(/\D/g, '').slice(0, 10);
            let formatted = digits;
            if (digits.length > 6) {
                formatted = digits.slice(0, 3) + '-' + digits.slice(3, 6) + '-' + digits.slice(6);
            } else if (digits.length > 3) {
                formatted = digits.slice(0, 3) + '-' + digits.slice(3);
            }
            this.value = formatted;
        });
    }

    // Check for existing session and route based on approval status
    if (window.auth && window.auth.isLoggedIn()) {
        routeAuthenticatedUser();
    }

    // Listen for async auth state changes (e.g. Supabase detecting #access_token hash
    // fragments from email confirmation redirect). This fires AFTER the sync check above,
    // so it handles the case where the user arrives with tokens in the URL but no
    // localStorage session yet.
    window.addEventListener('gba:authStateChanged', function onAuthChanged(e) {
        const dashEl = document.getElementById('portal-dashboard');
        const dashVisible = dashEl && (dashEl.style.display === 'flex' || dashEl.style.display === 'block');
        if (e.detail && e.detail.isLoggedIn && !dashVisible) {
            routeAuthenticatedUser();
            // Clean the hash fragments from the URL so a page refresh doesn't re-trigger
            if (window.location.hash && window.location.hash.includes('access_token')) {
                history.replaceState(null, '', window.location.pathname + window.location.search);
            }
        }
    });

    // Attach form listener
    const pForm = document.getElementById('parent-login-form');
    if (pForm) {
        pForm.addEventListener('submit', (e) => {
            e.preventDefault();
            handleLogin();
        });
    }

    // Reveal portal cleanly after all initial auth checks
    setTimeout(() => {
        const wrap = document.getElementById('main-portal-wrap');
        if (wrap) wrap.style.opacity = '1';
    }, 50);
});

// --- Authentication Logic ---

/**
 * Route a logged-in user to the correct view (dashboard or waiting room).
 * Extracted so both the sync DOMContentLoaded check and the async
 * gba:authStateChanged listener can share the same logic.
 */
async function routeAuthenticatedUser() {
    let savedEmail = localStorage.getItem('gba_user_email');

    // Sync RBAC immediately so the 100ms security check doesn't bounce them back to login
    if (window.Security && window.Security.RBAC) {
        window.Security.RBAC.setRole(window.Security.RBAC.roles.PARENT);
    }

    // If no saved email, try to recover from Supabase session
    if (!savedEmail && window.auth && typeof window.auth.getCurrentUser === 'function') {
        try {
            const user = await window.auth.getCurrentUser();
            if (user && user.email) {
                savedEmail = user.email;
                localStorage.setItem('gba_user_email', user.email);
                if (user.id) localStorage.setItem('gba_user_id', user.id);
                console.log('[portal] Recovered email from Supabase session:', user.email);
            }
        } catch (e) {
            console.warn('[portal] Could not recover user from session:', e);
        }
    }

    if (!savedEmail) return;

    const loginView = document.getElementById('portal-login');
    const waitingRoom = document.getElementById('portal-waiting-room');
    const deniedView = document.getElementById('portal-denied');

    // Always verify approval against the server -- never trust localStorage alone
    let approved = false;
    let denied = false;

    if (window.auth && typeof window.auth.verifyApproval === 'function') {
        try {
            const result = await window.auth.verifyApproval();
            // verifyApproval now always returns an object (never null)
            if (result) {
                approved = result.approved;
                denied = result.denied;
                if (result.error) {
                    console.warn('[portal] verifyApproval returned with error:', result.error);
                }
            }
        } catch (e) {
            console.warn('[portal] Server approval check failed:', e);
            // On network failure, use cached value as last resort
            approved = localStorage.getItem('gba_user_approved') === 'true';
        }
    } else {
        // Auth module not loaded -- use cached value
        approved = localStorage.getItem('gba_user_approved') === 'true';
    }

    if (denied) {
        // Account explicitly denied by admin
        if (loginView) loginView.style.display = 'none';
        if (waitingRoom) waitingRoom.style.display = 'none';
        if (deniedView) {
            deniedView.style.display = 'flex';
        } else if (waitingRoom) {
            // Fallback: repurpose waiting room with denied message
            waitingRoom.style.display = 'flex';
            const waitMsg = waitingRoom.querySelector('h2, .waiting-title');
            if (waitMsg) waitMsg.textContent = 'Account Access Denied';
            const waitSub = waitingRoom.querySelector('p, .waiting-subtitle');
            if (waitSub) waitSub.textContent = 'Your account request has been denied by administration. Please contact Coach Scott if you believe this is an error.';
        }
        return;
    }

    if (approved) {
        if (loginView) loginView.style.display = 'none';
        showDashboard();
        updateDashboardProfile(savedEmail);
    } else {
        // Not yet approved -- show waiting room
        if (loginView) loginView.style.display = 'none';
        if (waitingRoom) waitingRoom.style.display = 'flex';
        initWaitingRoom();
    }
}

/** Show the portal dashboard and hide the site nav so it doesn't overlap. */
function showDashboard() {
    const dash = document.getElementById('portal-dashboard');
    if (dash) dash.style.display = 'flex';
    // Apply per-profile visibility flags (dues-exempt / hide-calendar). Fire-and-forget;
    // sets window.__duesExempt / window.__hideCalendar and hides gated sections.
    if (typeof window.applyAccountVisibility === 'function') { window.applyAccountVisibility(); }
    // nav-unified.css forces .navbar { display: flex !important } — must beat it with setProperty
    const nav = document.querySelector('nav.navbar');
    if (nav) nav.style.setProperty('display', 'none', 'important');
    document.body.style.overflow = 'hidden';
}

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
            setAlertIcon(errorMsg, null);
            errorMsg.textContent = "You forgot to type your email or password.";
            errorMsg.style.display = 'block';
        }
        return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        if (errorMsg) {
            setAlertIcon(errorMsg, 'mail');
            errorMsg.textContent = "That email does not look right. Please check it.";
            errorMsg.style.display = 'block';
        }
        return;
    }

    // No client-side length gate at login: existing accounts may predate the
    // 8-character minimum, and a wrong-length password is just a wrong password.

    // Check rate limiting if Security system is available
    if (window.Security && window.Security.RateLimiter) {
        const rateCheck = window.Security.RateLimiter.check('login', email);
        if (!rateCheck.allowed) {
            if (errorMsg) {
                setAlertTone(errorMsg, null);
                setAlertIcon(errorMsg, 'clock');
                errorMsg.textContent = rateCheck.message || "You tried too many times. Please wait a few minutes and try again.";
                errorMsg.style.display = 'block';
            }
            return;
        }
    }

    btn.innerHTML = 'Signing In...';
    btn.disabled = true;

    try {
        let loginSuccess = false;
        let errorMessage = 'Your email or password is wrong. Please try again.';

        // Authenticate via Supabase (real backend)
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

                // Check if login was successful (explicit success check)
                if (result && result.success === true) {
                    loginSuccess = true;
                } else {
                    errorMessage = result?.error || result?.message || errorMessage;
                }
            } catch (authError) {
                console.error('Auth login error:', authError);
              errorMessage = authError.message || errorMessage;

                // Provide specific error messages
                if (authError.message && authError.message.includes('Invalid login credentials')) {
                    errorMessage = 'Your email or password is wrong. Please try again.';
                    setAlertIcon(errorMsg, 'lock');
                } else if (authError.message && authError.message.includes('Email not confirmed')) {
                    // Show inline resend link (sanitize email to prevent XSS)
                    if (errorMsg) {
                        const safeEmail = escapeHTML(email);
                        setAlertIcon(errorMsg, 'mail');
                        errorMsg.innerHTML = 'Check your inbox for a verification email from noreply@clubgodspeed.com.<br><a href="#" id="resend-verify-link" style="color:inherit;font-weight:700;text-decoration:underline;">Didn\'t get it? Resend &rarr;</a>';
                        errorMsg.style.display = 'block';
                        const resendLink = document.getElementById('resend-verify-link');
                        if (resendLink) resendLink.addEventListener('click', (e) => { e.preventDefault(); resendVerificationEmail(email); });
                    }
                    btn.innerHTML = 'Sign In'; btn.disabled = false;
                    return;
                } else if (authError.message && authError.message.includes('Too many requests')) {
                    errorMessage = 'You tried too many times. Please wait a few minutes and try again.';
                    setAlertIcon(errorMsg, 'clock');
                } else if (authError.message === 'Failed to fetch') {
                    errorMessage = 'We cannot reach the server. Please check your internet and try again.';
                    setAlertIcon(errorMsg, 'wifi-off');
                } else {
                    setAlertIcon(errorMsg, null);
                }
            }
        }

        // NOTE: SecureAuth is already called inside auth.login() as its first attempt
        // (auth-supabase.js line 122). No redundant second call needed here.

        // Handle successful login -- server-side approval verification
        if (loginSuccess) {
            try {
                btn.innerHTML = 'Verifying...';

                // Server-side approval check -- verifyApproval now always returns an object
                if (window.auth && typeof window.auth.verifyApproval === 'function') {
                    const approval = await window.auth.verifyApproval();

                    if (approval && approval.denied) {
                        if (typeof window.auth.logout === 'function') {
                            await window.auth.logout();
                        }
                        throw new Error('Your account access has been denied by administration.');
                    }

                    if (approval && !approval.approved) {
                        // Not yet approved -- show waiting room (covers both pending and missing profile)
                        document.getElementById('portal-login').style.display = 'none';
                        document.getElementById('portal-waiting-room').style.display = 'flex';
                        initWaitingRoom();
                        btn.innerHTML = 'Sign In';
                        btn.disabled = false;
                        return;
                    }
                }
            } catch (verifyError) {
                if (verifyError.message && verifyError.message.includes('denied by administration')) {
                    throw verifyError;
                }
                console.warn('[portal] Approval verification error:', verifyError);
                // On network error, show waiting room instead of using stale cache
                // This prevents a race where stale cache says approved=false but server says true
                document.getElementById('portal-login').style.display = 'none';
                document.getElementById('portal-waiting-room').style.display = 'flex';
                initWaitingRoom();
                btn.innerHTML = 'Sign In';
                btn.disabled = false;
                return;
            }

            // Approved — show dashboard
            document.getElementById('portal-login').style.display = 'none';
            showDashboard();
            updateDashboardProfile(email);

            // Cohort designation
            if (email.toLowerCase() === 'training@clubgodspeed.com') {
                localStorage.setItem('gba_user_cohort', 'training');
            } else {
                localStorage.setItem('gba_user_cohort', 'aau');
            }
            updateUIForCohort();
            loadSignedDocuments(email);

            if (errorMsg) {
                errorMsg.style.display = 'none';
                errorMsg.textContent = '';
            }
        } 
        
        if (!loginSuccess) {
            // Show error message
            if (errorMsg) {
                // Only set a default icon if one hasn't been chosen upstream
                if (!errorMsg.dataset.alertIcon) setAlertIcon(errorMsg, null);
                setAlertTone(errorMsg, null);
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
                    userFriendlyMessage = "Your email or password is wrong. Please try again.";
                    setAlertIcon(errorMsg, 'lock');
                } else if (error.message.includes('Email not confirmed') || error.message.includes('verify')) {
                    const loginEmail = document.getElementById('email')?.value?.trim() || '';
                    setAlertIcon(errorMsg, 'mail');
                    errorMsg.innerHTML = 'Check your inbox for a verification email from noreply@clubgodspeed.com.<br><a href="#" id="resend-verify-link-2" style="color:inherit;font-weight:700;text-decoration:underline;">Didn\'t get it? Resend verification email</a>';
                    errorMsg.style.display = 'block';
                    const resendLink2 = document.getElementById('resend-verify-link-2');
                    if (resendLink2) resendLink2.addEventListener('click', (e) => { e.preventDefault(); resendVerificationEmail(loginEmail); });
                    const form = document.querySelector('.login-form');
                    if (form) { form.classList.add('shake'); setTimeout(() => form.classList.remove('shake'), 500); }
                    btn.innerHTML = 'Sign In'; btn.disabled = false;
                    return;
                } else if (error.message.includes('denied by administration')) {
                    userFriendlyMessage = "Your account is blocked. Please contact your coach.";
                    setAlertIcon(errorMsg, 'shield');
                } else if (error.message.includes('Cannot connect') || error.message.includes('fetch')) {
                    userFriendlyMessage = "We cannot reach the server. Please check your internet and try again.";
                    setAlertIcon(errorMsg, 'wifi-off');
                } else if (error.message.includes('rate limit') || error.message.includes('Too many')) {
                    userFriendlyMessage = "You tried too many times. Please wait a few minutes and try again.";
                    setAlertIcon(errorMsg, 'clock');
                } else if (error.message.includes('unavailable')) {
                    userFriendlyMessage = "Our system is down right now. Please try again in a few minutes.";
                    setAlertIcon(errorMsg, 'wifi-off');
                } else {
                    userFriendlyMessage = "Something went wrong. Please try again.";
                    setAlertIcon(errorMsg, null);
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
    const playerAgeRaw = playerAgeInput ? playerAgeInput.value.trim() : '';
    const playerAge = parseInt(playerAgeRaw, 10);
    const phone = phoneInput ? phoneInput.value.trim() : '';

    const btn = document.querySelector('.signup-form button[type="submit"]') || document.querySelector('#portal-signup button[type="submit"]');
    const errorMsg = document.querySelector('#portal-signup .login-error');
    if (errorMsg) errorMsg.style.display = 'none';

    // 1. Input validation & visual HIGHLIGHTING
    // Use raw string for age empty check so 0 isn't treated as empty
    let hasEmpty = false;
    [
        {input: emailInput, val: email},
        {input: passwordInput, val: password},
        {input: parentNameInput, val: parentName},
        {input: playerNameInput, val: playerName},
        {input: playerAgeInput, val: playerAgeRaw},
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
            setAlertIcon(errorMsg, null);
            errorMsg.textContent = "You missed a spot. Please fill out every box in the form.";
            errorMsg.style.display = 'block';
        }
        return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        if (errorMsg) {
            setAlertIcon(errorMsg, 'mail');
            errorMsg.textContent = "That email does not look right. Please check it.";
            errorMsg.style.display = 'block';
        }
        return;
    }

    if (password.length < 8) {
        if (errorMsg) {
            setAlertIcon(errorMsg, 'lock');
            errorMsg.textContent = "Your password must be 8 characters or more.";
            errorMsg.style.display = 'block';
        }
        if (passwordInput) {
            passwordInput.style.borderColor = '#ef4444';
            passwordInput.style.backgroundColor = '#fef2f2';
            passwordInput.addEventListener('input', function() { this.style.borderColor = ''; this.style.backgroundColor = ''; }, { once: true });
        }
        return;
    }

    // Validate phone number (at least 10 digits)
    const phoneDigits = phone.replace(/\D/g, '');
    if (phoneDigits.length < 10) {
        if (errorMsg) {
            setAlertTone(errorMsg, null);
            setAlertIcon(errorMsg, null);
            errorMsg.textContent = "Please type a real phone number with at least 10 numbers.";
            errorMsg.style.display = 'block';
        }
        if (phoneInput) {
            phoneInput.style.borderColor = '#ef4444';
            phoneInput.style.backgroundColor = '#fef2f2';
            phoneInput.addEventListener('input', function() { this.style.borderColor = ''; this.style.backgroundColor = ''; }, { once: true });
        }
        return;
    }

    // Validate player age range
    if (isNaN(playerAge) || playerAge < 5 || playerAge > 19) {
        if (errorMsg) {
            setAlertTone(errorMsg, null);
            setAlertIcon(errorMsg, null);
            errorMsg.textContent = "Player age must be between 5 and 19.";
            errorMsg.style.display = 'block';
        }
        if (playerAgeInput) {
            playerAgeInput.style.borderColor = '#ef4444';
            playerAgeInput.style.backgroundColor = '#fef2f2';
            playerAgeInput.addEventListener('input', function() { this.style.borderColor = ''; this.style.backgroundColor = ''; }, { once: true });
        }
        return;
    }

    // Check rate limiting if available
    if (window.Security && window.Security.RateLimiter) {
        const rateCheck = window.Security.RateLimiter.check('signup', email);
        if (!rateCheck.allowed) {
            if (errorMsg) {
                setAlertTone(errorMsg, null);
                setAlertIcon(errorMsg, 'clock');
                errorMsg.textContent = rateCheck.message || "You tried too many times. Please wait a few minutes and try again.";
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

        // Derive approximate grade from age using current school year month
        // (Aug-Dec: age-5 is typical; Jan-Jul: age-6 since school year started prior fall)
        const ageNum = parseInt(playerAge, 10);
        const currentMonth = new Date().getMonth(); // 0=Jan
        const gradeNum = currentMonth >= 7 ? ageNum - 5 : ageNum - 6; // Aug+ vs Jan-Jul
        const gradeSuffix = gradeNum === 1 ? 'st' : gradeNum === 2 ? 'nd' : gradeNum === 3 ? 'rd' : 'th';
        const grade = (Number.isFinite(gradeNum) && gradeNum >= 0 && gradeNum <= 12)
            ? `${gradeNum}${gradeSuffix}`
            : null;

        // Use Supabase Auth if available
        if (window.auth && typeof window.auth.signup === 'function') {
            const metadata = {
                parent_name: parentName,
                full_name: parentName,
                player_name: playerName,
                player_age: playerAge,
                grade: grade,
                phone: phone,
                role: 'parent',
                cohort: 'aau'
            };
            const result = await window.auth.signup(email, password, metadata);
            if (result && result.success) {
                signupSuccess = true;
            }
        } else {
            throw new Error('Our signup system is temporarily unavailable. Please try again in a few minutes.');
        }

        if (signupSuccess) {
            // Notify admin of new registration (fire-and-forget)
            try {
                const sb = window.auth && window.auth.getSupabaseClient ? window.auth.getSupabaseClient() : null;
                if (sb) {
                    sb.functions.invoke('send-email', {
                        body: {
                            type: 'new_registration',
                            emailTo: 'jewellsco@gmail.com',
                            email: email,
                            parentName: parentName,
                            playerName: playerName,
                            grade: grade || '',
                            phone: phone
                        }
                    }).catch(err => console.warn('Admin notification failed (non-blocking):', err));
                }
            } catch (notifyErr) {
                console.warn('Admin notification skipped:', notifyErr);
            }

            // Success UI — explain the two-stage process clearly
            if (typeof godspeedAlert === 'function') {
                godspeedAlert(
                    `Step 1: Check your inbox for a verification email from noreply@clubgodspeed.com and click the link to verify your address.\n\nStep 2: After verifying, Coach Scott will review and approve your account. You will receive an email when your portal is unlocked.`,
                    "Account Created"
                );
            } else {
                alert("Account Created!\n\nStep 1: Check your email for a verification link from noreply@clubgodspeed.com.\n\nStep 2: After verifying, Coach Scott will review and approve your account.");
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
        console.error('[signup] raw error message:', error.message);
        console.error('[signup] error stack:', error.stack);

        if (errorMsg) {
            let userFriendlyMessage = "Something went wrong on our end. Please try again!";
            const msg = (error.message || '').toLowerCase();
            if (msg.includes('already') && (msg.includes('exist') || msg.includes('register'))) {
                // Duplicate email -- show login/resend links (use event listeners, not inline onclick)
                setAlertIcon(errorMsg, 'mail');
                errorMsg.innerHTML = 'An account with this email already exists. <a href="#" id="signup-go-login" style="color:inherit;font-weight:700;text-decoration:underline;">Log in here</a> or <a href="#" id="signup-resend-verify" style="color:inherit;font-weight:700;text-decoration:underline;">resend verification email</a>.';
                errorMsg.style.display = 'block';
                const goLogin = document.getElementById('signup-go-login');
                if (goLogin) goLogin.addEventListener('click', (e) => { e.preventDefault(); showLoginForm(); });
                const resendV = document.getElementById('signup-resend-verify');
                if (resendV) resendV.addEventListener('click', (e) => { e.preventDefault(); resendVerificationEmail(email); });
                const form = document.querySelector('.signup-form');
                if (form) { form.classList.add('shake'); setTimeout(() => form.classList.remove('shake'), 500); }
                return; // skip textContent assignment below
            } else if (msg.includes('not connected') || msg.includes('failed to fetch') || msg.includes('cannot connect') || msg.includes('network error')) {
                userFriendlyMessage = "We cannot reach the server. Please check your internet and try again.";
                setAlertIcon(errorMsg, 'wifi-off');
            } else if (msg.includes('unavailable')) {
                userFriendlyMessage = "Our system is down right now. Please try again in a few minutes.";
                setAlertIcon(errorMsg, 'wifi-off');
            } else if (msg.includes('password') || msg.includes('weak')) {
                // Differentiate pwned password (HaveIBeenPwned) from generic weak password
                if (msg.includes('known') || msg.includes('easy to guess') || (error.code === 'weak_password' && error.reasons && error.reasons.includes('pwned'))) {
                    userFriendlyMessage = "This password is not safe. It has been leaked online. Please pick a new one.";
                    setAlertIcon(errorMsg, 'shield');
                } else {
                    userFriendlyMessage = "Your password is too easy to guess. Please mix letters and numbers.";
                    setAlertIcon(errorMsg, 'lock');
                }
            } else if (msg.includes('rate') || msg.includes('limit') || msg.includes('too many')) {
                userFriendlyMessage = "You tried too many times. Please wait a minute and try again.";
                setAlertIcon(errorMsg, 'clock');
            } else if (msg.includes('invalid') && msg.includes('email')) {
                userFriendlyMessage = "That email address is not valid. Please check it and try again.";
                setAlertIcon(errorMsg, 'mail');
            } else if (msg.includes('database') || msg.includes('trigger') || msg.includes('violates') || msg.includes('transaction') || msg.includes('timeout') || msg.includes('database_error')) {
                userFriendlyMessage = "Our system hit a small bump. Please wait a moment and try again. If this keeps happening, text Coach Scott.";
                setAlertIcon(errorMsg, null);
            } else {
                // Log the actual error for debugging, show safe message to user
                console.error('[signup] unhandled error category:', error.message);
                userFriendlyMessage = "Something went wrong. Please try again. If it keeps happening, text Coach Scott.";
                setAlertIcon(errorMsg, null);
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

// Resend verification email (rate limited: 1 per 60 seconds)
let _lastResendTime = 0;
window.resendVerificationEmail = async function(email) {
    // Prefer the currently visible login view's alert container
    const visibleAlert =
        document.querySelector('#portal-login:not([style*="display: none"]) .login-error') ||
        document.querySelector('#portal-signup:not([style*="display: none"]) .login-error') ||
        document.querySelector('.login-error');

    const now = Date.now();
    if (now - _lastResendTime < 60000) {
        const waitSec = Math.ceil((60000 - (now - _lastResendTime)) / 1000);
        if (visibleAlert) {
            setAlertTone(visibleAlert, 'info');
            setAlertIcon(visibleAlert, 'clock');
            visibleAlert.textContent = 'Please wait ' + waitSec + ' seconds before resending.';
            visibleAlert.style.display = 'block';
        }
        return;
    }

    try {
        const sb = window.auth && window.auth.getSupabaseClient ? window.auth.getSupabaseClient() : null;
        if (!sb) {
            if (visibleAlert) {
                setAlertTone(visibleAlert, null);
                setAlertIcon(visibleAlert, 'wifi-off');
                visibleAlert.textContent = 'We cannot reach the server. Please check your internet and try again.';
                visibleAlert.style.display = 'block';
            }
            return;
        }
        email = email || document.getElementById('email')?.value?.trim();
        if (!email) {
            if (visibleAlert) {
                setAlertTone(visibleAlert, null);
                setAlertIcon(visibleAlert, 'mail');
                visibleAlert.textContent = 'Please type your email address first.';
                visibleAlert.style.display = 'block';
            }
            return;
        }
        const { error } = await sb.auth.resend({ type: 'signup', email });
        if (error) throw error;
        _lastResendTime = Date.now();
        if (visibleAlert) {
            setAlertTone(visibleAlert, 'success');
            setAlertIcon(visibleAlert, 'mail');
            visibleAlert.textContent = 'Verification email sent. Please check your inbox and spam folder.';
            visibleAlert.style.display = 'block';
        }
    } catch(e) {
        if (visibleAlert) {
            setAlertTone(visibleAlert, null);
            setAlertIcon(visibleAlert, 'mail');
            const msg = (e && e.message) ? e.message : '';
            visibleAlert.textContent = msg
                ? 'We could not resend the email: ' + msg
                : 'We could not resend the email. Please try again.';
            visibleAlert.style.display = 'block';
        }
    }
};


/**
 * Where OAuth / magic-link should drop the user back after they authenticate.
 * Built from the CURRENT origin (protocol + host) so it works on www,
 * non-www, and Vercel preview deploys — instead of hardcoding production www
 * and bouncing everyone there. The path is always the parent portal, because
 * that's the only page these buttons live on and where routing expects them.
 * NOTE: every origin this can produce (https://www.clubgodspeed.com,
 * https://clubgodspeed.com, and each preview URL) must be listed in the
 * Supabase Auth redirect allowlist, or the provider rejects the return trip.
 */
function portalRedirectUrl() {
    return window.location.origin + '/parent-portal.html';
}

/**
 * Google OAuth sign-in. Bypasses email deliverability entirely — the
 * provider is already enabled in Supabase. Works for both sign-in and
 * sign-up (handle_new_user trigger creates the profile on first OAuth).
 */
window.handleGoogleSignIn = async function () {
    const visibleAlert =
        document.querySelector('#portal-login:not([style*="display: none"]) .login-error') ||
        document.querySelector('#portal-signup:not([style*="display: none"]) .login-error') ||
        document.querySelector('.login-error');
    const btns = [document.getElementById('google-signin-btn'), document.getElementById('google-signup-btn')].filter(Boolean);

    btns.forEach(b => { b.disabled = true; });

    try {
        if (!window.auth || typeof window.auth.signInWithOAuth !== 'function') {
            throw new Error('auth_unavailable');
        }
        const { error } = await window.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: portalRedirectUrl()
            }
        });
        if (error) throw new Error(error.message || 'oauth_failed');
        // Success: browser is navigating to Google. Leave the button disabled.
    } catch (e) {
        console.error('[auth] Google sign-in failed:', e);
        btns.forEach(b => { b.disabled = false; });
        if (visibleAlert) {
            setAlertTone(visibleAlert, null);
            setAlertIcon(visibleAlert, 'wifi-off');
            visibleAlert.textContent = 'We could not open Google sign-in. Please check your internet and try again.';
            visibleAlert.style.display = 'block';
        }
    }
};

/**
 * Passwordless magic link sign-in (rate limited: 1 per 60 seconds).
 * shouldCreateUser is false on purpose: accounts must be created through
 * the signup form so the player/parent metadata reaches handle_new_user.
 */
let _lastMagicLinkTime = 0;
window.handleMagicLink = async function () {
    const emailInput = document.getElementById('email');
    const email = emailInput ? emailInput.value.trim() : '';
    const btn = document.getElementById('magic-link-btn');
    const visibleAlert = document.querySelector('#portal-login .login-error');

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
        if (visibleAlert) {
            setAlertTone(visibleAlert, null);
            setAlertIcon(visibleAlert, 'mail');
            visibleAlert.textContent = 'Type your email address above first, then tap the link button again.';
            visibleAlert.style.display = 'block';
        }
        if (emailInput) {
            emailInput.style.borderColor = '#ef4444';
            emailInput.style.backgroundColor = '#fef2f2';
            emailInput.addEventListener('input', function () { this.style.borderColor = ''; this.style.backgroundColor = ''; }, { once: true });
            emailInput.focus();
        }
        return;
    }

    const now = Date.now();
    if (now - _lastMagicLinkTime < 60000) {
        const waitSec = Math.ceil((60000 - (now - _lastMagicLinkTime)) / 1000);
        if (visibleAlert) {
            setAlertTone(visibleAlert, 'info');
            setAlertIcon(visibleAlert, 'clock');
            visibleAlert.textContent = 'Please wait ' + waitSec + ' seconds before asking for another link.';
            visibleAlert.style.display = 'block';
        }
        return;
    }

    if (btn) { btn.disabled = true; btn.textContent = 'Sending link...'; }

    try {
        const sb = window.auth && window.auth.getSupabaseClient ? window.auth.getSupabaseClient() : null;
        if (!sb) throw new Error('Failed to fetch');

        const { error } = await sb.auth.signInWithOtp({
            email: email,
            options: {
                shouldCreateUser: false,
                emailRedirectTo: portalRedirectUrl()
            }
        });
        if (error) throw error;

        _lastMagicLinkTime = Date.now();
        if (visibleAlert) {
            setAlertTone(visibleAlert, 'success');
            setAlertIcon(visibleAlert, 'mail');
            visibleAlert.textContent = 'Check your email. We sent you a link that signs you in with one tap. Look in spam if you do not see it.';
            visibleAlert.style.display = 'block';
        }
    } catch (e) {
        console.error('[auth] magic link failed:', e);
        if (visibleAlert) {
            setAlertTone(visibleAlert, null);
            const msg = (e && e.message) ? e.message.toLowerCase() : '';
            if (msg.includes('signup') || msg.includes('not allowed') || msg.includes('user not found')) {
                setAlertIcon(visibleAlert, 'mail');
                visibleAlert.textContent = 'We could not find an account with that email. Check the spelling, or tap Join below to create one.';
            } else if (msg.includes('rate') || msg.includes('too many')) {
                setAlertIcon(visibleAlert, 'clock');
                visibleAlert.textContent = 'You asked for too many links. Please wait a few minutes and try again.';
            } else {
                setAlertIcon(visibleAlert, 'wifi-off');
                visibleAlert.textContent = 'We could not send the link. Please check your internet and try again.';
            }
            visibleAlert.style.display = 'block';
        }
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Email me a sign-in link'; }
    }
};

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
                showDashboard();
                updateDashboardProfile(email);
            loadSignedDocuments(email); // Load signed documents after 2FA login
            const twoFactorDiv = document.getElementById('two-factor-input');
            if (twoFactorDiv) twoFactorDiv.remove();
        }
    } catch (error) {
        godspeedAlert(error.message || "That code doesn't look quite right! Please try again.", 'Verification Error');
    }
};

// --- Dynamic Ledger Interceptor ---
function getLedgerProfile(rawRecord) {
    if (!rawRecord || !rawRecord.packages) return rawRecord;

    const activePackages = rawRecord.packages.filter(p => p.status === 'Active');
    const activeIds = activePackages.map(p => p.id);
    const activeSessions = rawRecord.sessions ? rawRecord.sessions.filter(s => activeIds.includes(s.package_id)) : [];
    
    // Battle Royale Rule: Lifetime mapping across EVERYTHING
    const lifetimePurchased = rawRecord.packages.reduce((sum, p) => sum + p.total_hours, 0);
    const lifetimeUsed = rawRecord.sessions ? rawRecord.sessions.reduce((sum, s) => sum + s.duration, 0) : 0;
    
    // PDF Rule: Active mapping across only ACTIVE packages
    const activePurchased = activePackages.reduce((sum, p) => sum + p.total_hours, 0);
    const activeUsed = activeSessions.reduce((sum, s) => sum + s.duration, 0);
    const activeRemaining = activePurchased - activeUsed;
    
    return {
        hours: {
            totalPurchased: activePurchased, // UI now requests active hours only
            used: activeUsed,                // Active hours utilized
            remaining: activeRemaining,      // Active balance pool
            lifetimePurchased: lifetimePurchased, // Kept for backend/battle royale fallback
            lifetimeUsed: lifetimeUsed
        },
        purchases: activePackages.map(p => ({
            id: p.id,
            date: p.purchase_date,
            item: p.item,
            amount: p.amount,
            status: p.status
        })),
        logs: activeSessions // Native loops will now ONLY iterate active sessions
    };
}

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

    // Restore site navbar and scroll
    const nav = document.querySelector('nav.navbar');
    if (nav) nav.style.removeProperty('display');
    document.body.style.overflow = '';


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

// --- Waiting Room: Auto-Poll + Status Check ---

let _waitingPollInterval = null;
let _waitingPollFailures = 0;

/**
 * Populate waiting room with parent/athlete names from profile data
 * and start auto-polling for approval status every 30 seconds.
 */
function initWaitingRoom() {
    const namesEl = document.getElementById('waiting-room-names');
    const statusEl = document.getElementById('waiting-room-status');
    const parentEmail = localStorage.getItem('gba_user_email');
    const sb = window.auth?.getSupabaseClient?.();

    // Show parent/athlete name if we have profile data
    if (sb && namesEl) {
        const userId = localStorage.getItem('gba_user_id');
        if (userId) {
            sb.from('profiles').select('full_name, player_name').eq('id', userId).single()
                .then(({ data }) => {
                    if (data && (data.full_name || data.player_name)) {
                        const parts = [];
                        if (data.full_name) parts.push(data.full_name);
                        if (data.player_name) parts.push('Parent of ' + data.player_name);
                        namesEl.textContent = parts.join(' -- ');
                        namesEl.style.display = 'block';
                    } else {
                        // No profile data -- show email as fallback
                        if (parentEmail) {
                            namesEl.textContent = parentEmail;
                            namesEl.style.display = 'block';
                        }
                        console.warn('[portal] initWaitingRoom: profile has no name for user:', userId);
                    }
                })
                .catch((err) => {
                    console.warn('[portal] initWaitingRoom: profile fetch failed:', err.message || err);
                    // Show email as fallback on error
                    if (parentEmail) {
                        namesEl.textContent = parentEmail;
                        namesEl.style.display = 'block';
                    }
                });
        }
    }

    // Start auto-poll every 15 seconds (was 30s -- faster for better UX on approval)
    if (_waitingPollInterval) clearInterval(_waitingPollInterval);
    _waitingPollInterval = setInterval(() => {
        checkApprovalStatus(true);
    }, 15000);

    // Run initial check immediately
    checkApprovalStatus(true);

    // Update status text
    if (statusEl) statusEl.textContent = 'We will check your status automatically.';
}

/**
 * Check approval status on-demand (button click) or via auto-poll.
 * If approved, route to dashboard. If denied, show denied view.
 */
window.checkApprovalStatus = async function (silent) {
    const statusEl = document.getElementById('waiting-room-status');

    if (!silent && statusEl) {
        statusEl.textContent = 'Checking...';
    }

    try {
        if (window.auth && typeof window.auth.verifyApproval === 'function') {
            const result = await window.auth.verifyApproval();

            // verifyApproval now always returns an object, but handle null defensively
            if (!result) {
                _waitingPollFailures++;
                if (!silent && statusEl) statusEl.textContent = 'Could not reach server. Try again shortly.';
                if (_waitingPollFailures >= 5 && statusEl) {
                    statusEl.textContent = 'Having trouble reaching the server. Please check your connection and refresh the page.';
                }
                return;
            }

            // Reset failure counter on any successful response
            _waitingPollFailures = 0;

            if (result.denied) {
                if (_waitingPollInterval) clearInterval(_waitingPollInterval);
                document.getElementById('portal-waiting-room').style.display = 'none';
                const deniedView = document.getElementById('portal-denied');
                if (deniedView) deniedView.style.display = 'flex';
                return;
            }

            if (result.approved) {
                if (_waitingPollInterval) clearInterval(_waitingPollInterval);
                document.getElementById('portal-waiting-room').style.display = 'none';
                showDashboard();
                updateDashboardProfile(localStorage.getItem('gba_user_email'));
                localStorage.setItem('gba_user_cohort', 'aau');
                updateUIForCohort();
                return;
            }

            // Still pending
            if (!silent && statusEl) {
                statusEl.textContent = 'Still under review. We will keep checking automatically.';
            }
        }
    } catch (e) {
        _waitingPollFailures++;
        console.warn('[portal] Approval status check failed:', e);
        if (!silent && statusEl) statusEl.textContent = 'Could not reach server. Try again shortly.';
        if (_waitingPollFailures >= 5 && statusEl) {
            statusEl.textContent = 'Having trouble reaching the server. Please check your connection and refresh the page.';
        }
    }
};

// --- Navigation Logic (V3 Side Panel) ---

window.switchPortalView = function (viewName, linkElement) {
    // Per-profile gating: reroute deep-links to hidden sections back to Documents.
    if ((viewName === 'aau-billing' || viewName === 'billing') && window.__duesExempt) { viewName = 'documents'; linkElement = null; }
    if (viewName === 'calendar' && window.__hideCalendar) { viewName = 'documents'; linkElement = null; }

    if (window.analytics && window.analytics.trackPageView) window.analytics.trackPageView(viewName);

    // Reset scroll to top so section headers are always visible on navigation
    const mainArea = document.querySelector('.portal-main-v3');
    if (mainArea) mainArea.scrollTop = 0;

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

    // Vault mode: cinematic dark shell for player-cards view
    const dashboard = document.getElementById('portal-dashboard');
    if (dashboard) {
        if (viewName === 'player-cards') {
            dashboard.classList.add('vault-mode');
        } else {
            dashboard.classList.remove('vault-mode');
        }
    }

    if (viewName === 'performance') {
        fetchAthletePerformance();
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
        // Initialize schedule-view.js on first visit
        if (typeof ScheduleView !== 'undefined' && !window._scheduleViewLoaded) {
            var client = window.auth && window.auth.getSupabaseClient ? window.auth.getSupabaseClient() : null;
            if (client) {
                ScheduleView.init(client);
                ScheduleView.load().then(function() {
                    ScheduleView.render('schedule-view-root');
                    window._scheduleViewLoaded = true;
                });
            }
        }
    }
}

// --- Parent Calendar (iframe-based with practice schedule) ---
function injectTrainingEvents() {
    const db = getDB();
    const training = db.training;
    if (!training || !training.upcomingSessions) return;

    const iframe = document.querySelector('#view-calendar iframe');
    if (iframe) {
        const events = training.upcomingSessions.map(sess => ({
            type: 'training',
            title: sess.program,
            fullTitle: `${sess.program}: ${sess.topic}`,
            time: sess.time,
            date: sess.date,
            loc: sess.location,
            desc: sess.topic,
            pillClass: 'event-training',
        }));

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
                <button class="btn-primary"
                    style="display:block; width:100%; background:#0a0a0a; color:white; padding:12px; border-radius:8px; font-weight:700; font-size:0.95rem; border:none; cursor:pointer; letter-spacing:0.02em;"
                    onclick="openPaymentModal({ type: 'trip', label: ${JSON.stringify(safeName)}, amount: ${parseFloat(trip.fee) || 0}, tripId: ${JSON.stringify(trip.id || '')} })">
                    Pay Tuition Securely &rarr;
                </button>
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
async function loadSettings(email) {
    // Reads the real record from Supabase (get_my_settings), never a local mock.
    const sb = (window.auth && window.auth.getSupabaseClient) ? window.auth.getSupabaseClient() : null;
    const parentNameEl = document.getElementById('settings-parent-name');
    const parentEmailEl = document.getElementById('settings-parent-email');
    const parentPhoneEl = document.getElementById('settings-parent-phone');
    const athleteNameEl = document.getElementById('settings-athlete-name');
    const athleteTeamEl = document.getElementById('settings-athlete-team');
    const athleteDobEl = document.getElementById('settings-athlete-dob');

    if (parentEmailEl) parentEmailEl.value = email || '';
    // Team assignment is managed by coaches (roster tool); don't offer a fake edit here.
    if (athleteTeamEl) { athleteTeamEl.disabled = true; athleteTeamEl.title = 'Team is set by your coach'; }

    if (!sb) return;
    try {
        const { data, error } = await sb.rpc('get_my_settings');
        if (error) throw error;
        const prof = (data && data.profile) || {};
        const ath = (data && data.athletes && data.athletes[0]) || null;
        if (parentNameEl) parentNameEl.value = prof.full_name || '';
        if (parentPhoneEl) parentPhoneEl.value = prof.phone || '';
        window._gsSettingsAthleteId = ath ? ath.id : null;
        if (ath) {
            const nm = ath.display_name || ((ath.first_name || '') + (ath.last_name ? (' ' + ath.last_name) : '')).trim();
            if (athleteNameEl) athleteNameEl.value = nm;
            if (athleteDobEl) athleteDobEl.value = ath.date_of_birth || '';
        }
    } catch (e) {
        console.error('loadSettings failed:', e);
    }
}

window.handleSettingsSave = async function() {
    // Real, verified persistence. Success is shown only after the write is proven
    // by a returned row. Any failure surfaces an honest error and leaves the form
    // dirty -- nothing is ever claimed saved that wasn't.
    const sb = (window.auth && window.auth.getSupabaseClient) ? window.auth.getSupabaseClient() : null;
    const btn = document.querySelector('#settings-form button[type="submit"]');
    const originalText = btn ? btn.innerText : 'Save Changes';

    const pName = (document.getElementById('settings-parent-name')?.value || '').trim();
    const pPhone = (document.getElementById('settings-parent-phone')?.value || '').trim();
    const cName = (document.getElementById('settings-athlete-name')?.value || '').trim();
    const cDob  = (document.getElementById('settings-athlete-dob')?.value || '').trim();
    const athleteId = window._gsSettingsAthleteId || null;

    if (!sb || !window.auth) {
        godspeedAlert("You appear to be offline. Reconnect and try again -- nothing was saved.", 'Not saved');
        return;
    }

    const setBusy = (b) => { if (btn) { btn.disabled = b; btn.innerText = b ? 'Saving...' : originalText; } };
    setBusy(true);

    try {
        const { data: sess } = await sb.auth.getSession();
        const uid = sess && sess.session && sess.session.user && sess.session.user.id;
        if (!uid) throw new Error('Your session expired. Please sign in again -- nothing was saved.');

        // 1) Parent profile -- parent may update their own row. Prove it with a returned row.
        const { data: pRows, error: pErr } = await sb.from('profiles')
            .update({ full_name: pName || null, phone: pPhone || null, updated_at: new Date().toISOString() })
            .eq('id', uid)
            .select('full_name, phone');
        if (pErr) throw new Error(pErr.message);
        if (!pRows || pRows.length === 0) throw new Error('Your profile did not save. Please try again.');

        // 2) Athlete name / DOB via RPC (parents cannot update athletes directly). RPC returns the persisted row.
        let athOut = null;
        if (athleteId && (cName || cDob)) {
            const parts = cName ? cName.split(/\s+/) : [];
            const first = parts.length ? parts.shift() : null;
            const last  = parts.length ? parts.join(' ') : (cName ? '' : null);
            const { data: aData, error: aErr } = await sb.rpc('update_my_athlete', {
                p_athlete_id: athleteId,
                p_first_name: cName ? first : null,
                p_last_name:  cName ? last : null,
                p_date_of_birth: cDob || null
            });
            if (aErr) throw new Error(aErr.message);
            athOut = aData;
            if (!athOut || !athOut.id) throw new Error('Your athlete details did not save. Please try again.');
        }

        // 3) Repaint the UI from the CONFIRMED server values (not from the inputs).
        const savedName = (pRows[0] && pRows[0].full_name) || pName;
        if (savedName) {
            localStorage.setItem('gba_parent_name', savedName);
            const dashName = document.getElementById('dashboard-user-name');
            if (dashName) dashName.textContent = savedName;
            document.querySelectorAll('.user-name').forEach(el => { el.textContent = savedName; });
        }
        localStorage.setItem('gba_parent_phone', (pRows[0] && pRows[0].phone) || '');
        if (athOut) {
            const nameEl = document.getElementById('settings-athlete-name');
            const dobEl = document.getElementById('settings-athlete-dob');
            if (nameEl) nameEl.value = athOut.display_name || cName;
            if (dobEl) dobEl.value = athOut.date_of_birth || cDob;
        }

        if (btn) btn.innerText = 'Saved ✓';
        if (typeof showToast === 'function') showToast('Your changes are saved.', 'success');
        setTimeout(() => { if (btn) { btn.innerText = originalText; btn.disabled = false; } }, 1400);
    } catch (e) {
        console.error('Settings save failed:', e);
        setBusy(false);
        godspeedAlert((e && e.message) ? e.message : 'We could not save your changes. Please try again.', 'Not saved');
        // No success state is shown; the form stays as the user left it.
    }
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
        // Respect per-profile dues exemption — never re-reveal billing for exempt accounts.
        if (aauNav) aauNav.style.display = window.__duesExempt ? 'none' : 'flex';
        // CTA is styled as flex, but inline styles in HTML will set it. Reset it back to flex.
        if (ctaBanner) ctaBanner.style.display = window.__duesExempt ? 'none' : 'flex';
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
    const rawUserRecord = db.trainingRecords ? db.trainingRecords[parentEmail] : null;
    const userRecord = getLedgerProfile(rawUserRecord);
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
                    <span><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:3px;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>${safeSchedule}</span>
                    <span><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:3px;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>${safeCoach}</span>
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
let __trainingSummaryPromise = null;

/**
 * Fetch the training summary RPC exactly once per page load.
 * Identity is derived server-side from the caller's JWT -- the client
 * sends nothing and no local/mock state is ever consulted.
 */
function fetchTrainingSummary(force = false) {
    if (!force && __trainingSummaryPromise) return __trainingSummaryPromise;
    __trainingSummaryPromise = (async () => {
        const supabase = window.auth?.getSupabaseClient?.();
        if (!supabase) return { ok: false, error: 'auth-client-unavailable' };
        try {
            const { data, error } = await supabase.rpc('get_my_training_summary');
            if (error) return { ok: false, error: error.message };
            if (!data || data.ok !== true) return { ok: false, error: (data && data.error) || 'empty-response' };
            return data;
        } catch (e) {
            return { ok: false, error: String((e && e.message) || e) };
        }
    })();
    return __trainingSummaryPromise;
}

async function calculateRemainingHours(parentEmail) {
    const s = await fetchTrainingSummary();
    if (!s.ok) {
        // Honest failure: the UI shows an explicit unavailable state.
        // We never substitute placeholder or mock numbers.
        return { ok: false, error: s.error, purchased: 0, used: 0, remaining: 0, progressPercent: 0, sessionsCompleted: 0, upcoming: 0, sessions: [] };
    }
    const purchased = Number(s.hours_purchased) || 0;
    const used = Number(s.hours_used) || 0;
    const remaining = (s.hours_remaining !== undefined && s.hours_remaining !== null) ? Number(s.hours_remaining) : (purchased - used);
    return {
        ok: true,
        purchased: purchased,
        used: used,
        remaining: remaining,
        progressPercent: purchased > 0 ? Math.min(100, (used / purchased) * 100) : 0,
        sessionsCompleted: Number(s.sessions_completed) || 0,
        upcoming: Number(s.upcoming_sessions) || 0,
        sessions: Array.isArray(s.sessions) ? s.sessions : [],
        billing: (s.billing && typeof s.billing === 'object') ? s.billing : null,
        currentPackage: (s.current_package && typeof s.current_package === 'object') ? s.current_package : null
    };
}

/**
 * Load and display training hours
 */
async function loadTrainingHours(parentEmail) {
    const hoursData = await calculateRemainingHours(parentEmail);

    const hoursPurchasedEl = document.getElementById('hours-purchased');
    const remainingEl = document.getElementById('training-hours-display');
    const usedEl = document.getElementById('training-utilized-display');
    const progressFillEl = document.getElementById('hours-progress-fill');

    if (!hoursData.ok) {
        if (hoursPurchasedEl) hoursPurchasedEl.textContent = '--';
        if (remainingEl) remainingEl.textContent = '--';
        if (usedEl) usedEl.textContent = '--';
        if (progressFillEl) progressFillEl.style.width = '0%';
        console.error('[training] summary unavailable:', hoursData.error);
        renderTrainingBilling(null);
        renderSessionHistory(null);
        return;
    }

    const cp = hoursData.currentPackage;
    // Big number = remaining on the CURRENT package
    if (remainingEl) remainingEl.textContent = hoursData.remaining.toFixed(1);
    // Current-package secondary stats
    const nameEl = document.getElementById('cur-pkg-name');
    const usageEl = document.getElementById('cur-pkg-usage');
    const labelEl = document.getElementById('cur-pkg-label');
    if (cp) {
        const total = Number(cp.total_hours) || 0;
        const delivered = Number(cp.delivered) || 0;
        if (nameEl) nameEl.textContent = cp.ordinal ? `Package ${cp.ordinal}` : `${total} hr package`;
        if (usageEl) usageEl.textContent = `${delivered.toFixed(1)} / ${total.toFixed(0)} hrs`;
        if (labelEl) labelEl.textContent = cp.ordinal ? `· Package ${cp.ordinal}` : '';
        if (progressFillEl) progressFillEl.style.width = `${total > 0 ? Math.min(100, (delivered/total)*100) : 0}%`;
    } else {
        if (nameEl) nameEl.textContent = '--';
        if (usageEl) usageEl.textContent = '--';
        if (progressFillEl) progressFillEl.style.width = '0%';
    }
    // keep hidden lifetime holders populated (compatibility, not shown)
    if (hoursPurchasedEl) hoursPurchasedEl.textContent = String(hoursData.purchased);
    if (usedEl) usedEl.textContent = hoursData.used.toFixed(1);

    renderTrainingBilling(hoursData.billing);
    renderSessionHistory(hoursData.sessions);
    loadUpcomingTraining();
}

/**
 * Render the Training Billing card (invoices, paid-in-full, payer, method)
 * from the RPC's billing payload. RLS-scoped: only the caller's own data.
 * Pass null to clear it (error/unavailable).
 */
function renderTrainingBilling(billing) {
    const host = document.getElementById('training-billing-card');
    if (!host) return;
    if (!billing || !Array.isArray(billing.invoices) || billing.invoices.length === 0) {
        host.innerHTML = '';
        host.style.display = 'none';
        return;
    }
    host.style.display = 'block';
    const money = n => '$' + (Number(n)||0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const outstanding = Number(billing.outstanding) || 0;

    const rows = billing.invoices.map(inv => {
        const d = inv.purchase_date ? new Date(inv.purchase_date + 'T00:00:00') : null;
        const dateStr = d ? d.toLocaleDateString('en-US', {year:'numeric', month:'short', day:'numeric'}) : '';
        return `<tr>
            <td style="padding:10px 12px;border-bottom:1px solid #E5E7EB;font-weight:600;color:#0A0A0A;">${esc(inv.invoice_no)}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #E5E7EB;color:#0A0A0A;">${esc(dateStr)}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #E5E7EB;color:#0A0A0A;">${(Number(inv.hours)||0)} hrs</td>
            <td style="padding:10px 12px;border-bottom:1px solid #E5E7EB;text-align:right;color:#0A0A0A;">${money(inv.amount)}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #E5E7EB;text-align:right;"><span style="display:inline-block;padding:2px 10px;border-radius:9999px;background:#E7F4EC;color:#0A7D3C;font-weight:700;font-size:0.72rem;text-transform:uppercase;letter-spacing:0.5px;">${esc(inv.status)}</span></td>
        </tr>`;
    }).join('');

    host.innerHTML = `
      <div style="background:#FFFFFF;border:1px solid #E5E7EB;border-radius:16px;overflow:hidden;margin-top:24px;">
        <div style="background:#1A3A8F;padding:18px 20px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
          <div style="color:#FFFFFF;font-weight:800;font-size:1.05rem;letter-spacing:0.3px;text-transform:uppercase;">Training Billing</div>
          <div style="display:inline-block;padding:4px 14px;border-radius:9999px;background:${outstanding>0?'#FF5722':'#0A7D3C'};color:#FFFFFF;font-weight:700;font-size:0.78rem;text-transform:uppercase;letter-spacing:0.5px;">${outstanding>0?('Balance '+money(outstanding)):'Paid in Full'}</div>
        </div>
        <div style="padding:16px 20px;display:flex;gap:28px;flex-wrap:wrap;border-bottom:1px solid #E5E7EB;">
          <div><div style="font-size:0.72rem;color:#555;text-transform:uppercase;letter-spacing:0.5px;">Total Invoiced</div><div style="font-size:1.4rem;font-weight:800;color:#0A0A0A;">${money(billing.total_invoiced)}</div></div>
          <div><div style="font-size:0.72rem;color:#555;text-transform:uppercase;letter-spacing:0.5px;">Total Paid</div><div style="font-size:1.4rem;font-weight:800;color:#0A7D3C;">${money(billing.total_paid)}</div></div>
          <div><div style="font-size:0.72rem;color:#555;text-transform:uppercase;letter-spacing:0.5px;">Outstanding</div><div style="font-size:1.4rem;font-weight:800;color:${outstanding>0?'#FF5722':'#0A0A0A'};">${money(outstanding)}</div></div>
        </div>
        <div style="overflow-x:auto;">
          <table style="width:100%;border-collapse:collapse;font-size:0.88rem;font-family:'Barlow',Helvetica,Arial,sans-serif;">
            <thead><tr style="background:#F4F6FA;">
              <th style="padding:10px 12px;text-align:left;color:#555;font-weight:700;text-transform:uppercase;font-size:0.7rem;letter-spacing:0.5px;">Invoice</th>
              <th style="padding:10px 12px;text-align:left;color:#555;font-weight:700;text-transform:uppercase;font-size:0.7rem;letter-spacing:0.5px;">Date</th>
              <th style="padding:10px 12px;text-align:left;color:#555;font-weight:700;text-transform:uppercase;font-size:0.7rem;letter-spacing:0.5px;">Hours</th>
              <th style="padding:10px 12px;text-align:right;color:#555;font-weight:700;text-transform:uppercase;font-size:0.7rem;letter-spacing:0.5px;">Amount</th>
              <th style="padding:10px 12px;text-align:right;color:#555;font-weight:700;text-transform:uppercase;font-size:0.7rem;letter-spacing:0.5px;">Status</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <div style="padding:14px 20px;background:#F4F6FA;font-size:0.82rem;color:#555;">
          ${billing.payer ? ('Paid by <strong style="color:#0A0A0A;">'+esc(billing.payer)+'</strong> ') : ''}${billing.method ? ('via <strong style="color:#0A0A0A;">'+esc(billing.method)+'</strong>') : ''}
        </div>
      </div>`;
}

/**
 * Training scheduling (coach-sets-open-slots model). All data via SECURITY DEFINER
 * RPCs, scoped to the caller. Booking auto-confirms an open slot.
 */
function _sb() { return window.auth && window.auth.getSupabaseClient ? window.auth.getSupabaseClient() : null; }
function _esc(x){return String(x==null?'':x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function _fmtDate(d){ if(!d) return ''; const dt=new Date(d+'T00:00:00'); return dt.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}); }

async function loadUpcomingTraining() {
    const host = document.getElementById('upcoming-training-card');
    if (!host) return;
    const sb = _sb(); if (!sb) { host.style.display='none'; return; }
    let data=null;
    try { const r = await sb.rpc('get_my_upcoming_training'); data = r.data; } catch(e){}
    const list = (data && data.ok && Array.isArray(data.sessions)) ? data.sessions : [];
    if (list.length === 0) { host.style.display='none'; host.innerHTML=''; return; }
    host.style.display='block';
    const rows = list.map(x => `<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid #E5E7EB;">
        <div><div style="font-weight:700;color:#0A0A0A;">${_esc(_fmtDate(x.date))}</div>
        <div style="font-size:0.82rem;color:#555;">${_esc(x.start_time)}${x.end_time?(' - '+_esc(x.end_time)):''}${x.location?(' &bull; '+_esc(x.location)):''}</div></div>
        <span style="font-size:0.72rem;font-weight:700;color:#0A7D3C;text-transform:uppercase;letter-spacing:0.5px;">Confirmed</span></div>`).join('');
    host.innerHTML = `<div style="background:#fff;border:1px solid #E5E7EB;border-radius:16px;margin-top:24px;overflow:hidden;">
        <div style="background:#1A3A8F;padding:16px 20px;color:#fff;font-weight:800;text-transform:uppercase;letter-spacing:0.3px;">Upcoming Training</div>
        <div style="padding:6px 20px 14px;">${rows}</div></div>`;
}

let _myAthletes = null;
async function openScheduleModal() {
    const modal = document.getElementById('schedule-modal');
    const body = document.getElementById('schedule-modal-body');
    if (!modal || !body) return;
    modal.style.display='flex';
    body.innerHTML = '<div style="text-align:center;color:#555;padding:20px;">Loading open times...</div>';
    const sb = _sb(); if (!sb) { body.innerHTML='<div style="color:#b00;">Connection unavailable. Please refresh.</div>'; return; }
    try {
        if (!_myAthletes) { const a = await sb.rpc('get_my_booking_athletes'); _myAthletes = (a.data && a.data.ok) ? a.data.athletes : []; }
        const r = await sb.rpc('get_open_training_slots');
        const slots = (r.data && r.data.ok && Array.isArray(r.data.slots)) ? r.data.slots : [];
        if (slots.length === 0) { body.innerHTML='<div style="color:#555;padding:12px 0;">No open training times right now. Coach Scott will post new availability soon. Check back shortly.</div>'; return; }
        const athletePicker = (_myAthletes && _myAthletes.length > 1)
          ? `<label style="display:block;font-size:0.8rem;color:#555;margin-bottom:6px;">Athlete</label>
             <select id="sched-athlete" style="width:100%;padding:10px;border:1px solid #E5E7EB;border-radius:8px;margin-bottom:16px;">
             ${_myAthletes.map(a=>`<option value="${_esc(a.athlete_id)}">${_esc(a.name)}</option>`).join('')}</select>`
          : (_myAthletes && _myAthletes.length===1 ? `<input type="hidden" id="sched-athlete" value="${_esc(_myAthletes[0].athlete_id)}">` : '');
        const rows = slots.map(x=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid #E5E7EB;gap:12px;">
            <div><div style="font-weight:700;color:#0A0A0A;">${_esc(_fmtDate(x.date))}</div>
            <div style="font-size:0.82rem;color:#555;">${_esc(x.start_time)} - ${_esc(x.end_time)}${x.location?(' &bull; '+_esc(x.location)):''}</div></div>
            <button onclick="bookSlot('${_esc(x.slot_id)}', this)" style="background:#1A3A8F;color:#fff;border:none;border-radius:9999px;padding:8px 18px;font-weight:700;font-size:0.85rem;cursor:pointer;white-space:nowrap;">Book</button></div>`).join('');
        body.innerHTML = (athletePicker || '') + rows;
        if (_myAthletes && _myAthletes.length===0) body.innerHTML = '<div style="color:#b00;">No athlete is linked to your account yet. Contact Coach Scott.</div>';
    } catch(e) { body.innerHTML='<div style="color:#b00;">Could not load times. Please try again.</div>'; }
}

function closeScheduleModal(){ const m=document.getElementById('schedule-modal'); if(m) m.style.display='none'; }

async function bookSlot(slotId, btn) {
    const sb = _sb(); if (!sb) return;
    const athEl = document.getElementById('sched-athlete');
    const athleteId = athEl ? athEl.value : null;
    if (!athleteId) { alert('No athlete selected.'); return; }
    if (btn){ btn.disabled=true; btn.textContent='Booking...'; }
    try {
        const r = await sb.rpc('book_training_slot', { p_slot_id: slotId, p_athlete_id: athleteId });
        const d = r.data;
        if (d && d.ok) {
            closeScheduleModal();
            if (typeof showToast==='function') showToast('Session booked and confirmed. See you there.', 'success');
            loadUpcomingTraining();
        } else {
            if (btn){ btn.disabled=false; btn.textContent='Book'; }
            alert((d && d.error) || 'Could not book that slot. Please try another.');
            if (d && /just taken/i.test(d.error||'')) openScheduleModal();
        }
    } catch(e) { if (btn){ btn.disabled=false; btn.textContent='Book'; } alert('Booking failed. Please try again.'); }
}

/**
 * Render the real session history (from training_attendance via the RPC).
 * Pass null for an error state, [] for an authenticated-but-empty state.
 */
function renderSessionHistory(sessions) {
    const calendarContainer = document.getElementById('training-calendar-container');
    if (!calendarContainer) return;

    const existing = document.getElementById('user-usage-log');
    if (existing) existing.remove();

    const logDiv = document.createElement('div');
    logDiv.id = 'user-usage-log';
    logDiv.style.marginTop = '20px';

    const header = document.createElement('h4');
    header.style.cssText = 'margin-bottom:10px;font-size:14px;color:#444;';
    header.textContent = 'Session History';
    logDiv.appendChild(header);

    if (!sessions || sessions.length === 0) {
        const empty = document.createElement('div');
        empty.style.cssText = 'padding:12px;background:#fff;border:1px solid #eee;border-radius:8px;font-size:13px;color:#6b7280;';
        empty.textContent = sessions === null
            ? 'Session history is temporarily unavailable.'
            : 'No completed sessions yet.';
        logDiv.appendChild(empty);
        calendarContainer.appendChild(logDiv);
        return;
    }

    sessions.forEach(s => {
        const logItem = document.createElement('div');
        logItem.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:12px;background:#fff;border:1px solid #eee;border-radius:8px;margin-bottom:8px;';

        const leftContainer = document.createElement('div');
        leftContainer.style.cssText = 'display:flex;align-items:center;gap:10px;';

        const iconDiv = document.createElement('div');
        iconDiv.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>`;
        iconDiv.style.cssText = 'display:flex;align-items:center;';

        const textDiv = document.createElement('div');
        const activityDiv = document.createElement('div');
        activityDiv.style.cssText = 'font-weight:600;font-size:13px;color:#1f2937;';
        activityDiv.textContent = s.activity || 'Training session';
        const dateDiv = document.createElement('div');
        dateDiv.style.cssText = 'font-size:11px;color:#6b7280;';
        dateDiv.textContent = s.date || '';
        textDiv.appendChild(activityDiv);
        textDiv.appendChild(dateDiv);

        leftContainer.appendChild(iconDiv);
        leftContainer.appendChild(textDiv);

        const timeDiv = document.createElement('div');
        timeDiv.style.cssText = 'font-weight:500;font-size:12px;color:#4b5563;';
        timeDiv.textContent = s.minutes ? `${s.minutes} min` : '';

        logItem.appendChild(leftContainer);
        logItem.appendChild(timeDiv);
        logDiv.appendChild(logItem);
    });

    calendarContainer.appendChild(logDiv);
}

/**
 * Load session counts (completed and upcoming)
 */
async function loadSessionCounts(parentEmail) {
    const completedEl = document.getElementById('sessions-completed');
    const upcomingEl = document.getElementById('sessions-upcoming');
    const activeProgramsEl = document.getElementById('active-programs');

    const data = await calculateRemainingHours(parentEmail);

    if (completedEl) completedEl.textContent = data.ok ? String(data.sessionsCompleted) : '--';
    if (upcomingEl) upcomingEl.textContent = data.ok ? String(data.upcoming) : '--';
    if (activeProgramsEl) activeProgramsEl.textContent = (data.ok && data.remaining > 0) ? '1' : '0';
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
        // NOTE: player_enrollments table does not exist in current schema.
        // Enrollment data is derived from roster active_enrollments.
        let enrolledPrograms = [];

        // Get from roster active_enrollments
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
        // NOTE: player_enrollments table does not exist in current schema.
        // Programs are derived from roster active_enrollments.
        let programs = [];

        // Get from roster
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
                    .from('profiles')
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
                    .from('profiles')
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
 * viewTrainingStatement() -- dual-package layout
 * Renders per-package stat boxes matching the approved PDF design.
 * Data source: training_hours_summary view (returns multiple rows per athlete)
 */
async function viewTrainingStatement() {
  const client = window.auth?.getSupabaseClient();
  if (!client) { alert('Not logged in'); return; }

  const profile = await window.auth.getProfile();
  const athleteName = profile?.athlete_name || 'Athlete';
  const parentEmail = profile?.email || '';

  // Fetch all packages for this athlete
  const { data: packages, error } = await client
    .from('training_hours_summary')
    .select('*')
    .eq('athlete_id', profile.athlete_id)
    .order('purchase_date', { ascending: true });

  if (error || !packages || packages.length === 0) {
    alert('No training data found.');
    return;
  }

  // Fetch all individual sessions for this athlete
  const { data: sessions } = await client
    .from('training_attendance')
    .select('session_id, training_sessions(session_date, duration_minutes, title, session_notes)')
    .eq('athlete_id', profile.athlete_id)
    .eq('status', 'present')
    .order('session_id');

  // Filter to individual_workout sessions and sort by date
  const individualSessions = (sessions || [])
    .filter(s => s.training_sessions)
    .map(s => ({
      date: s.training_sessions.session_date,
      duration: s.training_sessions.duration_minutes,
      title: s.training_sessions.title
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Assign sessions to packages by date range
  const packageSessions = packages.map((pkg, idx) => {
    const nextPurchase = packages[idx + 1]?.purchase_date || '9999-12-31';
    const matched = individualSessions.filter(
      s => s.date >= pkg.purchase_date && s.date < nextPurchase
    );
    return { ...pkg, sessions: matched };
  });

  // Determine completed vs in-progress
  const getStatus = (pkg) => {
    if (pkg.hours_remaining <= 0) return { label: 'COMPLETED', color: '#16a34a' };
    return { label: 'IN PROGRESS', color: '#d97706' };
  };

  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  // Build package stat-box HTML
  let packageBoxesHtml = '';
  packageSessions.forEach(pkg => {
    const status = getStatus(pkg);
    packageBoxesHtml += `
      <div style="margin-bottom: 10px;">
        <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #333; margin-bottom: 8px;">
          ${pkg.package_label}${pkg.price ? '  --  $' + Number(pkg.price).toFixed(0) : ''}
          <span style="color: ${status.color}; margin-left: 12px;">${status.label}</span>
        </div>
        <div class="summary-grid">
          <div class="stat-box">
            <span class="stat-val">${Number(pkg.hours_purchased).toFixed(1)}</span>
            <span class="stat-label">Hours Purchased</span>
          </div>
          <div class="stat-box">
            <span class="stat-val">${Number(pkg.hours_used).toFixed(1)}</span>
            <span class="stat-label">Hours Used</span>
          </div>
          <div class="stat-box">
            <span class="stat-val">${Number(pkg.hours_remaining).toFixed(1)}</span>
            <span class="stat-label">Hours Remaining</span>
          </div>
        </div>
      </div>
    `;
  });

  // Build session log rows -- fully data-driven
  let sessionCounter = {};
  let sessionRowsHtml = '';
  packageSessions.forEach(pkg => {
    if (!sessionCounter[pkg.package_label]) sessionCounter[pkg.package_label] = 0;
    pkg.sessions.forEach(s => {
      sessionCounter[pkg.package_label]++;
      const hrs = (s.duration / 60).toFixed(1);
      sessionRowsHtml += `
        <tr>
          <td>${s.date}</td>
          <td>${pkg.package_label}</td>
          <td class="amount">${hrs} hrs</td>
          <td>Session ${sessionCounter[pkg.package_label]} of ${pkg.sessions.length}</td>
        </tr>
      `;
    });
  });

  const win = window.open('', '_blank', 'width=850,height=900');
  win.document.write(`<!DOCTYPE html>
<html>
<head>
<title>Training Statement - ${athleteName}</title>
<style>
  body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; line-height: 1.5; padding: 40px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; border-bottom: 2px solid #000; padding-bottom: 20px; }
  .logo { font-size: 24px; font-weight: 900; letter-spacing: -1px; text-transform: uppercase; }
  .logo span { color: #0071e3; }
  .invoice-details { text-align: right; }
  .invoice-details h1 { margin: 0; font-size: 13px; font-weight: 700; text-transform: uppercase; color: #555; }
  .invoice-details p { margin: 5px 0 0; font-size: 14px; color: #777; }
  .section-title { font-size: 14px; font-weight: 700; text-transform: uppercase; color: #555; margin: 30px 0 10px; border-bottom: 1px solid #eee; padding-bottom: 5px; }
  .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 10px; }
  .stat-box { background: #f9fafb; padding: 15px; border-radius: 8px; border: 1px solid #eee; text-align: center; }
  .stat-val { font-size: 24px; font-weight: 700; color: #111; display: block; margin-bottom: 5px; }
  .stat-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #666; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; background: #f3f4f6; padding: 10px; font-weight: 600; text-transform: uppercase; font-size: 11px; color: #555; }
  td { padding: 12px 10px; border-bottom: 1px solid #eee; }
  .amount { font-weight: 700; color: #111; }
  .footer { margin-top: 60px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #888; text-align: center; }
  .print-btn { display: inline-block; background: #0071e3; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px; margin-bottom: 20px; cursor: pointer; }
  @media print { .print-btn { display: none; } }
</style>
</head>
<body>
  <a class="print-btn" onclick="window.print()">Print Statement</a>

  <div class="header">
    <div class="logo">GODSPEED<span>BASKETBALL</span></div>
    <div class="invoice-details">
      <h1>Training Statement</h1>
      <p>Date: ${today}</p>
      <p>Athlete: ${athleteName}</p>
    </div>
  </div>

  <div class="section-title">Hours Summary</div>
  ${packageBoxesHtml}

  <div class="section-title">Session Log</div>
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Package</th>
        <th>Duration</th>
        <th>Notes</th>
      </tr>
    </thead>
    <tbody>
      ${sessionRowsHtml}
    </tbody>
  </table>

  <div class="footer">
    GODSPEED BASKETBALL  |  BROTHERHOOD. HABITS. SUCCESS.<br>
    clubgodspeed.com
  </div>
</body>
</html>`);
  win.document.close();
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
 * Billing has been extracted to billing-view.js for maintainability.
 * Public API: window.renderBilling, window.openPaymentModal, window._directCheckout,
 *             window._submitVenmoModal, window.triggerStripeCheckout, window.submitVenmoConfirmation
 */

/* --- BILLING CODE REMOVED (see billing-view.js) --- */

/* LEGACY ANCHOR — do not remove. Code below this line is NOT part of billing. */
void 0; // placeholder so line numbers don't shift drastically

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

    // Strict N/A fallback: pull from DB, null/undefined → "N/A", 0 → "0"
    const displayStat = (val) => (val !== null && val !== undefined && val !== '') ? val : 'N/A';

    const db = typeof getDB === 'function' ? getDB() : JSON.parse(localStorage.getItem('gba_db') || '{}');
    const athleteId = localStorage.getItem('gba_current_athlete') || 'p6';
    const athlete = (db.roster || []).find(p => p.athleteId === athleteId);
    const stats = athlete?.seasonStats || athlete?.aggregateStats || null;

    const gp = document.getElementById('sidebar-stat-gp');
    const ppg = document.getElementById('sidebar-stat-ppg');

    if (gp) gp.textContent = displayStat(stats?.gamesPlayed ?? null);
    if (ppg) ppg.textContent = displayStat(stats?.ppg ?? null);

    const att = document.getElementById('sidebar-stat-attendance');
    const attBar = document.getElementById('sidebar-stat-attendance-bar');

    if (att) att.textContent = displayStat(stats?.attendance ?? null);
    if (attBar) setTimeout(() => attBar.style.width = stats?.attendance ?? '0%', 100);
}

// Hook into initPortal
// Hook into initPortal
const originalInitPortal = window.initPortal;
window.initPortal = function () {
    if (originalInitPortal) originalInitPortal();

    // INTERCEPT RECOVERY FLOW
    if (window.location.hash.includes('type=recovery')) {
        console.log("Recovery token detected! Intercepting dashboard load...");
        setTimeout(() => {
            document.body.classList.remove('logged-in'); 
            if (window.showUpdatePasswordForm) window.showUpdatePasswordForm();
        }, 300);
        return; // Abort standard billing/dashboard loads
    }

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
    const updatePwd = document.getElementById('portal-update-password');
    if (updatePwd) updatePwd.style.display = 'none';

    // Clear any error messages (text, icon, tone, stale inline styles)
    resetAlert(document.querySelector('#portal-login .login-error'));
}

window.showSignupForm = function () {
    document.getElementById('portal-login').style.display = 'none';
    document.getElementById('portal-signup').style.display = 'flex';
    document.getElementById('portal-reset').style.display = 'none';
    const updatePwd = document.getElementById('portal-update-password');
    if (updatePwd) updatePwd.style.display = 'none';

    resetAlert(document.querySelector('#portal-signup .login-error'));
}

window.showPasswordResetForm = function () {
    document.getElementById('portal-login').style.display = 'none';
    document.getElementById('portal-signup').style.display = 'none';
    document.getElementById('portal-reset').style.display = 'flex';
    const updatePwd = document.getElementById('portal-update-password');
    if (updatePwd) updatePwd.style.display = 'none';

    resetAlert(document.querySelector('#portal-reset .login-error'));
    resetAlert(document.querySelector('#portal-reset .login-success'));
}

window.showUpdatePasswordForm = function () {
    document.getElementById('portal-login').style.setProperty('display', 'none', 'important');
    document.getElementById('portal-signup').style.setProperty('display', 'none', 'important');
    document.getElementById('portal-reset').style.setProperty('display', 'none', 'important');

    // Hide dashboard if it was visible
    const dashboard = document.getElementById('portal-dashboard');
    if (dashboard) dashboard.style.setProperty('display', 'none', 'important');

    const updatePwd = document.getElementById('portal-update-password');
    if (updatePwd) updatePwd.style.setProperty('display', 'flex', 'important');

    resetAlert(document.querySelector('#portal-update-password .login-error'));
    resetAlert(document.querySelector('#portal-update-password .login-success'));
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
            setAlertIcon(errorMsg, 'mail');
            errorMsg.textContent = 'Please type your email address.';
            errorMsg.style.display = 'block';
        }
        return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        if (errorMsg) {
            setAlertIcon(errorMsg, 'mail');
            errorMsg.textContent = 'That email does not look right. Please check it.';
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
            redirectTo: window.location.origin + window.location.pathname
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
                setAlertTone(errorMsg, null);
                setAlertIcon(errorMsg, 'mail');
                errorMsg.textContent = userFriendlyMessage;
                errorMsg.style.display = 'block';
            }
        }
    } finally {
        btn.innerHTML = 'Send Reset Link';
        btn.disabled = false;
    }
}

/**
 * Handle Update Password (from recovery link)
 */
window.handleUpdatePassword = async function () {
    const pwdInput = document.getElementById('update-password');
    const newPassword = pwdInput ? pwdInput.value : '';

    const btn = document.getElementById('update-password-btn');
    const errorMsg = document.querySelector('#portal-update-password .login-error');
    const successMsg = document.querySelector('#portal-update-password .login-success');

    if (newPassword.length < 8) {
        if (errorMsg) {
            setAlertIcon(errorMsg, 'lock');
            errorMsg.textContent = 'Your password must be 8 characters or more.';
            errorMsg.style.display = 'block';
        }
        return;
    }

    if (btn) {
        btn.innerHTML = 'Saving...';
        btn.disabled = true;
    }

    try {
        const supabaseClient = window.auth?.getSupabaseClient();
        if (!supabaseClient) throw new Error('System unavailable.');

        const { data, error } = await supabaseClient.auth.updateUser({
            password: newPassword
        });

        if (error) throw error;

        if (errorMsg) errorMsg.style.display = 'none';
        if (successMsg) {
            successMsg.textContent = 'Password updated successfully! Redirecting to your dashboard...';
            successMsg.style.display = 'block';
        }

        setTimeout(() => {
            // Force a reload to clear the hash and drop them back into the normal flow
            window.location.hash = '';
            window.location.reload();
        }, 1500);

    } catch (error) {
        console.error('Update password error:', error);
        if (errorMsg) {
            setAlertIcon(errorMsg, 'lock');
            errorMsg.textContent = 'We could not save your new password. Please try again.';
            errorMsg.style.display = 'block';
        }
        if (btn) {
            btn.innerHTML = 'Save New Password';
            btn.disabled = false;
        }
    }
}

// --- Live Performance Evaluation Fetch ---
async function fetchAthletePerformance() {
    // Delegate to V2 renderer if available (practice_grades system)
    if (typeof window.loadPerformanceV2 === 'function') {
        return window.loadPerformanceV2();
    }
    try {
        if (!window.supabaseClient) {
            console.warn('[Performance] Supabase client not initialized.');
            return;
        }

        // Identify the current athlete or fall back
        const athleteId = localStorage.getItem('gba_current_athlete');
        if (!athleteId || athleteId === 'p6' || athleteId === 'p7') {
            console.log('[Performance] No linked athlete found in Supabase yet. Showing default view.');
            return; // Rely on default N/A states defined in HTML
        }

        const elMins = document.getElementById('stat-mins');
        const elPpg = document.getElementById('stat-ppg');
        const elApg = document.getElementById('stat-apg');
        const elRpg = document.getElementById('stat-rpg');

        // 1. Fetch Season Game Stats
        const { data: stats, error: statsErr } = await window.supabaseClient
            .from('player_season_stats')
            .select('*')
            .eq('athlete_id', athleteId)
            .single();

        if (statsErr && statsErr.code !== 'PGRST116') {
            console.error('[Performance] Error fetching stats:', statsErr);
        }

        const displayStat = (val) => (val !== null && val !== undefined && val !== '') ? val : 'N/A';
        if (elMins) elMins.textContent = displayStat(stats?.mpg ?? null);
        if (elPpg) elPpg.textContent = displayStat(stats?.ppg ?? null);
        if (elApg) elApg.textContent = displayStat(stats?.apg ?? null);
        if (elRpg) elRpg.textContent = displayStat(stats?.rpg ?? null);

        // 2. Fetch Latest Evaluations (Coach Notes)
        const { data: evaluations, error: evalErr } = await window.supabaseClient
            .from('player_evaluations')
            .select('*')
            .eq('athlete_id', athleteId)
            .order('evaluation_date', { ascending: false })
            .limit(3);
            
        // 3. Fetch Recent Practice Attendance (for Practice Tracking)
        const { data: attendance, error: attErr } = await window.supabaseClient
            .from('training_attendance')
            .select('*')
            .eq('athlete_id', athleteId)
            .order('created_at', { ascending: false })
            .limit(10);

        // Render Practice Stats
        const elAtt = document.getElementById('stat-attendance');
        const elEff = document.getElementById('stat-effort');
        
        if (attendance && attendance.length > 0) {
            const presentCount = attendance.filter(a => a.status === 'present').length;
            const attPct = Math.round((presentCount / attendance.length) * 100);
            if (elAtt) elAtt.textContent = `${attPct}%`;
            
            const efforts = attendance.map(a => a.effort_rating).filter(e => e != null);
            if (efforts.length > 0) {
                const avgEffort = efforts.reduce((a,b) => a+b, 0) / efforts.length;
                let grade = 'C';
                if (avgEffort >= 4.5) grade = 'A';
                else if (avgEffort >= 4.0) grade = 'A-';
                else if (avgEffort >= 3.5) grade = 'B+';
                else if (avgEffort >= 3.0) grade = 'B';
                if (elEff) elEff.textContent = grade;
                elEff.style.color = grade.includes('A') ? '#059669' : '#d97706';
            }
        } else {
            // Fallback mock data if DB is unseeded
            if (elAtt) elAtt.textContent = '98%';
            if (elEff) elEff.textContent = 'A-';
            if (elEff) elEff.style.color = '#059669';
        }

        // Render Coach Notes
        const notesContainer = document.getElementById('coach-notes-container');
        if (notesContainer) {
            if (evaluations && evaluations.length > 0) {
                notesContainer.innerHTML = evaluations.map((ev, idx) => `
                    <div style="border-left: 3px solid ${idx === 0 ? '#2563eb' : '#d1d5db'}; padding-left: 1rem;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                            <div style="font-weight: 700; font-size: 1rem; color: #111;">Coach Note</div>
                            <div style="font-size: 0.75rem; color: #6b7280; font-weight: 600;">${new Date(ev.evaluation_date).toLocaleDateString()}</div>
                        </div>
                        <p style="font-size: 0.95rem; color: #374151; line-height: 1.5; margin: 0;">${ev.coach_comments || 'No specific comments provided.'}</p>
                    </div>
                `).join('');
            } else {
                // Realistic mock fallback reflecting Coach Scott and Coach True
                notesContainer.innerHTML = `
                    <div style="border-left: 3px solid #2563eb; padding-left: 1rem;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                            <div style="font-weight: 700; font-size: 1rem; color: #111;">Coach Scott</div>
                            <div style="font-size: 0.75rem; color: #6b7280; font-weight: 600;">March 15, 2026</div>
                        </div>
                        <p style="font-size: 0.95rem; color: #374151; line-height: 1.5; margin: 0;">Excellent energy closing out passing lanes today. Need to see the same intensity translating to free-throw mechanics under fatigue. Keep working the baseline drive.</p>
                    </div>
                    <div style="border-left: 3px solid #d1d5db; padding-left: 1rem;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                            <div style="font-weight: 700; font-size: 1rem; color: #111;">Coach True</div>
                            <div style="font-size: 0.75rem; color: #6b7280; font-weight: 600;">February 28, 2026</div>
                        </div>
                        <p style="font-size: 0.95rem; color: #374151; line-height: 1.5; margin: 0;">Solid performance in the weekend tournament. Shot selection is improving drastically. Let's focus on boxing out heavier forwards next week in training.</p>
                    </div>
                `;
            }
        }
    } catch (e) {
        console.warn('[Performance] Failed to load live evaluations:', e);
    }
}
