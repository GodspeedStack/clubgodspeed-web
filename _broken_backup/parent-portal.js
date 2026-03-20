/**
 * Parent Portal Logic
 * Handles Waiver Signing (Canvas), Navigation (V3 Side Panel), and Authentication.
 */

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

function handleLogin() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const btn = document.querySelector('.login-form button[type="submit"]');

    if (email && password) {
        btn.innerHTML = 'Signing In...';
        if (window.auth) window.auth.login(email);

        setTimeout(() => {
            document.getElementById('portal-login').style.display = 'none';
            document.getElementById('portal-dashboard').style.display = 'flex'; // V3 Flex Layout
            updateDashboardProfile(email);
        }, 800);
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
    console.log('Switching to view:', viewName); // Debug

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

        card.innerHTML = `
            <h3 style="font-size: 18px; margin-bottom: 16px;">${trip.name}</h3>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px;">
                <div style="background: #eef2ff; padding: 12px; border-radius: 8px;">
                    <div style="font-size: 0.8rem; color: #0071e3; font-weight: 600; margin-bottom: 4px;">DATES</div>
                    <div style="font-weight: 500;">${trip.start || 'TBD'} - ${trip.end || 'TBD'}</div>
                </div>
                <div style="background: #eef2ff; padding: 12px; border-radius: 8px;">
                     <div style="font-size: 0.8rem; color: #0071e3; font-weight: 600; margin-bottom: 4px;">TUITION</div>
                    <div style="font-weight: 500;">$${trip.fee || '0'}</div>
                </div>
            </div>
            
            <div style="margin-bottom: 20px;">
                <div style="font-weight: 600; margin-bottom: 8px;">Location & Details</div>
                <p style="font-size: 0.9rem; color: #666; margin-bottom: 12px; white-space: pre-wrap; line-height: 1.5;">${trip.location || 'Details pending...'}</p>
            </div>
            
            ${canPay ? `
            <div style="border-top: 1px solid #eee; padding-top: 16px;">
                 <a href="${trip.paymentLink}" target="_blank" class="btn-primary" 
                    style="display:block; text-align:center; text-decoration:none; background:#0071e3; color:white; padding:12px; border-radius:8px; width:100%; font-weight:600;">
                    Pay Tuition ($${trip.fee})
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
    console.log('Opening modal for:', type);
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
        document.getElementById('performance-grade-list').innerHTML = '<p class="text-muted">No athlete found linked to your account.</p>';
        return;
    }

    // 2. Get Grades
    const grades = db.grades.filter(g => g.athleteId === child.athleteId).sort((a, b) => new Date(b.date) - new Date(a.date)); // Newest first

    // 3. Render List
    const listContainer = document.getElementById('performance-grade-list');

    if (grades.length === 0) {
        listContainer.innerHTML = '<p style="color: #888;">No grades recorded yet. Check back after next practice.</p>';
        document.getElementById('stat-gpa').textContent = '-';
        document.getElementById('stat-attendance').textContent = '0%';
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
    document.getElementById('stat-gpa').textContent = overallGpa;

    // Mock Attendance (Grades count vs Expected)
    // Simple logic: 1 grade = 1 attendance point for now
    document.getElementById('stat-attendance').textContent = '100%'; // Placeholder logic
}

// Hook into View Switching to load data when tab is clicked
const originalSwitch = window.switchPortalView;
window.switchPortalView = function (viewName, linkElement) {
    originalSwitch(viewName, linkElement);
    const email = document.getElementById('email').value || localStorage.getItem('gba_user_email'); // Fallback to stored

    if (viewName === 'performance') {
        if (email) loadPerformance(email);
    } else if (viewName === 'settings') {
        loadSettings(email);
    }
}

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
