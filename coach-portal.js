console.log("LOGIN SCRIPT LOADED - VERSION 21");

// =====================================================
// SECURITY UTILITIES - XSS Prevention
// =====================================================
/**
 * Escape HTML entities to prevent XSS attacks
 * @param {string} str - String to escape
 * @returns {string} - Escaped string safe for HTML
 */
function escapeHTML(str) {
    if (typeof str !== 'string') {
        if (str === null || str === undefined) return '';
        return String(str);
    }
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
        '/': '&#x2F;'
    };
    return str.replace(/[&<>"'/]/g, m => map[m]);
}

/**
 * Validate and sanitize URL to prevent javascript: and data: protocols
 * @param {string} url - URL to validate
 * @returns {string|null} - Sanitized URL or null if invalid
 */
function validateURL(url) {
    if (typeof url !== 'string') return null;
    const trimmed = url.trim();
    // Block dangerous protocols
    const lowerTrimmed = trimmed.toLowerCase();
    if (lowerTrimmed.startsWith('javascript:') || 
        lowerTrimmed.startsWith('data:') ||
        lowerTrimmed.startsWith('vbscript:') ||
        lowerTrimmed.startsWith('on')) {
        return null;
    }
    // Allow safe protocols
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

/**
 * Sanitize text for safe display (escapes HTML)
 * @param {any} value - Value to sanitize
 * @returns {string} - Sanitized string
 */
function sanitizeText(value) {
    if (value === null || value === undefined) return '';
    return escapeHTML(String(value));
}

/**
 * Safe way to set text content (prevents XSS)
 * @param {HTMLElement} element - Element to set text on
 * @param {any} text - Text to set
 */
function setSafeText(element, text) {
    if (!element) return;
    element.textContent = text === null || text === undefined ? '' : String(text);
}

function getElement(id) {
    return document.getElementById(id);
}

function setDisplay(element, value) {
    if (element) {
        element.style.display = value;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Attach Login Listener
    const loginForm = document.getElementById('staff-login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            handleCoachLogin();
        });
    } else {
        console.error("Login form not found");
    }
});

// Global State for Analytics
window.currentRosterState = { data: [] };

// 1. Auth Logic - Enhanced with Supabase Auth support
window.handleCoachLogin = async function () {
    console.log("Login Attempt Started - handleCoachLogin called");

    const codeInput = document.getElementById('coach-code');
    const code = codeInput ? codeInput.value.trim() : '';

    if (!code) {
        godspeedAlert("Please enter an access code.", "GODSPEED BASKETBALL");
        return;
    }

    // Check rate limiting
    if (window.Security && window.Security.RateLimiter) {
        const identifier = code || 'unknown';
        const rateCheck = window.Security.RateLimiter.check('coach_login', identifier);
        if (!rateCheck.allowed) {
            godspeedAlert(rateCheck.message || "Too many attempts. Please try again later.", "GODSPEED BASKETBALL");
            return;
        }
        window.Security.RateLimiter.recordAttempt('coach_login', identifier);
    }

    // Try Supabase Auth first (if available and code looks like email)
    const isEmailFormat = code.includes('@');
    if (isEmailFormat && window.auth && window.auth.isSupabaseAvailable && window.auth.isSupabaseAvailable()) {
        try {
            // For Supabase, we need email + password
            // If code is email, prompt for password
            const password = prompt('Enter your password:');
            if (!password) {
                if (window.Security && window.Security.RateLimiter) {
                    window.Security.RateLimiter.reset('coach_login', code);
                }
                return;
            }

            // Use SecureAuth if available
            let result;
            if (window.Security && window.Security.SecureAuth) {
                result = await window.Security.SecureAuth.login(code, password);
            } else {
                const success = await window.auth.login(code, password);
                result = { success };
            }

            if (result.requires2FA) {
                const twoFactorCode = prompt('Enter 6-digit 2FA code:');
                if (twoFactorCode) {
                    result = await window.Security.SecureAuth.login(code, password, twoFactorCode);
                } else {
                    throw new Error('2FA code required');
                }
            }

            if (result.success) {
                // Get user role
                const user = await window.auth.getCurrentUser();
                const role = user?.user_metadata?.role || 'coach';

                // Verify role is coach or admin
                if (role !== 'coach' && role !== 'admin') {
                    await window.auth.logout();
                    throw new Error('Access denied. Coach or admin role required.');
                }

                // Store role
                if (window.Security && window.Security.RBAC) {
                    window.Security.RBAC.setRole(role);
                } else {
                    localStorage.setItem('gba_user_role', role);
                }
                localStorage.setItem('isCoachLoggedIn', 'true');
                localStorage.setItem('gba_user_email', code);
                localStorage.setItem('gba_user_id', user?.id || '');

                // Reset rate limit
                if (window.Security && window.Security.RateLimiter) {
                    window.Security.RateLimiter.reset('coach_login', code);
                }

                // Show dashboard
                const loginView = document.getElementById('coach-login');
                const dashboardView = document.getElementById('coach-dashboard');
                if (loginView && dashboardView) {
                    loginView.style.display = 'none';
                    dashboardView.style.display = 'flex';
                    initDashboard();
                }
                return;
            }
        } catch (error) {
            console.error('Supabase auth failed, trying fallback:', error);
            // Fall through to hash-based fallback
        }
    }

    // Fallback: Hash-based authentication (backward compatibility)
    async function sha256(message) {
        const msgBuffer = new TextEncoder().encode(message);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    const adminHash = "e5792d476100987627a696348842af5832a87383a152da862db8068755034371"; // G0DSP33D_ADMIN!
    const coachHash = "c7d74026858a7065971488c9ae8729577782b534b829af4666f777176461ba16"; // G0DSP33D_EL1T3!

    const hash = await sha256(code);
    let role = null;
    
    if (hash === adminHash) {
        role = 'admin';
    } else if (hash === coachHash) {
        role = 'coach';
    } else {
        godspeedAlert("Access Denied. Invalid Code.", "GODSPEED BASKETBALL");
        if (codeInput) {
            codeInput.value = '';
            codeInput.focus();
        }
        return;
    }

    // Store Role with RBAC
    if (window.Security && window.Security.RBAC) {
        window.Security.RBAC.setRole(role);
    } else {
        localStorage.setItem('gba_user_role', role);
    }
    localStorage.setItem('isCoachLoggedIn', 'true');

    // Reset rate limit on success
    if (window.Security && window.Security.RateLimiter) {
        window.Security.RateLimiter.reset('coach_login', code);
    }

    const loginView = document.getElementById('coach-login');
    const dashboardView = document.getElementById('coach-dashboard');

    if (loginView && dashboardView) {
        loginView.style.display = 'none';
        dashboardView.style.display = 'flex';
        initDashboard();
    } else {
        godspeedAlert("Critical Error: Dashboard views not found.", "Error");
    }
}

async function logoutCoach() {
    // Logout from Supabase if available
    if (window.auth && window.auth.logout) {
        await window.auth.logout();
    }
    
    localStorage.removeItem('gba_user_role');
    localStorage.removeItem('isCoachLoggedIn');
    localStorage.removeItem('gba_user_email');
    localStorage.removeItem('gba_user_id');
    
    setDisplay(getElement('coach-dashboard'), 'none');
    setDisplay(getElement('coach-login'), 'flex');
    
    // Clear code input
    const codeInput = getElement('coach-code');
    if (codeInput) codeInput.value = '';
}



// 2. Dashboard Init
// Security: Check permissions before allowing dashboard access
function checkCoachPermissions() {
    if (window.Security && window.Security.RBAC) {
        try {
            window.Security.RBAC.requirePermission('view_coach_portal');
            return true;
        } catch (error) {
            godspeedAlert('You do not have permission to access the coach portal.', 'Access Denied');
            logoutCoach();
            return false;
        }
    }
    return true; // Allow if security system not loaded
}

function initDashboard() {
    // Check permissions before initializing
    if (!checkCoachPermissions()) {
        return;
    }
    const db = getDB(); // From portal-data.js
    const list = document.getElementById('team-list');
    const userRole = localStorage.getItem('gba_user_role') || 'coach';
    list.innerHTML = '';

    // Group teams by category
    const teamsByCategory = db.teams.reduce((acc, team) => {
        const cat = team.category || 'Other';
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(team);
        return acc;
    }, {});

    // Define Category Order
    const categoryOrder = ['10U Development', '10U Gold', '10U Elite'];

    // Helper for colors
    const getColor = (name) => {
        if (name.includes('Red')) return '#ff3b30';
        if (name.includes('Blue')) return '#2563eb';
        if (name.includes('Black')) return '#1d1d1f';
        if (name.includes('Green')) return '#34c759';
        if (name.includes('White')) return '#e5e5e5';
        return '#888';
    };

    // Render Groups
    Object.keys(teamsByCategory).sort((a, b) => {
        const idxA = categoryOrder.indexOf(a);
        const idxB = categoryOrder.indexOf(b);
        // Put unknown categories at the end
        if (idxA === -1) return 1;
        if (idxB === -1) return -1;
        return idxA - idxB;
    }).forEach(category => {
        // Create Details/Summary Group
        const group = document.createElement('div');
        group.className = 'sidebar-group';

        const details = document.createElement('details');
        details.open = true; // Default open

        const summary = document.createElement('summary');
        summary.textContent = category;
        details.appendChild(summary);

        // Teams in Category
        teamsByCategory[category].forEach(team => {
            const item = document.createElement('div');
            item.className = 'team-nav-item';

            // Clean Name: "10U Development Red" -> "Red"
            let displayName = team.name;
            if (displayName.startsWith(category)) {
                displayName = displayName.replace(category, '').trim();
            }

            // Dot
            const dot = document.createElement('span');
            dot.className = 'team-dot';
            dot.style.backgroundColor = getColor(team.name);
            if (team.name.includes('White')) dot.style.border = '1px solid #ccc';

            item.appendChild(dot);

            // Name Wrapper (flex grow)
            const nameSpan = document.createElement('span');
            nameSpan.textContent = displayName;
            nameSpan.style.flex = '1';
            item.appendChild(nameSpan);

            // Player Count
            const playerCount = db.roster.filter(p => p.teamId === team.id).length;
            if (playerCount > 0) {
                const countBadge = document.createElement('span');
                countBadge.className = 'team-count-badge';
                countBadge.textContent = playerCount;
                item.appendChild(countBadge);
            }

            item.onclick = () => loadTeamRoster(team.id, item);
            details.appendChild(item);
        });

        group.appendChild(details);
        list.appendChild(group);
    });

    // Add Admin Section (RBAC: Admin Only)
    if (userRole === 'admin') {
        const adminGroup = document.createElement('div');
        adminGroup.className = 'sidebar-group';
        adminGroup.style.marginTop = '2rem';
        adminGroup.style.borderTop = '1px solid rgba(0,0,0,0.05)';
        adminGroup.style.paddingTop = '1rem';

        adminGroup.innerHTML = `
            <div class="sidebar-title">Organization</div>
            <div class="team-nav-item" onclick="switchTeamView('accounts', this)">
                <div style="width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; background: #E5E5EA; border-radius: 6px; margin-right: 4px;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: #1c1c1e;"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                </div>
                <span style="flex: 1; font-weight: 500;">Accounts</span>
            </div>
        `;
        list.appendChild(adminGroup);
    }
}

// 3. Load Roster (Table View)
function loadTeamRoster(teamId, navItem) {
    const db = getDB();
    const team = db.teams.find(t => t.id === teamId);

    // Update Active State
    document.querySelectorAll('.team-nav-item').forEach(el => el.classList.remove('active'));
    if (navItem) navItem.classList.add('active');

    // Update Header
    document.getElementById('view-title').textContent = team ? team.name : 'Dashboard';

    // Get Athletes
    const athletes = db.roster.filter(p => p.teamId === teamId);

    // Update global state for analytics
    window.currentRosterState.data = athletes;
    window.currentTeamId = teamId;

    // Show View Tabs
    const tabs = document.getElementById('view-tabs');
    if (tabs) tabs.style.display = 'flex';

    const container = document.getElementById('roster-table-container');

    if (athletes.length === 0) {
        container.innerHTML = '<div style="padding: 2rem; text-align: center;">No athletes found for this team.</div>';
        return;
    }

    // iOS List Group / Table Header
    let html = `
        <!-- Godspeed IQ CTA Banner -->
        <div style="background: linear-gradient(135deg, #000000 0%, #1c1c1e 100%); border-radius: 18px; padding: 24px; margin-bottom: 32px; color: white; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 10px 30px rgba(0,0,0,0.15); border: 1px solid rgba(255,255,255,0.1);">
            <div>
                <div style="font-size: 11px; font-weight: 700; color: #FFD60A; text-transform: uppercase; margin-bottom: 6px; letter-spacing: 0.1em; display: flex; align-items: center; gap: 6px;">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg> 
                    AI INSIGHTS AVAILABLE
                </div>
                <h3 style="margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.01em; color: #FFFFFF;">Roster Intelligence</h3>
                <p style="margin: 6px 0 0 0; font-size: 14px; color: #a1a1a6; font-weight: 400; max-width: 400px;">Analyze rotation gaps, momentum distincts, and performance trends.</p>
            </div>
            <button onclick="switchTeamView('analytics')" style="background: rgba(255,255,255,0.1); backdrop-filter: blur(10px); color: white; border: 1px solid rgba(255,255,255,0.2); padding: 10px 20px; border-radius: 20px; font-weight: 600; font-size: 13px; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 8px;">
                Open War Room
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </button>
        </div>

        <div style="background: white; border-radius: 24px; border: 1px solid rgba(0,0,0,0.06); overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.03);">
            <div style="display: flex; padding: 14px 24px; background: rgba(249, 249, 249, 0.8); backdrop-filter: blur(10px); border-bottom: 1px solid rgba(0,0,0,0.05); font-size: 11px; font-weight: 600; text-transform: uppercase; color: #86868b; letter-spacing: 0.05em;">
                <div style="flex: 3;">Athlete & Focus</div>
                <div style="flex: 1.5;">Status</div>
                <div style="flex: 0 0 60px; text-align: right;">Share</div>
            </div>
            <div style="display: flex; flex-direction: column;">
    `;

    // Helper Functions for iOS UI (embedded)
    const getTierBadgeStyle = (tier) => {
        if (tier.includes("Elite")) return "background: #fffbeb; color: #b45309; border: 1px solid #fcd34d;"; // Yellow-50/700
        if (tier.includes("Rotation")) return "background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe;"; // Blue-50/700
        if (tier.includes("Development")) return "background: #f9fafb; color: #374151; border: 1px solid #e5e7eb;"; // Gray-50/700
        return "background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca;"; // Red-50/700
    };

    const getTrendIcon = (trend) => {
        const t = (trend || "").toLowerCase();
        if (t.includes("rocket")) return `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" class="text-orange-500" style="color: #f97316;"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>`;
        if (t.includes("up") || t.includes("improving")) return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: #22c55e;"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`; // Green Up
        if (t.includes("down") || t.includes("declining")) return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: #ef4444;"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>`; // Red Down
        return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: #9ca3af;"><line x1="5" y1="12" x2="19" y2="12"/></svg>`; // Gray Minus
    };

    athletes.forEach(athlete => {
        // Sanitize all athlete data
        const safeAthleteId = escapeHTML(String(athlete.athleteId || ''));
        const safeName = escapeHTML(String(athlete.name || ''));
        const safeInitials = escapeHTML(String(athlete.initials || athlete.name.substring(0, 2).toUpperCase() || ''));
        const safeNotes = escapeHTML(String(athlete.notes || 'No Focus Set'));
        const safeTier = escapeHTML(String(athlete.tier || ''));

        html += `
            <div onclick="viewPlayerReport('${safeAthleteId}')" 
                 class="group"
                 style="display: flex; align-items: center; padding: 16px 24px; border-bottom: 1px solid #f3f4f6; cursor: pointer; transition: background 0.2s;"
                 onmouseover="this.style.background='rgba(59, 130, 246, 0.03)'" 
                 onmouseout="this.style.background='white'">
                
                <!-- Avatar -->
                <div style="width: 48px; height: 48px; background: #f3f4f6; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; color: #6b7280; font-size: 18px; margin-right: 16px;">
                    ${safeInitials}
                </div>

                <!-- Content -->
                <div style="flex: 1;">
                    <h4 style="margin: 0; font-size: 16px; font-weight: 600; color: #111827;">${safeName}</h4>
                    <p style="margin: 4px 0 0; font-size: 13px; color: #6b7280; display: flex; align-items: center; gap: 6px;">
                        <span style="width: 6px; height: 6px; background: #ef4444; border-radius: 50%;"></span>
                        ${safeNotes}
                    </p>
                </div>

                <!-- Badges -->
                <div style="display: flex; align-items: center; gap: 12px; margin-right: 16px;">
                    <span style="font-size: 11px; font-weight: 600; padding: 4px 10px; border-radius: 999px; text-transform: uppercase; letter-spacing: 0.5px; ${getTierBadgeStyle(athlete.tier)}">
                        ${safeTier}
                    </span>
                    <div style="padding: 6px; background: #f9fafb; border-radius: 8px;">
                        ${getTrendIcon(athlete.trend)}
                    </div>
                </div>

                <!-- Chevron -->
                <div style="color: #d1d5db;">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                </div>
            </div>
    `;
    });
    // Close container
    html += '</div></div>';
    container.innerHTML = html;
}

function saveFocusFromTable(athleteId, input) {
    const originalValue = input.value;
    const finalVal = input.value;

    // Validation: Max 50 Chars (approx 2 distinct items)
    if (finalVal.length > 50) {
        godspeedAlert("Please keep Focus items concise (max 50 chars). Example: 'Box Out, Move Feet'", "Validation");
        // Revert to original or trim
        input.value = originalValue;
        return;
    }

    const db = getDB();
    if (!db.reports) db.reports = {};
    if (!db.reports[athleteId]) {
        db.reports[athleteId] = { tier: 'Unassigned', avg: '-', content: '' };
    }

    db.reports[athleteId].focus = finalVal;
    saveDB(db);

    // Optional: Visual feedback
    input.style.border = '1px solid #4caf50';
    setTimeout(() => {
        input.style.border = '1px solid transparent';
        input.style.background = 'transparent';
    }, 1000);
}

// 4. Report Logic (The "Router" for Profile View)
// --- VIEW PLAYER REPORT (MODAL OVERLAY) ---
function viewPlayerReport(athleteId) {
    console.log("Opening Report for:", athleteId);
    const db = getDB();
    const athlete = db.roster.find(a => a.athleteId === athleteId);
    const modal = document.getElementById('report-modal');

    if (!athlete || !modal) {
        console.error("Athlete or Modal not found");
        return;
    }

    // Store active ID
    modal.dataset.activeAthleteId = athleteId;

    // 1. Data Prep (Graph)
    // Filter grades for this athlete, sort chronological
    const playerGrades = (db.grades || [])
        .filter(g => g.athleteId === athleteId && g.scores && g.scores.avg > 0)
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .slice(-9); // Last 9 sessions

    // Current Score Calculation
    const currentAvg = athlete.avg_grade || (playerGrades.length > 0 ? playerGrades[playerGrades.length - 1].scores.avg.toFixed(2) : "N/A");

    // Tier Styling
    let tierBg = "#f3f4f6"; let tierText = "#374151";
    if ((athlete.tier || "").includes("Elite")) { tierBg = "#fef9c3"; tierText = "#b45309"; }
    else if ((athlete.tier || "").includes("Rotation")) { tierBg = "#eff6ff"; tierText = "#1d4ed8"; }
    else if ((athlete.tier || "").includes("Limited")) { tierBg = "#fef2f2"; tierText = "#b91c1c"; }

    // Sanitize all athlete data before building HTML
    const safeAthleteId = escapeHTML(String(athleteId || ''));
    const safeInitials = escapeHTML(String(athlete.initials || athlete.name.substring(0, 2).toUpperCase() || ''));
    const safeName = escapeHTML(String(athlete.name || ''));
    const safeTier = escapeHTML(String(athlete.tier || ''));
    const safeNotes = escapeHTML(String(athlete.notes || 'Focus on consistency.'));
    const safeCurrentAvg = escapeHTML(String(currentAvg || '0'));

    // 2. Build Modal HTML (User's Design)
    const html = `
    <!-- MODAL CARD CONTAINER -->
    <div style="position: relative; background: white; border-radius: 24px; width: 100%; max-width: 800px; max-height: 90vh; overflow-y: auto; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25); padding: 32px; animation: slideUp 0.3s ease-out;">
        
        <!-- CLOSE BUTTON -->
        <button onclick="document.getElementById('report-modal').style.display='none'" 
            style="position: absolute; top: 20px; right: 20px; padding: 10px; background: #f3f4f6; border-radius: 50%; border: none; cursor: pointer; color: #6b7280; transition: background 0.2s;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>

        <!-- HEADER -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; margin-top: 10px;">
            <div style="display: flex; align-items: center; gap: 20px;">
                <div style="width: 80px; height: 80px; background: #f3f4f6; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 30px; font-weight: 700; color: #6b7280;">
                    ${safeInitials}
                </div>
                <div>
                    <h2 style="margin: 0; font-size: 30px; font-weight: 900; color: #111827; letter-spacing: -0.02em; text-transform: uppercase;">${safeName}</h2>
                    <span style="display: inline-block; margin-top: 8px; padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 700; text-transform: uppercase; background: ${tierBg}; color: ${tierText};">
                        ${safeTier}
                    </span>
                </div>
            </div>
            <div style="text-align: right;">
                <div style="font-size: 12px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Current V2 Score</div>
                <div style="font-size: 48px; font-weight: 900; color: #111827; letter-spacing: -0.05em; line-height: 1;">${safeCurrentAvg}</div>
            </div>
        </div>

        <!-- COACH FOCUS -->
        <div style="background: #eff6ff; border-left: 4px solid #3b82f6; padding: 24px; border-radius: 0 12px 12px 0; margin-bottom: 32px;">
            <h3 style="margin: 0 0 8px 0; color: #1e3a8a; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">Coach's Focus Area</h3>
            <p style="margin: 0; color: #1d4ed8; font-size: 18px; font-weight: 500; font-style: italic;">"${safeNotes}"</p>
        </div>

        <!-- GRAPH SECTION -->
        <div style="background: #f9fafb; border-radius: 16px; padding: 24px; border: 1px solid #f3f4f6;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px;">
                <h3 style="margin: 0; font-size: 14px; font-weight: 700; color: #111827; text-transform: uppercase;">Performance Trajectory</h3>
                <span style="background: white; border: 1px solid #e5e7eb; color: #6b7280; padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 700;">Last ${playerGrades.length} Sessions</span>
            </div>
            <div style="height: 256px; width: 100%; position: relative;">
                <canvas id="athleteTrendChart"></canvas>
            </div>
        </div>

        <!-- FOOTER ACTIONS -->
        <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 32px; border-top: 1px solid #f3f4f6; padding-top: 24px;">
            <button onclick="sendTrainingReportEmail('${athleteId}')" class="btn-ios-secondary" style="background: #f3f4f6; color: #374151; padding: 10px 20px; border-radius: 8px; font-weight: 700; border:none; cursor: pointer; display: flex; align-items: center; gap: 8px;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                    <polyline points="22,6 12,13 2,6"></polyline>
                </svg>
                Email Training Report
            </button>
            <button onclick="sendPracticeInfoEmail('${athleteId}')" class="btn-ios-secondary" style="background: #f3f4f6; color: #374151; padding: 10px 20px; border-radius: 8px; font-weight: 700; border:none; cursor: pointer; display: flex; align-items: center; gap: 8px;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                    <polyline points="22,6 12,13 2,6"></polyline>
                </svg>
                Email Practice Info
            </button>
            <button class="btn-ios-primary" style="background: #2563eb; color: white; padding: 10px 24px; border-radius: 8px; font-weight: 700; border:none; cursor: pointer; box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.1), 0 2px 4px -1px rgba(37, 99, 235, 0.06);">
                Save Changes
            </button>
        </div>
    </div>
    `;

    // 3. Render & Show
    modal.innerHTML = html;
    modal.style.display = 'flex';

    // 4. Initialize Chart (Chart.js)
    setTimeout(() => {
        const ctx = document.getElementById('athleteTrendChart');
        if (ctx) {
            // Prepare Data for Chart.js
            const labels = playerGrades.map(g => {
                // Shorten gradeId or Date to "P#"
                const pid = g.gradeId && g.gradeId.includes('P') ? g.gradeId.split('-')[0] : g.date.substring(5);
                return pid.replace('prac_', 'P');
            });
            const dataPoints = playerGrades.map(g => g.scores.avg);

            new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'V2 Score',
                        data: dataPoints,
                        borderColor: '#2563EB', // Blue-600
                        backgroundColor: 'rgba(37, 99, 235, 0.1)',
                        borderWidth: 3,
                        pointBackgroundColor: '#2563EB',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2,
                        pointRadius: 5,
                        pointHoverRadius: 7,
                        tension: 0.4,
                        fill: true
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true,
                            max: 10,
                            grid: { display: true, color: '#f3f4f6' },
                            ticks: { font: { size: 11 }, color: '#9ca3af' }
                        },
                        x: {
                            grid: { display: false },
                            ticks: { font: { size: 11 }, color: '#9ca3af' }
                        }
                    },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: '#1d1d1f',
                            titleFont: { family: 'Inter', size: 13 },
                            bodyFont: { family: 'Inter', size: 13 },
                            padding: 10,
                            cornerRadius: 8,
                            displayColors: false
                        }
                    }
                }
            });
        }
    }, 100);
}

function validateFocusInput(input) {
    const val = input.value;


    if (val.length > 50) {
        godspeedAlert("Focus must be concise (max 50 chars). Example: 'Defensive Slides, Motor'.", "Validation");
        // Trim to 50
        input.value = val.substring(0, 50);
    }
}

function savePlayerReport() {
    const modal = document.getElementById('report-modal');
    const athleteId = modal.dataset.activeAthleteId;

    if (!athleteId) {
        godspeedAlert("Error: No athlete selected.", "Error");
        return;
    }

    const contentDiv = document.getElementById('report-content');
    const commentsInput = document.getElementById('report-comments-input');
    const focusInput = document.getElementById('report-focus-input');

    const newContent = contentDiv.innerHTML;
    const newComments = commentsInput.value;
    const newFocus = focusInput ? focusInput.value : null;

    const db = getDB();
    if (!db.reports) db.reports = {};
    if (!db.reports[athleteId]) {
        // Init if missing
        db.reports[athleteId] = { tier: 'Unassigned', avg: '-', content: '' };
    }

    db.reports[athleteId].content = newContent;
    db.reports[athleteId].comments = newComments;
    if (newFocus) db.reports[athleteId].focus = newFocus;

    saveDB(db);

    godspeedAlert('Report updated successfully!', 'Success');
    closeReportModal();

    // Refresh table to show updated Focus/Trend/etc
    // Check if we are in team view to refresh
    const activeTeamItem = document.querySelector('.team-nav-item.active');
    if (activeTeamItem) {
        // Re-trigger click to reload table (simplest way to refresh)
        activeTeamItem.click();
    }
}

function shareSingleReport(athleteId, athleteName) {
    if (!athleteId) return;

    // In a real app, verify report completion here
    console.log(`Sharing report for ${athleteId}...`);

    // Simulate API delay
    document.body.style.cursor = 'wait';
    setTimeout(() => {
        document.body.style.cursor = 'default';
        // Minimal Toast or Alert
        godspeedAlert(`Report for ${athleteName} shared with parents! 📤`, 'Success');
    }, 400);
}

// 6. Modal Accessibility (Scrim Dismiss & Utils)
document.addEventListener('DOMContentLoaded', () => {
    const modals = ['report-modal', 'grading-modal', 'bulk-modal'];

    modals.forEach(id => {
        const overlay = document.getElementById(id);
        if (!overlay) return;

        // Scrim Dismiss: Close if clicking the overlay background specifically
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.style.display = 'none';
            }
        });
    });
});

function closeReportModal() {
    setDisplay(getElement('report-modal'), 'none');
}

function openShareSheet() {
    // Open the new share options modal
    setDisplay(getElement('share-sheet-modal'), 'flex');
}

function executeShareEmail() {
    const athleteNameEl = getElement('report-athlete-name');
    if (!athleteNameEl) return;
    const athleteName = athleteNameEl.textContent.replace(' Report', '');
    // Simulate Email API
    godspeedAlert(`📧 Report for ${athleteName} sent to parents via Email!`, 'Success');
    setDisplay(getElement('share-sheet-modal'), 'none');
}

function executeSharePush() {
    const athleteNameEl = getElement('report-athlete-name');
    if (!athleteNameEl) return;
    const athleteName = athleteNameEl.textContent.replace(' Report', '');
    // Simulate Push API
    godspeedAlert(`📲 Report for ${athleteName} pushed to Parent Portal!`, 'Success');
    setDisplay(getElement('share-sheet-modal'), 'none');
}


function closeGradingModal() {
    setDisplay(getElement('grading-modal'), 'none');
}
// 5. Grading Logic
function openGradingModal(athleteId, name) {
    const nameEl = getElement('grading-athlete-name');
    const idEl = getElement('grading-athlete-id');
    const dateEl = getElement('grade-date');
    const notesEl = getElement('grade-notes');
    const modal = getElement('grading-modal');
    if (!nameEl || !idEl || !dateEl || !notesEl || !modal) return;
    nameEl.textContent = name;
    idEl.value = athleteId;

    // Set default date to today
    dateEl.valueAsDate = new Date();

    // Clear inputs
    ['focus', 'hustle', 'skill', 'iq'].forEach(k => {
        const input = document.getElementById(`score-${k}`);
        if (input) input.value = '';
    });
    notesEl.value = '';

    modal.style.display = 'flex';
}

function saveGrade() {
    const athleteIdEl = getElement('grading-athlete-id');
    const typeEl = getElement('grade-type');
    const dateEl = getElement('grade-date');
    const notesEl = getElement('grade-notes');
    if (!athleteIdEl || !typeEl || !dateEl || !notesEl) return;
    const athleteId = athleteIdEl.value;
    const type = typeEl.value;
    const date = dateEl.value;
    const notes = notesEl.value;

    // Gather Scores
    const scores = {
        focus: parseInt(getElement('score-focus')?.value, 10) || 0,
        hustle: parseInt(getElement('score-hustle')?.value, 10) || 0,
        skill: parseInt(getElement('score-skill')?.value, 10) || 0,
        iq: parseInt(getElement('score-iq')?.value, 10) || 0
    };

    if (!date) {
        godspeedAlert('Please select a date', 'Validation');
        return;
    }

    const newGrade = {
        gradeId: 'GR-' + Date.now(),
        athleteId,
        date,
        type,
        scores,
        notes
    };

    // Save to DB
    const db = getDB();
    db.grades.push(newGrade);
    saveDB(db);

    godspeedAlert('Grade Saved!', 'Success');
    closeGradingModal();
}

// 5. Bulk Upload (Copy/Paste)
function showBulkUpload() {
    setDisplay(getElement('bulk-modal'), 'flex');
    const bulkText = getElement('bulk-text');
    if (bulkText) bulkText.value = ''; // specific focus
}

function closeBulkModal() {
    setDisplay(getElement('bulk-modal'), 'none');
}

function processBulkText() {
    const bulkText = getElement('bulk-text');
    if (!bulkText) return;
    const text = bulkText.value;
    if (!text) {
        godspeedAlert('Please paste some data first.', 'Validation');
        return;
    }
    parseAndSaveCSV(text);
    closeBulkModal();
}

// Deprecated file processCSV removed in favor of direct text parsing


function parseAndSaveCSV(csvText) {
    // Simple CSV Parser (Assumes comma delimiter, no quoted newlines)
    const lines = csvText.split('\n');
    if (lines.length < 2) {
        godspeedAlert('CSV appears empty or invalid.', 'Error');
        return;
    }

    const headers = lines[0].toLowerCase().split(',').map(h => h.trim());
    // Expected: athlete_id, date, focus, hustle, skill, iq, notes, type

    const db = getDB();
    let importedCount = 0;
    let errors = [];

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const cols = line.split(',').map(c => c.trim());
        if (cols.length < 4) continue; // Basic check

        // Map columns based on headers implementation or fixed index
        // Let's rely on fixed index for stability in this prototype or try to map
        // Format: AthleteID, Date, Type(?), Focus, Hustle, Skill, IQ, Notes

        try {
            const athleteId = cols[0];
            const date = cols[1];
            // If date invalid, skip
            if (new Date(date).toString() === 'Invalid Date') throw new Error('Invalid Date');

            const type = 'Practice'; // Default or from CSV

            // Stats (Assume cols 2,3,4,5 are scores if headers match roughly, else assumption)
            // Let's enforce strict order for now: AthleteID, Date, Focus, Hustle, Skill, IQ, Notes
            const scores = {
                focus: parseInt(cols[2]) || 5,
                hustle: parseInt(cols[3]) || 5,
                skill: parseInt(cols[4]) || 5,
                iq: parseInt(cols[5]) || 5
            };

            const notes = cols[6] || "";

            // Validate Athlete Exists
            if (!db.roster.some(r => r.athleteId === athleteId)) {
                // Try fuzzy match on name? No, safer to fail.
                throw new Error(`Athlete ID ${athleteId} not found`);
            }

            const newGrade = {
                gradeId: 'GR-CSV-' + Date.now() + Math.random().toString(36).substr(2, 5),
                athleteId,
                date,
                type,
                scores,
                notes
            };

            db.grades.push(newGrade);
            importedCount++;

        } catch (err) {
            errors.push(`Line ${i + 1}: ${err.message}`);
        }
    }

    if (importedCount > 0) {
        saveDB(db);
        godspeedAlert(`Successfully imported ${importedCount} grades.\n\nErrors: \n${errors.slice(0, 5).join('\n')}`, 'Import Complete');
        // Refresh view if on a team
        loadTeamRoster();
    } else {
        godspeedAlert('No grades imported. Please check CSV format:\nAthleteID, Date, Focus, Hustle, Skill, IQ, Notes', 'Import Error');
    }
}

function exportData() {
    const db = getDB();
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(db));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "godspeed_data_backup.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
}

// ==========================================
// WAR ROOM (ANALYTICS) LOGIC
// ==========================================

// ==========================================

// 7. View Switching (Segmented Control)
// 7. View Switching (Segmented Control)
window.switchTeamView = function (viewName, btnElement) {
    console.log("Rendering Nav Items", viewName); // Debug
    const views = {
        'roster': document.getElementById('roster-view'),
        'analytics': document.getElementById('analytics-view'),
        'schedule': document.getElementById('schedule-view'),
        'logistics': document.getElementById('logistics-view'),
        'postgame': document.getElementById('postgame-view'),
        'accounts': document.getElementById('accounts-view')
    };

    const buttons = {
        'roster': document.getElementById('btn-view-roster'),
        'analytics': document.getElementById('btn-view-analytics'),
        'schedule': document.getElementById('btn-view-schedule'),
        'logistics': document.getElementById('btn-view-logistics'),
        'postgame': document.getElementById('btn-view-postgame')
    };

    // Hide all
    Object.values(views).forEach(el => { if (el) el.style.display = 'none'; });
    Object.values(buttons).forEach(el => { if (el) el.classList.remove('active'); });

    // Show target
    if (views[viewName]) views[viewName].style.display = 'block';

    // Activate button
    if (btnElement) {
        btnElement.classList.add('active');
    } else if (buttons[viewName]) {
        buttons[viewName].classList.add('active');
    }

    if (viewName === 'analytics') {
        openAnalyticsPage();
    } else if (viewName === 'schedule') {
        renderCoachSchedule();
    } else if (viewName === 'logistics') {
        renderAdminTrips();
    } else if (viewName === 'postgame') {
        renderPostGameEntry();
    } else if (viewName === 'accounts') {
        document.getElementById('view-tabs').style.display = 'none';
        document.getElementById('view-title').textContent = 'User Accounts';
        renderCoachAccounts();
    }
}

function renderCoachAccounts() {
    const db = getDB();
    const container = document.getElementById('accounts-table-container');
    const accounts = db.accounts || [];

    let html = `
        <!-- Bulk Email Actions -->
        <div style="background: white; border-radius: 16px; padding: 20px; margin-bottom: 20px; border: 1px solid rgba(0,0,0,0.06); box-shadow: 0 2px 8px rgba(0,0,0,0.03);">
            <h3 style="margin: 0 0 16px 0; font-size: 16px; font-weight: 600; color: #111827;">Bulk Email Actions</h3>
            <div style="display: flex; gap: 12px; flex-wrap: wrap;">
                <button onclick="sendBulkTrainingReports()" style="background: #2563eb; color: white; border: none; padding: 12px 20px; border-radius: 8px; font-weight: 600; font-size: 14px; cursor: pointer; display: flex; align-items: center; gap: 8px; transition: background 0.2s;" onmouseover="this.style.background='#1d4ed8'" onmouseout="this.style.background='#2563eb'">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                        <polyline points="22,6 12,13 2,6"></polyline>
                    </svg>
                    Send Training Reports to All
                </button>
                <button onclick="sendBulkPracticeInfo()" style="background: #059669; color: white; border: none; padding: 12px 20px; border-radius: 8px; font-weight: 600; font-size: 14px; cursor: pointer; display: flex; align-items: center; gap: 8px; transition: background 0.2s;" onmouseover="this.style.background='#047857'" onmouseout="this.style.background='#059669'">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                        <polyline points="22,6 12,13 2,6"></polyline>
                    </svg>
                    Send Practice Info to All
                </button>
            </div>
            <p style="margin: 12px 0 0 0; color: #6b7280; font-size: 12px;">These emails will be sent to all parents with active accounts.</p>
        </div>
        
        <div style="background: white; border-radius: 24px; border: 1px solid rgba(0,0,0,0.06); overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.03);">
            <div style="display: flex; padding: 14px 24px; background: rgba(249, 249, 249, 0.8); backdrop-filter: blur(10px); border-bottom: 1px solid rgba(0,0,0,0.05); font-size: 11px; font-weight: 600; text-transform: uppercase; color: #86868b; letter-spacing: 0.05em;">
                <div style="flex: 2;">Parent / User</div>
                <div style="flex: 2;">Contact</div>
                <div style="flex: 2;">Athletes</div>
                <div style="flex: 1;">Status</div>
                <div style="flex: 1; text-align: right;">Balance</div>
                <div style="flex: 0 0 40px;"></div>
            </div>
            <div style="display: flex; flex-direction: column;">
    `;

    if (accounts.length === 0) {
        html += `<div style="padding: 24px; text-align: center; color: #888;">No accounts found.</div>`;
    } else {
        accounts.forEach(acc => {
            // Find athlete names and sanitize
            const athleteNames = (acc.athletes || []).map(id => {
                const a = db.roster.find(r => r.athleteId === id);
                return a ? escapeHTML(String(a.name || '')) : escapeHTML(String(id || ''));
            }).join(', ');

            // Sanitize all account data
            const safeParentName = escapeHTML(String(acc.parentName || ''));
            const safeId = escapeHTML(String(acc.id || ''));
            const safeEmail = escapeHTML(String(acc.email || ''));
            const safePhone = escapeHTML(String(acc.phone || ''));
            const safeStatus = escapeHTML(String(acc.status || ''));
            const safeBalance = escapeHTML(String(acc.balance || '$0.00'));

            // Status Badge
            let statusColor = '#34C759'; // Green
            let statusBg = '#E8F5E9';
            if (acc.status === 'Past Due') { statusColor = '#FF3B30'; statusBg = '#FFEBEE'; }
            if (acc.status === 'Pending') { statusColor = '#FF9500'; statusBg = '#FFF3E0'; }

            html += `
                <div class="group" style="display: flex; align-items: center; padding: 16px 24px; border-bottom: 1px solid #f3f4f6; transition: background 0.2s;" onmouseover="this.style.background='rgba(59, 130, 246, 0.03)'" onmouseout="this.style.background='white'">
                    <div style="flex: 2;">
                        <div style="font-weight: 600; color: #111;">${safeParentName}</div>
                        <div style="font-size: 12px; color: #888;">ID: ${safeId}</div>
                    </div>
                    <div style="flex: 2;">
                        <div style="font-size: 14px; color: #333;">${safeEmail}</div>
                        <div style="font-size: 12px; color: #888;">${safePhone}</div>
                    </div>
                    <div style="flex: 2; font-size: 14px; color: #111;">
                        ${athleteNames}
                    </div>
                    <div style="flex: 1;">
                        <span style="font-size: 11px; font-weight: 600; padding: 4px 10px; border-radius: 999px; background: ${statusBg}; color: ${statusColor}; border: 1px solid ${statusBg};">
                            ${safeStatus}
                        </span>
                    </div>
                    <div style="flex: 1; text-align: right; font-weight: 600; font-family: monospace; font-size: 14px;">
                        ${safeBalance}
                    </div>
                    <div style="flex: 0 0 40px; text-align: right; color: #ccc;">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg>
                    </div>
                </div>
            `;
        });
    }

    html += `</div></div>`;
    container.innerHTML = html;
}

function renderPostGameEntry() {
    const db = getDB();
    const gameSelect = document.getElementById('postgame-select');
    const rosterList = document.getElementById('postgame-roster-list');

    // 1. Populate Games (if empty)
    if (gameSelect.options.length <= 1) {
        const games = db.games || [];
        games.forEach(g => {
            const opt = document.createElement('option');
            opt.value = g.id;
            opt.textContent = `${g.date} - ${g.opponent}`;
            gameSelect.appendChild(opt);
        });

        // Listener for game change
        gameSelect.addEventListener('change', () => {
            renderPostGameRoster(db);
        });
    }
}

function renderPostGameRoster(db) {
    const rosterList = document.getElementById('postgame-roster-list');
    rosterList.innerHTML = '';

    // Use currently selected team or default
    const currentTeamId = localStorage.getItem('gba_team_id') || 'TEAM-10U-DEV-BLACK';
    const roster = db.roster.filter(p => p.teamId === currentTeamId);

    if (roster.length === 0) {
        rosterList.innerHTML = '<div style="padding:1rem; text-align:center;">No players found for this team.</div>';
        return;
    }

    roster.forEach(player => {
        const row = document.createElement('div');
        row.className = 'stat-entry-row';
        row.style.background = '#f9f9f9';
        row.style.padding = '1rem';
        row.style.borderRadius = '12px';
        row.style.display = 'flex';
        row.style.flexWrap = 'wrap';
        row.style.alignItems = 'center';
        row.style.gap = '1rem';
        row.style.border = '1px solid #eee';

        const safePlayerName = escapeHTML(String(player.name || ''));
        const safePlayerId = escapeHTML(String(player.athleteId || ''));
        row.innerHTML = `
            <div style="flex: 1 1 100%; font-weight: 600; margin-bottom: 0.5rem; color: #333;">${safePlayerName}</div>
            
            <div style="flex: 1; display:flex; flex-direction:column; min-width: 60px;">
                <label style="font-size:0.7rem; color:#888; margin-bottom:2px;">PTS</label>
                <input type="number" class="stat-input" data-pid="${safePlayerId}" data-stat="points" placeholder="0" style="padding:8px; border:1px solid #ddd; border-radius:8px; text-align:center;">
            </div>
            <div style="flex: 1; display:flex; flex-direction:column; min-width: 60px;">
                 <label style="font-size:0.7rem; color:#888; margin-bottom:2px;">REB</label>
                <input type="number" class="stat-input" data-pid="${safePlayerId}" data-stat="rebounds" placeholder="0" style="padding:8px; border:1px solid #ddd; border-radius:8px; text-align:center;">
            </div>
             <div style="flex: 1; display:flex; flex-direction:column; min-width: 60px;">
                 <label style="font-size:0.7rem; color:#888; margin-bottom:2px;">AST</label>
                <input type="number" class="stat-input" data-pid="${safePlayerId}" data-stat="assists" placeholder="0" style="padding:8px; border:1px solid #ddd; border-radius:8px; text-align:center;">
            </div>
             <div style="flex: 1; display:flex; flex-direction:column; min-width: 60px;">
                 <label style="font-size:0.7rem; color:#888; margin-bottom:2px;">STL</label>
                <input type="number" class="stat-input" data-pid="${safePlayerId}" data-stat="steals" placeholder="0" style="padding:8px; border:1px solid #ddd; border-radius:8px; text-align:center;">
            </div>
             <div style="flex: 1; display:flex; flex-direction:column; min-width: 60px;">
                 <label style="font-size:0.7rem; color:#888; margin-bottom:2px;">DEF</label>
                <input type="number" class="stat-input" data-pid="${safePlayerId}" data-stat="deflections" placeholder="0" style="padding:8px; border:1px solid #ddd; border-radius:8px; text-align:center;">
            </div>
             <div style="flex: 1; display:flex; flex-direction:column; min-width: 60px;">
                 <label style="font-size:0.7rem; color:#888; margin-bottom:2px;">BLK</label>
                <input type="number" class="stat-input" data-pid="${safePlayerId}" data-stat="blocks" placeholder="0" style="padding:8px; border:1px solid #ddd; border-radius:8px; text-align:center;">
            </div>
        `;
        rosterList.appendChild(row);
    });
}

function saveBoxScore() {
    const db = getDB();
    const gameId = document.getElementById('postgame-select').value;

    if (!gameId) {
        godspeedAlert('Please select a game first.', 'Validation');
        return;
    }

    const inputs = document.querySelectorAll('.stat-input');
    let count = 0;

    // Group by player
    const playerStats = {};

    inputs.forEach(input => {
        const pid = input.dataset.pid;
        const stat = input.dataset.stat;
        const val = parseInt(input.value) || 0;

        if (!playerStats[pid]) playerStats[pid] = { game_id: gameId, player_id: pid, timestamp: new Date().toISOString() };
        playerStats[pid][stat] = val;

        if (val > 0) count++; // Only count meaningful entries
    });

    // Save to DB
    if (!db.boxScores) db.boxScores = [];

    Object.values(playerStats).forEach(entry => {
        db.boxScores.push(entry);
    });

    saveDB(db);
    godspeedAlert('Game Stats Published to Database!', 'Success');
}

// --- LOGISTICS MANAGER ---

function renderAdminTrips() {
    const db = getDB();
    const list = document.getElementById('admin-trips-list');
    list.innerHTML = '';

    const trips = db.trips || [];

    if (trips.length === 0) {
        list.innerHTML = '<div style="color:#999; text-align:center; padding:1rem;">No events created yet.</div>';
        return;
    }

    trips.forEach(trip => {
        const item = document.createElement('div');
        item.style.padding = '12px';
        item.style.background = 'white';
        item.style.border = '1px solid #eee';
        item.style.borderRadius = '10px';
        const safeTripName = escapeHTML(String(trip.name || ''));
        const safeTripFee = escapeHTML(String(trip.fee || '0'));
        const safeTripStart = escapeHTML(String(trip.start || ''));
        const safeTripEnd = escapeHTML(String(trip.end || ''));
        item.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <div style="font-weight: 600; font-size: 0.95rem;">${safeTripName}</div>
                <div style="font-size: 0.85rem; color: #0071E3;">$${safeTripFee}</div>
            </div>
            <div style="font-size: 0.8rem; color: #666; margin-top: 4px;">
                ${safeTripStart} - ${safeTripEnd}
            </div>
            <div style="font-size: 0.75rem; color: #888; margin-top: 4px;">
                ${trip.teamId}
            </div>
        `;
        list.appendChild(item);
    });
}

function saveTrip() {
    const db = getDB();
    if (!db.trips) db.trips = [];

    const newTrip = {
        id: 'TRIP-' + Date.now(),
        name: document.getElementById('trip-name').value,
        start: document.getElementById('trip-start').value,
        end: document.getElementById('trip-end').value,
        location: document.getElementById('trip-location').value,
        fee: document.getElementById('trip-fee').value,
        paymentLink: document.getElementById('trip-link').value,
        teamId: document.getElementById('trip-team').value
    };

    db.trips.push(newTrip);
    saveDB(db);
    renderAdminTrips();
    godspeedAlert('Event saved successfully!', 'Success');

    // Clear form
    document.getElementById('trip-name').value = '';
    document.getElementById('trip-start').value = '';
    document.getElementById('trip-end').value = '';
    document.getElementById('trip-location').value = '';
    document.getElementById('trip-fee').value = '';
    document.getElementById('trip-link').value = '';
}

function renderCoachSchedule() {
    const container = document.getElementById('schedule-content');
    if (!container) return;

    const db = getDB();
    const games = db.gameAnalysis?.recentGames || [];

    if (games.length === 0) {
        container.innerHTML = '<div style="padding: 2rem; text-align: center; color: #888;">No upcoming events formatted.</div>';
        return;
    }

    container.innerHTML = `
        <div style="background: white; border-radius: 12px; overflow: hidden; border: 1px solid #eee;">
            ${games.map(g => `
                <div style="padding: 16px; border-bottom: 1px solid #f5f5f7; display: flex; align-items: center; justify-content: space-between;">
                    <div style="display: flex; flex-direction: column; gap: 4px;">
                        <span style="font-size: 0.9rem; font-weight: 600; color: #1d1d1f;">${g.opponent}</span>
                        <span style="font-size: 0.8rem; color: #86868b;">${g.date}</span>
                    </div>
                    <div style="text-align: right;">
                         <span style="display: inline-block; padding: 4px 10px; border-radius: 6px; font-weight: 600; font-size: 0.8rem; background: ${g.result === 'Win' ? '#E8F5E9' : '#FFEBEE'}; color: ${g.result === 'Win' ? '#34C759' : '#FF3B30'}; margin-bottom: 4px;">
                            ${g.result.toUpperCase()}
                        </span>
                        <div style="font-family: 'SF Mono', monospace; font-size: 0.85rem; color: #333;">${g.score}</div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

function openAnalyticsPage() {
    console.log('--- OPENING ANALYTICS PAGE ---');
    const db = getDB();
    const teamId = window.currentTeamId;
    console.log('Team ID:', teamId);

    if (!teamId) {
        console.error('No Team ID found!');
        return;
    }

    const view = document.getElementById('analytics-view');
    console.log('View Element:', view);
    console.log('DB Game Analysis:', db.gameAnalysis);

    // Check if we have the new Architect Data
    if (db.gameAnalysis) {
        console.log('Rendering Architect Mode directly...');
        try {
            renderArchitectDashboard(view, db.gameAnalysis);
        } catch (e) {
            console.error('CRASH RENDER ARCHITECT:', e);
            // Sanitize error message to prevent XSS
            const safeMessage = typeof e.message === 'string' ?
                e.message.replace(/[&<>"']/g, m => {
                    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
                    return map[m];
                }) : 'An error occurred';
            view.innerHTML = `<h3>Error Loading Architect Mode</h3><pre>${safeMessage}</pre>`;
        }
    } else {
        console.log('Rendering Legacy Analytics...');
        renderLegacyAnalytics(view, db, teamId);
    }
}

function renderArchitectDashboard(container, data) {
    // 1. Build Header & Tabs
    // Attempt to get active team name from sidebar
    const activeTeamEl = document.querySelector('.team-nav-item.active span');
    const teamName = activeTeamEl ? activeTeamEl.textContent : "10U Development Black";

    // Define helper variables for template access
    const ff = data.fourFactors;
    const inv = data.invisibleBoxScore;

    let html = `
        <div style="margin-bottom: 2rem;">
            <!-- Breadcrumb / Context -->
             <div style="font-size: 0.9rem; font-weight: 600; color: #86868b; margin-bottom: 8px;">
                ${teamName}
            </div>
            
            <!-- Large Title Group -->
            <div style="margin-bottom: 12px;">
                <h1 style="font-size: 2.5rem; font-weight: 800; color: #1d1d1f; letter-spacing: -0.02em; line-height: 1; margin: 0;">
                    THE WAR ROOM
                </h1>
                <div style="font-size: 0.8rem; font-weight: 700; color: #D4AF37; letter-spacing: 0.15em; text-transform: uppercase; margin-top: 6px;">
                    ARCHITECT MODE
                </div>
            </div>
            
            <p style="font-size: 1.05rem; color: #86868b; max-width: 600px; line-height: 1.4;">
                Strategic intelligence and historical performance tracking.
            </p>
        </div>

        <!-- iOS Segmented Control tabs -->
        <div style="background: #E5E5EA; padding: 3px; border-radius: 9px; display: inline-flex; align-items: center; margin-bottom: 2rem;">
            <div id="tab-wr-analysis" onclick="switchWarRoomTab('analysis')" 
                style="padding: 6px 20px; border-radius: 7px; font-weight: 600; font-size: 0.9rem; cursor: pointer; background: white; color: black; box-shadow: 0 1px 3px rgba(0,0,0,0.12); transition: all 0.2s; min-width: 130px; text-align: center;">
                Game Analysis
            </div>
            <div id="tab-wr-lifetime" onclick="switchWarRoomTab('lifetime')"
                style="padding: 6px 20px; border-radius: 7px; font-weight: 500; font-size: 0.9rem; cursor: pointer; background: transparent; color: #666; transition: all 0.2s; min-width: 130px; text-align: center;">
                Lifetime Stats
            </div>
        </div>

        <!-- VIEW: Analysis (Wrapped for toggling) -->
        <div id="wr-view-analysis" style="display: block;">
            
            <!-- Strategic Dashboard (Bento Grid) -->
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; margin-bottom: 32px;">
                
                <!-- Card A: Momentum Tracker (Stock Ticker) -->
                <div style="background: white; border-radius: 24px; padding: 24px; border: 1px solid rgba(0,0,0,0.06); box-shadow: 0 12px 40px rgba(0,0,0,0.04);">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <div style="width: 28px; height: 28px; background: #F2F2F7; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #1d1d1f;">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                            </div>
                            <h4 style="margin: 0; font-size: 16px; font-weight: 700; color: #1d1d1f; letter-spacing: -0.01em;">Momentum Tracker</h4>
                        </div>
                        <span style="font-size: 11px; font-weight: 700; color: #86868b; background: #F5F5F7; padding: 6px 10px; border-radius: 20px; letter-spacing: 0.03em;">L7 DAYS</span>
                    </div>
                    
                    <div style="display: flex; flex-direction: column; gap: 16px;">
                        <!-- Oliver (Rocket) -->
                        <div style="display: flex; align-items: flex-start; gap: 12px;">
                            <div style="margin-top: 2px;">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style="color: #34C759;"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg> 
                            </div>
                            <div style="flex: 1;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
                                    <span style="font-weight: 700; font-size: 15px; color: #1d1d1f;">Oliver</span>
                                    <span style="font-size: 12px; color: #34C759; font-weight: 700; background: rgba(52, 199, 89, 0.1); padding: 2px 8px; border-radius: 6px;">+2.5</span>
                                </div>
                                <div style="font-size: 13px; color: #86868b; line-height: 1.4; font-weight: 500;">Huge breakout in Practice 8 (Defensive Intensity)</div>
                            </div>
                        </div>

                        <!-- Quest (Up) -->
                         <div style="display: flex; align-items: flex-start; gap: 12px;">
                             <div style="margin-top: 2px;">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#34C759" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
                            </div>
                            <div style="flex: 1;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
                                    <span style="font-weight: 700; font-size: 15px; color: #1d1d1f;">Quest</span>
                                    <span style="font-size: 12px; color: #34C759; font-weight: 700; background: rgba(52, 199, 89, 0.1); padding: 2px 8px; border-radius: 6px;">+0.5</span>
                                </div>
                                <div style="font-size: 13px; color: #86868b; line-height: 1.4; font-weight: 500;">Fixed sprint discipline. Returned to Elite status.</div>
                            </div>
                        </div>

                         <div style="height: 1px; background: rgba(0,0,0,0.04); margin: 4px 0;"></div>

                         <!-- Junior (Down) -->
                         <div style="display: flex; align-items: flex-start; gap: 12px;">
                             <div style="margin-top: 2px;">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FF3B30" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>
                            </div>
                            <div style="flex: 1;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
                                    <span style="font-weight: 700; font-size: 15px; color: #1d1d1f;">Junior</span>
                                    <span style="font-size: 12px; color: #FF3B30; font-weight: 700; background: rgba(255, 59, 48, 0.1); padding: 2px 8px; border-radius: 6px;">-0.4</span>
                                </div>
                                <div style="font-size: 13px; color: #86868b; line-height: 1.4; font-weight: 500;">Conditioning (Cramps) & Scheme IQ issues.</div>
                            </div>
                        </div>

                        <!-- Kyrie (Flat) -->
                         <div style="display: flex; align-items: flex-start; gap: 12px;">
                             <div style="margin-top: 2px;">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FF9F0A" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>
                            </div>
                            <div style="flex: 1;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
                                    <span style="font-weight: 700; font-size: 15px; color: #1d1d1f;">Kyrie</span>
                                    <span style="font-size: 12px; color: #FF9F0A; font-weight: 700; background: rgba(255, 159, 10, 0.1); padding: 2px 8px; border-radius: 6px;">Flat</span>
                                </div>
                                <div style="font-size: 13px; color: #86868b; line-height: 1.4; font-weight: 500;">Technical closeout progress masked by low effort.</div>
                            </div>
                        </div>

                    </div>
                </div>

                <!-- Card B: Rotation Depth (Gap Analysis) -->
                <div style="background: white; border-radius: 24px; padding: 24px; border: 1px solid rgba(0,0,0,0.06); box-shadow: 0 12px 40px rgba(0,0,0,0.04);">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px;">
                         <div style="display: flex; align-items: center; gap: 8px;">
                            <div style="width: 28px; height: 28px; background: #FFF9C4; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #D4AF37;">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
                            </div>
                            <h4 style="margin: 0; font-size: 16px; font-weight: 700; color: #1d1d1f; letter-spacing: -0.01em;">Rotation Depth Chart</h4>
                        </div>
                         <span style="font-size: 10px; font-weight: 700; color: #9A7D0A; background: #FFFDE7; border: 1px solid rgba(255,215,0,0.3); padding: 4px 8px; border-radius: 20px; letter-spacing: 0.05em; text-transform: uppercase;">GAP ANALYSIS</span>
                    </div>

                    <div style="padding: 16px; background: #FF3B30; background: linear-gradient(135deg, #FF3B30 0%, #FF2D55 100%); border-radius: 12px; margin-bottom: 20px; color: white; box-shadow: 0 4px 12px rgba(255, 59, 48, 0.3);">
                        <div style="font-size: 15px; font-weight: 700; letter-spacing: -0.01em; margin-bottom: 4px;">Heavy on Guards, Thin on Bigs.</div>
                        <div style="font-size: 13px; opacity: 0.9; font-weight: 500;">
                            We rely entirely on A.D. and Howard. One lapse costs us the interior.
                        </div>
                    </div>

                    <div style="display: flex; flex-direction: column; gap: 12px;">
                        <div style="display: flex; gap: 10px; align-items: flex-start;">
                            <div style="width: 6px; height: 6px; border-radius: 50%; background: #1d1d1f; margin-top: 6px; flex-shrink: 0;"></div>
                             <div style="font-size: 13px; color: #444; line-height: 1.5;">We have <span style="font-weight: 700; color: #1d1d1f;">4 Rotational Guards</span> (Aiden, Quest, Cassius, Anton).</div>
                        </div>
                        <div style="display: flex; gap: 10px; align-items: flex-start;">
                            <div style="width: 6px; height: 6px; border-radius: 50%; background: #FF3B30; margin-top: 6px; flex-shrink: 0;"></div>
                             <div style="font-size: 13px; color: #444; line-height: 1.5;">Wing Trap Vulnerability: Oliver and Ashton struggle to execute, leaving corners exposed.</div>
                        </div>
                    </div>
                </div>

                <!-- Card C: Iron Five (Premium Dark) -->
                <div style="background: black; background: linear-gradient(145deg, #1c1c1e 0%, #000000 100%); border-radius: 24px; padding: 24px; color: white; box-shadow: 0 12px 40px rgba(0,0,0,0.2); position: relative; overflow: hidden;">
                    <!-- Gloss effect -->
                    <div style="position: absolute; top: -50px; right: -50px; width: 150px; height: 150px; background: radial-gradient(circle, rgba(212,175,55,0.2) 0%, rgba(0,0,0,0) 70%); border-radius: 50%;"></div>
                    
                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 20px;">
                         <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                         <h4 style="margin: 0; font-size: 16px; font-weight: 800; color: white; letter-spacing: 0.05em; text-transform: uppercase;">The "Iron Five"</h4>
                    </div>
                    
                    <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 24px;">
                        <span style="background: rgba(255,255,255,0.15); backdrop-filter: blur(10px); color: white; border: 1px solid rgba(255,255,255,0.1); padding: 8px 14px; border-radius: 30px; font-size: 13px; font-weight: 600;">Aiden</span>
                        <span style="background: rgba(255,255,255,0.15); backdrop-filter: blur(10px); color: white; border: 1px solid rgba(255,255,255,0.1); padding: 8px 14px; border-radius: 30px; font-size: 13px; font-weight: 600;">Quest</span>
                        <span style="background: rgba(255,255,255,0.15); backdrop-filter: blur(10px); color: white; border: 1px solid rgba(255,255,255,0.1); padding: 8px 14px; border-radius: 30px; font-size: 13px; font-weight: 600;">Cassius</span>
                        <span style="background: rgba(255,255,255,0.15); backdrop-filter: blur(10px); color: white; border: 1px solid rgba(255,255,255,0.1); padding: 8px 14px; border-radius: 30px; font-size: 13px; font-weight: 600;">A.D.</span>
                        <span style="background: rgba(255,255,255,0.15); backdrop-filter: blur(10px); color: white; border: 1px solid rgba(255,255,255,0.1); padding: 8px 14px; border-radius: 30px; font-size: 13px; font-weight: 600;">Howard</span>
                    </div>

                    <div style="border-top: 1px solid rgba(255,255,255,0.15); padding-top: 16px;">
                        <div style="font-size: 14px; color: #D4AF37; font-weight: 600; margin-bottom: 6px;">Identity: High Motor / Lockdown</div>
                        <div style="font-size: 13px; color: #a1a1a6; line-height: 1.5;">
                             The only group trusted for 'Short Burst' shifts. Averages <span style="color:white; font-weight: 700;">9.0</span> in Effort/Competitiveness.
                        </div>
                    </div>
                </div>

                <!-- Card D: Strategic Gleanings (Notifications) -->
                <div style="background: white; border-radius: 24px; padding: 24px; border: 1px solid rgba(0,0,0,0.06); box-shadow: 0 12px 40px rgba(0,0,0,0.04);">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px;">
                        <h4 style="margin: 0; font-size: 16px; font-weight: 700; color: #1d1d1f;">Strategic Gleanings</h4>
                         <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0071E3" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                    </div>

                    <div style="display: flex; flex-direction: column; gap: 12px;">
                        <!-- Urgent -->
                        <div style="padding: 14px; background: #FFF5F5; border-radius: 12px; border: 1px solid rgba(255, 59, 48, 0.1);">
                            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px;">
                                <div style="width: 6px; height: 6px; background: #FF3B30; border-radius: 50%;"></div>
                                <div style="font-size: 11px; font-weight: 700; color: #FF3B30; text-transform: uppercase; letter-spacing: 0.05em;">URGENT: Baseline Crisis</div>
                            </div>
                            <div style="font-size: 13px; color: #1d1d1f; line-height: 1.4; font-weight: 500;">
                                Aiden is getting beat baseline. We must drill <span style="font-weight: 700;">'Wings Trap'</span> immediately.
                            </div>
                        </div>

                         <!-- Culture -->
                         <div style="padding: 14px; background: #F2F8FD; border-radius: 12px; border: 1px solid rgba(0, 113, 227, 0.1);">
                            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px;">
                                <div style="width: 6px; height: 6px; background: #0071E3; border-radius: 50%;"></div>
                                <div style="font-size: 11px; font-weight: 700; color: #0071E3; text-transform: uppercase; letter-spacing: 0.05em;">CULTURE: Trust Metric</div>
                            </div>
                            <div style="font-size: 13px; color: #1d1d1f; line-height: 1.4; font-weight: 500;">
                                Direct correlation between 'Listening' scores and 'Winning Minutes.' (See: Oliver).
                            </div>
                        </div>

                         <!-- Tactical -->
                         <div style="padding: 14px; background: #F5F5F7; border-radius: 12px; border: 1px solid rgba(0,0,0,0.05);">
                            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px;">
                                <div style="width: 6px; height: 6px; background: #86868b; border-radius: 50%;"></div>
                                <div style="font-size: 11px; font-weight: 700; color: #86868b; text-transform: uppercase; letter-spacing: 0.05em;">TACTICAL: Spacing</div>
                            </div>
                            <div style="font-size: 13px; color: #1d1d1f; line-height: 1.4; font-weight: 500;">
                                Junior/Cassius need <span style="font-weight: 700;">'Spot-to-Spot'</span> movement drills.
                            </div>
                        </div>
                    </div>
                </div>

            </div>

            <!-- Coach's Take (Editorial) -->
            <div style="background: white; border-radius: 24px; padding: 40px; border: 1px solid rgba(0,0,0,0.06); text-align: center; max-width: 800px; margin: 0 auto; box-shadow: 0 20px 60px rgba(0,0,0,0.06); position: relative; overflow: hidden;">
                <div style="position: absolute; top: -20px; left: 20px; font-size: 120px; color: #f5f5f7; font-family: serif; font-weight: 700; opacity: 0.5;">“</div>
                
                <h3 style="position: relative; margin: 0 0 16px 0; font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #86868b;">Coach's Takeaway</h3>
                
                <p style="position: relative; font-size: 20px; font-weight: 600; color: #1d1d1f; line-height: 1.5; font-family: 'SF Pro Display', sans-serif; letter-spacing: -0.01em;">
                    "Our defense is winning games (allowing 21 pts), but our <span style="color:#0071E3;">System IQ</span> is lagging. We have athletes like Kyrie and Junior who can't play minutes because they break the scheme. The goal for Practice 10 is <span style="text-decoration: underline; text-decoration-color: #D4AF37; text-decoration-thickness: 3px; text-underline-offset: 4px;">spacing discipline</span>."
                </p>

                <div style="position: relative; margin-top: 24px; display: inline-flex; align-items: center; gap: 8px; padding: 8px 16px; background: #F5F5F7; border-radius: 20px;">
                     <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#555" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                     <span style="font-size: 12px; font-weight: 600; color: #555;">Notes Updated: Just now</span>
                </div>
            </div>

        </div> <!-- End Analysis View (Wrapped) -->
    
    <!-- VIEW: Lifetime Stats -->
    <div id="wr-view-lifetime" style="display: none;">
        <div class="architect-tier">
            <div class="tier-header">Lifetime Roster Performance</div>
            <p style="color: #666; margin-bottom: 24px; font-size: 0.9rem;">
                Historical aggregation of all Practice and Game data points recorded in the portal.
            </p>
            <div id="lifetime-stats-container" style="background: white; border-radius: 12px; overflow: hidden; border: 1px solid #eee; box-shadow: 0 2px 10px rgba(0,0,0,0.02);">
                <!-- Table injected via JS -->
                <div style="padding: 3rem; text-align: center; color: #888;">
                    <div class="spinner" style="margin: 0 auto 1rem;"></div>
                    Loading historical data...
                </div>
            </div>
        </div>
    </div>`;

    container.innerHTML = html;

    // Defer chart rendering to allow DOM update
    // Only fetch context if element exists (Analysis view is default)
    setTimeout(() => {
        const radar = document.getElementById('architectRadarChart');
        if (radar) {
            renderArchitectRadar(data);
            renderArchitectTrendChart(data);
        }
    }, 100);
}

function renderFactorCard(factor, percent = 50) {
    let color = '#ccc';
    if (factor.status === 'good') color = '#2ecc71';
    if (factor.status === 'bad') color = '#e74c3c';
    if (factor.status === 'neutral') color = '#f1c40f';

    return `
        <div class="factor-card ${factor.status}">
            <div class="factor-label">${factor.label}</div>
            <div class="factor-val">${factor.val}</div>
            <div class="stat-bar-container">
                <div class="stat-bar-fill" style="width: ${percent}%; background: ${color};"></div>
            </div>
            <div class="factor-insight">${factor.insight}</div>
        </div>
    `; // Closed properly
}

function renderKillDots(val, target) {
    let dots = '';
    for (let i = 0; i < target; i++) {
        const status = i < val ? 'filled' : 'empty';
        dots += `<div class="kill-dot ${status}"></div>`;
    }
    return dots;
}

function renderArchitectRadar(data) {
    const ctx = document.getElementById('architectRadarChart');
    if (!ctx) return;

    // Use data from identityProfile if available, else fallback
    const profile = data.identityProfile || {
        focus: 6.0, hustle: 9.0, skill: 7.5, iq: 5.0, defense: 7.0, offense: 8.0
    };

    if (window.archRadar) window.archRadar.destroy();

    window.archRadar = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: ['Focus', 'Hustle', 'Skill', 'IQ', 'Defense', 'Offense'],
            datasets: [{
                label: 'Team Identity',
                data: [profile.focus, profile.hustle, profile.skill, profile.iq, profile.defense, profile.offense],
                backgroundColor: 'rgba(212, 175, 55, 0.2)', // Metallic Gold
                borderColor: '#D4AF37',
                borderWidth: 2,
                pointBackgroundColor: '#000',
                pointBorderColor: '#fff',
                pointHoverBackgroundColor: '#fff',
                pointHoverBorderColor: '#D4AF37'
            }]
        },
        options: {
            scales: {
                r: {
                    angleLines: { color: '#eee' },
                    grid: { color: '#eee' },
                    pointLabels: {
                        font: { size: 11, family: 'Inter', weight: '600' },
                        color: '#666'
                    },
                    suggestedMin: 0,
                    suggestedMax: 10,
                    ticks: { backdropColor: 'transparent', display: false }
                }
            },
            plugins: {
                legend: { display: false }
            },
            maintainAspectRatio: false
        }
    });
}

function renderArchitectTrendChart(data) {
    const ctx = document.getElementById('architectTrendChart');
    if (!ctx || !data.trends) return;

    if (window.archTrend) window.archTrend.destroy();

    window.archTrend = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.trends.labels,
            datasets: [
                {
                    label: 'Turnovers',
                    data: data.trends.turnovers,
                    borderColor: '#FF3B30', // Red
                    backgroundColor: 'rgba(255, 59, 48, 0.1)',
                    tension: 0.4,
                    yAxisID: 'y'
                },
                {
                    label: 'Efficiency (PPP)',
                    data: data.trends.efficiency,
                    borderColor: '#34C759', // Green
                    backgroundColor: 'rgba(52, 199, 89, 0.1)',
                    tension: 0.4,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            scales: {
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: { display: true, text: 'Turnovers' }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    grid: { drawOnChartArea: false },
                    title: { display: true, text: 'PPP' }
                }
            },
            plugins: {
                legend: { position: 'bottom' }
            }
        }
    });
}

function getPatternIcon(type) {
    if (type.includes('Fatigue')) return '';
    if (type.includes('Empty')) return ''; // Empty calorie
    if (type.includes('Gold')) return '';  // Gold miner
    return '';
}

function renderLegacyAnalytics(view, db, teamId) {
    // Reconstruct simplified legacy view structure
    view.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 2rem;">
            <div>
                <h2 style="margin-bottom: 0.5rem;">War Room</h2>
                <p style="color: #666;">Standard Roster Analysis</p>
            </div>
        </div>
        <div id="legacy-stats-container" style="padding: 2rem; text-align: center; color: #888; background: #f5f5f5; border-radius: 12px;">
            Standard analytics module disabled. Initiate Architect Mode for advanced insights.
        </div>
    `;
}

function closeAnalyticsPage() {
    switchTeamView('roster');
}

function openAcademyView(navItem) {
    document.querySelectorAll('.team-nav-item').forEach(function (el) { el.classList.remove('active'); });
    if (navItem) navItem.classList.add('active');

    document.getElementById('roster-view').style.display = 'none';
    document.getElementById('analytics-view').style.display = 'none';
    document.getElementById('academy-view').style.display = 'block';

    var btnAnalytics = document.getElementById('btn-view-analytics');
    if (btnAnalytics) btnAnalytics.style.display = 'none';

    document.getElementById('view-title').textContent = 'Coach Academy';
    renderAcademy();
}

// --- ACADEMY DATA (Coaching U) ---
const ACADEMY_CONTENT = {
    hero: {
        id: 'hero-001',
        title: "Erik Spoelstra: NBA Defensive Pick & Roll Coverages",
        coach: "Erik Spoelstra (Miami Heat)",
        desc: "A masterclass on modern PnR defense. Spoelstra breaks down drop coverage, switching, and the 'next' defense rotation.",
        image: 'assets/hero-collage.png', // Fallback
        badge: "Must Watch"
    },
    library: [
        {
            id: 'v-001',
            title: "Newest Concepts in Early Offense",
            coach: "Billy Donovan",
            category: "Offense",
            image: "assets/confidence-resilience.jpg",
            desc: "Billy Donovan discusses how to create triggers in the first 7 seconds of the shot clock to put pressure on the defense immediately."
        },
        {
            id: 'v-002',
            title: "Defending the Pick & Roll",
            coach: "Stan Van Gundy",
            category: "Defense",
            image: "assets/movement-mastery.png",
            desc: "SVG breaks down the 3 primary coverages he used to build top-5 defenses in Orlando and Detroit."
        },
        {
            id: 'v-003',
            title: "Developing a Winning Culture",
            coach: "Dwane Casey",
            category: "Culture",
            image: "assets/trophy-vision.png",
            desc: "How to build standards, accountability, and toughness in your locker room from Day 1."
        },
        {
            id: 'v-004',
            title: "NBA Offense: 7 Seconds or Less",
            coach: "Mike D'Antoni",
            category: "Offense",
            image: "assets/shooting-form.png",
            desc: "The philosophy of pace and space. How to flatten the defense and create driving lanes."
        },
        {
            id: 'v-005',
            title: "Coaching and Crisis Management",
            coach: "Doc Rivers",
            category: "Culture",
            image: "assets/trophy-hands.png",
            desc: "Managing egos, losing streaks, and media pressure. Doc shares stories from the Celtics championship run."
        },
        {
            id: 'v-006',
            title: "Zone Offense Principles",
            coach: "Jay Wright",
            category: "Offense",
            image: "assets/shooting-ref.png",
            desc: "How Villanova attacks the 2-3 Zone using the high post and corner overload."
        }
    ],
    playbook: [
        {
            id: 'pb-001',
            title: "Godspeed Philosophy: The 4 Pillars",
            coach: "Godspeed Staff",
            category: "Philosophy",
            desc: "The foundational values that drive our program: Character, Discipline, Excellence, Family."
        },
        {
            id: 'pb-002',
            title: "Offensive Installation: Pace & Space",
            coach: "Coach Scott",
            category: "Playbook",
            desc: "Core actions: Pace, Space, and Early Offense triggers. How we want to play fast."
        },
        {
            id: 'pb-003',
            title: "Defensive Principles (Pack Line)",
            coach: "Coach Scott",
            category: "Playbook",
            desc: "Our defensive identity. Gap integrity, wall-up drills, and closeout techniques."
        }
    ]
};

function renderAcademy() {
    const heroContainer = document.getElementById('academy-hero');
    const gridContainer = document.getElementById('academy-video-grid');

    if (!heroContainer || !gridContainer) return;

    // 1. Render Hero
    const hero = ACADEMY_CONTENT.hero;
    heroContainer.innerHTML = `
        <div style="z-index: 2; width: 100%;">
            <div class="hero-badge">${hero.badge}</div>
            <h1 style="font-size: 2.5rem; font-weight: 800; line-height: 1.1; margin-bottom: 0.5rem; max-width: 600px;">
                ${hero.title}
            </h1>
            <p style="font-size: 1.1rem; opacity: 0.9; margin-bottom: 20px;">with ${hero.coach}</p>
            <button class="btn-ios-primary" style="padding: 12px 30px; font-size: 1rem; display: flex; align-items: center; gap: 10px;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                Play Masterclass
            </button>
        </div>
    `;
    // Add dynamic background style if we had real images urls
    // heroContainer.style.backgroundImage = ...

    // 2. Render Main Grid
    renderAcademyGrid(ACADEMY_CONTENT.library);

    // 3. Render Playbook Section
    const container = gridContainer.parentNode;
    let pbHeader = document.getElementById('academy-playbook-header');

    if (!pbHeader) {
        // Create Header
        pbHeader = document.createElement('h3');
        pbHeader.id = 'academy-playbook-header';
        pbHeader.className = 'text-l';
        pbHeader.style.cssText = 'margin: 3rem 0 1rem 0;';
        pbHeader.textContent = 'Godspeed Playbook & Philosophy';
        container.appendChild(pbHeader);

        // Create Grid
        const pbGrid = document.createElement('div');
        pbGrid.id = 'academy-playbook-grid';
        pbGrid.className = 'video-grid';
        container.appendChild(pbGrid);
    }

    const pbGrid = document.getElementById('academy-playbook-grid');
    if (pbGrid) {
        pbGrid.innerHTML = ACADEMY_CONTENT.playbook.map(v => `
            <div class="video-card-item" onclick="playVideo('${v.id}')">
                <div class="video-thumb" style="background: linear-gradient(135deg, #1c1c1e 0%, #2c2c2e 100%); display: flex; align-items: center; justify-content: center;">
                     <span style="font-size: 2rem;">📖</span>
                </div>
                <div class="video-meta">
                    <div style="font-size: 0.7rem; color: #D4AF37; font-weight: 700; text-transform: uppercase; margin-bottom: 4px;">${v.category}</div>
                    <div class="video-title">${v.title}</div>
                    <div class="video-coach">${v.coach}</div>
                </div>
            </div>
        `).join('');
    }
}

function renderAcademyGrid(videos) {
    const grid = document.getElementById('academy-video-grid');
    if (!grid) return;

    grid.innerHTML = videos.map(v => `
        <div class="video-card-item" onclick="playVideo('${v.id}')">
            <div class="video-thumb" style="background: #d1d1d6; display: flex; align-items: center; justify-content: center;">
                <div class="play-overlay" style="position: relative; opacity: 1; background: transparent;">
                    <div class="play-icon" style="background: white; color: black; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                    </div>
                </div>
            </div>
            <div class="video-meta">
                <div style="font-size: 0.7rem; color: #2563eb; font-weight: 700; text-transform: uppercase; margin-bottom: 4px;">${v.category}</div>
                <div class="video-title">${v.title}</div>
                <div class="video-coach">${v.coach}</div>
            </div>
        </div>
    `).join('');
}

function filterAcademy(category) {
    // Visual feedback on filtering
    const videos = category === 'All'
        ? ACADEMY_CONTENT.library
        : ACADEMY_CONTENT.library.filter(v => v.category === category);
    renderAcademyGrid(videos);
}

function playVideo(id) {
    let video = null;
    if (id === 'hero') {
        video = ACADEMY_CONTENT.hero;
    } else {
        video = ACADEMY_CONTENT.library.find(v => v.id === id) || ACADEMY_CONTENT.playbook.find(v => v.id === id);
    }

    if (!video) return;

    const modal = document.getElementById('video-modal');
    document.getElementById('video-modal-title').textContent = video.title;
    document.getElementById('video-modal-desc').textContent = video.desc;

    modal.style.display = 'flex';
}

function closeVideoModal() {
    document.getElementById('video-modal').style.display = 'none';
}

// Global function to handle edits in the Player Report cards
window.updateGradeNote = function (element, gradeId, fieldType) {
    const newText = element.innerText.trim();
    const db = getDB();
    const gradeIndex = db.grades.findIndex(g => g.gradeId === gradeId);

    if (gradeIndex !== -1) {
        const grade = db.grades[gradeIndex];

        // Ensure notes is an object (handle legacy string case)
        if (typeof grade.notes !== 'object') {
            grade.notes = { well: grade.notes, improve: '' };
        }

        // Update field
        grade.notes[fieldType] = newText;

        // Update Metadata
        grade.lastEdited = {
            coach: 'Coach Scott',
            timestamp: new Date().toISOString()
        };

        // Save
        db.grades[gradeIndex] = grade;
        saveDB(db);

        // Update Footer in UI without full reload
        const card = document.getElementById('card-' + gradeId);
        let footerDiv = card.lastElementChild;
        // Check if it's the footer by content
        if (footerDiv.innerHTML.includes('Edited by')) {
            footerDiv.remove();
        }

        const timestampStr = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: 'numeric' });
        const footerHtml = 'Edited by Coach Scott • ' + timestampStr;

        const newFooter = document.createElement('div');
        newFooter.style.cssText = 'margin-top: 12px; padding-top: 8px; border-top: 1px solid #f5f5f7; font-size: 0.7rem; color: #86868b; text-align: right; font-style: italic;';
        newFooter.innerHTML = footerHtml;
        card.appendChild(newFooter);
    }
};

// Handle edits for the main Narrative Report
window.updateNarrative = function (element, athleteId) {
    const newText = element.innerText.trim();
    const db = getDB();

    if (db.reports && db.reports[athleteId]) {
        let headerText = 'Performance Analysis';
        const prev = element.previousElementSibling;
        if (prev && prev.tagName === 'H4') {
            headerText = prev.innerText;
        }

        const newContent = '<h4>' + headerText + '</h4><p>' + element.innerHTML + '</p>';

        db.reports[athleteId].content = newContent;

        db.reports[athleteId].lastEdited = {
            coach: 'Coach Scott',
            timestamp: new Date().toISOString()
        };

        saveDB(db);
    }
};

// --- War Room / Architect Mode Logic ---

function switchWarRoomTab(tabName) {
    const analysisView = document.getElementById('wr-view-analysis');
    const lifetimeView = document.getElementById('wr-view-lifetime');
    const tabAnalysis = document.getElementById('tab-wr-analysis');
    const tabLifetime = document.getElementById('tab-wr-lifetime');

    if (tabName === 'analysis') {
        if (analysisView) analysisView.style.display = 'block';
        if (lifetimeView) lifetimeView.style.display = 'none';

        if (tabAnalysis) {
            tabAnalysis.style.background = 'white';
            tabAnalysis.style.color = 'black';
            tabAnalysis.style.fontWeight = '600';
            tabAnalysis.style.boxShadow = '0 1px 3px rgba(0,0,0,0.12)';
        }
        if (tabLifetime) {
            tabLifetime.style.background = 'transparent';
            tabLifetime.style.color = '#666';
            tabLifetime.style.fontWeight = '500';
            tabLifetime.style.boxShadow = 'none';
        }
    } else if (tabName === 'lifetime') {
        if (analysisView) analysisView.style.display = 'none';
        if (lifetimeView) lifetimeView.style.display = 'block';

        if (tabLifetime) {
            tabLifetime.style.background = 'white';
            tabLifetime.style.color = 'black';
            tabLifetime.style.fontWeight = '600';
            tabLifetime.style.boxShadow = '0 1px 3px rgba(0,0,0,0.12)';
        }
        if (tabAnalysis) {
            tabAnalysis.style.background = 'transparent';
            tabAnalysis.style.color = '#666';
            tabAnalysis.style.fontWeight = '500';
            tabAnalysis.style.boxShadow = 'none';
        }

        renderLifetimeStats();
    }
}

function renderLifetimeStats() {
    const container = document.getElementById('lifetime-stats-container');
    if (!container) return;

    // Clear and set background to iOS grouped gray
    container.innerHTML = '';
    container.style.backgroundColor = '#F2F2F7'; // iOS System Gray 6
    container.style.padding = '20px';
    container.style.borderRadius = '0 0 12px 12px'; // Rounded bottom

    const db = getDB();
    if (!db) return;

    // --- DATA SETUP ---
    const stats = db.seasonStats || { gp: 0, wins: 0, losses: 0, pf: 0, pa: 0, avgPf: 0, avgPa: 0, margin: 0 };

    // Hardcoded Data (Source of Truth)
    const playerPerformance = [
        { name: "Kyrie", highlight: "18 points (prev game)", notes: "Multiple steals, floater, layups, free throws. Needs better defense." },
        { name: "Anton", highlight: "Very under control", notes: "Hit 2pt shot, And-1, multiple free throws, steal to layup." },
        { name: "A.D.", highlight: "83 good rebounds sequence", notes: "Layups, steals, blocks. 83 good rebounds and scores recorded." },
        { name: "Howard", highlight: "Defensive impact", notes: "Multiple steals, rebounds, deflections. Credited with made shot." },
        { name: "Quest", highlight: "Good floater", notes: "Steals, deflections. 1 turnover, missed 2 FTs." },
        { name: "Emory", highlight: "Back-to-back steals", notes: "Layup off steal (And-1), rebounds, caused travel." },
        { name: "Junior", highlight: "Starter vs Sydney", notes: "Assist to A.D., steal, rebound." },
        { name: "Cassius", highlight: "Steal credit", notes: "Good shot and layup off pass from Emory." },
        { name: "Ashton", highlight: "Layup and FT", notes: "Steal, good rebound, fouled on made layup." },
        { name: "Oliver", highlight: "Blocked shot", notes: "Multiple rebounds, steal." }
    ];

    const gameLog = [
        { id: 1, date: "12/13", opponent: "Heritage 5th Grade Silver", scoreUs: 23, scoreThem: 15, result: "W" },
        { id: 2, date: "12/14", opponent: "Slavens Storm 5th/11U", scoreUs: 22, scoreThem: 20, result: "W" },
        { id: 3, date: "12/14", opponent: "Slavens Storm 5th/11U", scoreUs: 20, scoreThem: 21, result: "L" },
        { id: 4, date: "12/14", opponent: "B and B 5th White", scoreUs: 13, scoreThem: 9, result: "W" },
        { id: 5, date: "1/17", opponent: "Flyers", scoreUs: 16, scoreThem: 30, result: "L" },
        { id: 6, date: "1/17", opponent: "Flyers (Second Team)", scoreUs: 12, scoreThem: 55, result: "L" },
        { id: 7, date: "2/21", opponent: "Premier", scoreUs: 18, scoreThem: 30, result: "L" },
        { id: 8, date: "4/5", opponent: "Future Legends Triple Threat", scoreUs: 18, scoreThem: 20, result: "L" },
        { id: 9, date: "4/12", opponent: "Hardwood", scoreUs: 28, scoreThem: 21, result: "W" },
        { id: 10, date: "4/12", opponent: "Elevation", scoreUs: 26, scoreThem: 19, result: "W" },
        { id: 11, date: "5/25", opponent: "Buffalo (Memorial Classic)", scoreUs: 27, scoreThem: 19, result: "W" },
        { id: 12, date: "5/25", opponent: "Top Flight (Memorial Classic)", scoreUs: null, scoreThem: null, result: "N/A" },
        { id: 13, date: "7/27", opponent: "55 Buckets", scoreUs: 6, scoreThem: 22, result: "L" },
        { id: 14, date: "7/27", opponent: "Elevation Flyers", scoreUs: 28, scoreThem: 8, result: "L" },
        { id: 15, date: "7/28", opponent: "Flyers", scoreUs: 27, scoreThem: 12, result: "L" },
        { id: 16, date: "7/28", opponent: "Premier", scoreUs: 18, scoreThem: 16, result: "L" }
    ];


    // --- TEMPLATE BUILDER ---
    let html = `
        <!-- Section Header -->
        <div style="font-size: 0.8rem; font-weight: 600; color: #8E8E93; text-transform: uppercase; margin-bottom: 8px; margin-left: 4px;">
            Season Overview
        </div>

        <!-- 1. Stats Cards (Grid) -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 24px;">
            
            <!-- Card 1: Record -->
            <div style="background: white; border-radius: 14px; padding: 16px; box-shadow: 0 2px 5px rgba(0,0,0,0.03);">
                <div style="display: flex; align-items: center; gap: 8px; marginBottom: 12px;">
                    <div style="width: 32px; height: 32px; background: #e3f2fd; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #007aff; font-size: 1.1rem;">📊</div>
                    <div style="font-weight: 700; color: #1d1d1f;">Record</div>
                </div>
                <div style="display: flex; justify-content: space-between; margin-top: 10px;">
                    <div style="text-align: center;">
                        <div style="font-size: 1.6rem; font-weight: 800; color: #1d1d1f;">${stats.gp}</div>
                        <div style="font-size: 0.7rem; color: #8E8E93; font-weight: 600;">GAMES</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="font-size: 1.6rem; font-weight: 800; color: #34C759;">${stats.wins}</div>
                        <div style="font-size: 0.7rem; color: #8E8E93; font-weight: 600;">WINS</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="font-size: 1.6rem; font-weight: 800; color: #FF3B30;">${stats.losses}</div>
                        <div style="font-size: 0.7rem; color: #8E8E93; font-weight: 600;">LOSSES</div>
                    </div>
                </div>
            </div>

            <!-- Card 2: Performance -->
            <div style="background: white; border-radius: 14px; padding: 16px; box-shadow: 0 2px 5px rgba(0,0,0,0.03);">
                <div style="display: flex; align-items: center; gap: 8px; marginBottom: 12px;">
                    <div style="width: 32px; height: 32px; background: #fff8e1; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #ff9500; font-size: 1.1rem;">⚡️</div>
                    <div style="font-weight: 700; color: #1d1d1f;">Scoring</div>
                </div>
                <div style="display: flex; justify-content: space-around; margin-top: 10px;">
                     <div style="text-align: center;">
                        <div style="font-size: 1.4rem; font-weight: 700; color: #1d1d1f;">${stats.avgPf}</div>
                        <div style="font-size: 0.7rem; color: #8E8E93; font-weight: 600;">AVG PF</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="font-size: 1.4rem; font-weight: 700; color: ${stats.margin >= 0 ? '#34C759' : '#FF3B30'};">
                            ${stats.margin > 0 ? '+' : ''}${stats.margin}
                        </div>
                        <div style="font-size: 0.7rem; color: #8E8E93; font-weight: 600;">DIFF</div>
                    </div>
                </div>
            </div>
        </div>

        <!-- 2. Player Highlights (Inset List) -->
        <div style="font-size: 0.8rem; font-weight: 600; color: #8E8E93; text-transform: uppercase; margin-bottom: 8px; margin-left: 4px;">
            Roster Scouting Report
        </div>
        <div style="background: white; border-radius: 14px; overflow: hidden; box-shadow: 0 2px 5px rgba(0,0,0,0.03); margin-bottom: 24px;">
            ${playerPerformance.map((p, i) => {
                // Sanitize player performance data
                const safeName = escapeHTML(String(p.name || ''));
                const safeHighlight = escapeHTML(String(p.highlight || ''));
                const safeNotes = escapeHTML(String(p.notes || ''));
                const safeInitial = safeName.charAt(0) || '';
                return `
                <div style="padding: 14px 16px; display: flex; align-items: flex-start; gap: 14px; ${i !== playerPerformance.length - 1 ? 'border-bottom: 1px solid #E5E5EA; margin-left: 16px; padding-left: 0;' : ''}">
                    <!-- Avatar/Initial -->
                    <div style="width: 36px; height: 36px; background: #F2F2F7; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.9rem; color: #8E8E93; flex-shrink: 0;">
                        ${safeInitial}
                    </div>
                    <div style="flex: 1;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                            <div style="font-weight: 600; color: #000; font-size: 0.95rem;">${safeName}</div>
                            <span style="font-size: 0.75rem; color: #FF9500; font-weight: 600; background: #FFF8E1; padding: 2px 6px; border-radius: 6px;">${safeHighlight}</span>
                        </div>
                        <div style="font-size: 0.9rem; color: #3C3C4399; line-height: 1.4;">${safeNotes}</div>
                    </div>
                </div>
            `;
            }).join('')}
        </div>

        <!-- 3. Game History (Table Card) -->
        <div style="font-size: 0.8rem; font-weight: 600; color: #8E8E93; text-transform: uppercase; margin-bottom: 8px; margin-left: 4px;">
            Game Log (First to Last)
        </div>
        <div style="background: white; border-radius: 14px; overflow: hidden; box-shadow: 0 2px 5px rgba(0,0,0,0.03);">
            <table style="width: 100%; border-collapse: collapse;">
                ${gameLog.map((g, i) => {
                    // Sanitize game log data
                    const safeDate = escapeHTML(String(g.date || ''));
                    const safeOpponent = escapeHTML(String(g.opponent || ''));
                    const safeResult = escapeHTML(String(g.result || ''));
                    const safeScoreUs = escapeHTML(String(g.scoreUs !== null && g.scoreUs !== undefined ? g.scoreUs : ''));
                    const safeScoreThem = escapeHTML(String(g.scoreThem !== null && g.scoreThem !== undefined ? g.scoreThem : ''));
                    const scoreText = g.result === 'N/A' ? 'N/A' : `${safeResult} ${safeScoreUs}-${safeScoreThem}`;
                    return `
                    <tr style="${i !== gameLog.length - 1 ? 'border-bottom: 1px solid #E5E5EA;' : ''}">
                        <td style="padding: 14px 16px; color: #8E8E93; font-size: 0.85rem; width: 60px; font-variant-numeric: tabular-nums;">${safeDate}</td>
                        <td style="padding: 14px 4px; font-weight: 500; color: #000; font-size: 0.9rem;">
                            ${safeOpponent}
                        </td>
                        <td style="padding: 14px 16px; text-align: right;">
                             <span style="
                                display: inline-block;
                                padding: 4px 10px;
                                border-radius: 6px;
                                font-weight: 700;
                                font-size: 0.8rem;
                                min-width: 60px;
                                text-align: center;
                                background: ${g.result === 'W' ? '#34C759' : g.result === 'L' ? '#FF3B30' : '#E5E5EA'};
                                color: ${g.result === 'N/A' ? '#8E8E93' : '#FFF'};
                             ">
                                ${scoreText}
                             </span>
                        </td>
                    </tr>
                `;
                }).join('')}
            </table>
        </div>
        
        <div style="height: 40px;"></div> <!-- Bottom spacer -->
    `;

    container.innerHTML = html;
}


// 8. War Room Tabs Logic
window.switchWarRoomTab = function (tabName) {
    const analysisView = document.getElementById('wr-view-analysis');
    const lifetimeView = document.getElementById('wr-view-lifetime');
    const tabAnalysis = document.getElementById('tab-wr-analysis');
    const tabLifetime = document.getElementById('tab-wr-lifetime');

    if (tabName === 'analysis') {
        analysisView.style.display = 'block';
        lifetimeView.style.display = 'none';

        tabAnalysis.style.background = 'white';
        tabAnalysis.style.color = 'black';
        tabAnalysis.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';

        tabLifetime.style.background = 'transparent';
        tabLifetime.style.color = '#666';
        tabLifetime.style.boxShadow = 'none';

    } else if (tabName === 'lifetime') {
        analysisView.style.display = 'none';
        lifetimeView.style.display = 'block';

        tabLifetime.style.background = 'white';
        tabLifetime.style.color = 'black';
        tabLifetime.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';

        tabAnalysis.style.background = 'transparent';
        tabAnalysis.style.color = '#666';
        tabAnalysis.style.boxShadow = 'none';

        renderLifetimeStats();
    }
}



// ==========================================
// EMAIL FUNCTIONALITY
// ==========================================

/**
 * Send training report email to parent
 * @param {string} athleteId - Athlete ID
 */
window.sendTrainingReportEmail = async function(athleteId) {
    if (!window.coachEmailService) {
        godspeedAlert('Email service not loaded. Please refresh the page.', 'Error');
        return;
    }
    
    const button = event?.target?.closest('button');
    if (button) {
        button.disabled = true;
        button.innerHTML = '<span style="display: inline-block; width: 16px; height: 16px; border: 2px solid currentColor; border-top-color: transparent; border-radius: 50%; animation: spin 0.6s linear infinite;"></span> Sending...';
    }
    
    try {
        const db = getDB();
        const athlete = db.roster?.find(a => a.athleteId === athleteId);
        const coachNotes = athlete?.notes || '';
        
        const result = await window.coachEmailService.sendTrainingReport(athleteId, coachNotes);
        
        if (result.success) {
            if (result.emailData) {
                // Email data prepared, need to send via API
                await sendEmailViaResend(result.emailData);
            }
            showEmailSuccess('Training report sent successfully!');
        } else {
            showEmailError(result.error || 'Failed to send training report');
        }
    } catch (error) {
        console.error('Error sending training report:', error);
        showEmailError('An error occurred while sending the email');
    } finally {
        if (button) {
            button.disabled = false;
            button.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                    <polyline points="22,6 12,13 2,6"></polyline>
                </svg>
                Email Training Report
            `;
        }
    }
};

/**
 * Send practice info email to parent
 * @param {string} athleteId - Athlete ID
 */
window.sendPracticeInfoEmail = async function(athleteId) {
    if (!window.coachEmailService) {
        godspeedAlert('Email service not loaded. Please refresh the page.', 'Error');
        return;
    }
    
    const button = event?.target?.closest('button');
    if (button) {
        button.disabled = true;
        button.innerHTML = '<span style="display: inline-block; width: 16px; height: 16px; border: 2px solid currentColor; border-top-color: transparent; border-radius: 50%; animation: spin 0.6s linear infinite;"></span> Sending...';
    }
    
    try {
        const result = await window.coachEmailService.sendPracticeInfo(athleteId);
        
        if (result.success) {
            if (result.emailData) {
                // Email data prepared, need to send via API
                await sendEmailViaResend(result.emailData);
            }
            showEmailSuccess('Practice info sent successfully!');
        } else {
            showEmailError(result.error || 'Failed to send practice info');
        }
    } catch (error) {
        console.error('Error sending practice info:', error);
        showEmailError('An error occurred while sending the email');
    } finally {
        if (button) {
            button.disabled = false;
            button.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                    <polyline points="22,6 12,13 2,6"></polyline>
                </svg>
                Email Practice Info
            `;
        }
    }
};

/**
 * Send email via Resend API
 * @param {Object} emailData - Email data object
 */
async function sendEmailViaResend(emailData) {
    // Check if Resend API key is available
    // Try multiple ways to get the key
    let resendKey = window.VITE_RESEND_API_KEY || '';
    // Check for Vite environment variable (only in module context)
    try {
        if (typeof import !== 'undefined' && typeof import.meta !== 'undefined') {
            const metaEnv = import.meta.env;
            if (metaEnv && metaEnv.VITE_RESEND_API_KEY) {
                resendKey = metaEnv.VITE_RESEND_API_KEY;
            }
        }
    } catch (e) {
        // Not in module context, ignore
    }
    
    if (!resendKey) {
        // Show helpful error with instructions
        const errorMsg = 'Resend API key not configured.\n\n' +
                        'To enable email sending:\n' +
                        '1. Get your Resend API key from https://resend.com/api-keys\n' +
                        '2. Add VITE_RESEND_API_KEY=your_key_here to your .env file\n' +
                        '3. Restart your development server\n\n' +
                        'Email data has been prepared and logged to console.';
        console.log('Email data prepared (API key missing):', emailData);
        throw new Error(errorMsg);
    }
    
    // In production, this should call a backend API endpoint for security
    // For development, we can call Resend directly if CORS allows
    try {
        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${resendKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                // For development: Use Resend's test domain or your verified domain
                // For production: Update to your verified domain (e.g., notifications@yourdomain.com)
                from: emailData.from || 'Godspeed Basketball <onboarding@resend.dev>',
                to: emailData.to,
                subject: emailData.subject,
                html: emailData.html
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to send email');
        }
        
        const result = await response.json();
        console.log('Email sent successfully:', result);
        return result;
    } catch (error) {
        console.error('Resend API error:', error);
        
        // If CORS error, provide helpful message
        if (error.message.includes('CORS') || error.message.includes('fetch')) {
            console.log('CORS error detected. Email data prepared:', emailData);
            throw new Error('CORS error: Email sending requires a backend API endpoint. Email data logged to console.');
        }
        
        // Fallback: show email data for manual sending
        console.log('Email data prepared (send failed):', emailData);
        throw error;
    }
}

/**
 * Show email success message
 * @param {string} message - Success message
 */
function showEmailSuccess(message) {
    // Create or update success notification
    let notification = document.getElementById('email-notification');
    if (!notification) {
        notification = document.createElement('div');
        notification.id = 'email-notification';
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #10b981;
            color: white;
            padding: 16px 24px;
            border-radius: 8px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            z-index: 10000;
            font-weight: 600;
            animation: slideIn 0.3s ease-out;
        `;
        document.body.appendChild(notification);
    }
    
    notification.textContent = message;
    notification.style.background = '#10b981';
    notification.style.display = 'block';
    
    setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => {
            notification.style.display = 'none';
            notification.style.opacity = '1';
        }, 300);
    }, 3000);
}

/**
 * Show email error message
 * @param {string} message - Error message
 */
function showEmailError(message) {
    // Create or update error notification
    let notification = document.getElementById('email-notification');
    if (!notification) {
        notification = document.createElement('div');
        notification.id = 'email-notification';
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #ef4444;
            color: white;
            padding: 16px 24px;
            border-radius: 8px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            z-index: 10000;
            font-weight: 600;
            animation: slideIn 0.3s ease-out;
        `;
        document.body.appendChild(notification);
    }
    
    notification.textContent = message;
    notification.style.background = '#ef4444';
    notification.style.display = 'block';
    
    setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => {
            notification.style.display = 'none';
            notification.style.opacity = '1';
        }, 300);
    }, 5000);
}

// Add spin animation for loading
if (typeof document !== 'undefined' && !document.getElementById('email-spin-style')) {
    const style = document.createElement('style');
    style.id = 'email-spin-style';
    style.textContent = `
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        @keyframes slideIn {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
    `;
    document.head.appendChild(style);
}

/**
 * Send bulk training reports to all parents
 */
window.sendBulkTrainingReports = async function() {
    if (!window.coachEmailService) {
        godspeedAlert('Email service not loaded. Please refresh the page.', 'Error');
        return;
    }
    
    const confirmed = await godspeedConfirm('Send training reports to ALL parents? This may take a few minutes.', 'Confirm Action');
    if (!confirmed) {
        return;
    }
    
    const db = getDB();
    const accounts = db.accounts || [];
    const athletes = db.roster || [];
    
    let successCount = 0;
    let errorCount = 0;
    const errors = [];
    
    showEmailSuccess('Starting bulk email send...');
    
    for (const account of accounts) {
        if (!account.email) continue;
        
        // Find athletes for this account
        const accountAthletes = athletes.filter(a => 
            account.athletes && account.athletes.includes(a.athleteId)
        );
        
        for (const athlete of accountAthletes) {
            try {
                const result = await window.coachEmailService.sendTrainingReport(athlete.athleteId, athlete.notes || '');
                if (result.success) {
                    if (result.emailData) {
                        await sendEmailViaResend(result.emailData);
                    }
                    successCount++;
                } else {
                    errorCount++;
                    errors.push(`${escapeHTML(String(athlete.name || ''))}: ${escapeHTML(String(result.error || 'Unknown error'))}`);
                }
            } catch (error) {
                errorCount++;
                errors.push(`${escapeHTML(String(athlete.name || ''))}: ${escapeHTML(String(error.message || 'Unknown error'))}`);
            }
        }
    }
    
    if (errorCount === 0) {
        showEmailSuccess(`Successfully sent ${successCount} training reports!`);
    } else {
        showEmailError(`Sent ${successCount} reports. ${errorCount} failed. Check console for details.`);
        console.error('Email errors:', errors);
    }
};

/**
 * Send bulk practice info to all parents
 */
window.sendBulkPracticeInfo = async function() {
    if (!window.coachEmailService) {
        godspeedAlert('Email service not loaded. Please refresh the page.', 'Error');
        return;
    }
    
    const confirmed = await godspeedConfirm('Send practice info to ALL parents? This may take a few minutes.', 'Confirm Action');
    if (!confirmed) {
        return;
    }
    
    const db = getDB();
    const accounts = db.accounts || [];
    const athletes = db.roster || [];
    
    let successCount = 0;
    let errorCount = 0;
    const errors = [];
    
    showEmailSuccess('Starting bulk email send...');
    
    for (const account of accounts) {
        if (!account.email) continue;
        
        // Find athletes for this account
        const accountAthletes = athletes.filter(a => 
            account.athletes && account.athletes.includes(a.athleteId)
        );
        
        for (const athlete of accountAthletes) {
            try {
                const result = await window.coachEmailService.sendPracticeInfo(athlete.athleteId);
                if (result.success) {
                    if (result.emailData) {
                        await sendEmailViaResend(result.emailData);
                    }
                    successCount++;
                } else {
                    errorCount++;
                    errors.push(`${escapeHTML(String(athlete.name || ''))}: ${escapeHTML(String(result.error || 'Unknown error'))}`);
                }
            } catch (error) {
                errorCount++;
                errors.push(`${escapeHTML(String(athlete.name || ''))}: ${escapeHTML(String(error.message || 'Unknown error'))}`);
            }
        }
    }
    
    if (errorCount === 0) {
        showEmailSuccess(`Successfully sent ${successCount} practice info emails!`);
    } else {
        showEmailError(`Sent ${successCount} emails. ${errorCount} failed. Check console for details.`);
        console.error('Email errors:', errors);
    }
};
