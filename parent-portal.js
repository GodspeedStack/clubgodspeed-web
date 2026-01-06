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
        emailInput.addEventListener('input', (e) => {
            const val = e.target.value;
            if (val && val.includes('@')) {
                const namePart = val.split('@')[0];
                greetingSpan.textContent = namePart.charAt(0).toUpperCase() + namePart.slice(1);
            } else if (val) {
                greetingSpan.textContent = val;
            } else {
                greetingSpan.textContent = 'Guest';
            }
        });
    }

    // Check for existing session
    if (window.auth && window.auth.isLoggedIn()) {
        const savedEmail = localStorage.getItem('gba_user_email');
        if (savedEmail) updateDashboardProfile(savedEmail);
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
    if (!email || !password) {
        if (errorMsg) {
            errorMsg.textContent = 'Please enter both email and password';
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

    // Basic password validation (minimum length)
    if (password.length < 6) {
        if (errorMsg) {
            errorMsg.textContent = 'Password must be at least 6 characters';
            errorMsg.style.display = 'block';
        }
        return;
    }

    btn.innerHTML = 'Signing In...';
    btn.disabled = true;

    try {
        // Use Supabase auth if available, otherwise fallback
        if (window.auth && typeof window.auth.login === 'function') {
            const success = await window.auth.login(email, password);
            if (success) {
                document.getElementById('portal-login').style.display = 'none';
                document.getElementById('portal-dashboard').style.display = 'flex';
                updateDashboardProfile(email);
            } else {
                throw new Error('Login failed');
            }
        } else {
            // Fallback for development
            localStorage.setItem('gba_parent_auth_token', 'valid_token_' + Date.now());
            localStorage.setItem('gba_user_email', email);
            setTimeout(() => {
                document.getElementById('portal-login').style.display = 'none';
                document.getElementById('portal-dashboard').style.display = 'flex';
                updateDashboardProfile(email);
            }, 800);
        }
    } catch (error) {
        console.error('Login error:', error);
        if (errorMsg) {
            errorMsg.textContent = error.message || 'Login failed. Please check your credentials.';
            errorMsg.style.display = 'block';
        }
        btn.innerHTML = 'Sign In';
        btn.disabled = false;
    }
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
    if (window.auth) window.auth.logout();
    document.getElementById('portal-dashboard').style.display = 'none';
    document.getElementById('portal-login').style.display = 'flex';
    document.querySelector('.login-form').reset();
    document.querySelector('.login-form button[type="submit"]').innerHTML = 'Sign In';
    document.getElementById('login-greeting').textContent = 'Guest';
}

// --- Navigation Logic (V3 Side Panel) ---

window.switchPortalView = function (viewName, linkElement) {
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

    if (viewName === 'tuition') {
        renderParentTrips();
    }

    if (viewName === 'training') {
        renderTrainingDashboard();
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
    document.getElementById('modal-title').textContent = getTitleFromType(type);

    // Inject Dynamic Data
    const pName = localStorage.getItem('gba_parent_name') || 'Parent Name';
    const cName = localStorage.getItem('gba_child_name') || 'Athlete Name';

    let content = DOCUMENT_TEMPLATE[type];
    content = content.replace(/{parent_name}/g, pName).replace(/{child_name}/g, cName);

    document.getElementById('modal-content').innerHTML = content;

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
        submitBtn.addEventListener('click', () => {
            submitBtn.innerHTML = 'Signing...';
            setTimeout(() => {
                markDocumentSigned(currentDocType);
                closeDocModal();
                alert(getTitleFromType(currentDocType) + ' Signed Successfully!');
            }, 1000);
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
            listContainer.innerHTML = '<p class="text-muted">No athlete found linked to your account.</p>';
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
    if (attendanceEl) attendanceEl.textContent = '100%'; // Placeholder logic
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
    document.getElementById('settings-parent-name').value = localStorage.getItem('gba_parent_name') || '';
    document.getElementById('settings-parent-email').value = email || '';
    document.getElementById('settings-parent-phone').value = localStorage.getItem('gba_parent_phone') || '';

    // Athlete Info (From DB if linked, else LocalStorage fallback)
    if (linkedAthlete) {
        document.getElementById('settings-athlete-name').value = linkedAthlete.name;
        document.getElementById('settings-athlete-team').value = linkedAthlete.teamId;
        document.getElementById('settings-athlete-dob').value = linkedAthlete.dob || '';
    } else {
        document.getElementById('settings-athlete-name').value = localStorage.getItem('gba_child_name') || '';
        document.getElementById('settings-athlete-team').value = localStorage.getItem('gba_child_team') || '';
        document.getElementById('settings-athlete-dob').value = localStorage.getItem('gba_child_dob') || '';
    }
}

function handleSettingsSave() {
    const email = document.getElementById('settings-parent-email').value;
    const pName = document.getElementById('settings-parent-name').value;
    const pPhone = document.getElementById('settings-parent-phone').value;

    // Athlete Inputs
    const cName = document.getElementById('settings-athlete-name').value.trim();
    const cTeam = document.getElementById('settings-athlete-team').value;
    const cDob = document.getElementById('settings-athlete-dob').value;

    if (!email) {
        alert('Error: No email found. Please sign in again.');
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
    btn.style.background = '#34C759'; // Success Green
    btn.disabled = true;

    setTimeout(() => {
        btn.innerText = originalText;
        btn.style.background = ''; // Reset
        btn.disabled = false;
    }, 2000);
}
// --- Gear & Uniform Logic ---

window.submitGearOrder = function () {
    const email = document.getElementById('settings-parent-email').value || localStorage.getItem('gba_user_email');
    if (!email) {
        alert("Please sign in to submit an order.");
        return;
    }

    // 1. Collect Data
    const jerseySize = document.querySelector('#view-gear .gear-item:nth-child(2) select').value;
    const jerseyQty = document.querySelector('#view-gear .gear-item:nth-child(2) input[type="number"]').value;

    const shortsSize = document.querySelector('#view-gear .gear-item:nth-child(3) select').value;
    const shortsQty = document.querySelector('#view-gear .gear-item:nth-child(3) input[type="number"]').value;

    const shirtSize = document.querySelector('#view-gear .gear-item:nth-child(4) select').value;
    const shirtQty = document.querySelector('#view-gear .gear-item:nth-child(4) input[type="number"]').value;

    const backpackName = document.querySelector('#view-gear .gear-item:nth-child(5) input[type="text"]').value;
    const backpackChecked = document.querySelector('#view-gear .gear-item:nth-child(5) input[type="checkbox"]').checked;

    // 2. Create Order Object
    const order = {
        orderId: 'ORD-' + Date.now(),
        parentId: email,
        date: new Date().toISOString(),
        items: [
            { id: 'jersey', name: 'Game Jersey', size: jerseySize, qty: jerseyQty },
            { id: 'shorts', name: 'Game Shorts', size: shortsSize, qty: shortsQty },
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

    // 4. UI Feedback
    const btn = document.querySelector('#view-gear button');
    const originalText = btn.innerText;

    btn.innerText = 'Order Request Sent ✓';
    btn.style.background = '#34C759'; // Success Green
    btn.disabled = true;

    alert(`Order for ${email} has been submitted to the team admin.`);

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
async function renderTrainingDashboard() {
    const parentEmail = localStorage.getItem('gba_user_email');
    /* if (!parentEmail) {
         console.warn('No parent email found');
         return;
     } */
    // For demo "tomorrow", even if no email, show mock data

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

                return `
                <div class="session-card" style="display:flex; justify-content:space-between; align-items:center; padding:12px 16px; background:#f9fafb; border-radius:8px; margin-bottom:8px; border:1px solid #eee;">
                    <div>
                        <div style="font-weight:700; color:#111; font-size:14px;">${new Date(sess.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} @ ${sess.time}</div>
                        <div style="font-size:12px; color:#666;">${sess.program} • ${sess.topic}</div>
                    </div>
                    <div style="text-align:right;">
                        <span style="font-size:11px; padding:4px 8px; background:${badgeBg}; color:${badgeColor}; border-radius:12px; font-weight:600;">${badgeText}</span>
                    </div>
                </div>
            `}).join('');
        }

        // B. Past Usage Logs (User Specific)
        if (userRecord && userRecord.logs && userRecord.logs.length > 0) {
            content += `<h4 style="margin: 24px 0 12px 0; font-size: 14px; color: #444; font-weight: 600; text-transform:uppercase; letter-spacing:0.5px;">Session History</h4>`;
            content += userRecord.logs.map(log => `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 16px; background:#fff; border-radius:8px; margin-bottom:8px; border:1px solid #eee;">
                     <div>
                        <div style="font-weight:600; color:#111; font-size:13px;">${log.activity}</div>
                        <div style="font-size:11px; color:#666;">${new Date(log.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} • ${log.notes}</div>
                    </div>
                    <div style="font-weight:700; color:#444; font-size:13px;">-${log.time}</div>
                </div>
            `).join('');
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
                    <button onclick="viewTrainingStatement('${safeEmail}')" class="btn-primary" style="padding: 6px 12px; font-size: 10px; width: auto; display: inline-block; text-decoration: none; line-height:1.2; border:none; cursor:pointer;">View Receipt</button>
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
                <a href="${safeLink}" class="btn-primary" style="padding: 6px 12px; font-size: 10px; width: auto; display: inline-block; text-decoration: none; line-height:1.2;">Download</a>
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
            const { data: parentAccount } = await supabase.from('parent_accounts').select('id').eq('email', parentEmail).single();
            if (parentAccount) {
                const { data: purchases } = await supabase.from('training_purchases').select('hours_purchased, hours_used').eq('parent_id', parentAccount.id).eq('status', 'active');
                if (purchases) {
                    totalPurchased = purchases.reduce((sum, p) => sum + (parseFloat(p.hours_purchased) || 0), 0);
                    totalUsed = purchases.reduce((sum, p) => sum + (parseFloat(p.hours_used) || 0), 0);
                }
            }
        } catch (e) { console.error(e); }
    }

    // Fallback to Mock Data
    if (totalPurchased === 0 && db.training) {
        totalPurchased = db.training.hours.totalPurchased;
        totalUsed = db.training.hours.used;
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
    const hoursRemainingEl = document.getElementById('hours-remaining');
    const hoursPurchasedEl = document.getElementById('hours-purchased');
    const hoursUsedEl = document.getElementById('hours-used');
    const progressFillEl = document.getElementById('hours-progress-fill');

    if (hoursRemainingEl) {
        hoursRemainingEl.textContent = hoursData.remaining.toFixed(1);

        // --- NEW: User-Specific Usage & Purchase History ---
        const db = getDB();
        const userRecords = db.trainingRecords ? db.trainingRecords[parentEmail] : null;

        if (userRecords) {
            // Overwrite details if user record exists
            hoursRemainingEl.textContent = userRecords.hours.remaining.toFixed(1);
            if (hoursPurchasedEl) hoursPurchasedEl.textContent = userRecords.hours.totalPurchased; // if element exists (might not)

            // Also update the main dashboard display elements if they differ
            if (document.getElementById('training-hours-display')) {
                document.getElementById('training-hours-display').textContent = userRecords.hours.remaining.toFixed(1);
            }
            if (document.getElementById('training-utilized-display')) {
                document.getElementById('training-utilized-display').textContent = userRecords.hours.used.toFixed(1);
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
                const safeLogs = userRecords.logs.map(log => {
                    const safeActivity = escapeHTML(log.activity || '');
                    const safeDate = escapeHTML(log.date || '');
                    const safeTime = escapeHTML(log.time || '');
                    return `
                    <div style="display:flex; justify-content:space-between; padding:10px; background:#fff; border:1px solid #eee; border-radius:8px; margin-bottom:8px;">
                        <div>
                            <div style="font-weight:600; font-size:13px;">${safeActivity}</div>
                            <div style="font-size:11px; color:#666;">${safeDate}</div>
                        </div>
                        <div style="font-weight:600; color:#444;">${safeTime}</div>
                    </div>
                `;
                }).join('');
                logDiv.innerHTML = '<h4 style="margin-bottom:10px; font-size:14px; color:#444;">Session History</h4>' + safeLogs;
                calendarContainer.parentNode.insertBefore(logDiv, calendarContainer.nextSibling);
            }

            // Receipts
            const docsContainer = document.getElementById('training-documents-list');
            if (docsContainer && userRecords.purchases) {
                const purchaseHtml = userRecords.purchases.map(p => `
                    <div class="doc-item" style="display:flex; align-items:center; gap:12px; padding:12px; border-bottom:1px solid #f0f0f0; background:#f9fafb;">
                        <div style="background:#dcfce7; color:#166534; width:32px; height:32px; display:flex; align-items:center; justify-content:center; border-radius:6px; font-size:14px; font-weight:700;">$</div>
                        <div style="flex:1;">
                            <div style="font-size:13px; font-weight:600;">Receipt: ${p.item}</div>
                            <div style="font-size:11px; color:#888;">${p.date} • ${p.amount} • ${p.status}</div>
                        </div>
                        <a href="${p.link}" onclick="alert('Receipt View Placeholder'); return false;" style="font-size:11px; color:#2563eb; font-weight:600; text-decoration:none;">View PDF</a>
                    </div>
                `).join('');
                docsContainer.insertAdjacentHTML('afterbegin', purchaseHtml);
            }
        }

        // Add warning class if low hours
        if (hoursData.remaining < 5) {
            hoursRemainingEl.parentElement.style.background = 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)';
        }
    }

    if (hoursPurchasedEl) hoursPurchasedEl.textContent = hoursData.purchased.toFixed(1);
    if (hoursUsedEl) hoursUsedEl.textContent = hoursData.used.toFixed(1);
    if (progressFillEl) progressFillEl.style.width = `${hoursData.progressPercent}%`;
}

/**
 * Load session counts (completed and upcoming)
 */
async function loadSessionCounts(parentEmail) {
    const supabase = window.auth?.getSupabaseClient?.();
    const db = getDB();

    const athletes = (db.roster || []).filter(a => a.parentId === parentEmail);
    let completedCount = 0;
    let upcomingCount = 0;

    if (supabase && window.auth?.isSupabaseAvailable?.()) {
        try {
            const { data: parentAccount } = await supabase
                .from('parent_accounts')
                .select('id')
                .eq('email', parentEmail)
                .single();

            if (parentAccount) {
                const athleteIds = athletes.map(a => a.athleteId);

                // Get completed sessions (attendance records)
                const { data: purchases } = await supabase
                    .from('training_purchases')
                    .select('id')
                    .eq('parent_id', parentAccount.id)
                    .in('athlete_id', athleteIds);

                if (purchases && purchases.length > 0) {
                    const purchaseIds = purchases.map(p => p.id);
                    const { data: attendance } = await supabase
                        .from('training_attendance')
                        .select('id')
                        .in('purchase_id', purchaseIds);

                    completedCount = attendance ? attendance.length : 0;
                }

                // Get upcoming sessions
                const { data: enrollments } = await supabase
                    .from('player_enrollments')
                    .select('program_id')
                    .eq('parent_id', parentAccount.id)
                    .in('athlete_id', athleteIds)
                    .eq('status', 'active');

                if (enrollments && enrollments.length > 0) {
                    const programIds = enrollments.map(e => e.program_id);
                    const today = new Date().toISOString().split('T')[0];
                    const { data: sessions } = await supabase
                        .from('training_sessions')
                        .select('id')
                        .in('program_id', programIds)
                        .gte('session_date', today)
                        .eq('status', 'scheduled');

                    upcomingCount = sessions ? sessions.length : 0;
                }
            }
        } catch (error) {
            console.error('Error loading session counts:', error);
        }
    }

    // 1. Update Top Stats
    const completedEl = document.getElementById('sessions-completed');
    const upcomingEl = document.getElementById('sessions-upcoming');

    // Note: userRecord and data.upcomingSessions are not defined in this scope.
    // Assuming 'userRecord' refers to 'db.trainingRecords[parentEmail]' and 'data.upcomingSessions' is a placeholder for 'upcomingCount'.
    // The instruction implies using these variables, but they are not available in the current function's scope.
    // To faithfully apply the instruction, the code will be inserted as provided, which might lead to runtime errors if these variables are not globally accessible or passed.
    const userRecord = db.trainingRecords ? db.trainingRecords[parentEmail] : null; // Define userRecord for this scope
    const data = { upcomingSessions: [] }; // Placeholder for data, assuming upcomingCount is the intended value
    data.upcomingSessions = Array(upcomingCount).fill(0); // Populate placeholder based on calculated upcomingCount

    if (completedEl) completedEl.textContent = (userRecord && userRecord.logs) ? userRecord.logs.length : 0;
    if (upcomingEl) upcomingEl.textContent = data.upcomingSessions ? data.upcomingSessions.length : 0;
}

/**
 * Load training calendar filtered by athlete's training days
 */
async function loadTrainingCalendar(parentEmail) {
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
            option.value = athlete.athleteId;
            option.textContent = athlete.name;
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
            const { data: parentAccount } = await supabase
                .from('parent_accounts')
                .select('id')
                .eq('email', parentEmail)
                .single();

            if (parentAccount) {
                const athleteIds = athletes.map(a => a.athleteId);
                const { data: enrollments } = await supabase
                    .from('player_enrollments')
                    .select('program_id, enrolled_sessions')
                    .eq('parent_id', parentAccount.id)
                    .in('athlete_id', athleteIds)
                    .eq('status', 'active');

                if (enrollments) {
                    enrolledPrograms = enrollments.map(e => e.program_id);
                }
            }
        } catch (error) {
            console.error('Error loading enrollments:', error);
        }
    } else {
        // Fallback: get from roster active_enrollments
        athletes.forEach(athlete => {
            if (athlete.active_enrollments) {
                enrolledPrograms.push(...athlete.active_enrollments);
            }
        });
    }

    // Store enrolled programs for calendar filtering
    window.trainingEnrolledPrograms = enrolledPrograms;
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
    const db = getDB();
    const supabase = window.auth?.getSupabaseClient?.();
    const container = document.getElementById('skills-programs-list');

    if (!container) return;

    const athletes = (db.roster || []).filter(a => a.parentId === parentEmail);
    let programs = [];

    if (supabase && window.auth?.isSupabaseAvailable?.()) {
        try {
            const { data: parentAccount } = await supabase
                .from('parent_accounts')
                .select('id')
                .eq('email', parentEmail)
                .single();

            if (parentAccount) {
                const athleteIds = athletes.map(a => a.athleteId);
                const { data: enrollments } = await supabase
                    .from('player_enrollments')
                    .select('*, training_packages(name, description, program_type)')
                    .eq('parent_id', parentAccount.id)
                    .in('athlete_id', athleteIds)
                    .eq('status', 'active');

                if (enrollments) {
                    programs = enrollments;
                }
            }
        } catch (error) {
            console.error('Error loading skills programs:', error);
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
        container.innerHTML = '<div style="text-align: center; padding: 40px; color: #888;"><p>No active skills programs found.</p></div>';
        return;
    }

    let html = '';
    programs.forEach(program => {
        const athlete = athletes.find(a => a.athleteId === program.athlete_id);
        html += `
            <div style="background: #f9f9f9; border-radius: 12px; padding: 20px; margin-bottom: 16px;">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
                    <div>
                        <h4 style="font-size: 18px; font-weight: 600; margin-bottom: 4px;">${program.program_name || program.program_id}</h4>
                        <p style="font-size: 14px; color: #666;">${athlete ? athlete.name : 'Unknown Athlete'}</p>
                    </div>
                    <span style="background: #10b981; color: white; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600;">Active</span>
                </div>
                ${program.start_date ? `<div style="font-size: 14px; color: #666; margin-top: 8px;">Started: ${new Date(program.start_date).toLocaleDateString()}</div>` : ''}
            </div>
        `;
    });

    container.innerHTML = html;

    // Update active programs count
    const activeProgramsEl = document.getElementById('active-programs');
    if (activeProgramsEl) activeProgramsEl.textContent = programs.length;
}

/**
 * Load receipts for the parent
 */
async function loadReceipts(parentEmail) {
    const supabase = window.auth?.getSupabaseClient?.();
    const container = document.getElementById('receipts-list');

    if (!container) return;

    let receipts = [];

    if (supabase && window.auth?.isSupabaseAvailable?.()) {
        try {
            const { data: parentAccount } = await supabase
                .from('parent_accounts')
                .select('id')
                .eq('email', parentEmail)
                .single();

            if (parentAccount) {
                const { data } = await supabase
                    .from('receipts')
                    .select('*')
                    .eq('parent_id', parentAccount.id)
                    .order('payment_date', { ascending: false })
                    .limit(5);

                if (data) receipts = data;
            }
        } catch (error) {
            console.error('Error loading receipts:', error);
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
        container.innerHTML = '<div style="text-align: center; padding: 20px; color: #888;"><p>No receipts found.</p></div>';
        return;
    }

    let html = '';
    receipts.forEach(receipt => {
        html += `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 16px; background: #f9f9f9; border-radius: 8px;">
                <div>
                    <div style="font-weight: 600; margin-bottom: 4px;">Receipt #${receipt.receipt_number || receipt.transaction_id}</div>
                    <div style="font-size: 14px; color: #666;">${new Date(receipt.payment_date).toLocaleDateString()}</div>
                </div>
                <div style="text-align: right;">
                    <div style="font-weight: 600; margin-bottom: 4px;">$${parseFloat(receipt.amount).toFixed(2)}</div>
                    <button onclick="generateReceiptPDF('${receipt.receipt_number || receipt.transaction_id}')" class="btn-text" style="font-size: 12px; color: #2563eb;">Download</button>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

/**
 * Load invoices for the parent
 */
async function loadInvoices(parentEmail) {
    const supabase = window.auth?.getSupabaseClient?.();
    const container = document.getElementById('invoices-list');

    if (!container) return;

    let invoices = [];

    if (supabase && window.auth?.isSupabaseAvailable?.()) {
        try {
            const { data: parentAccount } = await supabase
                .from('parent_accounts')
                .select('id')
                .eq('email', parentEmail)
                .single();

            if (parentAccount) {
                const { data } = await supabase
                    .from('invoices')
                    .select('*')
                    .eq('parent_id', parentAccount.id)
                    .order('issue_date', { ascending: false })
                    .limit(5);

                if (data) invoices = data;
            }
        } catch (error) {
            console.error('Error loading invoices:', error);
        }
    }

    if (invoices.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 20px; color: #888;"><p>No invoices found.</p></div>';
        return;
    }

    let html = '';
    invoices.forEach(invoice => {
        const statusColor = invoice.status === 'paid' ? '#10b981' : invoice.status === 'overdue' ? '#ef4444' : '#f59e0b';
        html += `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 16px; background: #f9f9f9; border-radius: 8px;">
                <div>
                    <div style="font-weight: 600; margin-bottom: 4px;">Invoice #${invoice.invoice_number}</div>
                    <div style="font-size: 14px; color: #666;">Due: ${new Date(invoice.due_date).toLocaleDateString()}</div>
                </div>
                <div style="text-align: right;">
                    <div style="font-weight: 600; margin-bottom: 4px;">$${parseFloat(invoice.total_amount).toFixed(2)}</div>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <span style="background: ${statusColor}; color: white; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600;">${invoice.status.toUpperCase()}</span>
                        <button onclick="generateInvoicePDF('${invoice.invoice_number}')" class="btn-text" style="font-size: 12px; color: #2563eb;">Download</button>
                    </div>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
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
        alert('No training record found for this user.');
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
                .logo span { color: #2563eb; }
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
                .print-btn { display: inline-block; background: #2563eb; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px; margin-bottom: 20px; cursor: pointer; }
                @media print { .print-btn { display: none; } }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="logo">GODSPEED<span>ACADEMY</span></div>
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
                    <span class="stat-val" style="color: #2563eb;">${record.hours.remaining.toFixed(1)}</span>
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
