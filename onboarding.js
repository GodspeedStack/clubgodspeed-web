/**
 * Godspeed Basketball - Onboarding Flow Engine
 * Drives the multi-step parent onboarding at /welcome
 *
 * Architecture:
 *  - Steps 0-9 map to onboarding_step enum in Supabase
 *  - Each step transition is recorded in onboarding_events (immutable audit log)
 *  - Signature data is stored both in localStorage (immediate) and Supabase (persistent)
 *  - Admin can see exact drop-off point via onboarding_status view
 */

const OB = (() => {
    'use strict';

    // ── Config ──
    const STEP_MAP = [
        'welcome',           // 0
        'account_created',   // 1
        'parent_guide',      // 2
        'athletic_waiver',   // 3
        'medical_consent',   // 4
        'practice_consent',  // 5
        'code_of_conduct',   // 6
        'media_release',     // 7
        'payment_setup',     // 8
        'complete'           // 9
    ];

    const DOC_STEPS = {
        3: 'athletic',
        4: 'medical',
        5: 'practice',
        6: 'conduct',
        7: 'media'
    };

    const TOTAL_STEPS = STEP_MAP.length;

    // ── State ──
    let currentStep = 0;
    let supabase = null;
    let sessionId = null;
    let userEmail = null;
    let parentName = null;
    let athleteName = null;
    let isLoginMode = false;
    let signatures = {}; // { athletic: dataUrl, ... }
    let signatureContexts = {}; // { athletic: CanvasRenderingContext2D, ... }
    let sigDrawing = {};

    // ── Init ──
    function init() {
        initSupabase();
        setDateLabels();
        buildStepDots();
        restoreSession();
        bindSignatureCanvases();
        bindCheckboxes();
        updateUI();

        // Handle OAuth redirect
        if (window.location.hash.includes('access_token')) {
            handleOAuthCallback();
        }
    }

    function initSupabase() {
        const cfg = window.SUPABASE_CONFIG;
        if (cfg && cfg.url && cfg.anonKey && window.supabase) {
            supabase = window.supabase.createClient(cfg.url, cfg.anonKey, {
                auth: {
                    autoRefreshToken: true,
                    persistSession: true,
                    detectSessionInUrl: true,
                    storage: window.localStorage
                }
            });
        }
    }

    function setDateLabels() {
        const d = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        document.querySelectorAll('.ob-date').forEach(el => el.textContent = d);
    }

    function buildStepDots() {
        const container = document.getElementById('ob-step-dots');
        if (!container) return;
        container.innerHTML = '';
        for (let i = 0; i < TOTAL_STEPS; i++) {
            const dot = document.createElement('div');
            dot.className = 'ob-dot';
            dot.dataset.step = i;
            container.appendChild(dot);
        }
    }

    // ── Session persistence (localStorage + Supabase) ──
    function restoreSession() {
        const saved = localStorage.getItem('gs_onboarding');
        if (saved) {
            try {
                const data = JSON.parse(saved);
                currentStep = data.step || 0;
                sessionId = data.sessionId || null;
                userEmail = data.email || null;
                parentName = data.parentName || null;
                athleteName = data.athleteName || null;
                signatures = data.signatures || {};

                if (parentName) populateNameFields();
                if (userEmail && currentStep >= 2) showAuthDone();
            } catch (_) {
                currentStep = 0;
            }
        }
    }

    function saveSession() {
        localStorage.setItem('gs_onboarding', JSON.stringify({
            step: currentStep,
            sessionId,
            email: userEmail,
            parentName,
            athleteName,
            signatures
        }));
    }

    // ── Supabase session tracking ──
    async function ensureOnboardingSession() {
        if (!supabase || sessionId) return;
        try {
            const { data, error } = await supabase.rpc('get_or_create_onboarding', {
                p_email: userEmail,
                p_user_id: (await supabase.auth.getUser())?.data?.user?.id || null,
                p_parent_name: parentName,
                p_athlete_name: athleteName
            });
            if (data && !error) {
                sessionId = data.id;
                // If returning user, resume from their last step
                const savedIdx = STEP_MAP.indexOf(data.current_step);
                if (savedIdx > currentStep) {
                    currentStep = savedIdx;
                }
                saveSession();
            }
        } catch (e) {
            console.warn('Onboarding session init failed:', e);
        }
    }

    async function recordStepAdvance(stepName) {
        if (!supabase || !sessionId) return;
        try {
            await supabase.rpc('advance_onboarding_step', {
                p_session_id: sessionId,
                p_step: stepName,
                p_user_agent: navigator.userAgent
            });
        } catch (e) {
            console.warn('Step advance failed:', e);
        }
    }

    // ── Navigation ──
    function next() {
        if (!canAdvance()) return;

        // Perform step-specific actions before advancing
        const docType = DOC_STEPS[currentStep];
        if (docType && !signatures[docType]) {
            captureSignature(docType);
        }

        const nextIdx = currentStep + 1;
        if (nextIdx >= TOTAL_STEPS) return;

        const stepName = STEP_MAP[nextIdx];
        recordStepAdvance(stepName);

        currentStep = nextIdx;
        saveSession();
        updateUI();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function prev() {
        if (currentStep <= 0) return;
        // Don't go back past auth if already authenticated
        if (currentStep === 2 && userEmail) return;
        currentStep--;
        updateUI();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function goToStep(idx) {
        if (idx < 0 || idx >= TOTAL_STEPS) return;
        currentStep = idx;
        saveSession();
        updateUI();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function canAdvance() {
        // Step 0 (welcome): always
        if (currentStep === 0) return true;

        // Step 1 (auth): must be authenticated
        if (currentStep === 1) return !!userEmail;

        // Step 2 (guide): always (we trust they scrolled)
        if (currentStep === 2) return true;

        // Steps 3-7 (documents): must have checkbox checked + signature
        const docType = DOC_STEPS[currentStep];
        if (docType) {
            const checkbox = document.getElementById(`agree-${docType}`);
            const wrap = document.getElementById(`sig-wrap-${docType}`);
            const hasSig = wrap && wrap.classList.contains('has-sig');
            return checkbox && checkbox.checked && hasSig;
        }

        // Step 8 (payment): must have checkbox checked
        if (currentStep === 8) {
            const checkbox = document.getElementById('agree-payment');
            return checkbox && checkbox.checked;
        }

        return true;
    }

    // ── UI Update ──
    function updateUI() {
        // Show/hide steps
        document.querySelectorAll('.ob-step').forEach(el => {
            el.classList.toggle('active', parseInt(el.dataset.step) === currentStep);
        });

        // Stepper visibility
        const stepper = document.getElementById('ob-stepper');
        if (stepper) stepper.hidden = currentStep === 0 || currentStep === TOTAL_STEPS - 1;

        // Progress bar
        const fill = document.getElementById('ob-progress-fill');
        if (fill) {
            const pct = currentStep === 0 ? 0 : Math.round((currentStep / (TOTAL_STEPS - 1)) * 100);
            fill.style.width = pct + '%';
        }

        // Step label
        const stepLabels = [
            'Welcome', 'Create Account', 'Season Guide',
            'Athletic Waiver', 'Medical Consent', 'Practice Commitment',
            'Code of Conduct', 'Media Release', 'Payment Info', 'Complete'
        ];
        const nameEl = document.getElementById('ob-step-name');
        const countEl = document.getElementById('ob-step-count');
        if (nameEl) nameEl.textContent = stepLabels[currentStep] || '';
        if (countEl) countEl.textContent = `${currentStep + 1} of ${TOTAL_STEPS}`;

        // Step dots
        document.querySelectorAll('.ob-dot').forEach(dot => {
            const idx = parseInt(dot.dataset.step);
            dot.classList.toggle('completed', idx < currentStep);
            dot.classList.toggle('active', idx === currentStep);
        });

        // Back button
        const backBtn = document.getElementById('ob-btn-back');
        if (backBtn) backBtn.hidden = currentStep === 0 || currentStep === TOTAL_STEPS - 1;

        // Next button text + state
        const nextBtn = document.getElementById('ob-btn-next');
        if (nextBtn) {
            if (currentStep === 0) {
                nextBtn.textContent = 'Get Started';
                nextBtn.disabled = false;
            } else if (currentStep === 1) {
                nextBtn.textContent = 'Continue';
                nextBtn.disabled = !userEmail;
            } else if (currentStep >= 3 && currentStep <= 7) {
                nextBtn.textContent = 'Sign & Continue';
                nextBtn.disabled = !canAdvance();
            } else if (currentStep === 8) {
                nextBtn.textContent = 'Finish Onboarding';
                nextBtn.disabled = !canAdvance();
            } else if (currentStep === TOTAL_STEPS - 1) {
                nextBtn.style.display = 'none';
            } else {
                nextBtn.textContent = 'Continue';
                nextBtn.disabled = false;
            }
        }

        // Bottom bar visibility
        const bar = document.getElementById('ob-bottom-bar');
        if (bar) bar.hidden = currentStep === TOTAL_STEPS - 1;

        // Reinit signature canvases when entering doc steps
        if (DOC_STEPS[currentStep]) {
            setTimeout(() => initSigCanvas(DOC_STEPS[currentStep]), 100);
        }

        // Personalize Venmo button with athlete name in note
        const venmoBtn = document.getElementById('venmo-pay-btn');
        if (venmoBtn) {
            const note = athleteName
                ? encodeURIComponent('Godspeed Basketball - ' + athleteName)
                : encodeURIComponent('Godspeed Basketball');
            venmoBtn.href = 'https://venmo.com/Coachsco?txn=pay&note=' + note;
        }
    }

    // ── Authentication ──
    async function authGoogle() {
        if (!supabase) { alert('Connection error. Please refresh and try again.'); return; }

        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.origin + '/welcome.html'
            }
        });
        if (error) alert('Google sign-in failed: ' + error.message);
    }

    async function handleOAuthCallback() {
        if (!supabase) return;
        // Wait for session to be established
        await new Promise(r => setTimeout(r, 500));
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            userEmail = user.email;
            parentName = parentName || user.user_metadata?.full_name || user.email.split('@')[0];
            athleteName = athleteName || '';

            localStorage.setItem('gba_user_email', userEmail);
            localStorage.setItem('gba_user_id', user.id);

            showAuthDone();
            populateNameFields();
            await ensureOnboardingSession();

            // Auto-advance to guide if still on auth step
            if (currentStep <= 1) {
                currentStep = 2;
                recordStepAdvance('parent_guide');
                saveSession();
                updateUI();
            }

            // Clean URL
            history.replaceState(null, '', window.location.pathname);
        }
    }

    async function authEmail() {
        if (!supabase) { alert('Connection error. Please refresh and try again.'); return; }

        const email = document.getElementById('ob-email')?.value?.trim();
        const password = document.getElementById('ob-password')?.value;
        const pName = document.getElementById('ob-parent-name')?.value?.trim();
        const aName = document.getElementById('ob-athlete-name')?.value?.trim();

        // Validate
        if (!email || !email.includes('@')) {
            showFieldError('ob-email', 'ob-email-error', 'Please enter a valid email address.');
            return;
        }
        if (!password || password.length < 6) {
            showFieldError('ob-password', 'ob-password-error', 'Password must be at least 6 characters.');
            return;
        }

        const btn = document.getElementById('btn-email-auth');
        btn.disabled = true;
        btn.innerHTML = '<span class="ob-spinner"></span>';

        try {
            if (isLoginMode) {
                // Sign in
                const { data, error } = await supabase.auth.signInWithPassword({ email, password });
                if (error) throw error;

                userEmail = data.user.email;
                parentName = data.user.user_metadata?.full_name || email.split('@')[0];
                localStorage.setItem('gba_user_email', userEmail);
                localStorage.setItem('gba_user_id', data.user.id);
            } else {
                // Sign up
                if (!pName) {
                    showFieldError('ob-parent-name', null, 'Please enter your name.');
                    btn.disabled = false;
                    btn.textContent = 'Create Account';
                    return;
                }

                const { data, error } = await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        data: {
                            full_name: pName,
                            player_name: aName
                        },
                        emailRedirectTo: window.location.origin + '/welcome.html'
                    }
                });
                if (error) throw error;

                userEmail = email;
                parentName = pName;
                athleteName = aName;
                localStorage.setItem('gba_user_email', userEmail);
                if (data.user) localStorage.setItem('gba_user_id', data.user.id);
            }

            showAuthDone();
            populateNameFields();
            await ensureOnboardingSession();

            // Also sync to parent-portal localStorage keys
            localStorage.setItem('gba_parent_name', parentName);
            if (athleteName) localStorage.setItem('gba_child_name', athleteName);

            // Auto-advance
            currentStep = 2;
            recordStepAdvance('parent_guide');
            saveSession();
            updateUI();

        } catch (err) {
            alert(err.message || 'Authentication failed. Please try again.');
            btn.disabled = false;
            btn.textContent = isLoginMode ? 'Sign In' : 'Create Account';
        }
    }

    function toggleLoginMode() {
        isLoginMode = !isLoginMode;
        const nameGroup = document.getElementById('ob-name-group');
        const athleteGroup = document.getElementById('ob-athlete-group');
        const btn = document.getElementById('btn-email-auth');
        const toggle = document.getElementById('btn-toggle-login');

        if (isLoginMode) {
            nameGroup.hidden = true;
            athleteGroup.hidden = true;
            btn.textContent = 'Sign In';
            toggle.textContent = 'Need an account? Sign up';
        } else {
            nameGroup.hidden = false;
            athleteGroup.hidden = false;
            btn.textContent = 'Create Account';
            toggle.textContent = 'Already have an account? Sign in';
        }
    }

    function showAuthDone() {
        const form = document.getElementById('email-auth-form');
        const googleBtn = document.getElementById('btn-google-auth');
        const divider = document.querySelector('.ob-divider');
        const status = document.getElementById('ob-auth-status');

        if (form) form.hidden = true;
        if (googleBtn) googleBtn.hidden = true;
        if (divider) divider.hidden = true;
        if (status) {
            status.hidden = false;
            const nameEl = document.getElementById('ob-auth-name');
            const emailEl = document.getElementById('ob-auth-email');
            if (nameEl) nameEl.textContent = parentName || '';
            if (emailEl) emailEl.textContent = userEmail || '';
        }
    }

    function populateNameFields() {
        document.querySelectorAll('.ob-child-name').forEach(el => el.value = athleteName || '');
        document.querySelectorAll('.ob-parent-name-field').forEach(el => el.value = parentName || '');
    }

    function showFieldError(inputId, errorId, msg) {
        const input = document.getElementById(inputId);
        if (input) input.classList.add('error');
        if (errorId) {
            const err = document.getElementById(errorId);
            if (err) { err.textContent = msg; err.style.display = 'block'; }
        }
        if (input) {
            input.addEventListener('input', () => {
                input.classList.remove('error');
                if (errorId) {
                    const err = document.getElementById(errorId);
                    if (err) err.style.display = 'none';
                }
            }, { once: true });
        }
    }

    // ── Signature Canvases ──
    function bindSignatureCanvases() {
        Object.values(DOC_STEPS).forEach(type => {
            // Will be initialized when step becomes active
            sigDrawing[type] = false;
        });
    }

    function initSigCanvas(type) {
        const canvas = document.getElementById(`sig-canvas-${type}`);
        const wrap = document.getElementById(`sig-wrap-${type}`);
        if (!canvas || !wrap) return;
        if (signatureContexts[type]) return; // Already initialized

        const ctx = canvas.getContext('2d');
        canvas.width = wrap.clientWidth;
        canvas.height = wrap.clientHeight;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#000';
        signatureContexts[type] = ctx;

        let drawing = false;
        let lastX = 0, lastY = 0;

        function getPos(e) {
            const rect = canvas.getBoundingClientRect();
            const touch = e.touches ? e.touches[0] : e;
            return {
                x: (touch.clientX - rect.left) * (canvas.width / rect.width),
                y: (touch.clientY - rect.top) * (canvas.height / rect.height)
            };
        }

        function startDraw(e) {
            e.preventDefault();
            drawing = true;
            const pos = getPos(e);
            lastX = pos.x;
            lastY = pos.y;
            wrap.classList.add('has-sig');
            sigDrawing[type] = true;
            updateNextButton();
        }

        function moveDraw(e) {
            if (!drawing) return;
            e.preventDefault();
            const pos = getPos(e);
            ctx.beginPath();
            ctx.moveTo(lastX, lastY);
            ctx.lineTo(pos.x, pos.y);
            ctx.stroke();
            lastX = pos.x;
            lastY = pos.y;
        }

        function endDraw(e) {
            if (e) e.preventDefault();
            drawing = false;
        }

        canvas.addEventListener('mousedown', startDraw);
        canvas.addEventListener('mousemove', moveDraw);
        canvas.addEventListener('mouseup', endDraw);
        canvas.addEventListener('mouseleave', endDraw);
        canvas.addEventListener('touchstart', startDraw, { passive: false });
        canvas.addEventListener('touchmove', moveDraw, { passive: false });
        canvas.addEventListener('touchend', endDraw);

        // Restore if already signed
        if (signatures[type]) {
            const img = new Image();
            img.onload = () => {
                ctx.drawImage(img, 0, 0);
                wrap.classList.add('has-sig');
            };
            img.src = signatures[type];
        }
    }

    function clearSig(type) {
        const canvas = document.getElementById(`sig-canvas-${type}`);
        const wrap = document.getElementById(`sig-wrap-${type}`);
        const ctx = signatureContexts[type];
        if (canvas && ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        if (wrap) wrap.classList.remove('has-sig');
        sigDrawing[type] = false;
        delete signatures[type];
        updateNextButton();
    }

    function captureSignature(type) {
        const canvas = document.getElementById(`sig-canvas-${type}`);
        if (!canvas) return;
        const dataUrl = canvas.toDataURL('image/png');
        signatures[type] = dataUrl;

        // Persist to localStorage (parent-portal compatible format)
        const email = userEmail || '';
        const docsKey = 'gba_signed_docs_' + email;
        let signedDocs = {};
        try { signedDocs = JSON.parse(localStorage.getItem(docsKey) || '{}'); } catch (_) {}

        signedDocs[type] = {
            signedAt: new Date().toISOString(),
            signatureImage: dataUrl,
            parentName: parentName,
            childName: athleteName,
            documentType: type,
            email: email
        };
        localStorage.setItem(docsKey, JSON.stringify(signedDocs));

        // Also persist to Supabase signatures table if available
        if (supabase) {
            supabase.from('signatures').insert([{
                parent_email: email,
                parent_name: parentName,
                child_name: athleteName,
                document_type: type,
                signature_data: dataUrl,
                signed_at: new Date().toISOString()
            }]).then(() => {}).catch(() => {});
        }

        saveSession();
    }

    // ── Checkbox binding ──
    function bindCheckboxes() {
        ['athletic', 'medical', 'practice', 'conduct', 'media', 'payment'].forEach(id => {
            const cb = document.getElementById(`agree-${id}`);
            if (cb) cb.addEventListener('change', updateNextButton);
        });
    }

    function updateNextButton() {
        const nextBtn = document.getElementById('ob-btn-next');
        if (nextBtn && currentStep >= 3) {
            nextBtn.disabled = !canAdvance();
        }
    }

    // ── Public API ──
    return {
        next,
        prev,
        goToStep,
        authGoogle,
        authEmail,
        toggleLoginMode,
        clearSig,
        init
    };
})();

// Boot
document.addEventListener('DOMContentLoaded', OB.init);
// Fallback if Supabase loads after DOMContentLoaded
window.addEventListener('load', () => {
    if (!window.SUPABASE_CONFIG) return;
    // Re-attempt Supabase init if it wasn't ready at DOMContentLoaded
    OB.init;
});
