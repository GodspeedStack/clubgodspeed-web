// ============================================================
// admin-os.js — Godspeed Admin OS v3.01
// ============================================================
'use strict';

let osSupabase = null;
let currentPanel = 'dashboard';
let BLOG_POSTS = [], MEMOS = [], CAMPAIGNS = [], allPlayers = [], allRequests = [];
let allInstallments = [], allOrders = [], allBroadcasts = [], allCalEvents = [];
let allRosterAthletes = [];
let duesFilter = 'all', ordersFilter = 'all';
let rosterView = 'players'; // 'players' or 'parents
let calYear, calMonth, calView = 'month';
let teamRosterCache = {};

// ─── SHARED UTILITIES ───────────────────────────────────────
const fmt = (iso) => iso ? new Date(iso + (iso.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '--';
const fmtShort = (iso) => iso ? new Date(iso + (iso.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '--';
function fmt12(t) {
  if (!t) return '--';
  const m = t.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return t;
  let h = parseInt(m[1]); const min = m[2]; const ampm = h >= 12 ? 'PM' : 'AM';
  if (h === 0) h = 12; else if (h > 12) h -= 12;
  return `${h}:${min} ${ampm}`;
}

function showToast(message, type = 'success') {
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = message;
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3000);
}

function confirmModal(title, body, onConfirm) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center';
  const card = document.createElement('div');
  card.style.cssText = 'background:var(--card,#1e1e2e);border:1px solid var(--border,#333);border-radius:12px;padding:28px 32px;max-width:420px;width:90%;color:var(--fg,#e0e0e0);font-family:inherit';
  const h = document.createElement('div');
  h.style.cssText = 'font-size:16px;font-weight:700;margin-bottom:12px'; h.textContent = title;
  const p = document.createElement('div');
  p.style.cssText = 'font-size:14px;line-height:1.5;white-space:pre-line;color:var(--muted,#aaa);margin-bottom:24px'; p.textContent = body;
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:10px;justify-content:flex-end';
  const cancel = document.createElement('button');
  cancel.textContent = 'Cancel'; cancel.className = 'btn-xs btn-ghost';
  cancel.onclick = () => overlay.remove();
  const confirm = document.createElement('button');
  confirm.textContent = 'Add Anyway'; confirm.style.cssText = 'padding:8px 18px;border-radius:8px;border:none;background:#3b82f6;color:#fff;font-weight:600;cursor:pointer;font-size:13px';
  confirm.onclick = () => { overlay.remove(); onConfirm(); };
  row.append(cancel, confirm); card.append(h, p, row); overlay.append(card);
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  document.body.appendChild(overlay);
}

function statusTag(status) {
  const map = {
    paid: 'tag-green', completed: 'tag-green', delivered: 'tag-green', confirmed: 'tag-green', manual: 'tag-green',
    pending: 'tag-yellow', processing: 'tag-yellow', unfulfilled: 'tag-yellow', draft: 'tag-yellow', pending_venmo: 'tag-blue',
    overdue: 'tag-red', refunded: 'tag-red', denied: 'tag-red',
    shipped: 'tag-blue', sent: 'tag-blue', published: 'tag-green', partial: 'tag-yellow', unpaid: 'tag-red', waived: 'tag-gray'
  };
  return `<span class="tag ${map[status] || 'tag-gray'}">${status}</span>`;
}

// ─── INIT ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('topbar-date').textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const now = new Date(); calYear = now.getFullYear(); calMonth = now.getMonth();
  document.querySelectorAll('input[name="bc-audience"]').forEach(r => r.addEventListener('change', () => {
    document.getElementById('bc-team').style.display = r.value === 'team' && r.checked ? 'block' : 'none';
  }));
  init();
});

function getOrCreateSupabaseClient() {
  const fromAuth = window.auth?.getSupabaseClient?.();
  if (fromAuth) return fromAuth;
  const cfg = window.SUPABASE_CONFIG;
  if (cfg?.url && cfg?.anonKey && window.supabase?.createClient) {
    return window.supabase.createClient(cfg.url, cfg.anonKey, {
      auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true }
    });
  }
  return null;
}

async function init() {
  const loading = document.getElementById('loading');
  const loginScreen = document.getElementById('admin-login-screen');
  const msg = document.getElementById('loading-msg');

  function showLogin() { loading.style.display='none'; loginScreen.style.display='flex'; }

  // Hard timeout: if init takes >5s, force login screen
  const bailTimer = setTimeout(() => {
    console.warn('[admin-os] init timed out after 5s, showing login');
    showLogin();
  }, 5000);

  try {
    osSupabase = window.location.search.includes('preview=1') ? null : getOrCreateSupabaseClient();
    if (osSupabase) {
      msg.textContent = 'Verifying session...';

      // Race getSession against a 4s timeout to prevent hang on stale tokens
      const sessionResult = await Promise.race([
        osSupabase.auth.getSession(),
        new Promise(r => setTimeout(() => r({ data: { session: null }, error: 'timeout' }), 4000))
      ]);
      const session = sessionResult?.data?.session;
      if (!session) { clearTimeout(bailTimer); showLogin(); return; }

      // Refresh expired sessions before proceeding
      if (session.expires_at && session.expires_at < Math.floor(Date.now() / 1000)) {
        const { data: refreshed, error: refreshErr } = await Promise.race([
          osSupabase.auth.refreshSession(),
          new Promise(r => setTimeout(() => r({ data: null, error: 'timeout' }), 4000))
        ]);
        if (refreshErr || !refreshed?.session) { clearTimeout(bailTimer); showLogin(); return; }
      }

      msg.textContent = 'Verifying admin credentials...';
      const {data} = await osSupabase.from('profiles').select('role,approved,full_name,email').eq('id',session.user.id).single();
      if ((data?.role === 'director' || data?.role === 'coach') && data?.approved) {
        document.getElementById('director-name').textContent = data.full_name || (data?.role === 'director' ? 'Director' : 'Coach');
        document.getElementById('director-email').textContent = data.email;
        document.getElementById('director-initials').textContent = (data.full_name||'D').charAt(0).toUpperCase();
        clearTimeout(bailTimer);
        loading.style.display='none'; loginScreen.style.display='none';
        await loadDashboard(); loadTeamsDropdowns(); return;
      } else {
        clearTimeout(bailTimer);
        msg.textContent = 'Unauthorized: Coach or Director access required.';
        loading.querySelector('h2').style.webkitTextFillColor = '#ef4444';
        setTimeout(async()=>{ await osSupabase.auth.signOut(); window.location.reload(); },2000); return;
      }
    }
    clearTimeout(bailTimer);
    loading.style.display='none';
    document.getElementById('director-name').textContent='Offline Mode';
    document.getElementById('director-email').textContent='No connection';
    await loadDashboard();
  } catch(e) { clearTimeout(bailTimer); console.error(e); loading.style.display='none'; await loadDashboard(); }
}

// ─── LOGIN ──────────────────────────────────────────────────
window.handleAdminLogin = async function () {
  const email = document.getElementById('admin-email').value, password = document.getElementById('admin-pass').value;
  const btn = document.getElementById('admin-login-btn'), errBox = document.getElementById('login-error-box');
  btn.textContent = 'Authenticating...'; btn.disabled = true; errBox.style.display = 'none';
  try {
    if (!osSupabase) osSupabase = getOrCreateSupabaseClient();
    if (!osSupabase) throw new Error('Cannot connect to authentication service.');
    const { error } = await osSupabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    window.location.reload();
  } catch (e) {
    errBox.textContent = e.message === 'Invalid login credentials' ? 'Invalid email or password.' : e.message;
    errBox.style.display = 'block'; btn.textContent = 'Secure Login'; btn.disabled = false;
  }
};

// ─── PANEL ROUTING ──────────────────────────────────────────
const PANEL_TITLES = { dashboard: 'Dashboard', players: 'Players & Parents', onboarding: 'Onboarding', calendar: 'Schedule & Tournaments', dues: 'Season Dues', fundraising: 'Fundraising', orders: 'Pro Shop Orders', comms: 'Messaging', dataEntry: 'Data Entry', blog: 'Blog Posts', memos: 'Coach Memos' };

function switchPanel(id, btn) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.sb-link').forEach(b => b.classList.remove('active'));
  const panel = document.getElementById('panel-' + id);
  if (panel) panel.classList.add('active');
  if (btn) btn.classList.add('active');
  document.getElementById('panel-title').textContent = PANEL_TITLES[id] || id;
  currentPanel = id;
  const loaders = { players: () => { loadPlayers(); loadRequests(); }, onboarding: loadOnboarding, dues: loadDues, fundraising: loadFundraising, orders: loadOrders, comms: loadComms, dataEntry: loadDataEntry, calendar: () => { loadCalendar(); loadTournaments(); }, blog: loadBlog, memos: loadMemos };
  if (loaders[id]) loaders[id]();
}

function refreshCurrent() {
  const loaders = { dashboard: loadDashboard, players: () => { loadPlayers(); loadRequests(); }, onboarding: loadOnboarding, dues: loadDues, fundraising: loadFundraising, orders: loadOrders, comms: loadComms, calendar: () => { loadCalendar(); loadTournaments(); }, blog: loadBlog, memos: loadMemos };
  if (loaders[currentPanel]) loaders[currentPanel]();
}

// ─── SUB-TAB SWITCHING ──────────────────────────────────────
function switchPeopleTab(tab) {
  document.getElementById('people-tab-roster').style.cssText = tab === 'roster'
    ? 'padding:6px 16px;border-radius:6px;font-size:12px;font-weight:700;border:none;cursor:pointer;background:var(--primary);color:#fff;transition:all 0.15s'
    : 'padding:6px 16px;border-radius:6px;font-size:12px;font-weight:700;border:none;cursor:pointer;background:transparent;color:var(--muted);transition:all 0.15s';
  document.getElementById('people-tab-requests').style.cssText = tab === 'requests'
    ? 'padding:6px 16px;border-radius:6px;font-size:12px;font-weight:700;border:none;cursor:pointer;background:var(--primary);color:#fff;transition:all 0.15s'
    : 'padding:6px 16px;border-radius:6px;font-size:12px;font-weight:700;border:none;cursor:pointer;background:transparent;color:var(--muted);transition:all 0.15s';
  document.getElementById('people-roster').style.display = tab === 'roster' ? '' : 'none';
  document.getElementById('people-requests').style.display = tab === 'requests' ? '' : 'none';
}
window.switchPeopleTab = switchPeopleTab;

function switchCompTab(tab) {
  document.getElementById('comp-tab-schedule').style.cssText = tab === 'schedule'
    ? 'padding:6px 16px;border-radius:6px;font-size:12px;font-weight:700;border:none;cursor:pointer;background:var(--primary);color:#fff;transition:all 0.15s'
    : 'padding:6px 16px;border-radius:6px;font-size:12px;font-weight:700;border:none;cursor:pointer;background:transparent;color:var(--muted);transition:all 0.15s';
  document.getElementById('comp-tab-tournaments').style.cssText = tab === 'tournaments'
    ? 'padding:6px 16px;border-radius:6px;font-size:12px;font-weight:700;border:none;cursor:pointer;background:var(--primary);color:#fff;transition:all 0.15s'
    : 'padding:6px 16px;border-radius:6px;font-size:12px;font-weight:700;border:none;cursor:pointer;background:transparent;color:var(--muted);transition:all 0.15s';
  document.getElementById('comp-schedule').style.display = tab === 'schedule' ? '' : 'none';
  document.getElementById('comp-tournaments').style.display = tab === 'tournaments' ? '' : 'none';
}
window.switchCompTab = switchCompTab;

// ─── TEAMS DROPDOWN LOADER ─────────────────────────────────
async function loadTeamsDropdowns() {
  if (!osSupabase) return;
  try {
    const { data } = await osSupabase.from('teams').select('id,name').order('name');
    const teams = data || [];
    ['de-team', 'gm-team', 'bc-team'].forEach(selId => {
      const sel = document.getElementById(selId);
      if (!sel) return;
      const firstOpt = sel.querySelector('option');
      sel.innerHTML = '';
      if (firstOpt) sel.appendChild(firstOpt);
      teams.forEach(t => { const o = document.createElement('option'); o.value = t.id; o.textContent = t.name; sel.appendChild(o); });
    });
  } catch (e) { console.error('Teams load error:', e); }
}

// ─── DASHBOARD ──────────────────────────────────────────────
async function loadDashboard() {
  let profiles = [], requests = [], dues = [];
  try {
    if (osSupabase) {
      const [p, r, d] = await Promise.all([
        osSupabase.from('profiles').select('id,approved').eq('approved', true),
        osSupabase.from('login_requests').select('id,full_name,email,status,created_at').eq('status', 'pending').order('created_at', { ascending: false }).limit(10),
        osSupabase.from('parent_dues_enrollment').select('id,total_owed,total_paid,status'),
      ]);
      profiles = p.data || []; requests = r.data || []; dues = d.data || [];
      // Seed allRequests so approve/deny from dashboard works optimistically
      if (!allRequests.length && requests.length) allRequests = requests.map(r => ({ ...r }));
    }
  } catch (e) { }
  const collected = dues.reduce((a, d) => a + (+d.total_paid || 0), 0);
  const outstanding = dues.reduce((a, d) => a + ((+d.total_owed || 0) - (+d.total_paid || 0)), 0);
  document.getElementById('m-members').textContent = profiles.filter(p => p.approved).length;
  document.getElementById('m-pending').textContent = requests.length;
  document.getElementById('m-collected').textContent = '$' + collected.toFixed(0);
  document.getElementById('m-outstanding').textContent = '$' + outstanding.toFixed(0);
  document.getElementById('pending-badge').textContent = requests.length;
  renderDashboardPending(requests);

  const unpaid = dues.filter(d => d.payment_status === 'unpaid' || d.payment_status === 'partial');
  document.getElementById('dash-dues-list').innerHTML = unpaid.length ? unpaid.slice(0, 4).map(d => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
      <div><div style="font-weight:600;font-size:13px">${d.full_name}</div><div style="color:var(--muted);font-size:11px">Balance: $${(+d.balance).toFixed(0)}</div></div>
      ${statusTag(d.payment_status)}
    </div>`).join('') : '<p style="color:var(--muted);font-size:13px">All dues current!</p>';

  document.getElementById('dash-activity').innerHTML = '<p style="color:var(--muted);font-size:13px">No recent activity.</p>';
}

function renderDashboardPending(requests) {
  document.getElementById('dash-pending-list').innerHTML = requests.length ? requests.slice(0, 4).map(r => `
    <div data-req-id="${r.id}" style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
      <div><div style="font-weight:600;font-size:13px">${r.full_name || r.email}</div><div style="color:var(--muted);font-size:11px">${r.email}</div></div>
      <div style="display:flex;gap:6px">
        <button class="btn btn-ghost btn-xs" onclick="approveReq('${r.id}','${r.email}')">Approve</button>
        <button class="btn btn-ghost btn-xs" onclick="denyReq('${r.id}','${r.email}')">Deny</button>
      </div>
    </div>`).join('') : '<p style="color:var(--muted);font-size:13px">No pending requests.</p>';
  // Update counters
  document.getElementById('m-pending').textContent = requests.length;
  document.getElementById('pending-badge').textContent = requests.length;
}

// ─── PLAYERS & PARENTS ──────────────────────────────────────
async function loadPlayers() {
  try {
    if (!osSupabase) return;
    // Load profiles (parents) for the parent view and linking
    const { data: profiles } = await osSupabase.from('profiles').select('*').order('full_name');
    allPlayers = profiles || [];
    // Load roster with linked parents via RPC
    const { data: roster, error } = await osSupabase.rpc('get_roster_with_parents');
    if (!error) allRosterAthletes = roster || [];
  } catch (e) { console.error('loadPlayers:', e); }
  if (rosterView === 'players') renderRosterByPlayer(allRosterAthletes); else renderRosterByParent(allPlayers);
}

function switchRosterView(view) {
  rosterView = view;
  document.querySelectorAll('.roster-tab').forEach(t => t.classList.toggle('active', t.dataset.view === view));
  if (view === 'players') renderRosterByPlayer(allRosterAthletes); else renderRosterByParent(allPlayers);
}

// ── Position label map ──
const POS_LABELS = { PG: 'Point Guard', SG: 'Shooting Guard', SF: 'Small Forward', PF: 'Power Forward', C: 'Center', G: 'Guard', F: 'Forward', UTIL: 'Utility' };

// ── Player-centric view ──
function renderRosterByPlayer(arr) {
  const q = (document.getElementById('player-search')?.value || '').toLowerCase();
  const filtered = q ? arr.filter(a => (a.display_name || '').toLowerCase().includes(q) || (a.parents || []).some(p => (p.full_name || '').toLowerCase().includes(q) || (p.email || '').toLowerCase().includes(q))) : arr;
  const tbody = document.getElementById('players-tbody');
  if (!filtered.length) { tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:var(--muted);padding:32px">No players found. Click "+ Add" to add a player.</td></tr>'; return; }
  const esc = s => (s || '').replace(/"/g, '&quot;');
  tbody.innerHTML = filtered.map(a => {
    const parentPhones = (a.parents || []).map(p => p.phone).filter(Boolean).join(', ') || '--';
    const dobStr = a.date_of_birth ? new Date(a.date_of_birth + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '--';
    const posLabel = a.position ? POS_LABELS[a.position] || a.position : '--';
    const enrolled = a.enrollment_status === 'active';
    // Parent link: show linked parent name or "Link" button
    const parentLink = (a.parents || []).length
      ? (a.parents || []).map(p => `<span style="font-size:12px">${p.full_name || p.email}</span>`).join('<br>')
      : `<button class="btn-tbl btn-tbl-add" onclick="openLinkParent('${a.athlete_id}','${esc(a.display_name)}')">Link</button>`;
    return `<tr>
      <td><button class="btn-tbl btn-tbl-add" onclick="openModal('add-player')" title="Add player">+</button></td>
      <td style="text-align:center;font-weight:700;color:var(--muted)">${a.jersey_number != null ? a.jersey_number : '--'}</td>
      <td><input class="row-input" value="${esc(a.display_name)}" data-athlete-id="${a.athlete_id}" data-orig-first="${esc(a.first_name)}" data-orig-last="${esc(a.last_name)}" onblur="savePlayerInline(this)" onkeydown="if(event.key==='Enter'){this.blur()}" placeholder="Player name"></td>
      <td style="color:var(--muted);font-size:12px">${parentPhones}</td>
      <td style="color:var(--muted);font-size:12px">${dobStr}</td>
      <td>${a.grade ? statusTag(a.grade) : '--'}</td>
      <td style="font-size:12px">${posLabel}</td>
      <td>${enrolled ? '<span class="tag tag-green">Yes</span>' : '<span class="tag tag-red">No</span>'}</td>
      <td>${parentLink}</td>
      <td><button class="btn-tbl btn-tbl-rm" onclick="removeAthlete('${a.athlete_id}','${esc(a.display_name)}')" title="Remove player">&minus;</button></td></tr>`;
  }).join('');
}

// ── Parent-centric view ──
function renderRosterByParent(arr) {
  const q = (document.getElementById('player-search')?.value || '').toLowerCase();
  const parentOnly = arr.filter(p => p.role === 'parent');
  const filtered = q ? parentOnly.filter(p => (p.full_name || '').toLowerCase().includes(q) || (p.email || '').toLowerCase().includes(q) || (p.player_name || '').toLowerCase().includes(q)) : parentOnly;
  const tbody = document.getElementById('players-tbody');
  if (!filtered.length) { tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:32px">No parents found.</td></tr>'; return; }
  const esc = s => (s || '').replace(/"/g, '&quot;');
  tbody.innerHTML = filtered.map(p => `<tr>
    <td><div style="display:flex;align-items:center;gap:8px"><div class="avatar">${(p.full_name || p.email)[0].toUpperCase()}</div><div><input class="row-input" value="${esc(p.full_name)}" data-profile-id="${p.id}" data-field="full_name" onblur="saveParentInline(this)" onkeydown="if(event.key==='Enter'){this.blur()}" placeholder="Parent name"><div style="color:var(--muted);font-size:11px;padding-left:6px">${p.role}</div></div></div></td>
    <td><input class="row-input row-input-sm" value="${esc(p.player_name)}" data-profile-id="${p.id}" data-field="player_name" onblur="saveParentInline(this)" onkeydown="if(event.key==='Enter'){this.blur()}" placeholder="Player name"></td>
    <td>${p.grade ? statusTag(p.grade) : '--'}</td>
    <td style="color:var(--muted)">${p.email}</td>
    <td style="color:var(--muted)">${p.phone || '--'}</td>
    <td>${statusTag(p.approved ? 'Approved' : 'Pending')}</td>
    <td>
      <button class="btn btn-ghost btn-xs" onclick="viewParentProfile('${p.id}')">View</button>
      <button class="btn btn-ghost btn-xs" onclick="impersonateParent('${p.id}','${esc(p.full_name || p.email)}')">View as</button>
    </td></tr>`).join('');
}

// ── Admin impersonation: mint a single-use magic link for the target parent ──
// Opens the parent-portal in a new tab so admin sees exactly what they see.
// Every invocation writes an append-only row to impersonation_audit.
async function impersonateParent(targetUserId, targetLabel) {
  if (!osSupabase) { showToast('Not signed in', 'error'); return; }
  const reason = window.prompt(
    `View as "${targetLabel}"?\n\nEnter a brief reason (required, logged to audit):`,
    ''
  );
  if (reason === null) return; // user cancelled
  const trimmed = (reason || '').trim();
  if (trimmed.length < 3) { showToast('Reason must be at least 3 characters', 'error'); return; }

  try {
    const { data: session } = await osSupabase.auth.getSession();
    const token = session?.session?.access_token;
    if (!token) { showToast('Session expired — sign in again', 'error'); return; }

    const res = await fetch(
      `${osSupabase.supabaseUrl}/functions/v1/admin-impersonate`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ target_user_id: targetUserId, reason: trimmed }),
      }
    );

    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = payload?.error || `HTTP ${res.status}`;
      showToast('Impersonation failed: ' + msg, 'error');
      return;
    }

    // Open the magic link in a new tab. Advise incognito in the toast.
    const link = payload.action_link;
    if (!link) { showToast('No link returned', 'error'); return; }
    window.open(link, '_blank', 'noopener,noreferrer');
    showToast('Opened view-as session. Use an incognito window to avoid signing out of admin.', 'info');
  } catch (e) {
    showToast('Error: ' + (e.message || String(e)), 'error');
  }
}

// ── Inline save: player name ──
async function savePlayerInline(el) {
  const athleteId = el.dataset.athleteId;
  const newName = el.value.trim();
  if (!newName || !athleteId || !osSupabase) return;
  const parts = newName.split(/\s+/);
  const firstName = parts[0];
  const lastName = parts.slice(1).join(' ');
  // Skip save if unchanged
  if (firstName === el.dataset.origFirst && lastName === el.dataset.origLast) return;
  try {
    const { error } = await osSupabase.from('athletes').update({ first_name: firstName, last_name: lastName }).eq('id', athleteId);
    if (error) { showToast('Save failed: ' + error.message, 'error'); return; }
    el.classList.add('saved'); setTimeout(() => el.classList.remove('saved'), 1200);
    // Update roster cache
    const a = allRosterAthletes.find(x => x.athlete_id === athleteId);
    const newDisplay = firstName + (lastName ? ' ' + lastName : '');
    if (a) { a.first_name = firstName; a.last_name = lastName; a.display_name = newDisplay; }
    el.dataset.origFirst = firstName; el.dataset.origLast = lastName;
    // Sync player_name on linked parent profiles so Parents tab stays current
    if (a && a.parents) {
      for (const pp of a.parents) {
        const p = allPlayers.find(x => x.id === pp.profile_id);
        if (p) p.player_name = newDisplay;
        await osSupabase.from('profiles').update({ player_name: newDisplay }).eq('id', pp.profile_id).then(() => { });
      }
    }
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

// ── Inline save: parent name / player_name on profile ──
async function saveParentInline(el) {
  const profileId = el.dataset.profileId;
  const field = el.dataset.field;
  const newVal = el.value.trim();
  if (!profileId || !field || !osSupabase) return;
  try {
    const { error } = await osSupabase.from('profiles').update({ [field]: newVal }).eq('id', profileId);
    if (error) { showToast('Save failed: ' + error.message, 'error'); return; }
    el.classList.add('saved'); setTimeout(() => el.classList.remove('saved'), 1200);
    // Update profiles cache (Parents tab source)
    const p = allPlayers.find(x => x.id === profileId);
    if (p) p[field] = newVal;
    // Sync into roster cache (Players tab source) so tab switch reflects changes
    allRosterAthletes.forEach(a => { (a.parents || []).forEach(pp => { if (pp.profile_id === profileId) pp[field] = newVal; }); });
    // If parent full_name changed, also update parent_dues_enrollment.parent_name for dues consistency
    if (field === 'full_name') {
      await osSupabase.from('parent_dues_enrollment').update({ parent_name: newVal }).eq('parent_email', p?.email).then(() => { });
    }
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

function filterPlayers() {
  if (rosterView === 'players') renderRosterByPlayer(allRosterAthletes); else renderRosterByParent(allPlayers);
}

// ── Remove athlete (soft-delete: set enrollment_status = 'inactive') ──
async function removeAthlete(athleteId, name) {
  if (!confirm(`Remove ${name} from the active roster? They will be set to inactive.`)) return;
  try {
    if (!osSupabase) return;
    const { error } = await osSupabase.from('athletes').update({ enrollment_status: 'inactive' }).eq('id', athleteId);
    if (error) { showToast('Remove failed: ' + error.message, 'error'); return; }
    allRosterAthletes = allRosterAthletes.filter(a => a.athlete_id !== athleteId);
    renderRosterByPlayer(allRosterAthletes);
    showToast(`${name} removed from active roster`);
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}
window.removeAthlete = removeAthlete;

// ── Link parent to athlete modal ──
function openLinkParent(athleteId, athleteName) {
  // Build parent selector from allPlayers (profiles with role=parent, no link to this athlete yet)
  const linkedIds = new Set((allRosterAthletes.find(a => a.athlete_id === athleteId)?.parents || []).map(p => p.profile_id));
  const available = allPlayers.filter(p => p.role === 'parent' && !linkedIds.has(p.id));
  if (!available.length) { showToast('No unlinked parent accounts available. A parent must register first.', 'info'); return; }
  const options = available.map(p => `<option value="${p.id}">${p.full_name || p.email} (${p.email})</option>`).join('');
  document.getElementById('modal-body').innerHTML = `
    <div class="field"><label>Select Parent Account</label><select id="link-parent-select" style="width:100%">${options}</select></div>
    <div class="field"><label>Relationship</label><select id="link-parent-rel" style="width:100%"><option value="guardian">Guardian</option><option value="mother">Mother</option><option value="father">Father</option><option value="other">Other</option></select></div>
    <button class="btn btn-primary" style="width:100%;margin-top:12px" onclick="doLinkParent('${athleteId}')">Link Parent</button>`;
  document.getElementById('modal-title').textContent = 'Link Parent to ' + athleteName;
  document.getElementById('modal-overlay').classList.add('open');
}
window.openLinkParent = openLinkParent;

async function doLinkParent(athleteId) {
  const profileId = document.getElementById('link-parent-select').value;
  const rel = document.getElementById('link-parent-rel').value;
  if (!profileId || !osSupabase) return;
  try {
    const { error } = await osSupabase.rpc('link_parent_to_athlete', { p_profile_id: profileId, p_athlete_id: athleteId, p_relationship: rel, p_is_primary: false });
    if (error) { showToast('Link failed: ' + error.message, 'error'); return; }
    closeModal();
    showToast('Parent linked successfully');
    await loadPlayers(); // Refresh roster with new link
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}
window.doLinkParent = doLinkParent;

// ── View Athlete Detail (player-centric) ──
function viewAthlete(athleteId) {
  const a = allRosterAthletes.find(x => x.athlete_id === athleteId); if (!a) return;
  openModal('view-player');
  document.getElementById('modal-title').textContent = a.display_name;
  const parentsHtml = (a.parents || []).length ? (a.parents || []).map(p => `
    <div style="padding:12px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-weight:600">${p.full_name || '--'}</div>
          <div style="color:var(--muted);font-size:12px">${p.email} ${p.phone ? ' | ' + p.phone : ''}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px">${p.relationship || 'guardian'} ${p.is_primary ? '(primary)' : ''}</div>
        </div>
        <div style="display:flex;align-items:center;gap:6px">${statusTag(p.approved ? 'Approved' : 'Pending')}</div>
      </div>
    </div>`).join('') : '<p style="color:var(--muted)">No parents linked yet.</p>';
  document.getElementById('modal-body').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
      <div><label style="font-size:11px;color:var(--muted)">Player Name</label><div style="margin-top:4px;font-weight:600">${a.display_name}</div></div>
      <div><label style="font-size:11px;color:var(--muted)">Grade</label><div style="margin-top:4px">${a.grade || '--'}</div></div>
      <div><label style="font-size:11px;color:var(--muted)">Status</label><div style="margin-top:4px">${statusTag(a.enrollment_status === 'active' ? 'Active' : 'Inactive')}</div></div>
    </div>
    <h3 style="font-size:13px;font-weight:700;margin-bottom:8px;color:var(--muted)">LINKED PARENTS</h3>
    ${parentsHtml}
    <button class="btn btn-primary" style="width:100%;margin-top:12px" onclick="openLinkParentModal('${athleteId}','${a.display_name}')"><i data-lucide="user-plus" style="width:16px;height:16px;margin-right:6px"></i>Link Parent Account</button>`;
  if (window.lucide) lucide.createIcons();
}

// ── View Parent Profile ──
function viewParentProfile(id) {
  const p = allPlayers.find(x => x.id === id); if (!p) return;
  openModal('view-player');
  document.getElementById('modal-title').textContent = p.full_name || p.email;
  document.getElementById('modal-body').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px">
      <div><label style="font-size:11px;color:var(--muted)">Parent Name</label><div style="margin-top:4px">${p.full_name || '--'}</div></div>
      <div><label style="font-size:11px;color:var(--muted)">Email</label><div style="margin-top:4px">${p.email}</div></div>
      <div><label style="font-size:11px;color:var(--muted)">Phone</label><div style="margin-top:4px">${p.phone || '--'}</div></div>
      <div><label style="font-size:11px;color:var(--muted)">Player(s)</label><div style="margin-top:4px">${p.player_name || '--'}</div></div>
      <div><label style="font-size:11px;color:var(--muted)">Grade</label><div style="margin-top:4px">${p.grade || '--'}</div></div>
      <div><label style="font-size:11px;color:var(--muted)">Status</label><div style="margin-top:4px;display:flex;align-items:center;gap:8px">${statusTag(p.approved ? 'Approved' : 'Pending')}${!p.approved ? `<button class="btn btn-ghost btn-xs" onclick="approveProfile('${p.id}')">Approve</button>` : ''}</div></div>
    </div>
    <div style="border-top:1px solid var(--border);padding-top:12px;margin-top:4px">
      <button class="btn btn-ghost btn-sm" onclick="resendVerification('${p.email}')" style="width:100%;justify-content:center;gap:6px"><i data-lucide="mail" style="width:14px;height:14px"></i>Resend Email Verification</button>
    </div>`;
}

// ─── PARENT IMPERSONATION ────────────────────────────────────
async function impersonateParent(targetUserId, targetLabel) {
  const reason = prompt('Reason for viewing as ' + targetLabel + ':');
  if (reason === null) return;
  if (!reason || reason.trim().length < 3) {
    showToast('Please enter a reason (at least 3 characters)', 'error');
    return;
  }
  if (!osSupabase) { showToast('Not connected', 'error'); return; }
  try {
    const { data: { session } } = await osSupabase.auth.getSession();
    if (!session) { showToast('Session expired - please log in again', 'error'); return; }
    const fnBase = (osSupabase.supabaseUrl || window.SUPABASE_CONFIG?.url || '').replace(/\/$/, '');
    const anonKey = window.SUPABASE_CONFIG?.anonKey || '';
    const res = await fetch(fnBase + '/functions/v1/admin-impersonate', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + session.access_token,
        'apikey': anonKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ target_user_id: targetUserId, reason: reason.trim() })
    });
    const json = await res.json();
    if (!res.ok) {
      const code = res.status;
      showToast((json.error || ('Error ' + code)), 'error');
      return;
    }
    window.open(json.action_link, '_blank', 'noopener,noreferrer');
    showToast('Opened in new tab - use incognito window for clean session');
  } catch (e) {
    showToast('Impersonation failed: ' + e.message, 'error');
  }
}
window.impersonateParent = impersonateParent;

// ── Link existing parent to athlete ──
function openLinkParentModal(athleteId, athleteName) {
  closeModal();
  openModal('link-parent');
  document.getElementById('modal-title').textContent = 'Link Parent to ' + athleteName;
  const parentOpts = allPlayers.filter(p => p.role === 'parent').map(p => `<option value="${p.id}">${p.full_name || p.email}</option>`).join('');
  document.getElementById('modal-body').innerHTML = `
    <div class="field"><label>Select Existing Parent</label><select id="lp-profile" style="width:100%"><option value="">-- Select Parent --</option>${parentOpts}</select></div>
    <div style="text-align:center;color:var(--muted);margin:12px 0;font-size:12px">-- OR add new parent below --</div>
    <div class="field"><label>New Parent Name</label><input type="text" id="lp-name" placeholder="e.g. Jane Smith"></div>
    <div class="field"><label>New Parent Email</label><input type="email" id="lp-email" placeholder="e.g. jane@email.com"></div>
    <div class="field"><label>Relationship</label><select id="lp-rel"><option value="mother">Mother</option><option value="father">Father</option><option value="guardian" selected>Guardian</option><option value="stepparent">Stepparent</option><option value="other">Other</option></select></div>
    <button class="btn btn-primary" style="width:100%;margin-top:8px" onclick="linkParentToAthlete('${athleteId}')">Link Parent</button>`;
}

async function linkParentToAthlete(athleteId) {
  if (!osSupabase) return;
  let profileId = document.getElementById('lp-profile').value;
  const newName = document.getElementById('lp-name').value.trim();
  const newEmail = document.getElementById('lp-email').value.trim();
  const rel = document.getElementById('lp-rel').value;
  try {
    // If no existing parent selected, create new profile
    if (!profileId && newEmail) {
      const { data: existing } = await osSupabase.from('profiles').select('id').eq('email', newEmail.toLowerCase()).maybeSingle();
      if (existing) { profileId = existing.id; }
      else {
        const { data: ins, error: insErr } = await osSupabase.from('profiles').insert({ email: newEmail.toLowerCase(), full_name: newName, role: 'parent', approved: true }).select('id').single();
        if (insErr) { showToast('Error creating parent: ' + insErr.message, 'error'); return; }
        profileId = ins.id;
      }
    }
    if (!profileId) { showToast('Select a parent or enter a new email', 'error'); return; }
    const { error } = await osSupabase.rpc('link_parent_to_athlete', { p_profile_id: profileId, p_athlete_id: athleteId, p_relationship: rel, p_is_primary: false });
    if (error) { showToast('Link failed: ' + error.message, 'error'); return; }
    showToast('Parent linked!'); closeModal(); loadPlayers();
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

async function approveProfile(id) {
  if (!confirm('Approve this profile?')) return;
  try {
    if (!osSupabase) return;
    // Fetch profile before update so we have email/name for the welcome email
    const { data: prof, error: fetchErr } = await osSupabase.from('profiles').select('email,full_name').eq('id', id).single();
    if (fetchErr) throw fetchErr;
    // Persist approval
    const { error: updateErr } = await osSupabase.from('profiles').update({ approved: true }).eq('id', id);
    if (updateErr) throw updateErr;
    // Update local cache immediately so re-render reflects new state
    const cached = allPlayers.find(x => x.id === id);
    if (cached) cached.approved = true;
    // Re-render the modal in-place — shows Approved status, hides Approve button
    viewParentProfile(id);
    // Send welcome email. The approval already enqueued a durable row
    // (trg_queue_welcome), so even if this direct send fails the 5-min cron
    // drain will retry. Surface the true outcome instead of assuming success.
    let emailNote = ' — welcome email queued';
    try {
      const { data: fnData, error: fnErr } = await osSupabase.functions.invoke('send-welcome-email', {
        body: { email: prof.email, full_name: prof.full_name || '' }
      });
      if (!fnErr && fnData && fnData.sent) emailNote = ' — welcome email sent';
      else console.warn('Welcome email not sent immediately, left for cron retry:', fnErr || fnData);
    } catch (e) { console.warn('Welcome email invoke failed (queued for retry):', e); }
    showToast('Profile approved' + emailNote);
    loadPlayers(); // refresh backing table in background
  } catch (e) { showToast('Failed: ' + e.message, 'error'); }
}

// ─── LOGIN REQUESTS ─────────────────────────────────────────
async function loadRequests() {
  try { if (osSupabase) { const { data } = await osSupabase.from('login_requests').select('id,full_name,email,requested_role,grade,player_name,status,created_at,ip_address').order('created_at', { ascending: false }); allRequests = data || []; } } catch (e) { }
  renderRequests(allRequests);
}
function renderRequests(arr) {
  const pending = arr.filter(r => r.status === 'pending');
  const resolved = arr.filter(r => r.status !== 'pending');
  document.getElementById('req-count-label').textContent = `${pending.length} pending`;
  document.getElementById('pending-badge').textContent = pending.length;
  const rtb = document.getElementById('req-tab-badge'); if (rtb) rtb.textContent = pending.length;
  let rows = '';
  if (!pending.length) {
    rows = '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--muted)">No pending requests.</td></tr>';
  } else {
    rows = pending.map(r => {
      const d = fmt(r.created_at);
      return `<tr><td style="font-weight:600">${r.full_name || '--'}</td><td style="color:var(--muted)">${r.email}</td>
        <td>${statusTag(r.requested_role)}</td><td>${r.grade || '--'} ${r.player_name ? '/ ' + r.player_name : ''}</td>
        <td style="color:var(--muted);font-size:12px">${d}</td><td style="color:var(--muted);font-size:11px">${r.ip_address || '--'}</td>
        <td><div style="display:flex;gap:6px"><button class="btn btn-ghost btn-xs" style="color:#34c759" onclick="approveReq('${r.id}','${r.email}')">Approve</button><button class="btn btn-ghost btn-xs" style="color:#ff3b30" onclick="denyReq('${r.id}','${r.email}')">Deny</button><button class="btn btn-ghost btn-xs" onclick="resendVerification('${r.email}')" title="Resend verification email">Resend</button></div></td></tr>`;
    }).join('');
  }
  // Resolved history (collapsed)
  if (resolved.length) {
    rows += `<tr><td colspan="7" style="padding:12px 0 4px"><button class="btn btn-ghost btn-xs" onclick="document.querySelectorAll('.resolved-row').forEach(el=>el.style.display=el.style.display==='none'?'':'none')" style="font-size:11px;color:var(--muted)">Show ${resolved.length} resolved</button></td></tr>`;
    rows += resolved.map(r => {
      const d = fmt(r.created_at);
      return `<tr class="resolved-row" style="display:none;opacity:0.5"><td style="font-weight:600">${r.full_name || '--'}</td><td style="color:var(--muted)">${r.email}</td>
        <td>${statusTag(r.requested_role)}</td><td>${r.grade || '--'} ${r.player_name ? '/ ' + r.player_name : ''}</td>
        <td style="color:var(--muted);font-size:12px">${d}</td><td style="color:var(--muted);font-size:11px">${r.ip_address || '--'}</td>
        <td>${statusTag(r.status)}</td></tr>`;
    }).join('');
  }
  document.getElementById('req-tbody').innerHTML = rows;
}
function syncDashboardPending() {
  const pending = allRequests.filter(r => r.status === 'pending');
  document.getElementById('m-pending').textContent = pending.length;
  document.getElementById('pending-badge').textContent = pending.length;
  const reqTabBadge = document.getElementById('req-tab-badge');
  if (reqTabBadge) reqTabBadge.textContent = pending.length;
  renderDashboardPending(pending);
}

async function approveReq(id, email) {
  if (!confirm(`Approve ${email}?`)) return;
  // Optimistic UI: remove from allRequests + scrub from DOM immediately
  allRequests = allRequests.filter(r => r.id !== id);
  renderRequests(allRequests);
  syncDashboardPending();
  // Also remove from dashboard DOM directly (covers case where allRequests wasn't loaded)
  document.querySelectorAll(`[data-req-id="${id}"]`).forEach(el => el.remove());
  showToast(`${email} approved`);
  // DB + welcome email in background
  try {
    if (!osSupabase) return;
    await osSupabase.rpc('approve_login_request', { request_id: id });
    const { data: prof } = await osSupabase.from('profiles').select('full_name').eq('email', email).maybeSingle();
    // approve_login_request flipped approved -> true, which enqueued a durable
    // welcome-email row. This direct send is best-effort; the 5-min cron drain
    // retries if it fails, so we never silently lose the email.
    try {
      const { data: fnData, error: fnErr } = await osSupabase.functions.invoke('send-welcome-email', {
        body: { email, full_name: prof?.full_name || '' }
      });
      if (!fnErr && fnData && fnData.sent) showToast(`Welcome email sent to ${email}`);
      else { console.warn('Welcome email not sent immediately, queued for cron retry:', fnErr || fnData); showToast(`${email} approved — welcome email queued`); }
    } catch (e) { console.warn('Welcome email invoke failed (queued for retry):', e); showToast(`${email} approved — welcome email queued`); }
  } catch (e) { console.error(e); showToast('Approve failed: ' + e.message, 'error'); }
}
async function denyReq(id, email) {
  const reason = prompt(`Reason for denying ${email}? (optional)`);
  if (reason === null) return;
  // Optimistic UI: remove from allRequests + scrub from DOM immediately
  allRequests = allRequests.filter(r => r.id !== id);
  renderRequests(allRequests);
  syncDashboardPending();
  document.querySelectorAll(`[data-req-id="${id}"]`).forEach(el => el.remove());
  showToast(`${email} denied`);
  // DB in background
  try { if (osSupabase) await osSupabase.rpc('deny_login_request', { request_id: id, reason }); }
  catch (e) { console.error(e); showToast('Deny failed: ' + e.message, 'error'); }
}

// ─── FUNDRAISING ────────────────────────────────────────────
let allFundraising = [];

async function loadFundraising() {
  if (!osSupabase) return;
  try {
    const [frRes, enrRes] = await Promise.all([
      osSupabase.from('fundraising_totals').select('*').order('total_raised', { ascending: false }),
      osSupabase.from('parent_dues_enrollment').select('athlete_name,parent_name,total_owed,total_paid,status')
    ]);
    const fundraisingRows = frRes.data || [];
    const enrollments = enrRes.data || [];

    // Match fundraising to enrollment by first name (enrollment uses first name only)
    allFundraising = enrollments.map(e => {
      const firstName = (e.athlete_name || '').split(' ')[0].toLowerCase();
      const match = fundraisingRows.find(f => {
        const fFirst = (f.athlete_name || '').split(' ')[0].toLowerCase();
        return fFirst === firstName;
      });
      return {
        athlete: e.athlete_name,
        parent: e.parent_name,
        totalOwed: parseFloat(e.total_owed) || 0,
        totalPaid: parseFloat(e.total_paid) || 0,
        duesStatus: e.status,
        raised: match ? parseFloat(match.total_raised) || 0 : 0,
        parentShares: match ? match.parent_shares : 0,
        emailShares: match ? match.email_shares : 0,
        smsShares: match ? match.sms_shares : 0,
        fullName: match ? match.athlete_name : e.athlete_name
      };
    }).sort((a, b) => b.raised - a.raised);
  } catch (e) { console.error('Fundraising load:', e); }
  renderFundraising();
}

function renderFundraising() {
  const totalRaised = allFundraising.reduce((s, r) => s + r.raised, 0);
  const participants = allFundraising.filter(r => r.raised > 0).length;
  const avg = participants ? totalRaised / participants : 0;

  document.getElementById('fr-total-raised').textContent = '$' + totalRaised.toFixed(0);
  document.getElementById('fr-participants').textContent = participants;
  document.getElementById('fr-avg').textContent = '$' + avg.toFixed(0);

  const container = document.getElementById('fundraising-cards');
  if (!allFundraising.length) {
    container.innerHTML = '<div style="text-align:center;color:var(--muted);padding:32px">No enrollment data found</div>';
    return;
  }

  const maxOwed = Math.max(...allFundraising.map(r => r.totalOwed), 1);

  container.innerHTML = `<div style="display:grid;grid-template-columns:180px 1fr 100px;padding:10px 20px;border-bottom:1px solid var(--border)">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--muted)">Player</div>
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--muted)">Progress</div>
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--muted);text-align:right">Remaining</div>
  </div>` + allFundraising.map((r, idx) => {
    const remaining = Math.max(r.totalOwed - r.totalPaid - r.raised, 0);
    const progressPct = Math.min(((r.totalPaid + r.raised) / r.totalOwed) * 100, 100);
    const delay = idx * 60;
    const isZero = remaining <= 0;

    // Build breakdown chips
    let chips = `<span style="font-size:11px;color:var(--muted)">$${r.totalOwed.toFixed(0)} dues</span>`;
    if (r.totalPaid > 0) chips += `<span style="font-size:11px;color:rgba(37,99,235,0.8)">$${r.totalPaid.toFixed(0)} paid</span>`;
    if (r.raised > 0) chips += `<span style="font-size:11px;color:rgba(37,99,235,0.8)">$${r.raised.toFixed(0)} raised</span>`;
    if (isZero) chips += `<span style="font-size:10px;font-weight:700;color:var(--text);background:rgba(37,99,235,0.15);padding:1px 6px;border-radius:4px">COVERED</span>`;

    return `<div class="fr-row fr-animate" style="animation-delay:${delay}ms">
      <div>
        <div style="font-weight:700;font-size:14px;color:var(--text)">${r.fullName || r.athlete}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px">${r.parent || '--'}</div>
      </div>
      <div>
        <div class="fr-bar-track">
          <div class="fr-bar-progress" data-width="${progressPct}" style="width:0%"></div>
        </div>
        <div style="display:flex;gap:10px;margin-top:5px;flex-wrap:wrap;align-items:center">
          ${chips}
        </div>
      </div>
      <div style="text-align:right;font-size:18px;font-weight:800;font-variant-numeric:tabular-nums;color:${isZero ? 'rgba(37,99,235,0.7)' : 'var(--text)'}">
        ${isZero ? '$0' : '$' + remaining.toFixed(0)}
      </div>
    </div>`;
  }).join('');

  // Trigger bar animations after DOM paint
  requestAnimationFrame(() => {
    setTimeout(() => {
      container.querySelectorAll('.fr-bar-progress').forEach(el => { el.style.width = el.dataset.width + '%'; });
    }, 50);
  });
}

// ─── EMAIL VERIFICATION RESEND ──────────────────────────────
async function resendVerification(email) {
  if (!osSupabase) { showToast('Not connected', 'error'); return; }
  try {
    showToast(`Sending verification to ${email}...`);
    const { data, error } = await osSupabase.functions.invoke('resend-verification', {
      body: { email }
    });
    if (error) throw error;
    if (data?.status === 'already_confirmed') {
      showToast(`${email} is already verified`, 'info');
    } else {
      showToast(`Verification email sent to ${email}`);
    }
  } catch (e) {
    const msg = e.message || String(e);
    showToast(`Resend failed: ${msg}`, 'error');
  }
}

async function resendAllVerifications() {
  if (!osSupabase) { showToast('Not connected', 'error'); return; }
  const parents = allPlayers.filter(p => p.role === 'parent' && p.email);
  if (!parents.length) { showToast('No parent profiles found', 'error'); return; }
  if (!confirm(`Resend verification emails to all ${parents.length} parent accounts?\n\nAlready-verified users will be skipped automatically.`)) return;
  let sent = 0, skipped = 0, failed = 0;
  showToast(`Sending verification emails to ${parents.length} users...`);
  for (const p of parents) {
    try {
      const { data, error } = await osSupabase.functions.invoke('resend-verification', {
        body: { email: p.email }
      });
      if (error) { failed++; console.warn(`Resend failed for ${p.email}:`, error); continue; }
      if (data?.status === 'already_confirmed') skipped++;
      else sent++;
    } catch (e) { failed++; console.warn(`Resend error for ${p.email}:`, e); }
  }
  showToast(`Verification emails: ${sent} sent, ${skipped} already verified, ${failed} failed`);
}

// ─── SEASON DUES ────────────────────────────────────────────
async function loadDues() {
  try {
    if (osSupabase) {
      const { data, error } = await osSupabase.from('dues_installments').select(`id,installment_number,amount,due_date,status,paid_at,enrollment:parent_dues_enrollment!enrollment_id(id,parent_name,parent_email,athlete_name,total_owed,total_paid,status)`).order('due_date', { ascending: true });
      if (!error) allInstallments = data || [];
      else {
        const { data: d } = await osSupabase.from('payment_summary').select('*');
        allInstallments = (d || []).map((r, i) => ({ id: r.id || i, amount: r.amount_due, due_date: null, status: r.payment_status === 'paid' ? 'paid' : r.payment_status, paid_at: null, enrollment: { user: { full_name: r.full_name, email: r.email || '' } } }));
      }
      // Load dues_payments submitted via parent portal Pay Tuition flow
      try {
        const { data: dp } = await osSupabase.from('dues_payments').select('*').order('payment_date', { ascending: false }).limit(50);
        if (dp && dp.length) renderDuesPaymentsFeed(dp);
      } catch (e) { /* table may not exist yet */ }
    }
  } catch (e) { console.error('Dues load:', e); }
  renderDues();
  loadQuickPayParents();

  // Realtime: push toast when a parent submits a new payment
  if (osSupabase && !window._duesPaymentsChannel) {
    window._duesPaymentsChannel = osSupabase
      .channel('admin-dues-payments')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'dues_payments' }, (payload) => {
        const isVenmo = payload.new.status === 'pending_venmo';
        showToast(`${isVenmo ? '📱' : '💳'} ${isVenmo ? 'Venmo pending' : 'Payment'}: ${payload.new.parent_name || payload.new.parent_email} — $${(+payload.new.amount).toFixed(2)}`);
        loadDues();
      }).subscribe();
  }
}

function renderDuesPaymentsFeed(payments) {
  let feedEl = document.getElementById('dues-payments-feed');
  if (!feedEl) {
    const duesPanel = document.getElementById('panel-dues');
    if (!duesPanel) return;
    const card = document.createElement('div');
    card.className = 'card';
    card.id = 'dues-payments-feed';
    card.style.marginBottom = '20px';
    card.innerHTML = `<div class="card-header"><h2>Portal Payments</h2><span style="font-size:12px;color:var(--muted)">Submitted via parent portal</span></div>
      <table><thead><tr><th>Parent</th><th>Player</th><th>Amount</th><th>Note</th><th>Date</th><th>Status</th><th></th></tr></thead><tbody id="dpf-tbody"></tbody></table>`;
    duesPanel.insertBefore(card, duesPanel.firstChild);
    feedEl = card;
  }
  const tbody = document.getElementById('dpf-tbody');
  if (!tbody) return;
  tbody.innerHTML = payments.map(p => {
    const d = p.payment_date ? new Date(p.payment_date).toLocaleDateString() : '--';
    const done = p.status === 'completed' || p.status === 'manual';
    const isVenmoPending = p.status === 'pending_venmo';
    const displayStatus = isVenmoPending ? 'Venmo Pending' : p.status;
    let actionBtn = '';
    if (isVenmoPending) {
      actionBtn = `<button class="btn btn-primary btn-xs" style="background:#34c759;border-color:#34c759" onclick="confirmVenmoPayment('${p.id}','${(+p.amount).toFixed(2)}','${(p.parent_email || '').replace(/'/g, "\\'")}','${(p.player_name || '').replace(/'/g, "\\'")}')">Confirm</button>`;
    } else if (!done) {
      actionBtn = `<button class="btn btn-ghost btn-xs" onclick="markDuesPaymentPaid('${p.id}')">Mark Paid</button>`;
    }
    return `<tr${isVenmoPending ? ' style="background:rgba(0,140,255,0.06)"' : ''}>
      <td style="font-weight:600">${p.parent_name || p.parent_email || '--'}</td>
      <td style="color:var(--muted)">${p.player_name || '--'}</td>
      <td>$${(+p.amount).toFixed(2)}</td>
      <td style="color:var(--muted);font-size:12px">${p.note || '--'}</td>
      <td style="color:var(--muted);font-size:12px">${d}</td>
      <td>${statusTag(displayStatus)}</td>
      <td>${actionBtn}</td>
    </tr>`;
  }).join('');
}
async function markDuesPaymentPaid(id) {
  if (!confirm('Mark this payment as completed?')) return;
  try { if (osSupabase) await osSupabase.from('dues_payments').update({ status: 'manual' }).eq('id', id); }
  catch (e) { showToast('Error: ' + e.message, 'error'); return; }
  showToast('Payment marked as completed'); loadDues();
}
async function confirmVenmoPayment(paymentId, amount, parentEmail, playerName) {
  if (!confirm(`Confirm Venmo payment of $${amount} from ${parentEmail || playerName}?`)) return;
  try {
    if (!osSupabase) return;
    // 1. Mark dues_payments row as completed
    await osSupabase.from('dues_payments').update({ status: 'completed' }).eq('id', paymentId);
    // 2. Find enrollment and update total_paid
    if (parentEmail) {
      const { data: enr } = await osSupabase.from('parent_dues_enrollment').select('id,total_paid,total_owed,status').eq('parent_email', parentEmail).maybeSingle();
      if (enr) {
        const newPaid = parseFloat(enr.total_paid || 0) + parseFloat(amount);
        const newStatus = newPaid >= parseFloat(enr.total_owed) ? 'paid_in_full' : enr.status;
        await osSupabase.from('parent_dues_enrollment').update({ total_paid: newPaid, status: newStatus }).eq('id', enr.id);
      }
    }
    // 3. Find next unpaid installment and mark it paid
    if (parentEmail) {
      const { data: inst } = await osSupabase.from('dues_installments')
        .select('id,enrollment:parent_dues_enrollment!enrollment_id(parent_email)')
        .in('status', ['pending', 'overdue'])
        .order('installment_number', { ascending: true }).limit(50);
      const match = (inst || []).find(i => i.enrollment?.parent_email === parentEmail);
      if (match) await osSupabase.from('dues_installments').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', match.id);
    }
    showToast('Venmo payment confirmed'); loadDues();
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}
function renderDues() {
  let items = allInstallments;
  if (duesFilter !== 'all') items = items.filter(i => i.status === duesFilter);
  const paid = allInstallments.filter(i => i.status === 'paid' || i.status === 'completed');
  const paidTotal = paid.reduce((a, i) => a + (+i.amount || 0), 0);
  const pending = allInstallments.filter(i => i.status === 'pending' || i.status === 'overdue');
  const outTotal = pending.reduce((a, i) => a + (+i.amount || 0), 0);
  const overdue = allInstallments.filter(i => i.status === 'overdue');
  const enrolled = new Set(allInstallments.map(i => i.enrollment?.id)).size;

  document.getElementById('d-enrolled').textContent = enrolled;
  document.getElementById('d-collected').textContent = '$' + paidTotal.toFixed(0);
  document.getElementById('d-outstanding').textContent = '$' + outTotal.toFixed(0);
  document.getElementById('d-overdue').textContent = overdue.length;

  document.querySelectorAll('#dues-filters .filter-chip').forEach(c => c.classList.toggle('active', c.textContent.toLowerCase() === duesFilter));

  document.getElementById('dues-tbody').innerHTML = items.length ? items.map((inst, idx) => `<tr>
    <td style="font-weight:600">${inst.enrollment?.parent_name || '--'}</td><td style="color:var(--muted)">${inst.enrollment?.athlete_name || '--'}</td>
    <td>#${inst.installment_number || idx + 1}</td><td>$${(+inst.amount || 0).toFixed(0)}</td><td style="color:var(--muted)">${fmtShort(inst.due_date)}</td>
    <td>${statusTag(inst.status)}</td><td style="color:var(--muted)">${inst.paid_at ? fmtShort(inst.paid_at) : '--'}</td>
    <td><div style="display:flex;gap:4px">${inst.status !== 'paid' ? `<button class="btn btn-ghost btn-xs" onclick="markInstallmentPaid('${inst.id}')">Mark Paid</button>` : `<button class="btn btn-ghost btn-xs" style="color:#ff453a" onclick="deletePayment('${inst.id}','${(inst.enrollment?.id || '')}','${(inst.enrollment?.parent_email || '').replace(/'/g, "\\'")}',${+inst.amount || 0})">Delete</button>`}</div></td>
  </tr>`).join('') : '<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:32px">No installments found</td></tr>';
  renderFamilyBalances();
}
function filterDues(f) { duesFilter = f; renderDues(); }

// ─── FAMILY BALANCES — settle a family / a team / everyone in one click ──────
// Backed by the mark_family_paid / mark_enrollments_paid RPCs (v13_01 migration).
// There is no team column on the enrollment, so a "team" = the set of families
// the director checks off, then hits "Settle selected".
function renderFamilyBalances() {
  const panel = document.getElementById('panel-dues');
  if (!panel) return;

  // One row per enrollment (family); balance from authoritative enrollment totals.
  const fams = new Map();
  allInstallments.forEach(i => {
    const e = i.enrollment;
    if (!e || !e.id || fams.has(e.id)) return;
    const owed = +e.total_owed || 0, paid = +e.total_paid || 0;
    fams.set(e.id, {
      id: e.id, parent: e.parent_name || e.parent_email || '--',
      athlete: e.athlete_name || '--', balance: Math.max(owed - paid, 0),
      status: e.status || (owed - paid <= 0 ? 'paid_in_full' : 'active')
    });
  });
  const families = [...fams.values()].sort((a, b) => b.balance - a.balance);
  const outstanding = families.filter(f => f.balance > 0);

  let card = document.getElementById('dues-families');
  if (!card) {
    card = document.createElement('div');
    card.className = 'card';
    card.id = 'dues-families';
    card.style.marginBottom = '20px';
    // Insert directly above the installments table card.
    const anchor = document.getElementById('dues-tbody')?.closest('.card') || panel.firstChild;
    panel.insertBefore(card, anchor);
  }

  card.innerHTML = `
    <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
      <div><h2>Family Balances</h2><span style="font-size:12px;color:var(--muted)">Settle a family, a team (select rows), or everyone at once</span></div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost btn-xs" onclick="settleSelectedFamilies()">Settle selected</button>
        <button class="btn btn-primary btn-xs" onclick="settleAllOutstandingFamilies()"${outstanding.length ? '' : ' disabled'}>Settle all outstanding (${outstanding.length})</button>
      </div>
    </div>
    <table>
      <thead><tr>
        <th style="width:32px"><input type="checkbox" onclick="toggleAllFamilies(this)" title="Select all outstanding"></th>
        <th>Family</th><th>Athlete</th><th>Balance</th><th>Status</th><th></th>
      </tr></thead>
      <tbody id="fam-tbody">${
        families.length ? families.map(f => `<tr>
          <td>${f.balance > 0 ? `<input type="checkbox" class="fam-check" data-enrollment-id="${f.id}">` : ''}</td>
          <td style="font-weight:600">${f.parent}</td>
          <td style="color:var(--muted)">${f.athlete}</td>
          <td style="font-weight:600">$${f.balance.toFixed(0)}</td>
          <td>${statusTag(f.status)}</td>
          <td>${f.balance > 0
            ? `<button class="btn btn-ghost btn-xs" onclick="settleFamilyDues('${f.id}','${f.parent.replace(/'/g, "\\'")}',${f.balance})">Settle family</button>`
            : '<span style="color:var(--muted);font-size:12px">Paid</span>'}</td>
        </tr>`).join('') : '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:24px">No families enrolled</td></tr>'
      }</tbody>
    </table>`;
}

function toggleAllFamilies(master) {
  document.querySelectorAll('#fam-tbody .fam-check').forEach(cb => { cb.checked = master.checked; });
}

function getCheckedFamilyIds() {
  return [...document.querySelectorAll('#fam-tbody .fam-check:checked')].map(cb => cb.dataset.enrollmentId);
}

async function settleFamilyDues(enrollmentId, parentName, balance) {
  if (!confirm(`Mark ${parentName} paid in full? This clears their $${(+balance).toFixed(0)} balance.`)) return;
  await _runSettle(() => osSupabase.rpc('mark_family_paid', { p_enrollment_id: enrollmentId }), '1 family settled');
}

async function settleSelectedFamilies() {
  const ids = getCheckedFamilyIds();
  if (!ids.length) { showToast('Select at least one family first', 'error'); return; }
  if (!confirm(`Mark ${ids.length} selected famil${ids.length === 1 ? 'y' : 'ies'} paid in full?`)) return;
  await _runSettle(() => osSupabase.rpc('mark_enrollments_paid', { p_enrollment_ids: ids }), `${ids.length} families settled`);
}

async function settleAllOutstandingFamilies() {
  const ids = [...document.querySelectorAll('#fam-tbody .fam-check')].map(cb => cb.dataset.enrollmentId);
  if (!ids.length) { showToast('No outstanding families', 'error'); return; }
  if (!confirm(`Mark ALL ${ids.length} outstanding families paid in full? This settles the whole club.`)) return;
  await _runSettle(() => osSupabase.rpc('mark_enrollments_paid', { p_enrollment_ids: ids }), `${ids.length} families settled`);
}

// Shared runner: calls the RPC, surfaces errors (incl. "migration not applied"), reloads.
async function _runSettle(fn, successMsg) {
  if (!osSupabase) { showToast('Not connected', 'error'); return; }
  try {
    const { data, error } = await fn();
    if (error) throw error;
    if (data && data.ok === false) throw new Error(data.error || 'Settlement rejected');
    showToast(successMsg);
    loadDues();
  } catch (e) {
    const msg = /function .* does not exist/i.test(e.message || '')
      ? 'Settle RPC missing — apply the v13_01 migration first.'
      : (e.message || 'Settlement failed');
    showToast('Error: ' + msg, 'error');
  }
}
async function markInstallmentPaid(id) {
  if (!confirm('Mark this installment as paid?')) return;
  try { if (osSupabase) await osSupabase.from('dues_installments').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', id); }
  catch (e) { showToast('Error: ' + e.message, 'error'); return; }
  showToast('Installment marked as paid'); loadDues();
}

// ─── DELETE / REVERSE PAYMENT ──────────────────────────────
function deletePayment(installmentId, enrollmentId, parentEmail, amount) {
  if (!osSupabase) return;
  amount = parseFloat(amount) || 0;

  // Look up context
  let parentName = parentEmail || '--';
  let athleteName = '--';
  if (enrollmentId) {
    const enrMatch = _qpEnrollments.find(e => e.id === enrollmentId);
    if (enrMatch) { parentName = enrMatch.parent_name || parentEmail; athleteName = enrMatch.athlete_name || '--'; }
  }

  // Modal overlay -- always visible regardless of scroll
  let overlay = document.getElementById('delete-pay-overlay');
  if (overlay) overlay.remove();

  overlay = document.createElement('div');
  overlay.id = 'delete-pay-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px)';
  overlay.innerHTML =
    '<div style="background:var(--card-bg,#1c1c1e);border:1px solid rgba(255,69,58,0.3);border-radius:16px;padding:24px 28px;max-width:380px;width:90%">' +
    '<div style="font-weight:700;font-size:16px;color:#ff453a;margin-bottom:14px">Delete Payment</div>' +
    '<div style="display:grid;grid-template-columns:auto 1fr;gap:6px 14px;font-size:14px;color:#fff">' +
    '<span style="color:var(--muted)">Player</span><span style="font-weight:600">' + athleteName + '</span>' +
    '<span style="color:var(--muted)">Parent</span><span>' + parentName + '</span>' +
    '<span style="color:var(--muted)">Amount</span><span style="font-weight:700;color:#ff453a">$' + amount.toFixed(2) + '</span>' +
    '</div>' +
    '<div style="margin-top:10px;font-size:12px;color:var(--muted)">Reverses admin tables, parent portal, and enrollment totals.</div>' +
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:18px">' +
    '<button id="del-cancel-btn" class="btn btn-sm" style="padding:8px 18px;border-radius:10px;font-size:13px;font-weight:600;background:transparent;border:1px solid var(--border);color:var(--muted)">Cancel</button>' +
    '<button id="del-confirm-btn" class="btn btn-sm" style="padding:8px 22px;border-radius:10px;font-size:13px;font-weight:700;background:#ff453a;color:#fff;border:none">Delete Payment</button>' +
    '</div>' +
    '</div>';

  document.body.appendChild(overlay);

  // Close on backdrop click or Cancel
  overlay.addEventListener('click', (ev) => { if (ev.target === overlay) overlay.remove(); });
  document.getElementById('del-cancel-btn').onclick = () => overlay.remove();

  // Confirm handler
  document.getElementById('del-confirm-btn').onclick = async () => {
    const btn = document.getElementById('del-confirm-btn');
    btn.disabled = true; btn.textContent = 'Deleting...';
    try {
      await executeDeletePayment(installmentId, enrollmentId, parentEmail, amount);
      overlay.remove();
      showToast('Payment deleted and reversed');
      loadDues();
    } catch (e) {
      btn.disabled = false; btn.textContent = 'Delete Payment';
      showToast('Delete error: ' + e.message, 'error');
    }
  };
}

async function executeDeletePayment(installmentId, enrollmentId, parentEmail, amount) {
  if (!osSupabase) throw new Error('Not connected');

  // Single atomic RPC call -- reverses all 4 tables in one transaction
  const { data, error } = await osSupabase.rpc('reverse_payment', {
    p_installment_id: installmentId,
    p_enrollment_id: enrollmentId || null,
    p_parent_email: parentEmail || null,
    p_amount: amount
  });

  if (error) throw new Error(error.message);
  if (data && !data.ok) throw new Error(data.error || 'Reversal failed');
}

// ─── QUICK-RECORD PAYMENT BAR ──────────────────────────────
let _qpEnrollments = [];

async function loadQuickPayParents() {
  if (!osSupabase) return;
  const select = document.getElementById('qp-parent');
  if (!select) return;
  try {
    const { data } = await osSupabase.from('parent_dues_enrollment')
      .select('id,parent_name,parent_email,athlete_name,total_owed,total_paid,status')
      .order('athlete_name', { ascending: true });
    _qpEnrollments = data || [];
    // Clear and rebuild
    select.innerHTML = '<option value="">Select parent...</option>';
    _qpEnrollments.forEach(e => {
      const remaining = Math.max((parseFloat(e.total_owed) || 0) - (parseFloat(e.total_paid) || 0), 0);
      const label = (e.athlete_name || '--') + ' -- ' + (e.parent_name || e.parent_email || '--');
      const suffix = e.status === 'paid_in_full' ? ' [PAID]' : remaining > 0 ? ' [$' + remaining.toFixed(0) + ' due]' : '';
      const opt = document.createElement('option');
      opt.value = e.id;
      opt.textContent = label + suffix;
      opt.dataset.email = e.parent_email || '';
      opt.dataset.name = e.parent_name || '';
      opt.dataset.athlete = e.athlete_name || '';
      opt.dataset.remaining = remaining;
      if (e.status === 'paid_in_full') opt.style.color = '#6b7280';
      select.appendChild(opt);
    });
  } catch (e) { console.error('Quick pay parents load:', e); }
}

function selectPayMethod(el) {
  document.querySelectorAll('#qp-method-pills .qp-pill').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
}

function qpFeedback(msg, type) {
  const el = document.getElementById('qp-feedback');
  if (!el) return;
  el.style.display = 'block';
  el.style.color = type === 'error' ? '#ff453a' : type === 'success' ? '#34c759' : 'var(--muted)';
  el.textContent = msg;
  if (type === 'success') setTimeout(() => { el.style.display = 'none'; }, 4000);
}

function qpShowConfirm() {
  const select = document.getElementById('qp-parent');
  const amountInput = document.getElementById('qp-amount');
  const enrollmentId = select?.value;
  const amount = parseFloat(amountInput?.value);
  const method = document.querySelector('#qp-method-pills .qp-pill.active')?.dataset?.method || 'venmo';

  if (!enrollmentId) { qpFeedback('Select a parent first.', 'error'); select?.focus(); return; }
  if (!amount || amount <= 0) { qpFeedback('Enter a valid amount.', 'error'); amountInput?.focus(); return; }
  if (!osSupabase) { qpFeedback('Not connected.', 'error'); return; }

  const opt = select.options[select.selectedIndex];
  const athleteName = opt.dataset.athlete || '--';
  const parentName = opt.dataset.name || opt.dataset.email || '--';
  const remaining = parseFloat(opt.dataset.remaining) || 0;
  const afterBalance = Math.max(remaining - amount, 0);

  const confirmEl = document.getElementById('qp-confirm');
  const summaryEl = document.getElementById('qp-confirm-summary');
  summaryEl.innerHTML =
    '<div style="font-weight:700;font-size:15px;margin-bottom:6px">Confirm Payment</div>' +
    '<div style="display:grid;grid-template-columns:auto 1fr;gap:4px 12px;font-size:14px">' +
    '<span style="color:var(--muted)">Player</span><span style="font-weight:600">' + athleteName + '</span>' +
    '<span style="color:var(--muted)">Parent</span><span>' + parentName + '</span>' +
    '<span style="color:var(--muted)">Amount</span><span style="font-weight:700;color:#34c759">$' + amount.toFixed(2) + '</span>' +
    '<span style="color:var(--muted)">Method</span><span style="text-transform:capitalize">' + method + '</span>' +
    '<span style="color:var(--muted)">Balance after</span><span>$' + afterBalance.toFixed(2) + ' remaining</span>' +
    '</div>';
  confirmEl.style.display = 'block';
  qpFeedback('', '');
  document.getElementById('qp-submit').style.display = 'none';
}

function qpCancelConfirm() {
  document.getElementById('qp-confirm').style.display = 'none';
  document.getElementById('qp-submit').style.display = '';
  qpFeedback('', '');
}

async function quickRecordPayment() {
  // Hide confirmation panel, show progress on the main bar
  document.getElementById('qp-confirm').style.display = 'none';
  document.getElementById('qp-submit').style.display = '';

  const select = document.getElementById('qp-parent');
  const amountInput = document.getElementById('qp-amount');
  const btn = document.getElementById('qp-submit');
  const enrollmentId = select?.value;
  const amount = parseFloat(amountInput?.value);
  const method = document.querySelector('#qp-method-pills .qp-pill.active')?.dataset?.method || 'venmo';

  if (!enrollmentId || !amount || amount <= 0 || !osSupabase) return;

  const opt = select.options[select.selectedIndex];
  const parentEmail = opt.dataset.email;
  const parentName = opt.dataset.name;
  const athleteName = opt.dataset.athlete;

  btn.disabled = true; btn.textContent = 'Recording...';
  qpFeedback('', '');

  try {
    // 1. Find next unpaid installment for this enrollment
    qpFeedback('Step 1/6: Finding installment...', '');
    let installmentId = null;
    const { data: unpaid, error: unpaidErr } = await osSupabase.from('dues_installments')
      .select('id,amount')
      .eq('enrollment_id', enrollmentId)
      .in('status', ['pending', 'overdue'])
      .order('due_date')
      .limit(1)
      .maybeSingle();
    if (unpaidErr) throw new Error('Step 1 installment lookup: ' + unpaidErr.message);
    if (unpaid) {
      installmentId = unpaid.id;
    } else {
      const { data: inst, error: instErr } = await osSupabase.from('dues_installments').insert({
        enrollment_id: enrollmentId,
        installment_number: 99,
        amount: amount,
        due_date: new Date().toISOString().split('T')[0],
        status: 'pending'
      }).select('id').single();
      if (instErr) throw new Error('Step 1 installment create: ' + instErr.message);
      installmentId = inst.id;
    }

    // 2. Record the dues_payment
    qpFeedback('Step 2/6: Recording payment...', '');
    const { error: payErr } = await osSupabase.from('dues_payments').insert({
      enrollment_id: enrollmentId,
      installment_id: installmentId,
      stripe_payment_intent: 'manual_' + method + '_' + Date.now(),
      amount: amount,
      currency: 'usd',
      status: 'succeeded',
      paid_at: new Date().toISOString(),
      parent_email: parentEmail,
      parent_name: parentName,
      player_name: athleteName
    });
    if (payErr) throw new Error('Step 2 dues_payment: ' + payErr.message);

    // 3. Mark installment paid
    qpFeedback('Step 3/6: Marking installment paid...', '');
    const { error: markErr } = await osSupabase.from('dues_installments').update({
      status: 'paid',
      paid_at: new Date().toISOString()
    }).eq('id', installmentId);
    if (markErr) console.warn('Step 3 installment mark:', markErr.message);

    // 4. Update enrollment total_paid + status
    qpFeedback('Step 4/6: Updating enrollment...', '');
    const { data: enr, error: enrErr } = await osSupabase.from('parent_dues_enrollment')
      .select('total_paid,total_owed,status,athlete_id')
      .eq('id', enrollmentId).single();
    if (enrErr) console.warn('Step 4 enrollment read:', enrErr.message);
    if (enr) {
      const newPaid = (parseFloat(enr.total_paid) || 0) + amount;
      const newStatus = newPaid >= parseFloat(enr.total_owed) ? 'paid_in_full' : 'active';
      await osSupabase.from('parent_dues_enrollment').update({
        total_paid: newPaid,
        status: newStatus
      }).eq('id', enrollmentId);
    }

    // 5. Sync to parent-portal tables (payment_plans + payments)
    qpFeedback('Step 5/6: Syncing to parent portal...', '');
    if (parentEmail) {
      try {
        const { data: prof } = await osSupabase.from('profiles')
          .select('id').eq('email', parentEmail).maybeSingle();
        if (prof) {
          // Scope the plan to this enrollment's athlete. maybeSingle() on parent_id
          // alone used to ERROR for any family with two athletes (two plans), which
          // silently skipped the whole portal sync -- the parent's portal kept showing
          // a balance the admin had already settled.
          const enrAthleteId = enr && enr.athlete_id ? enr.athlete_id : null;
          let pp = null;
          // Set when payment_plans.athlete_id does not exist yet (migration v10_01
          // applied by hand, so the app can genuinely run ahead of it).
          let noAthleteCol = false;

          if (enrAthleteId) {
            const { data: scoped, error: ppErr } = await osSupabase.from('payment_plans')
              .select('id,total_amount')
              .eq('parent_id', prof.id).eq('athlete_id', enrAthleteId)
              .order('created_at', { ascending: false }).limit(1);
            if (ppErr) {
              noAthleteCol = String(ppErr.code || '') === '42703' ||
                (String(ppErr.message || '').toLowerCase().includes('athlete_id') &&
                 String(ppErr.message || '').toLowerCase().includes('does not exist'));
              console.warn('Step 5 plan lookup:', ppErr.message);
            }
            if (scoped && scoped.length) pp = scoped[0];
          }

          // Pre-migration: fall back to the parent-wide lookup (limit(1), never
          // maybeSingle(), so a two-plan family does not error the sync away).
          if (!pp && noAthleteCol) {
            const { data: preMigration } = await osSupabase.from('payment_plans')
              .select('id,total_amount').eq('parent_id', prof.id)
              .order('created_at', { ascending: false }).limit(1);
            if (preMigration && preMigration.length) pp = preMigration[0];
          }

          // Legacy plans predate athlete_id (migration v10_01). Only adopt one when
          // this parent has a single athlete -- otherwise we cannot tell whose it is.
          if (!pp && !noAthleteCol) {
            const { data: linked } = await osSupabase.from('parent_player_links')
              .select('athlete_id').eq('profile_id', prof.id);
            if (linked && linked.length === 1) {
              const { data: legacy } = await osSupabase.from('payment_plans')
                .select('id,total_amount')
                .eq('parent_id', prof.id).is('athlete_id', null)
                .order('created_at', { ascending: false }).limit(1);
              if (legacy && legacy.length) pp = legacy[0];
            }
          }

          if (!pp) {
            const newPlanRow = {
              parent_id: prof.id,
              athlete_id: enrAthleteId,
              player_name: athleteName || '--',
              plan_type: 'full',
              total_amount: enr ? parseFloat(enr.total_owed) || 745 : 745,
              status: 'active'
            };
            if (noAthleteCol) delete newPlanRow.athlete_id;
            const { data: newPlan, error: planErr } = await osSupabase.from('payment_plans')
              .insert(newPlanRow).select('id,total_amount').single();
            if (planErr) console.warn('Step 5 plan create:', planErr.message);
            else pp = newPlan;
          }
          if (pp) {
            const { data: uiPay } = await osSupabase.from('payments')
              .select('id,amount')
              .eq('plan_id', pp.id)
              .eq('status', 'pending')
              .order('due_date')
              .limit(1)
              .maybeSingle();
            if (uiPay) {
              const { error: upErr } = await osSupabase.from('payments').update({
                status: 'confirmed',
                paid_at: new Date().toISOString(),
                payment_method: method
              }).eq('id', uiPay.id);
              if (upErr) console.warn('Step 5 payment update:', upErr.message);
            } else {
              const { error: inErr } = await osSupabase.from('payments').insert({
                plan_id: pp.id,
                parent_id: prof.id,
                installment_number: 1,
                amount: amount,
                due_date: new Date().toISOString().split('T')[0],
                status: 'confirmed',
                paid_at: new Date().toISOString(),
                payment_method: method
              });
              if (inErr) console.warn('Step 5 payment insert:', inErr.message);
            }
            const newPaid = (parseFloat(enr?.total_paid) || 0) + amount;
            if (newPaid >= (parseFloat(enr?.total_owed) || 745)) {
              await osSupabase.from('payment_plans').update({ status: 'completed' }).eq('id', pp.id);
            }
          }
        }
      } catch (e) { console.warn('Portal sync error:', e.message); }
    }

    // 6. Thank-you email (10s timeout so it never blocks the UI)
    qpFeedback('Step 6/6: Sending thank-you email...', '');
    if (parentEmail) {
      try {
        const fnUrl = (window.SUPABASE_CONFIG?.url || 'https://nnqokhqennuxalamnvps.supabase.co')
          + '/functions/v1/send-payment-thank-you';
        const anonKey = window.SUPABASE_CONFIG?.anonKey || '';
        const { data: { session } } = await osSupabase.auth.getSession();
        const token = session?.access_token || anonKey;
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), 10000);
        await fetch(fnUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token,
            'apikey': anonKey
          },
          body: JSON.stringify({ email: parentEmail, name: parentName, athlete: athleteName, amount: amount, method: method }),
          signal: ac.signal
        });
        clearTimeout(timer);
      } catch (e) { console.warn('Thank-you email skipped:', e.message); }
    }

    // Success -- reset form
    qpFeedback('$' + amount.toFixed(2) + ' via ' + method + ' recorded for ' + (athleteName || parentName), 'success');
    showToast('$' + amount.toFixed(2) + ' via ' + method + ' recorded for ' + (athleteName || parentName));
    select.value = '';
    amountInput.value = '';

    // Refresh data
    await loadDues();
    await loadQuickPayParents();
    if (currentPanel === 'dashboard') loadDashboard();

  } catch (e) {
    console.error('quickRecordPayment failed:', e);
    qpFeedback('Error: ' + e.message, 'error');
    showToast('Payment error: ' + e.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Record';
  }
}

// ─── PRO SHOP ORDERS ────────────────────────────────────────
async function loadOrders() {
  try {
    if (osSupabase) {
      const { data } = await osSupabase.from('orders').select('*,order_items(*)').order('created_at', { ascending: false }).limit(50);
      allOrders = data || [];
    }
  } catch (e) { console.error('Orders load:', e); }
  renderOrders();
}
function renderOrders() {
  let items = allOrders;
  if (ordersFilter !== 'all') items = items.filter(o => o.fulfillment_status === ordersFilter);
  const totalRev = allOrders.filter(o => o.payment_status === 'paid').reduce((a, o) => a + (+o.total_amount || 0), 0);
  const pendFulfill = allOrders.filter(o => o.fulfillment_status === 'unfulfilled' && o.payment_status === 'paid').length;
  const refunded = allOrders.filter(o => o.payment_status === 'refunded').reduce((a, o) => a + (+o.total_amount || 0), 0);

  document.getElementById('o-total').textContent = allOrders.length;
  document.getElementById('o-revenue').textContent = '$' + totalRev.toFixed(0);
  document.getElementById('o-pending').textContent = pendFulfill;
  document.getElementById('o-refunded').textContent = '$' + refunded.toFixed(0);

  document.querySelectorAll('#order-filters .filter-chip').forEach(c => c.classList.toggle('active', c.textContent.toLowerCase() === ordersFilter));

  document.getElementById('orders-tbody').innerHTML = items.length ? items.map(o => `<tr>
    <td style="font-weight:600">#${(o.id || '').slice(0, 8)}</td><td>${o.customer_name || o.customer_email || '--'}</td>
    <td>$${(+o.total_amount || 0).toFixed(2)}</td><td>${statusTag(o.payment_status || 'pending')}</td>
    <td>${statusTag(o.fulfillment_status || 'unfulfilled')}</td><td style="color:var(--muted)">${fmtShort(o.created_at)}</td>
    <td><select onchange="updateFulfillment('${o.id}',this.value)" style="background:rgba(0,0,0,.3);border:1px solid var(--border);border-radius:6px;color:#fff;padding:4px 8px;font-size:11px">
      <option value="unfulfilled" ${o.fulfillment_status === 'unfulfilled' ? 'selected' : ''}>Unfulfilled</option>
      <option value="processing" ${o.fulfillment_status === 'processing' ? 'selected' : ''}>Processing</option>
      <option value="shipped" ${o.fulfillment_status === 'shipped' ? 'selected' : ''}>Shipped</option>
      <option value="delivered" ${o.fulfillment_status === 'delivered' ? 'selected' : ''}>Delivered</option>
    </select></td></tr>`).join('') : '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:32px">No orders yet</td></tr>';
}
function filterOrders(f) { ordersFilter = f; renderOrders(); }
async function updateFulfillment(id, status) {
  try { if (osSupabase) await osSupabase.from('orders').update({ fulfillment_status: status }).eq('id', id); showToast('Order updated'); }
  catch (e) { showToast('Error: ' + e.message, 'error'); }
}

// ─── MESSAGING ──────────────────────────────────────────────
async function loadComms() {
  try {
    if (osSupabase) {
      const { data } = await osSupabase.from('broadcast_messages').select('*').order('created_at', { ascending: false });
      allBroadcasts = data || [];
    }
  } catch (e) { }
  renderBroadcasts();
  initAvailability();
}
function renderBroadcasts() {
  document.getElementById('broadcast-tbody').innerHTML = allBroadcasts.length ? allBroadcasts.map(m => `<tr style="cursor:pointer" onclick="viewBroadcast('${m.id}')">
    <td style="font-weight:600">${m.subject || '--'}</td><td>${m.audience || '--'}</td>
    <td style="color:var(--muted)">${fmtShort(m.created_at)}</td>
    <td>${m.recipient_count || '--'}</td><td>${m.delivered_count || '--'}</td><td>${m.read_count || '--'}</td>
  </tr>`).join('') : '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:32px">No messages yet</td></tr>';
}
async function sendBroadcast() {
  const subject = document.getElementById('bc-subject').value;
  const body = document.getElementById('bc-body').value;
  const channel = document.querySelector('input[name="bc-channel"]:checked')?.value || 'both';
  const audRadio = document.querySelector('input[name="bc-audience"]:checked')?.value;
  const teamId = document.getElementById('bc-team').value;
  const audience = audRadio === 'team' && teamId ? `team:${teamId}` : 'all_parents';
  if (!subject || !body) return showToast('Subject and body required', 'error');
  if (!confirm(`Send broadcast to ${audience}?`)) return;
  try {
    if (osSupabase) {
      const session = await osSupabase.auth.getSession();
      const { data: msgId, error } = await osSupabase.rpc('send_broadcast', { p_sender_id: session.data.session.user.id, p_subject: subject, p_body: body, p_channel: channel, p_audience: audience });
      if (error) throw error;
      if (msgId) {
        showToast('Broadcasting...', 'info');
        await sendAndPoll(msgId);
      }
    }
    document.getElementById('bc-subject').value = '';
    document.getElementById('bc-body').value = '';
    showToast('Broadcast sent successfully');
    loadComms();
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}
async function sendAndPoll(messageId) {
  let pending = true, attempts = 0;
  while (pending && attempts < 30) {
    try {
      const { data } = await osSupabase.functions.invoke('send-broadcast', { body: { message_id: messageId } });
      pending = (data?.still_pending || 0) > 0;
    } catch (e) { pending = false; }
    if (pending) await new Promise(r => setTimeout(r, 2000));
    attempts++;
  }
}
function viewBroadcast(id) {
  const m = allBroadcasts.find(x => x.id === id); if (!m) return;
  openModal('view-broadcast');
  document.getElementById('modal-title').textContent = m.subject;
  document.getElementById('modal-body').innerHTML = `
    <div style="margin-bottom:16px;color:var(--muted);font-size:12px">Sent ${fmt(m.created_at)} to ${m.audience}</div>
    <div style="background:rgba(0,0,0,.2);padding:20px;border-radius:12px;margin-bottom:20px;font-size:14px;line-height:1.6;white-space:pre-wrap">${m.body || ''}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
      <div style="text-align:center;padding:16px;background:rgba(255,255,255,.03);border-radius:8px"><div style="font-size:24px;font-weight:800">${m.recipient_count || 0}</div><div style="font-size:11px;color:var(--muted);margin-top:4px">RECIPIENTS</div></div>
      <div style="text-align:center;padding:16px;background:rgba(255,255,255,.03);border-radius:8px"><div style="font-size:24px;font-weight:800">${m.delivered_count || 0}</div><div style="font-size:11px;color:var(--muted);margin-top:4px">DELIVERED</div></div>
      <div style="text-align:center;padding:16px;background:rgba(255,255,255,.03);border-radius:8px"><div style="font-size:24px;font-weight:800">${m.read_count || 0}</div><div style="font-size:11px;color:var(--muted);margin-top:4px">READ</div></div>
    </div>`;
}

// ─── AVAILABILITY CHECK (SMS) ──────────────────────────────
let _currentAvailCheckId = null;
let _availRealtimeChannel = null;

function previewAvailSms() {
  const title = document.getElementById('avail-title').value;
  const dateVal = document.getElementById('avail-date').value;
  if (!title || !dateVal) { showToast('Enter title and date first', 'error'); return; }
  const dateStr = new Date(dateVal + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric'
  });
  const preview = `GODSPEED BASKETBALL\n\n${title} -- ${dateStr}\n\nIs your player available?\nReply 1 for YES\nReply 2 for NO\n\nPlease include player name if you have multiple athletes.\n\nBROTHERHOOD. HABITS. SUCCESS.`;
  const el = document.getElementById('avail-preview');
  el.textContent = preview;
  el.style.display = 'block';
}

async function sendAvailCheck() {
  const title = document.getElementById('avail-title').value;
  const dateVal = document.getElementById('avail-date').value;
  const eventType = document.getElementById('avail-type').value;
  if (!title || !dateVal) { showToast('Title and date required', 'error'); return; }
  if (!osSupabase) { showToast('Not connected', 'error'); return; }

  const btn = document.getElementById('avail-send-btn');
  btn.disabled = true; btn.textContent = 'Sending...';
  const fb = document.getElementById('avail-feedback');

  try {
    const fnUrl = (window.SUPABASE_CONFIG?.url || 'https://nnqokhqennuxalamnvps.supabase.co')
      + '/functions/v1/send-availability-sms';
    const anonKey = window.SUPABASE_CONFIG?.anonKey || '';
    const { data: { session } } = await osSupabase.auth.getSession();
    const token = session?.access_token || anonKey;

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 30000);

    const res = await fetch(fnUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token,
        'apikey': anonKey
      },
      body: JSON.stringify({ title, event_date: dateVal, event_type: eventType }),
      signal: ac.signal
    });
    clearTimeout(timer);

    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Send failed');

    _currentAvailCheckId = result.check_id;
    fb.style.display = 'block';
    fb.style.color = '#34c759';
    fb.textContent = `Sent to ${result.sent} parents` + (result.failed ? ` (${result.failed} failed)` : '');
    showToast(`Availability check sent to ${result.sent} parents`);

    // Load responses + subscribe to realtime
    loadAvailResponses(result.check_id);
    subscribeAvailRealtime(result.check_id);
    loadAvailHistory();

  } catch (e) {
    fb.style.display = 'block';
    fb.style.color = '#ff453a';
    fb.textContent = 'Error: ' + e.message;
    showToast('SMS error: ' + e.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Send to All Parents';
  }
}

async function loadAvailResponses(checkId) {
  if (!checkId || !osSupabase) return;
  _currentAvailCheckId = checkId;

  const { data, error } = await osSupabase
    .from('availability_responses')
    .select('*')
    .eq('check_id', checkId)
    .order('responded_at', { ascending: true });

  if (error) { console.warn('Avail responses:', error.message); return; }
  renderAvailResponses(data || []);
  subscribeAvailRealtime(checkId);
}

function renderAvailResponses(responses) {
  const tbody = document.getElementById('avail-resp-tbody');
  if (!tbody) return;

  const avail = responses.filter(r => r.response === 'available');
  const unavail = responses.filter(r => r.response === 'unavailable');
  const unknown = responses.filter(r => r.response === 'unknown');

  const countEl = document.getElementById('avail-response-count');
  if (countEl) {
    countEl.textContent = `${avail.length} yes / ${unavail.length} no / ${unknown.length} pending`;
  }

  if (!responses.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:32px">Waiting for replies...</td></tr>';
    return;
  }

  tbody.innerHTML = responses.map(r => {
    const color = r.response === 'available' ? '#34c759'
      : r.response === 'unavailable' ? '#ff453a'
        : 'var(--muted)';
    const label = r.response === 'available' ? 'Available'
      : r.response === 'unavailable' ? 'Unavailable'
        : 'Pending';
    const time = r.responded_at && r.response !== 'unknown'
      ? new Date(r.responded_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      : '--';
    return `<tr>
      <td style="font-weight:600">${r.player_name || '--'}</td>
      <td style="color:var(--muted);font-size:13px">${r.phone || '--'}</td>
      <td><span style="color:${color};font-weight:700;font-size:13px">${label}</span></td>
      <td style="color:var(--muted);font-size:12px;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.raw_reply || '--'}</td>
      <td style="color:var(--muted);font-size:12px">${time}</td>
    </tr>`;
  }).join('');
}

function subscribeAvailRealtime(checkId) {
  if (_availRealtimeChannel) {
    osSupabase.removeChannel(_availRealtimeChannel);
  }
  _availRealtimeChannel = osSupabase
    .channel('avail-responses-' + checkId)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'availability_responses',
      filter: 'check_id=eq.' + checkId
    }, () => {
      // Refresh on any change
      loadAvailResponses(checkId);
    })
    .subscribe();
}

async function loadAvailHistory() {
  if (!osSupabase) return;
  const { data } = await osSupabase
    .from('availability_checks')
    .select('id, title, event_date, status')
    .order('created_at', { ascending: false })
    .limit(10);

  if (!data || !data.length) return;

  const sel = document.getElementById('avail-history-select');
  const toggle = document.getElementById('avail-history-toggle');
  if (!sel || !toggle) return;

  toggle.style.display = 'block';
  sel.innerHTML = '<option value="">Previous checks...</option>' +
    data.map(c => `<option value="${c.id}">${c.title} (${c.event_date})</option>`).join('');
}

// Auto-load history when comms panel opens
function initAvailability() {
  // Set default date to tomorrow
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dateInput = document.getElementById('avail-date');
  if (dateInput && !dateInput.value) {
    dateInput.value = tomorrow.toISOString().split('T')[0];
  }
  loadAvailHistory();
}

// ─── DATA ENTRY ─────────────────────────────────────────────
const FOCUS_AREAS = ['shooting', 'ball_handling', 'defense', 'passing', 'rebounding', 'conditioning', 'court_vision', 'finishing'];
let guestCounter = 0;

function loadDataEntry() { /* teams already loaded in init */ }
function switchDataTab(tab, btn) {
  document.querySelectorAll('.sub-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('data-training').style.display = tab === 'training' ? 'block' : 'none';
  document.getElementById('data-game').style.display = tab === 'game' ? 'block' : 'none';
}

async function loadTeamRoster(prefix) {
  const teamId = document.getElementById(prefix + '-team').value;
  if (!teamId || !osSupabase) return;
  if (teamRosterCache[teamId]) { renderRoster(prefix, teamRosterCache[teamId]); return; }
  try {
    const { data } = await osSupabase.from('team_rosters').select('athlete_id,athletes!inner(id,first_name,last_name)').eq('team_id', teamId).eq('status', 'active');
    const roster = (data || []).map(r => ({ id: r.athletes.id, name: `${r.athletes.first_name} ${r.athletes.last_name}` }));
    teamRosterCache[teamId] = roster;
    renderRoster(prefix, roster);
  } catch (e) { console.error('Roster load:', e); }
}

function renderRoster(prefix, roster) {
  if (prefix === 'de') {
    document.getElementById('de-player-cards').innerHTML = roster.map(a => buildPlayerCard(a.id, a.name, false)).join('');
  } else if (prefix === 'gm') {
    const statCols = ['MIN', 'PTS', 'FGM', 'FGA', '3PM', '3PA', 'FTM', 'FTA', 'OREB', 'DREB', 'AST', 'STL', 'BLK', 'TO', 'PF'];
    document.getElementById('gm-stats-grid').innerHTML = `<table><thead><tr><th style="text-align:left">Player</th>${statCols.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${roster.map(a => `<tr><td style="text-align:left;font-weight:600;white-space:nowrap">${a.name}</td>${statCols.map(c => `<td><input type="number" min="0" value="0" data-athlete="${a.id}" data-stat="${c.toLowerCase()}"></td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }
}

function buildPlayerCard(athleteId, name, isGuest) {
  const focusOpts = FOCUS_AREAS.map(f => `<option value="${f}">${f.replace(/_/g, ' ')}</option>`).join('');
  return `<div class="player-report-card checked" data-athlete-id="${athleteId}">
    <div class="player-report-header" onclick="toggleCardExpand(this.parentElement)">
      <input type="checkbox" checked onclick="event.stopPropagation(); toggleCardChecked(this)">
      ${isGuest ? `<input type="text" class="pr-guest-name" placeholder="Guest player name..." style="flex:1;background:rgba(0,0,0,.3);border:1px solid var(--border);border-radius:6px;color:#fff;padding:4px 8px;font-size:13px;font-weight:600" onclick="event.stopPropagation()">` : `<span class="pr-name">${name}</span>`}
      ${isGuest ? `<button class="pr-remove" onclick="event.stopPropagation();this.closest('.player-report-card').remove()">x</button>` : ''}
      <button class="pr-expand" onclick="event.stopPropagation();toggleCardExpand(this.closest('.player-report-card'))">▼</button>
    </div>
    <div class="player-report-body">
      <div class="pr-field">
        <label>Effort Rating</label>
        <div class="effort-stars" data-value="0">
          ${[1, 2, 3, 4, 5].map(n => `<button onclick="setEffort(this,${n})">${n}</button>`).join('')}
        </div>
      </div>
      <div class="pr-field">
        <label>Focus Areas</label>
        <select class="pr-focus" multiple>${focusOpts}</select>
      </div>
      <div class="pr-field">
        <label>Coach Notes</label>
        <textarea class="pr-notes" placeholder="Performance observations..."></textarea>
      </div>
      <div class="pr-field">
        <label>Drills (comma-separated)</label>
        <input type="text" class="pr-drills" placeholder="e.g. Mikan drill, 3pt shooting 7/10">
      </div>
    </div>
  </div>`;
}

function toggleCardExpand(card) { card.classList.toggle('expanded'); }
function toggleCardChecked(cb) {
  cb.closest('.player-report-card').classList.toggle('checked', cb.checked);
}
function setEffort(btn, val) {
  const stars = btn.parentElement;
  stars.dataset.value = val;
  stars.querySelectorAll('button').forEach((b, i) => b.classList.toggle('active', i < val));
}

function toggleAllPlayers(check) {
  document.querySelectorAll('#de-player-cards .player-report-card').forEach(card => {
    const cb = card.querySelector('input[type=checkbox]');
    if (cb) { cb.checked = check; card.classList.toggle('checked', check); }
  });
}
function toggleExpandAll(expand) {
  document.querySelectorAll('#de-player-cards .player-report-card').forEach(card => {
    card.classList.toggle('expanded', expand);
  });
}
function addGuestPlayer() {
  guestCounter++;
  const container = document.getElementById('de-player-cards');
  const placeholder = container.querySelector('p');
  if (placeholder) placeholder.remove();
  container.insertAdjacentHTML('beforeend', buildPlayerCard('guest', '', true));
}

function clearAllStats() {
  document.querySelectorAll('#gm-stats-grid input[type=number]').forEach(i => i.value = '0');
}

async function submitTrainingSession() {
  const teamId = document.getElementById('de-team').value;
  const sessionType = document.getElementById('de-session-type').value;
  const date = document.getElementById('de-date').value;
  const startTime = document.getElementById('de-start-time').value;
  const endTime = document.getElementById('de-end-time').value;
  const location = document.getElementById('de-location').value;
  const sessionNotes = document.getElementById('de-notes').value;
  if (!teamId || !date || !startTime || !endTime) return showToast('Team, date, and times are required', 'error');

  const cards = document.querySelectorAll('#de-player-cards .player-report-card');
  if (!cards.length) return showToast('Load a roster first', 'error');

  const attendance = [];
  for (const card of cards) {
    let athleteId = card.dataset.athleteId;
    const checked = card.querySelector('input[type=checkbox]').checked;

    // Guest player: resolve
    if (athleteId === 'guest') {
      const nameInput = card.querySelector('.pr-guest-name');
      const guestName = nameInput ? nameInput.value.trim() : '';
      if (!guestName) continue; // skip empty guest cards silently
      if (osSupabase) {
        const parts = guestName.split(/\s+/);
        const { data: newAthlete, error: insertErr } = await osSupabase.from('athletes')
          .insert({ first_name: parts[0], last_name: parts.slice(1).join(' ') || '' })
          .select('id').single();
        if (insertErr) { showToast('Failed to add guest: ' + insertErr.message, 'error'); return; }
        athleteId = newAthlete.id;
      } else { continue; }
    }

    const effort = parseInt(card.querySelector('.effort-stars')?.dataset.value) || null;
    const focus = Array.from(card.querySelector('.pr-focus')?.selectedOptions || []).map(o => o.value);
    const notes = card.querySelector('.pr-notes')?.value?.trim() || null;
    const drillsRaw = card.querySelector('.pr-drills')?.value?.trim();
    const drills = drillsRaw ? drillsRaw.split(',').map(d => ({ drill_name: d.trim() })) : [];

    attendance.push({
      athlete_id: athleteId,
      status: checked ? 'present' : 'absent',
      effort_rating: effort,
      coach_notes: notes,
      skill_ratings: focus.length ? Object.fromEntries(focus.map(f => [f, 1])) : {},
      drills_completed: drills
    });
  }

  if (!attendance.some(a => a.status === 'present')) return showToast('At least one athlete must be present', 'error');

  try {
    if (osSupabase) {
      const { error } = await osSupabase.rpc('log_training_session', {
        p_team_id: teamId,
        p_session_type: sessionType,
        p_session_date: date,
        p_start_time: startTime,
        p_end_time: endTime,
        p_location: location,
        p_session_notes: sessionNotes,
        p_attendance: JSON.stringify(attendance)
      });
      if (error) throw error;
    }
    showToast('Training session logged with player reports. Calendar event created.');
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

async function submitGame() {
  const teamId = document.getElementById('gm-team').value;
  const opponent = document.getElementById('gm-opponent').value;
  const gameDate = document.getElementById('gm-date').value;
  const gameTime = document.getElementById('gm-time').value;
  const location = document.getElementById('gm-location').value;
  const gameType = document.getElementById('gm-type').value;
  const teamScore = document.getElementById('gm-team-score').value;
  const oppScore = document.getElementById('gm-opp-score').value;
  if (!teamId || !opponent || !gameDate || !gameType) return showToast('Team, opponent, date, and type required', 'error');

  const stats = [];
  document.querySelectorAll('#gm-stats-grid tbody tr').forEach(row => {
    const inputs = row.querySelectorAll('input[type=number]');
    if (!inputs.length) return;
    const athleteId = inputs[0].dataset.athlete;
    const s = { athlete_id: athleteId };
    inputs.forEach(inp => { s[inp.dataset.stat] = parseInt(inp.value) || 0; });
    stats.push(s);
  });

  try {
    if (osSupabase) {
      const { error } = await osSupabase.rpc('log_game', {
        p_game_date: gameDate,
        p_game_type: gameType,
        p_opponent_name: opponent,
        p_team_id: teamId,
        p_location: location,
        p_team_score: teamScore ? parseInt(teamScore) : null,
        p_opponent_score: oppScore ? parseInt(oppScore) : null,
        p_game_time: gameTime || null,
        p_player_stats: JSON.stringify(stats)
      });
      if (error) throw error;
    }
    showToast('Game logged. Calendar event created.');
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

// ─── RECURRING PRACTICE CONFIG (mirrors parent calendar-embed) ──
const RECURRING_PRACTICES = {
  1: { title: 'Mandatory Skills', time: '6:00 PM', loc: 'NEC', startDate: '2025-12-08' },
  2: { title: 'TEAM PRACTICE', time: '6:00 PM', loc: 'B.F. Elementary' },
  4: { title: 'TEAM PRACTICE', time: '6:00 PM', loc: 'B.F. Elementary' }
};
let practiceCancellations = new Set(); // Set of "date|dow" keys from DB
let pendingPracticeChanges = new Map(); // key -> { action: 'cancel'|'restore', dateStr, dow, title, loc }

function getPracticesForDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const dow = d.getDay();
  const p = RECURRING_PRACTICES[dow];
  if (!p) return null;
  if (p.startDate && dateStr < p.startDate) return null;
  const key = dateStr + '|' + dow;
  // Pending changes override DB state
  const pending = pendingPracticeChanges.get(key);
  let cancelled = practiceCancellations.has(key);
  if (pending) cancelled = pending.action === 'cancel';
  return { ...p, date: dateStr, cancelled };
}

function togglePractice(dateStr, dow) {
  const key = dateStr + '|' + dow;
  const p = RECURRING_PRACTICES[dow];
  if (!p) return;
  const dbCancelled = practiceCancellations.has(key);
  const pending = pendingPracticeChanges.get(key);
  const currentlyCancelled = pending ? pending.action === 'cancel' : dbCancelled;

  if (currentlyCancelled) {
    // Toggling to restore
    if (dbCancelled) {
      pendingPracticeChanges.set(key, { action: 'restore', dateStr, dow, title: p.title, loc: p.loc });
    } else {
      pendingPracticeChanges.delete(key); // revert to DB state (not cancelled)
    }
  } else {
    // Toggling to cancel
    if (!dbCancelled) {
      pendingPracticeChanges.set(key, { action: 'cancel', dateStr, dow, title: p.title, loc: p.loc });
    } else {
      pendingPracticeChanges.delete(key); // revert to DB state (cancelled)
    }
  }
  updatePracticeSaveBar();
  renderCalendar();
}

function updatePracticeSaveBar() {
  const bar = document.getElementById('practice-save-bar');
  const count = pendingPracticeChanges.size;
  document.getElementById('practice-change-count').textContent = count;
  bar.classList.toggle('visible', count > 0);
}

async function savePracticeChanges() {
  if (!osSupabase || pendingPracticeChanges.size === 0) return;
  const bar = document.getElementById('practice-save-bar');
  const btn = bar.querySelector('.save-btn');
  btn.textContent = 'Saving...';
  btn.disabled = true;

  const session = await osSupabase.auth.getSession();
  const userId = session.data.session?.user?.id;
  const cancellations = [];
  const restorations = [];

  try {
    for (const [key, change] of pendingPracticeChanges) {
      if (change.action === 'cancel') {
        // Insert cancellation record
        const { error } = await osSupabase.rpc('upsert_calendar_event', {
          p_title: change.title, p_event_type: 'practice', p_start_date: change.dateStr,
          p_location: change.loc, p_visibility: 'public', p_created_by: userId,
          p_cost: null, p_registration_deadline: null, p_registration_url: null,
          p_notes: 'Cancelled by admin', p_admin_checklist: null
        });
        if (error) throw error;
        await osSupabase.from('calendar_events')
          .update({ is_cancelled: true })
          .eq('start_date', change.dateStr)
          .eq('event_type', 'practice')
          .ilike('title', change.title);
        practiceCancellations.add(key);
        cancellations.push(change);
      } else {
        // Delete cancellation record
        const { error } = await osSupabase.from('calendar_events')
          .delete()
          .eq('start_date', change.dateStr)
          .eq('event_type', 'practice')
          .eq('is_cancelled', true)
          .ilike('title', change.title);
        if (error) throw error;
        practiceCancellations.delete(key);
        restorations.push(change);
      }
    }

    // Send parent notification via edge function
    if (cancellations.length > 0 || restorations.length > 0) {
      try {
        const { data: fnData, error: fnErr } = await osSupabase.functions.invoke('send-practice-update', {
          body: { cancellations, restorations }
        });
        if (fnErr) console.error('Notification send error:', fnErr);
        else showToast(`Saved. ${fnData?.sent || 0} parents notified.`, 'success');
      } catch (notifErr) {
        console.error('Notification error:', notifErr);
        showToast('Saved to calendar. Email notification failed.', 'warning');
      }
    }

    pendingPracticeChanges.clear();
    updatePracticeSaveBar();
    renderCalendar();
  } catch (e) {
    showToast('Error saving: ' + e.message, 'error');
  } finally {
    btn.textContent = 'Save & Notify Parents';
    btn.disabled = false;
  }
}

function discardPracticeChanges() {
  pendingPracticeChanges.clear();
  updatePracticeSaveBar();
  renderCalendar();
}

// ─── CALENDAR ───────────────────────────────────────────────
async function loadCalendar() {
  try {
    if (osSupabase) {
      let query = osSupabase.from('calendar_events').select('*').order('start_date', { ascending: true });
      if (calView === 'list') {
        // List view: all events from Jan 1 of viewed year onward
        query = query.gte('start_date', `${calYear}-01-01`).lte('start_date', `${calYear}-12-31`);
      } else {
        const start = new Date(calYear, calMonth, 1), end = new Date(calYear, calMonth + 1, 0);
        query = query.gte('start_date', start.toISOString().split('T')[0]).lte('start_date', end.toISOString().split('T')[0]);
      }
      // Parallel fetch: events + practice cancellations
      const viewStart = calView === 'list' ? `${calYear}-01-01` : new Date(calYear, calMonth, 1).toISOString().split('T')[0];
      const viewEnd = calView === 'list' ? `${calYear}-12-31` : new Date(calYear, calMonth + 1, 0).toISOString().split('T')[0];
      const [evResult, cancelResult] = await Promise.all([
        query,
        osSupabase.from('calendar_events')
          .select('start_date,title')
          .eq('event_type', 'practice').eq('is_cancelled', true)
          .gte('start_date', viewStart).lte('start_date', viewEnd)
      ]);
      const data = evResult.data;
      const cancels = cancelResult.data;
      practiceCancellations = new Set();
      (cancels || []).forEach(c => {
        const d = new Date(c.start_date + 'T12:00:00');
        practiceCancellations.add(c.start_date + '|' + d.getDay());
      });
      // Expand multi-day events so they appear on every date in the range
      // Filter out practice cancellation records from main list
      allCalEvents = [];
      for (const e of (data || [])) {
        if (e.event_type === 'practice' && e.is_cancelled) continue;
        allCalEvents.push({ ...e, event_date: e.start_date });
        if (e.end_date && e.end_date !== e.start_date) {
          const start = new Date(e.start_date + 'T00:00:00');
          const end = new Date(e.end_date + 'T00:00:00');
          const cursor = new Date(start);
          cursor.setDate(cursor.getDate() + 1);
          while (cursor <= end) {
            allCalEvents.push({ ...e, event_date: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`, _isSpan: true });
            cursor.setDate(cursor.getDate() + 1);
          }
        }
      }
    }
  } catch (e) { console.error('Calendar load:', e); }
  renderCalendar();
}
function calNav(dir) { if (calView === 'list') { calYear += dir; } else { calMonth += dir; if (calMonth > 11) { calMonth = 0; calYear++; } if (calMonth < 0) { calMonth = 11; calYear--; } } loadCalendar(); }
function setCalView(v) {
  calView = v;
  document.getElementById('cal-view-month').style.opacity = v === 'month' ? '1' : '0.5';
  document.getElementById('cal-view-list').style.opacity = v === 'list' ? '1' : '0.5';
  loadCalendar();
}
function renderCalendar() {
  const label = calView === 'list' ? String(calYear) : new Date(calYear, calMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  document.getElementById('cal-month-label').textContent = label;
  if (calView === 'list') { renderCalList(); return; }
  const first = new Date(calYear, calMonth, 1), last = new Date(calYear, calMonth + 1, 0);
  const startDay = first.getDay(), totalDays = last.getDate();
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const today = new Date(); const todayStr = today.toISOString().split('T')[0];
  let html = '<div class="cal-grid">';
  days.forEach(d => html += `<div class="cal-header">${d}</div>`);
  for (let i = 0; i < startDay; i++) html += `<div class="cal-day other-month"></div>`;
  for (let d = 1; d <= totalDays; d++) {
    const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const isToday = dateStr === todayStr;
    const dayEvents = allCalEvents.filter(e => e.event_date === dateStr);
    const dow = new Date(calYear, calMonth, d).getDay();
    const practice = getPracticesForDate(dateStr);
    html += `<div class="cal-day${isToday ? ' today' : ''}" onclick="showDayEvents('${dateStr}')"><div class="day-num">${d}</div>`;
    // Practice pill (tap to toggle)
    if (practice) {
      const off = practice.cancelled;
      html += `<div style="font-size:10px;padding:3px 6px;border-radius:4px;margin-bottom:2px;cursor:pointer;transition:all 0.15s;${off ? 'color:rgba(255,255,255,0.25);text-decoration:line-through;background:transparent;border:none' : 'background:rgba(37,99,235,0.1);color:#60a5fa;border:1px solid rgba(37,99,235,0.25)'}" onclick="event.stopPropagation();togglePractice('${dateStr}',${dow})" title="${off ? 'Click to restore' : 'Click to cancel'}">${practice.title}</div>`;
    }
    dayEvents.slice(0, 3).forEach(e => {
      let regTag = '';
      const eTags = Array.isArray(e.tags) ? e.tags : [];
      const isBackup = eTags.includes('backup');
      if (isBackup) {
        regTag = '<span style="font-size:8px;padding:1px 4px;border-radius:3px;background:rgba(37,99,235,0.1);color:rgba(37,99,235,0.7);font-weight:600;border:1px solid rgba(37,99,235,0.2)">BACKUP</span>';
      } else if (e.event_type === 'tournament') {
        const cl = Array.isArray(e.admin_checklist) ? e.admin_checklist : (e.admin_checklist ? JSON.parse(e.admin_checklist) : []);
        const reg = cl.find(c => c.id === 'register');
        if (!reg || !reg.done) regTag = '<span style="font-size:8px;padding:1px 4px;border-radius:3px;background:rgba(255,255,255,0.06);color:var(--muted);font-weight:600;border:1px solid var(--border)">NOT REG</span>';
      }
      const multiDay = (e.end_date && e.end_date !== e.start_date) ? ' multi-day' : '';
      const backupCls = isBackup ? ' backup' : '';
      const tagLine = regTag ? `<div style="margin-top:1px">${regTag}</div>` : '';
      html += `<div class="cal-event ${e.event_type || 'other'}${multiDay}${backupCls}" onclick="event.stopPropagation();editCalEvent('${e.id}')"><div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e.title || 'Event'}</div>${tagLine}</div>`;
    });
    if (dayEvents.length > 3) html += `<div style="font-size:10px;color:var(--muted)">+${dayEvents.length - 3} more</div>`;
    html += '</div>';
  }
  const remaining = 7 - ((startDay + totalDays) % 7); if (remaining < 7) for (let i = 0; i < remaining; i++) html += `<div class="cal-day other-month"></div>`;
  html += '</div>';
  document.getElementById('cal-container').innerHTML = html;
}
function renderCalList() {
  // Deduplicate expanded multi-day events for list view (show once per real event)
  const seen = new Set();
  const uniqueEvents = allCalEvents.filter(e => {
    if (seen.has(e.id)) return false;
    seen.add(e.id); return true;
  });
  // Group events by month for readability
  const months = {};
  uniqueEvents.forEach(e => {
    const d = new Date(e.event_date + 'T00:00:00');
    const key = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    if (!months[key]) months[key] = [];
    months[key].push(e);
  });
  const monthKeys = Object.keys(months);
  let rows = '';
  if (monthKeys.length) {
    monthKeys.forEach(mk => {
      rows += `<tr><td colspan="6" style="background:rgba(0,0,0,0.2);font-weight:700;padding:10px 16px;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;color:var(--muted);border-top:1px solid var(--border)">${mk}</td></tr>`;
      months[mk].forEach(e => {
        const dateLabel = e.end_date && e.end_date !== e.event_date ? fmtShort(e.event_date) + ' - ' + fmtShort(e.end_date) : fmtShort(e.event_date);
        let regTag = '';
        const eTags = Array.isArray(e.tags) ? e.tags : [];
        const isBackup = eTags.includes('backup');
        if (isBackup) {
          regTag = '<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:rgba(37,99,235,0.1);color:rgba(37,99,235,0.7);font-weight:600;border:1px solid rgba(37,99,235,0.2)">BACKUP</span>';
        } else if (e.event_type === 'tournament') {
          const cl = Array.isArray(e.admin_checklist) ? e.admin_checklist : (e.admin_checklist ? JSON.parse(e.admin_checklist) : []);
          const reg = cl.find(c => c.id === 'register');
          if (!reg || !reg.done) regTag = '<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:rgba(255,255,255,0.06);color:var(--muted);font-weight:600;border:1px solid var(--border)">NOT REG</span>';
        }
        const listTagLine = regTag ? `<div style="margin-top:3px">${regTag}</div>` : '';
        const visBadge = e.visibility === 'admin_only' ? '<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:rgba(239,68,68,0.1);color:#ef4444;font-weight:600;border:1px solid rgba(239,68,68,0.2);margin-left:6px">ADMIN ONLY</span>' : '';
        const pubBadge = e.published_at ? '<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:rgba(34,197,94,0.1);color:#22c55e;font-weight:600;border:1px solid rgba(34,197,94,0.2);margin-left:6px">SENT</span>' : (e.recalled_at ? '<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:rgba(245,158,11,0.1);color:#f59e0b;font-weight:600;border:1px solid rgba(245,158,11,0.2);margin-left:6px">RECALLED</span>' : '');
        rows += `<tr style="cursor:pointer${isBackup ? ';opacity:0.6' : ''}${e.visibility === 'admin_only' ? ';opacity:0.5' : ''}" onclick="editCalEvent('${e.id}')">
        <td>${dateLabel}</td><td style="color:var(--muted)">${fmt12(e.start_time)}</td><td style="font-weight:600">${e.title}${visBadge}${pubBadge}${listTagLine}</td>
        <td>${statusTag(e.event_type || 'other')}${e.event_type === 'tournament' ? tournamentProgressBadge(e) : ''}</td><td style="color:var(--muted)">${e.location || '--'}</td>
        <td>${e.published_at ? `<button class="btn btn-ghost btn-xs" style="color:#f59e0b" onclick="event.stopPropagation();depublishEvent('${e.id}')">Recall</button>` : ''}</td>
      </tr>`;
      });
    });
  } else {
    rows = `<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:32px">No events in ${calYear}</td></tr>`;
  }
  document.getElementById('cal-container').innerHTML = `<div class="card"><table><thead><tr><th>Date</th><th>Time</th><th>Title</th><th>Type</th><th>Location</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
function showDayEvents(dateStr) {
  const dayEvents = allCalEvents.filter(e => e.event_date === dateStr);
  openModal('day-events');
  document.getElementById('modal-title').textContent = 'Events on ' + fmtShort(dateStr);
  const eventsHtml = dayEvents.length ? dayEvents.map(e => `
    <div style="padding:12px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px;display:flex;align-items:flex-start;justify-content:space-between">
      <div>
        <div style="font-weight:700">${e.title}</div>
        <div style="color:var(--muted);font-size:12px;margin-top:4px">${e.start_time ? fmt12(e.start_time) : ''} ${e.end_time ? '- ' + fmt12(e.end_time) : ''} ${e.location ? '| ' + e.location : ''}</div>
        ${e.source_type ? `<div style="font-size:11px;color:var(--muted);margin-top:4px">Auto-created from ${e.source_type}</div>` : ''}
      </div>
      <button class="btn btn-ghost btn-xs" onclick="editCalEvent('${e.id}')" style="flex-shrink:0;margin-left:8px">Edit</button>
    </div>`).join('') : '<p style="color:var(--muted)">No events on this day.</p>';
  document.getElementById('modal-body').innerHTML = eventsHtml + `<button class="btn btn-primary" style="width:100%;margin-top:12px" onclick="addCalEventForDate('${dateStr}')"><i data-lucide="plus" style="width:16px;height:16px;margin-right:6px"></i>Add Event on ${fmtShort(dateStr)}</button>`;
  if (window.lucide) lucide.createIcons();
}
function addCalEventForDate(dateStr) {
  openModal('add-event');
  document.getElementById('modal-title').textContent = 'New Event';
  document.getElementById('modal-body').innerHTML = calEventForm({ event_date: dateStr });
}
function editCalEvent(id) {
  const e = allCalEvents.find(x => x.id === id); if (!e) return;
  // Tournaments open the detail/checklist panel instead of raw form
  if (e.event_type === 'tournament') { openTournamentDetail(id); return; }
  openModal('edit-event');
  document.getElementById('modal-title').textContent = 'Edit Event';
  document.getElementById('modal-body').innerHTML = calEventForm(e);
}
async function deleteCalEvent(id) {
  if (!confirm('Delete this event?')) return;
  try { if (osSupabase) await osSupabase.from('calendar_events').delete().eq('id', id); showToast('Event deleted'); loadCalendar(); }
  catch (e) { showToast('Error: ' + e.message, 'error'); }
}

async function publishCalendarToParents() {
  const btn = document.getElementById('btn-publish-calendar');
  if (!osSupabase) { showToast('Not connected to database', 'error'); return; }

  // Fetch ALL unpublished, parent-visible events
  const { data: unpublished, error: fetchErr } = await osSupabase
    .from('calendar_events')
    .select('id, title, event_type, start_date, end_date, start_time, end_time, location, visibility, notes, cost, description')
    .is('published_at', null)
    .in('visibility', ['public', 'team_only'])
    .order('start_date', { ascending: true });

  if (fetchErr) { showToast('Error: ' + fetchErr.message, 'error'); return; }
  if (!unpublished || !unpublished.length) { showToast('All events are already published.', 'info'); return; }

  // ── PRE-PUBLISH QA AUDIT ──
  const audit = runPublishQA(unpublished);
  showPublishAuditModal(unpublished, audit);
}

function runPublishQA(events) {
  const warnings = []; // yellow -- review recommended
  const errors = [];   // red -- should fix before sending

  // 1. Duplicate detection: same title within 7 days
  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      if (events[i].title.trim().toLowerCase() === events[j].title.trim().toLowerCase()) {
        const d1 = new Date(events[i].start_date + 'T12:00:00');
        const d2 = new Date(events[j].start_date + 'T12:00:00');
        const gap = Math.abs(d2 - d1) / 86400000;
        if (gap <= 7) {
          errors.push({ ids: [events[i].id, events[j].id], msg: `Possible duplicate: "${events[i].title}" appears on ${events[i].start_date} and ${events[j].start_date}. Should this be a multi-day event?` });
        }
      }
    }
  }

  // 2. Missing location
  events.forEach(e => {
    if (!e.location || e.location.trim() === '' || e.location.trim().toUpperCase() === 'TBD') {
      warnings.push({ ids: [e.id], msg: `"${e.title}" has no confirmed location (${e.location || 'empty'}).` });
    }
  });

  // 3. Dates in the past
  const today = new Date().toISOString().split('T')[0];
  events.forEach(e => {
    const endOrStart = e.end_date || e.start_date;
    if (endOrStart < today) {
      errors.push({ ids: [e.id], msg: `"${e.title}" (${e.start_date}) is in the past.` });
    }
  });

  // 4. Cost/price info that might leak
  events.forEach(e => {
    const haystack = [e.notes, e.description, e.title].filter(Boolean).join(' ');
    if (/\$\d/.test(haystack) || /cost|price|fee|early.?bird/i.test(haystack)) {
      warnings.push({ ids: [e.id], msg: `"${e.title}" may contain pricing info in title/description/notes. Verify this is parent-appropriate.` });
    }
  });

  // 5. Admin-sounding language leak check
  events.forEach(e => {
    const haystack = [e.notes, e.description, e.title].filter(Boolean).join(' ');
    if (/internal|admin.?only|do not share|coach.?note|staff|budget|roster.?lock|placeholder/i.test(haystack)) {
      errors.push({ ids: [e.id], msg: `"${e.title}" contains admin-only language that should not be sent to parents.` });
    }
  });

  // 6. Missing end_date for multi-word tournaments that look multi-day
  events.forEach(e => {
    if (e.event_type === 'tournament' && !e.end_date) {
      warnings.push({ ids: [e.id], msg: `Tournament "${e.title}" has no end date. Is this a multi-day event?` });
    }
  });

  // 7. Basic title cleanup check
  events.forEach(e => {
    if (e.title !== e.title.trim() || /\s{2,}/.test(e.title)) {
      warnings.push({ ids: [e.id], msg: `"${e.title}" has extra whitespace in the title.` });
    }
  });

  // 8. Tournament > 3 days should be a "season"
  events.forEach(e => {
    if (e.event_type === 'tournament' && e.end_date && e.end_date !== e.start_date) {
      const d1 = new Date(e.start_date + 'T12:00:00');
      const d2 = new Date(e.end_date + 'T12:00:00');
      const span = Math.round((d2 - d1) / 86400000) + 1;
      if (span > 3) {
        errors.push({ ids: [e.id], msg: `"${e.title}" spans ${span} days but is labeled "tournament". Events longer than 3 days should be labeled "season".` });
      }
    }
  });

  return { errors, warnings };
}

function showPublishAuditModal(events, audit) {
  // Index errors/warnings per event
  const errorIds = new Set();
  audit.errors.forEach(e => (e.ids || []).forEach(id => errorIds.add(id)));
  const warnIds = new Set();
  audit.warnings.forEach(w => (w.ids || []).forEach(id => warnIds.add(id)));

  // Store all events; approved = not blocked by error
  window._publishPool = events.map(e => ({
    ...e,
    included: !errorIds.has(e.id),
    hasError: errorIds.has(e.id),
    hasWarn: warnIds.has(e.id)
  }));
  window._publishAudit = audit;

  openModal('publish-audit');
  document.getElementById('modal-title').textContent = 'Publish to Parents';
  renderPublishPreview();
}

function fmtDateEmail(iso) {
  if (!iso) return '';
  return new Date(iso + (iso.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function renderPublishPreview() {
  const pool = window._publishPool;
  const audit = window._publishAudit;
  if (!pool) return;

  const included = pool.filter(e => e.included);
  const excluded = pool.filter(e => !e.included);
  const hasErrors = audit.errors.length > 0;
  const hasWarnings = audit.warnings.length > 0;

  let html = '';

  // QA issues (collapsed if clean)
  if (hasErrors || hasWarnings) {
    html += `<details style="margin-bottom:16px;border:1px solid var(--border);border-radius:8px;padding:0;overflow:hidden" ${hasErrors ? 'open' : ''}>
      <summary style="cursor:pointer;padding:10px 14px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;background:rgba(0,0,0,0.15);color:var(--muted)">
        QA Issues${hasErrors ? ' -- ' + audit.errors.length + ' error(s)' : ''}${hasWarnings ? ' -- ' + audit.warnings.length + ' warning(s)' : ''}
      </summary>
      <div style="padding:12px 14px">`;
    audit.errors.forEach(e => {
      html += `<div style="padding:8px 12px;border-radius:6px;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.15);color:#fca5a5;font-size:12px;margin-bottom:4px">${e.msg}</div>`;
    });
    audit.warnings.forEach(w => {
      html += `<div style="padding:8px 12px;border-radius:6px;background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.15);color:#fbbf24;font-size:12px;margin-bottom:4px">${w.msg}</div>`;
    });
    html += `</div></details>`;
  }

  // Live email preview
  html += `<div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px">What parents will see (${included.length} event${included.length !== 1 ? 's' : ''})</div>`;
  html += `<div style="background:#f3f4f6;border-radius:12px;padding:0;overflow:hidden;border:1px solid #d1d5db;max-height:360px;overflow-y:auto">`;
  // Email header
  html += `<div style="background:#111827;padding:16px;text-align:center">
    <div style="color:#fff;font-size:18px;font-weight:800;letter-spacing:0.05em">GODSPEED</div>
    <div style="color:#60a5fa;font-size:10px;letter-spacing:0.1em;margin-top:2px">SCHEDULE UPDATE</div>
  </div>`;
  html += `<div style="padding:16px">`;
  html += `<div style="color:#374151;font-size:13px;margin-bottom:12px">New events have been added to the team schedule. Please review and plan accordingly.</div>`;

  if (included.length === 0) {
    html += `<div style="text-align:center;color:#9ca3af;padding:24px;font-size:13px">No events selected. Add events from the excluded list below.</div>`;
  } else {
    html += `<table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;font-size:13px">
      <thead><tr style="background:#f9fafb">
        <th style="padding:8px 10px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em">Event</th>
        <th style="padding:8px 10px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em">Date</th>
        <th style="padding:8px 10px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em">Location</th>
        <th style="padding:8px 6px;width:30px"></th>
      </tr></thead><tbody>`;
    included.forEach(e => {
      const dateLabel = e.end_date && e.end_date !== e.start_date
        ? fmtDateEmail(e.start_date) + ' - ' + fmtDateEmail(e.end_date)
        : fmtDateEmail(e.start_date);
      const typeBadge = e.event_type ? `<span style="display:inline-block;font-size:9px;padding:1px 5px;border-radius:3px;background:#f3f4f6;color:#374151;text-transform:capitalize;font-weight:600;margin-left:4px;border:1px solid #e5e7eb">${e.event_type}</span>` : '';
      const warnDot = e.hasWarn ? '<span style="color:#f59e0b;margin-left:4px" title="Has warnings">&#9888;</span>' : '';
      html += `<tr>
        <td style="padding:8px 10px;border-top:1px solid #e5e7eb;color:#111827;font-weight:600">${e.title}${typeBadge}${warnDot}</td>
        <td style="padding:8px 10px;border-top:1px solid #e5e7eb;color:#374151;white-space:nowrap">${dateLabel}</td>
        <td style="padding:8px 10px;border-top:1px solid #e5e7eb;color:#374151">${e.location || 'TBD'}</td>
        <td style="padding:8px 6px;border-top:1px solid #e5e7eb;text-align:center"><button onclick="togglePublishEvent('${e.id}',false)" style="background:none;border:none;cursor:pointer;color:#ef4444;font-size:16px;line-height:1" title="Remove from publish">&times;</button></td>
      </tr>`;
    });
    html += `</tbody></table>`;
  }

  html += `<div style="margin-top:14px;text-align:center">
    <span style="display:inline-block;background:#2563eb;color:#fff;padding:8px 20px;border-radius:6px;font-weight:600;font-size:12px">View Full Schedule</span>
  </div>`;
  html += `<div style="color:#9ca3af;font-size:10px;text-align:center;margin-top:10px;letter-spacing:0.05em">BROTHERHOOD. HABITS. SUCCESS.</div>`;
  html += `</div></div>`;

  // Excluded / removed events
  if (excluded.length > 0) {
    html += `<div style="margin-top:16px"><div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px">Not included (${excluded.length})</div>`;
    html += `<div style="display:flex;flex-wrap:wrap;gap:6px">`;
    excluded.forEach(e => {
      const errStyle = e.hasError ? 'opacity:0.4;cursor:not-allowed' : 'cursor:pointer';
      const addBtn = e.hasError ? '' : `onclick="togglePublishEvent('${e.id}',true)"`;
      html += `<div style="display:flex;align-items:center;gap:6px;padding:6px 10px;border-radius:6px;border:1px solid var(--border);background:rgba(0,0,0,0.1);font-size:12px;${errStyle}" ${addBtn}>
        <span>${e.title}</span>
        ${e.hasError ? '<span style="color:#ef4444;font-size:10px">ERROR</span>' : '<span style="color:#22c55e;font-size:14px">+</span>'}
      </div>`;
    });
    html += `</div></div>`;
  }

  // Publish mode
  html += `<div style="margin-top:16px;padding:12px 16px;border-radius:8px;border:1px solid var(--border);background:rgba(0,0,0,0.15)">
    <div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px">Publish mode</div>
    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:8px"><input type="radio" name="qa-publish-mode" value="email" checked> <span style="font-size:13px"><strong>Email + Portal</strong> -- send email and mark published</span></label>
    <label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="radio" name="qa-publish-mode" value="portal"> <span style="font-size:13px"><strong>Portal only</strong> -- mark published, no email</span></label>
  </div>`;

  // Action buttons
  const btnLabel = included.length > 0 ? `Approve & Publish ${included.length} Event${included.length > 1 ? 's' : ''}` : 'Select events to publish';
  const btnDisabled = included.length === 0 ? 'disabled style="opacity:0.4;cursor:not-allowed"' : '';
  html += `<div style="display:flex;gap:8px;margin-top:16px">
    <button class="btn btn-primary" style="flex:1" onclick="confirmPublish()" id="qa-publish-btn" ${btnDisabled}>${btnLabel}</button>
    <button class="btn btn-ghost" style="flex:0 0 auto" onclick="closeModal()">Cancel</button>
  </div>`;

  document.getElementById('modal-body').innerHTML = html;
}

function togglePublishEvent(id, include) {
  const pool = window._publishPool;
  if (!pool) return;
  const ev = pool.find(e => e.id === id);
  if (ev && !ev.hasError) ev.included = include;
  renderPublishPreview();
}

async function confirmPublish() {
  const pool = window._publishPool;
  if (!pool) return;

  const included = pool.filter(e => e.included);
  if (!included.length) return;

  const ids = included.map(e => e.id);
  const mode = document.querySelector('input[name="qa-publish-mode"]:checked')?.value || 'email';
  const btn = document.getElementById('qa-publish-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Publishing...'; }

  try {
    const now = new Date().toISOString();
    const { error: updateErr } = await osSupabase
      .from('calendar_events')
      .update({ published_at: now, recalled_at: null })
      .in('id', ids);

    if (updateErr) throw updateErr;

    if (mode === 'email') {
      try {
        await osSupabase.functions.invoke('send-calendar-update', {
          body: { event_ids: ids }
        });
      } catch (emailErr) {
        console.error('Email notification error (events still published):', emailErr);
      }
      showToast(`Published ${ids.length} event(s) and emailed parents.`, 'success');
    } else {
      showToast(`Published ${ids.length} event(s) to portal (no email sent).`, 'success');
    }

    closeModal();
    loadCalendar();
  } catch (e) {
    showToast('Publish error: ' + e.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Approve & Publish Selected'; }
  } finally {
    window._publishPool = null;
    window._publishAudit = null;
  }
}

function calEventForm(e = {}) {
  const types = ['practice', 'game', 'tournament', 'season', 'meeting', 'camp', 'tryout', 'fundraiser', 'deadline', 'other'];
  const typeOpts = types.map(t => `<option value="${t}" ${e.event_type === t ? 'selected' : ''}>${t.charAt(0).toUpperCase() + t.slice(1)}</option>`).join('');
  const gradeVis = e.event_type === 'tournament' ? '' : 'display:none';
  return `<div class="field"><label>Title</label><input type="text" id="ev-title" value="${e.title || ''}"></div>
    <div class="grid2"><div class="field"><label>Type</label><select id="ev-type" onchange="document.getElementById('ev-grade-wrap').style.display=this.value==='tournament'?'':'none'">${typeOpts}</select></div>
    <div class="field" id="ev-grade-wrap" style="${gradeVis}"><label>Grade Level</label><select id="ev-grade"><option value="" ${!e.grade_level ? 'selected' : ''}>--</option><option value="4th" ${e.grade_level === '4th' ? 'selected' : ''}>4th Grade</option><option value="5th" ${e.grade_level === '5th' ? 'selected' : ''}>5th Grade</option><option value="both" ${e.grade_level === 'both' ? 'selected' : ''}>Both</option></select></div>
    <div class="field"><label>Date</label><input type="date" id="ev-date" value="${e.event_date || e.start_date || ''}"></div>
    <div class="field"><label>Start Time</label><input type="time" id="ev-start" value="${e.start_time || ''}"></div>
    <div class="field"><label>End Time</label><input type="time" id="ev-end" value="${e.end_time || ''}"></div></div>
    <div class="field"><label>Location</label><input type="text" id="ev-location" value="${e.location || ''}"></div>
    <div class="field"><label>Description</label><textarea id="ev-desc" style="min-height:80px;border:1px solid var(--border);border-radius:12px;background:rgba(0,0,0,0.3);color:#fff;padding:16px;width:100%;font-family:var(--font-sans);font-size:14px;resize:vertical">${e.description || ''}</textarea></div>
    <div class="field"><label>Visibility</label><select id="ev-visibility">
      <option value="public" ${(e.visibility || 'public') === 'public' ? 'selected' : ''}>Public (visible to parents)</option>
      <option value="team_only" ${e.visibility === 'team_only' ? 'selected' : ''}>Team Only</option>
      <option value="admin_only" ${e.visibility === 'admin_only' ? 'selected' : ''}>Admin Only (hidden from parents)</option>
    </select></div>
    ${e.published_at ? `<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;padding:10px 14px;border-radius:8px;background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.2)"><span style="font-size:12px;color:#22c55e;font-weight:600">Published ${fmtShort(e.published_at.split('T')[0])}</span><button class="btn btn-ghost btn-xs" style="color:#f59e0b;border-color:rgba(245,158,11,0.3)" onclick="depublishEvent('${e.id}')">Recall</button></div>` : (e.recalled_at ? `<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;padding:10px 14px;border-radius:8px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2)"><span style="font-size:12px;color:#f59e0b;font-weight:600">Recalled ${fmtShort(e.recalled_at.split('T')[0])}</span><span style="font-size:11px;color:var(--muted)">Will appear in next publish</span></div>` : '')}
    ${e.source_type ? `<div style="font-size:12px;color:var(--muted);margin-bottom:12px">Auto-created from ${e.source_type}</div>` : ''}
    <input type="hidden" id="ev-id" value="${e.id || ''}">
    <button class="btn btn-primary" style="width:100%;margin-top:8px" onclick="saveCalEvent()">Save Event</button>
    ${e.id ? `<button class="btn btn-danger" style="width:100%;margin-top:8px" onclick="deleteCalEvent('${e.id}');closeModal()">Delete Event</button>` : ''}`;
}
async function saveCalEvent() {
  const id = document.getElementById('ev-id').value;
  const evType = document.getElementById('ev-type').value;
  const gradeEl = document.getElementById('ev-grade');
  const payload = {
    p_id: id || null,
    p_title: document.getElementById('ev-title').value,
    p_event_type: evType,
    p_start_date: document.getElementById('ev-date').value,
    p_start_time: document.getElementById('ev-start').value || null,
    p_end_time: document.getElementById('ev-end').value || null,
    p_location: document.getElementById('ev-location').value,
    p_description: document.getElementById('ev-desc').value || null,
    p_grade_level: evType === 'tournament' && gradeEl ? gradeEl.value || null : null,
    p_visibility: document.getElementById('ev-visibility').value
  };
  if (!payload.p_title || !payload.p_start_date) return showToast('Title and date required', 'error');
  try {
    if (osSupabase) {
      const session = await osSupabase.auth.getSession();
      payload.p_created_by = session.data.session.user.id;
      payload.p_team_id = null; payload.p_all_day = false;
      const { error } = await osSupabase.rpc('upsert_calendar_event', payload);
      if (error) throw error;
    }
    showToast(id ? 'Event updated' : 'Event created'); closeModal(); loadCalendar();
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}
async function depublishEvent(id) {
  if (!osSupabase || !id) return;
  if (!confirm('Recall this event? It will be removed from the parent portal but can be re-published later.')) return;
  try {
    const { error } = await osSupabase.from('calendar_events').update({ published_at: null, recalled_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
    showToast('Event recalled', 'success'); closeModal(); loadCalendar();
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

// ─── BULK TOURNAMENT UPLOAD ──────────────────────────────────
function openBulkTournamentUpload() {
  openModal('add-event');
  document.getElementById('modal-title').textContent = '+ Event';
  document.getElementById('modal-body').innerHTML = `
    <p style="color:var(--muted);font-size:13px;margin-bottom:12px">Paste event info from a website, email, or flyer. Dates, locations, grades, and costs are picked up automatically.</p>
    <div class="field">
      <textarea id="bulk-raw" style="min-height:200px;border:1px solid var(--border);border-radius:12px;background:rgba(0,0,0,0.3);color:#fff;padding:16px;width:100%;font-family:var(--font-mono,monospace);font-size:13px;resize:vertical;transition:border-color 0.2s" placeholder="Example:

iHoop Spring Classic - April 12-13, 2026
Location: Allen Fieldhouse, Allen TX
4th Grade Division -- $425

BigFoot Battle - May 3, 2026
Location: Southlake Rec Center
5th Grade -- $380"></textarea>
      <div id="bulk-hint" style="min-height:20px;margin-top:6px;font-size:12px;transition:opacity 0.2s"></div>
    </div>
    <button class="btn btn-primary" style="width:100%;margin-top:4px" onclick="addTournaments()" id="bulk-add-btn">Add Events</button>
    <div id="bulk-result" style="margin-top:12px"></div>`;
}

async function addTournaments() {
  const raw = document.getElementById('bulk-raw').value.trim();
  const hint = document.getElementById('bulk-hint');
  const textarea = document.getElementById('bulk-raw');
  const btn = document.getElementById('bulk-add-btn');
  const resultDiv = document.getElementById('bulk-result');

  // Reset state
  textarea.style.borderColor = 'var(--border)';
  hint.style.opacity = '0';
  resultDiv.innerHTML = '';

  if (!raw) {
    textarea.style.borderColor = '#ff3b30';
    hint.innerHTML = '<span style="color:#ff3b30">Paste tournament info above to get started.</span>';
    hint.style.opacity = '1';
    textarea.focus();
    return;
  }

  btn.textContent = 'Adding...'; btn.disabled = true;
  try {
    const parsed = parseTournamentText(raw);

    if (!parsed.length) {
      textarea.style.borderColor = '#ff9500';
      hint.innerHTML = '<span style="color:#ff9500">Could not find tournament details. Make sure you include a name and date.</span>';
      hint.style.opacity = '1';
      btn.textContent = 'Add Tournaments'; btn.disabled = false;
      return;
    }

    // Check each parsed entry for required fields
    const valid = [], issues = [];
    parsed.forEach(t => {
      if (!t.title && !t.start_date) issues.push('One entry is missing both a name and date.');
      else if (!t.start_date) issues.push(`"${t.title}" is missing a date.`);
      else if (!t.title) issues.push('One entry has a date but no name.');
      else valid.push(t);
    });

    if (!valid.length) {
      textarea.style.borderColor = '#ff9500';
      hint.innerHTML = `<span style="color:#ff9500">${issues[0] || 'Could not find a tournament name and date.'}</span>`;
      hint.style.opacity = '1';
      btn.textContent = 'Add Tournaments'; btn.disabled = false;
      return;
    }

    // Save all valid tournaments
    if (!osSupabase) { showToast('Not connected', 'error'); btn.textContent = 'Add Tournaments'; btn.disabled = false; return; }
    const session = await osSupabase.auth.getSession();
    const userId = session.data.session.user.id;
    let saved = 0, errors = 0;

    for (const t of valid) {
      try {
        const { error } = await osSupabase.rpc('upsert_calendar_event', {
          p_title: t.title, p_event_type: 'tournament', p_start_date: t.start_date,
          p_end_date: t.end_date || null, p_start_time: t.start_time || null, p_location: t.location || '',
          p_grade_level: t.grade_level || 'both', p_created_by: userId, p_visibility: 'public',
          p_cost: t.cost || null, p_registration_deadline: t.registration_deadline || null,
          p_notes: t.notes || null, p_admin_checklist: JSON.stringify(buildTournamentChecklist())
        });
        if (error) throw error;
        saved++;
      } catch (e) { console.error('Save error:', e); errors++; }
    }

    // Show success summary inline
    textarea.style.borderColor = '#34c759';
    const cards = valid.map(t => {
      const dateLabel = t.end_date && t.end_date !== t.start_date ? fmtShort(t.start_date) + ' - ' + fmtShort(t.end_date) : fmtShort(t.start_date);
      return `<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:rgba(52,199,89,0.08);border-radius:8px;margin-bottom:4px">
        <span style="color:#34c759;font-size:16px">&#10003;</span>
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${t.title}</div>
          <div style="font-size:11px;color:var(--muted)">${dateLabel}${t.location ? ' -- ' + t.location : ''}${t.grade_level && t.grade_level !== 'both' ? ' -- ' + t.grade_level + ' grade' : ''}</div>
        </div>
      </div>`;
    }).join('');

    resultDiv.innerHTML = cards;
    if (issues.length) {
      hint.innerHTML = `<span style="color:#ff9500">${saved} added. ${issues.length} skipped (missing info).</span>`;
      hint.style.opacity = '1';
    } else {
      hint.innerHTML = `<span style="color:#34c759">${saved} tournament${saved !== 1 ? 's' : ''} added to the calendar.</span>`;
      hint.style.opacity = '1';
    }

    btn.textContent = 'Add Tournaments'; btn.disabled = false;
    // Reload calendar in background
    loadCalendar();
    // Auto-close after brief delay so user sees confirmation
    setTimeout(() => { if (document.querySelector('.modal.active')) closeModal(); }, 2200);

  } catch (e) {
    showToast('Error: ' + e.message, 'error');
    btn.textContent = 'Add Tournaments'; btn.disabled = false;
  }
}

function parseTournamentText(raw) {
  // Smart parser: collapses blank lines, detects event boundaries by title patterns,
  // handles pipe-delimited "CITY, STATE | MONTH DAY-DAY" and infers missing year.
  const allLines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  if (!allLines.length) return [];

  const detailRe = /^(please note|your team|no refunds|if you need|powered by|registration|open to|unsigned|normal|excellent|\d\+\s*game|championship|awards|teams must|proof of|\$\d)/i;
  const dateRe = /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d/i;
  const phoneRe = /^\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}$/;

  function isTitleLine(line) {
    if (line.length < 4) return false;
    if (detailRe.test(line) || phoneRe.test(line)) return false;
    if (/^\$/.test(line)) return false;
    // Must be mostly uppercase (>55% of alpha chars)
    const alpha = line.replace(/[^a-zA-Z]/g, '');
    if (alpha.length < 3) return false;
    return (alpha.replace(/[^A-Z]/g, '').length / alpha.length) > 0.55;
  }

  // Split into event blocks using title detection
  const eventBlocks = [];
  let cur = [];
  let curHasDate = false;
  for (const line of allLines) {
    // If this looks like a new title AND the current block already has date info, start new event
    if (cur.length > 0 && curHasDate && isTitleLine(line) && !line.includes('|')) {
      eventBlocks.push(cur);
      cur = [];
      curHasDate = false;
    }
    cur.push(line);
    if (dateRe.test(line) || /\|\s*\w+\s+\d{1,2}/i.test(line) || /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(line)) curHasDate = true;
  }
  if (cur.length) eventBlocks.push(cur);

  const thisYear = new Date().getFullYear();
  const results = [];
  for (const lines of eventBlocks) {
    const entry = { title: '', start_date: '', end_date: '', location: '', grade_level: 'both', start_time: null };

    // Title: first line, strip trailing date portion
    entry.title = lines[0].replace(/^[-*]\s*/, '')
      .replace(/\s*[-\u2013]+\s*\w+\s+\d{1,2}(?:\s*[-\u2013]\s*\d{1,2})?,?\s*\d{4}\s*$/i, '')
      .replace(/\s*[-\u2013]+\s*\d{1,2}\/\d{1,2}\/\d{2,4}\s*$/, '')
      .replace(/\s*[-:]?\s*$/, '');

    for (const line of lines) {
      // Pipe format: "CITY, STATE | MAY 2-3" (year inferred)
      const pipeMatch = line.match(/^(.+?)\s*\|\s*(\w+)\s+(\d{1,2})(?:\s*[-\u2013]\s*(\d{1,2}))?/i);
      if (pipeMatch && !entry.start_date) {
        const loc = pipeMatch[1].trim();
        if (loc && !entry.location) entry.location = loc;
        entry.start_date = toISO(pipeMatch[2], pipeMatch[3], thisYear);
        if (pipeMatch[4]) entry.end_date = toISO(pipeMatch[2], pipeMatch[4], thisYear);
        continue;
      }
      // Standard date: "Month Day-Day, Year", "Month Day-Day", "M/D/YYYY", cross-month ranges
      if (!entry.start_date) {
        const dateMatch = line.match(/(\w+\s+\d{1,2}(?:(?:st|nd|rd|th))?(?:\s*[-\u2013]\s*(?:\w+\s+)?\d{1,2}(?:(?:st|nd|rd|th))?)?,?\s*\d{0,4})/i)
          || line.match(/(\d{1,2}\/\d{1,2}\/\d{2,4}(?:\s*[-\u2013]\s*\d{1,2}\/\d{1,2}\/\d{2,4})?)/);
        if (dateMatch) {
          const parsed = parseDateRange(dateMatch[1]);
          if (parsed.start) entry.start_date = parsed.start;
          if (parsed.end) entry.end_date = parsed.end;
        }
      }
      // Location: prefixed format
      if (!entry.location) {
        const locMatch = line.match(/\b(?:location|venue)\s*[:\-]?\s*(.+)/i) || line.match(/(?:^|\s)(?:at|@)\s*[:\-]\s*(.+)/i);
        if (locMatch) entry.location = (locMatch[1] || locMatch[2] || '').trim();
      }
      // Location: "City, State" standalone (no pipe, no date, no detail)
      if (!entry.location && /^[A-Z][A-Za-z\s.]+,\s*[A-Za-z\s]+$/.test(line) && !dateRe.test(line) && !detailRe.test(line)) {
        entry.location = line;
      }
      // Grade detection
      if (/4th\s*grade|4th\s*gr|u10.*4|grade\s*4/i.test(line) && !/5th/i.test(line)) entry.grade_level = '4th';
      else if (/5th\s*grade|5th\s*gr|u11.*5|grade\s*5/i.test(line) && !/4th/i.test(line)) entry.grade_level = '5th';
      else if (/both|all\s*grades|4th.*5th|5th.*4th/i.test(line)) entry.grade_level = 'both';
      // Time detection
      const timeMatch = line.match(/(\d{1,2}:\d{2}\s*(?:am|pm)?)/i);
      if (timeMatch && !entry.start_time) entry.start_time = convertTo24(timeMatch[1]);
    }
    // Cost detection: "$395-450", "$250", "$100 per team"
    for (const line of lines) {
      const costMatch = line.match(/(\$\d[\d,]*(?:\s*[-–]\s*\$?\d[\d,]*)?(?:\s*(?:per|\/)\s*\w+)?)/i);
      if (costMatch && !entry.cost) { entry.cost = costMatch[1]; break; }
    }
    // Registration deadline: "Registration Closes April 26th, 2026"
    for (const line of lines) {
      const regMatch = line.match(/registration\s+(?:closes?|deadline|due|ends?)\s+(\w+\s+\d{1,2}(?:st|nd|rd|th)?,?\s*\d{4})/i);
      if (regMatch && !entry.registration_deadline) {
        const cleaned = regMatch[1].replace(/(st|nd|rd|th)/i, '');
        const p = parseDateRange(cleaned);
        if (p.start) entry.registration_deadline = p.start;
        break;
      }
    }
    // Notes: collect detail lines (rules, requirements, etc) that aren't title/date/location
    const noteLines = [];
    for (const line of lines) {
      if (line === entry.title || line === entry.location) continue;
      if (/\|\s*\w+\s+\d/i.test(line)) continue; // pipe date line
      if (phoneRe.test(line) || /^\$/.test(line)) continue;
      if (detailRe.test(line) || /call\/text|further assistance/i.test(line)) noteLines.push(line);
    }
    if (noteLines.length) entry.notes = noteLines.join('\n');

    if (entry.title) results.push(entry);
  }
  return results;
}

function parseDateRange(str) {
  // Handle many date formats: "April 12-13, 2026", "4/12/2026", "May 3-4",
  // "April 12, 2026 - April 13, 2026", "April 12th-13th, 2026"
  const result = { start: null, end: null };
  const thisYear = new Date().getFullYear();
  const cleaned = str.replace(/(st|nd|rd|th)\b/gi, '');

  // "Month Day - Month Day, Year" or "Month Day, Year - Month Day, Year"
  const crossMonthMatch = cleaned.match(/(\w+)\s+(\d{1,2}),?\s*(?:\d{4})?\s*[-–]\s*(\w+)\s+(\d{1,2}),?\s*(\d{4})?/i);
  if (crossMonthMatch) {
    const year = crossMonthMatch[5] || thisYear;
    result.start = toISO(crossMonthMatch[1], crossMonthMatch[2], year);
    result.end = toISO(crossMonthMatch[3], crossMonthMatch[4], year);
    return result;
  }
  // "Month Day-Day, Year" or "Month Day-Day" (year optional)
  const rangeMatch = cleaned.match(/(\w+)\s+(\d{1,2})\s*[-–]\s*(\d{1,2}),?\s*(\d{4})?/i);
  if (rangeMatch) {
    const year = rangeMatch[4] || thisYear;
    result.start = toISO(rangeMatch[1], rangeMatch[2], year);
    result.end = toISO(rangeMatch[1], rangeMatch[3], year);
    return result;
  }
  // "Month Day, Year"
  const singleMatch = cleaned.match(/(\w+)\s+(\d{1,2}),?\s*(\d{4})?/i);
  if (singleMatch) {
    const year = singleMatch[3] || thisYear;
    result.start = toISO(singleMatch[1], singleMatch[2], year);
    return result;
  }
  // "M/D/YYYY - M/D/YYYY"
  const slashRangeMatch = cleaned.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*[-–]\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (slashRangeMatch) {
    let y1 = slashRangeMatch[3], y2 = slashRangeMatch[6];
    if (y1.length === 2) y1 = '20' + y1; if (y2.length === 2) y2 = '20' + y2;
    result.start = `${y1}-${slashRangeMatch[1].padStart(2, '0')}-${slashRangeMatch[2].padStart(2, '0')}`;
    result.end = `${y2}-${slashRangeMatch[4].padStart(2, '0')}-${slashRangeMatch[5].padStart(2, '0')}`;
    return result;
  }
  // "M/D/YYYY"
  const slashMatch = cleaned.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (slashMatch) {
    let y = slashMatch[3]; if (y.length === 2) y = '20' + y;
    result.start = `${y}-${slashMatch[1].padStart(2, '0')}-${slashMatch[2].padStart(2, '0')}`;
    return result;
  }
  return result;
}

function toISO(month, day, year) {
  const months = { jan: 1, feb: 2, mar: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
  const m = months[month.toLowerCase().slice(0, 3)] || parseInt(month);
  return `${year}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function convertTo24(timeStr) {
  const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
  if (!match) return null;
  let h = parseInt(match[1]), m = match[2];
  if (match[3]) {
    const pm = match[3].toLowerCase() === 'pm';
    if (pm && h < 12) h += 12; if (!pm && h === 12) h = 0;
  }
  return `${String(h).padStart(2, '0')}:${m}`;
}

// renderBulkPreview and saveBulkTournaments removed -- replaced by unified addTournaments() above

// ─── TOURNAMENT DETAIL + CHECKLIST ──────────────────────────
function tournamentProgressBadge(e) {
  const cl = Array.isArray(e.admin_checklist) ? e.admin_checklist : (e.admin_checklist ? JSON.parse(e.admin_checklist) : []);
  if (!cl.length) return '';
  const done = cl.filter(c => c.done).length, total = cl.length, pct = Math.round(done / total * 100);
  const color = pct === 100 ? '#30d158' : pct > 0 ? '#ff9500' : 'rgba(255,255,255,0.2)';
  return ` <span style="display:inline-flex;align-items:center;gap:4px;margin-left:6px;font-size:11px;color:${color};font-weight:600"><span style="display:inline-block;width:32px;height:4px;background:rgba(255,255,255,0.1);border-radius:2px;overflow:hidden"><span style="display:block;width:${pct}%;height:100%;background:${color};border-radius:2px"></span></span>${done}/${total}</span>`;
}

function buildTournamentChecklist() {
  return [
    { id: 'register', label: 'Register team on tournament site', done: false, done_at: null, done_by: null },
    { id: 'payment', label: 'Submit tournament payment', done: false, done_at: null, done_by: null },
    { id: 'rosters', label: 'Upload/submit team roster', done: false, done_at: null, done_by: null },
    { id: 'proof', label: 'Prepare proof of age/grade docs', done: false, done_at: null, done_by: null },
    { id: 'travel', label: 'Coordinate travel/hotels if needed', done: false, done_at: null, done_by: null },
    { id: 'notify', label: 'Notify parents of tournament details', done: false, done_at: null, done_by: null },
    { id: 'confirm', label: 'Confirm registration received', done: false, done_at: null, done_by: null }
  ];
}

function openTournamentDetail(id) {
  const e = allCalEvents.find(x => x.id === id);
  if (!e) return;
  openModal('tournament-detail');
  document.getElementById('modal-title').textContent = e.title || 'Tournament';
  const checklist = Array.isArray(e.admin_checklist) ? e.admin_checklist : (e.admin_checklist ? JSON.parse(e.admin_checklist) : []);
  const doneCount = checklist.filter(c => c.done).length;
  const total = checklist.length;
  const pct = total ? Math.round(doneCount / total * 100) : 0;
  const startFmt = e.start_date ? fmtShort(e.start_date) : 'TBD';
  const endFmt = e.end_date && e.end_date !== e.start_date ? ' - ' + fmtShort(e.end_date) : '';
  const deadlineFmt = e.registration_deadline ? fmtShort(e.registration_deadline) : null;
  const daysUntil = e.start_date ? Math.ceil((new Date(e.start_date) - new Date()) / (1000 * 60 * 60 * 24)) : null;
  const urgencyColor = daysUntil !== null && daysUntil <= 7 ? '#ff3b30' : daysUntil !== null && daysUntil <= 14 ? '#ff9500' : 'var(--muted)';

  let html = `<div style="display:flex;flex-direction:column;gap:16px">`;

  // Header info cards
  html += `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px">`;
  html += `<div style="padding:12px;background:rgba(255,255,255,0.04);border-radius:10px;border:1px solid var(--border)">
    <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px">Date</div>
    <div style="font-weight:700;margin-top:4px">${startFmt}${endFmt}</div>
    ${daysUntil !== null ? `<div style="font-size:12px;color:${urgencyColor};margin-top:2px">${daysUntil > 0 ? daysUntil + ' days away' : daysUntil === 0 ? 'Today' : 'Passed'}</div>` : ''}
  </div>`;
  if (e.location) html += `<div style="padding:12px;background:rgba(255,255,255,0.04);border-radius:10px;border:1px solid var(--border)">
    <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px">Location</div>
    <div style="font-weight:700;margin-top:4px">${e.location}</div>
  </div>`;
  if (e.cost) html += `<div style="padding:12px;background:rgba(255,255,255,0.04);border-radius:10px;border:1px solid var(--border)">
    <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px">Cost</div>
    <div style="font-weight:700;margin-top:4px">${e.cost}</div>
  </div>`;
  if (e.grade_level) html += `<div style="padding:12px;background:rgba(255,255,255,0.04);border-radius:10px;border:1px solid var(--border)">
    <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px">Grade</div>
    <div style="font-weight:700;margin-top:4px">${e.grade_level === 'both' ? '4th + 5th' : e.grade_level + ' Grade'}</div>
  </div>`;
  if (deadlineFmt) {
    const deadlineDays = Math.ceil((new Date(e.registration_deadline) - new Date()) / (1000 * 60 * 60 * 24));
    const dlColor = deadlineDays <= 3 ? '#ff3b30' : deadlineDays <= 7 ? '#ff9500' : 'var(--text)';
    html += `<div style="padding:12px;background:rgba(255,255,255,0.04);border-radius:10px;border:1px solid var(--border)">
      <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px">Reg. Deadline</div>
      <div style="font-weight:700;margin-top:4px;color:${dlColor}">${deadlineFmt}</div>
      <div style="font-size:12px;color:${dlColor};margin-top:2px">${deadlineDays > 0 ? deadlineDays + ' days left' : deadlineDays === 0 ? 'Today' : 'Overdue'}</div>
    </div>`;
  }
  html += `</div>`;

  // Tags (backup, etc.)
  const eTags = Array.isArray(e.tags) ? e.tags : [];
  const isBackup = eTags.includes('backup');
  if (isBackup) {
    html += `<div style="display:flex;align-items:center;gap:6px;padding:8px 12px;background:rgba(37,99,235,0.08);border:1px solid rgba(37,99,235,0.2);border-radius:8px">
      <span style="color:rgba(37,99,235,0.8);font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:0.5px">Backup Tournament</span>
    </div>`;
  }

  // Registration status tag
  const registerItem = checklist.find(c => c.id === 'register');
  const isRegistered = registerItem && registerItem.done;
  if (!isRegistered && !isBackup) {
    html += `<div style="display:flex;align-items:center;gap:6px;padding:8px 12px;background:rgba(255,59,48,0.1);border:1px solid rgba(255,59,48,0.25);border-radius:8px">
      <span style="color:#ff3b30;font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:0.5px">Not Registered</span>
    </div>`;
  }

  // Checklist section (above details/notes)
  if (checklist.length) {
    html += `<div style="border:1px solid var(--border);border-radius:10px;overflow:hidden">
      <div style="padding:12px 16px;display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,0.04)">
        <div style="font-weight:700;font-size:14px">To Do</div>
        <div style="display:flex;align-items:center;gap:8px">
          <div style="width:80px;height:6px;background:rgba(255,255,255,0.1);border-radius:3px;overflow:hidden">
            <div style="width:${pct}%;height:100%;background:${pct === 100 ? '#30d158' : 'var(--accent)'};border-radius:3px;transition:width 0.3s"></div>
          </div>
          <span style="font-size:12px;color:${pct === 100 ? '#30d158' : 'var(--muted)'};font-weight:600">${doneCount}/${total}</span>
        </div>
      </div>`;
    checklist.forEach((item, idx) => {
      const doneStyle = item.done ? 'text-decoration:line-through;color:var(--muted)' : '';
      const checkIcon = item.done
        ? '<div style="width:20px;height:20px;border-radius:6px;background:#30d158;display:flex;align-items:center;justify-content:center;flex-shrink:0;cursor:pointer"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg></div>'
        : '<div style="width:20px;height:20px;border-radius:6px;border:2px solid rgba(255,255,255,0.2);flex-shrink:0;cursor:pointer"></div>';
      const doneInfo = item.done && item.done_at ? `<span style="font-size:10px;color:var(--muted);margin-left:8px">${fmtShort(item.done_at.split('T')[0])}</span>` : '';
      html += `<div style="padding:10px 16px;display:flex;align-items:center;gap:12px;border-top:1px solid var(--border);cursor:pointer;${item.done ? 'opacity:0.7' : ''}" id="check-row-${idx}" onclick="toggleTournamentCheck('${e.id}',${idx})">
        ${checkIcon}
        <div style="flex:1;font-size:13px;${doneStyle}">${item.label}${doneInfo}</div>
      </div>`;
    });
    html += `</div>`;
  } else {
    html += `<div style="text-align:center;padding:16px;color:var(--muted);font-size:13px">No checklist items. <a href="#" onclick="initTournamentChecklist('${e.id}');return false" style="color:var(--accent)">Add default checklist</a></div>`;
  }

  // Notes / extended details section (below checklist)
  if (e.notes) {
    html += `<div style="padding:12px;background:rgba(255,255,255,0.04);border-radius:10px;border:1px solid var(--border)">
      <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">Tournament Details</div>
      <div style="font-size:13px;color:var(--text);white-space:pre-line;line-height:1.5">${e.notes}</div>
    </div>`;
  }

  // Registration URL
  if (e.registration_url) {
    html += `<a href="${e.registration_url}" target="_blank" style="display:block;padding:10px 16px;background:var(--accent);color:#000;border-radius:8px;text-align:center;font-weight:600;font-size:13px;text-decoration:none">Open Registration Page</a>`;
  }

  // Action buttons
  html += `<div style="display:flex;gap:8px;margin-top:4px">
    <button class="btn btn-ghost btn-sm" style="flex:1" onclick="editCalEvent('${e.id}')">Edit Event</button>
    <button class="btn btn-ghost btn-sm" style="flex:1;color:#ff3b30" onclick="deleteCalEvent('${e.id}');closeModal()">Delete</button>
  </div>`;
  html += `</div>`;

  document.getElementById('modal-body').innerHTML = html;
}

async function toggleTournamentCheck(eventId, idx) {
  const e = allCalEvents.find(x => x.id === eventId);
  if (!e) return;
  const checklist = Array.isArray(e.admin_checklist) ? [...e.admin_checklist] : (e.admin_checklist ? JSON.parse(e.admin_checklist) : []);
  if (!checklist[idx]) return;
  const session = await osSupabase.auth.getSession();
  const userId = session.data.session?.user?.id || null;
  checklist[idx].done = !checklist[idx].done;
  checklist[idx].done_at = checklist[idx].done ? new Date().toISOString() : null;
  checklist[idx].done_by = checklist[idx].done ? userId : null;
  try {
    const { error } = await osSupabase.from('calendar_events').update({ admin_checklist: checklist }).eq('id', eventId);
    if (error) throw error;
    // Update ALL copies of this event in allCalEvents (multi-day expansion creates duplicates)
    allCalEvents.forEach(ev => { if (ev.id === eventId) ev.admin_checklist = checklist; });
    openTournamentDetail(eventId);
    renderCalendar(); // refresh grid/list behind modal so NOT REG badge updates
  } catch (err) { showToast('Error saving: ' + err.message, 'error'); }
}

async function initTournamentChecklist(eventId) {
  const checklist = buildTournamentChecklist();
  try {
    const { error } = await osSupabase.from('calendar_events').update({ admin_checklist: checklist }).eq('id', eventId);
    if (error) throw error;
    allCalEvents.forEach(ev => { if (ev.id === eventId) ev.admin_checklist = checklist; });
    openTournamentDetail(eventId);
    renderCalendar();
  } catch (err) { showToast('Error: ' + err.message, 'error'); }
}

// ─── BLOG ───────────────────────────────────────────────────
async function loadBlog() {
  try { if (osSupabase) { const { data } = await osSupabase.from('blog_posts').select('id,title,status,published_at,excerpt,body,tags').order('created_at', { ascending: false }); BLOG_POSTS = data || []; } } catch (e) { }
  if (!BLOG_POSTS.length) BLOG_POSTS = [{ id: 'b1', title: 'Welcome to the 2026 Season', status: 'published', published_at: new Date().toISOString(), excerpt: 'Exciting things ahead.', body: '# Welcome\n\nWe are thrilled to kick off another great season!', tags: ['news'] }];
  renderBlogList();
}
function renderBlogList() {
  document.getElementById('blog-list').innerHTML = BLOG_POSTS.map(p => `<div onclick="editBlog('${p.id}')" style="padding:10px;border-radius:8px;cursor:pointer;margin-bottom:6px;border:1px solid var(--border)" onmouseover="this.style.background='rgba(255,255,255,.04)'" onmouseout="this.style.background=''"><div style="font-weight:600;font-size:13px;margin-bottom:4px">${p.title}</div>${statusTag(p.status)}</div>`).join('');
}
function newBlogPost() { ['blog-editing-id', 'blog-title', 'blog-excerpt', 'blog-tags', 'blog-body'].forEach(id => document.getElementById(id).value = ''); document.getElementById('blog-editor-title').textContent = 'New Post'; }
function editBlog(id) { const p = BLOG_POSTS.find(x => x.id === id); if (!p) return; document.getElementById('blog-editing-id').value = p.id; document.getElementById('blog-title').value = p.title; document.getElementById('blog-excerpt').value = p.excerpt || ''; document.getElementById('blog-tags').value = (p.tags || []).join(', '); document.getElementById('blog-body').value = p.body || ''; document.getElementById('blog-editor-title').textContent = 'Editing: ' + p.title; }
async function saveBlogDraft() { await saveBlog('draft'); }
async function publishBlogPost() { await saveBlog('published'); }
async function saveBlog(status) {
  const id = document.getElementById('blog-editing-id').value;
  const payload = { title: document.getElementById('blog-title').value, body: document.getElementById('blog-body').value, excerpt: document.getElementById('blog-excerpt').value, tags: document.getElementById('blog-tags').value.split(',').map(t => t.trim()).filter(Boolean), status };
  if (!payload.title) return showToast('Title is required', 'error');
  try {
    if (osSupabase) { if (id) { await osSupabase.from('blog_posts').update(payload).eq('id', id); } else { const { data } = await osSupabase.from('blog_posts').insert({ ...payload, author_id: (await window.auth.getCurrentUser())?.id }).select('id').single(); if (data) document.getElementById('blog-editing-id').value = data.id; } }
    else { if (id) { const p = BLOG_POSTS.find(x => x.id === id); if (p) Object.assign(p, payload); } else { BLOG_POSTS.unshift({ id: 'b' + Date.now(), ...payload }); } }
    showToast(status === 'published' ? 'Published to site!' : 'Draft saved!'); await loadBlog();
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

// ─── MEMOS ──────────────────────────────────────────────────
async function loadMemos() {
  try { if (osSupabase) { const { data } = await osSupabase.from('memo_summary').select('*').order('created_at', { ascending: false }); MEMOS = data || []; } } catch (e) { }
  if (!MEMOS.length) MEMOS = [{ id: 'm1', subject: 'Practice Schedule - Week 2', recipient: 'all_coaches', author_name: 'Scott G.', created_at: new Date().toISOString(), ack_count: 3, body: 'Practice at 6pm Tuesday.' }];
  renderMemoList();
}
function renderMemoList() {
  document.getElementById('memos-list').innerHTML = MEMOS.map(m => `<div onclick="viewMemo('${m.id}')" style="padding:10px;border-radius:8px;cursor:pointer;margin-bottom:6px;border:1px solid var(--border)" onmouseover="this.style.background='rgba(255,255,255,.04)'" onmouseout="this.style.background=''"><div style="font-weight:600;font-size:13px;margin-bottom:4px">${m.subject}</div><div style="display:flex;justify-content:space-between">${statusTag(m.recipient)}<span style="color:var(--muted);font-size:11px">Acks: ${m.ack_count || 0}</span></div></div>`).join('');
}
function newMemo() { ['memo-editing-id', 'memo-subject', 'memo-body'].forEach(id => document.getElementById(id).value = ''); document.getElementById('memo-acks').innerHTML = ''; document.getElementById('memo-editor-title').textContent = 'New Memo'; }
function viewMemo(id) { const m = MEMOS.find(x => x.id === id); if (!m) return; document.getElementById('memo-editing-id').value = m.id; document.getElementById('memo-subject').value = m.subject; document.getElementById('memo-body').value = m.body || ''; document.getElementById('memo-recipient').value = m.recipient; document.getElementById('memo-editor-title').textContent = m.subject; document.getElementById('memo-acks').innerHTML = `<div style="padding:12px;background:rgba(255,255,255,.03);border-radius:8px"><div style="font-size:12px;font-weight:700;color:var(--muted);margin-bottom:6px">ACKNOWLEDGMENTS</div><div style="font-size:13px">${m.ack_count > 0 ? `${m.ack_count} coaches acknowledged` : 'No acknowledgments yet'}</div></div>`; }
async function sendMemo() {
  const id = document.getElementById('memo-editing-id').value;
  const payload = { subject: document.getElementById('memo-subject').value, body: document.getElementById('memo-body').value, recipient: document.getElementById('memo-recipient').value };
  if (!payload.subject) return showToast('Subject is required', 'error');
  try {
    if (osSupabase) { const user = await window.auth.getCurrentUser(); if (id) { await osSupabase.from('memos').update(payload).eq('id', id); } else { await osSupabase.from('memos').insert({ ...payload, author_id: user?.id }); } }
    else { MEMOS.unshift({ id: 'm' + Date.now(), ...payload, author_name: 'Scott G.', created_at: new Date().toISOString(), ack_count: 0 }); }
    showToast('Memo sent to ' + payload.recipient); await loadMemos(); newMemo();
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

// ─── MODAL ──────────────────────────────────────────────────
function openModal(id) {
  const templates = {
    'add-player': `
      <h3 style="font-size:12px;font-weight:700;color:var(--muted);margin-bottom:8px">PLAYER INFO</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div class="field"><label>First Name</label><input type="text" id="np-pfirst" placeholder="e.g. Aiden"></div>
        <div class="field"><label>Last Name</label><input type="text" id="np-plast" placeholder="e.g. Johnson"></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
        <div class="field"><label>Jersey #</label><input type="number" id="np-jersey" min="0" max="99" placeholder="e.g. 23"></div>
        <div class="field"><label>DOB</label><input type="date" id="np-dob"></div>
        <div class="field"><label>Grade</label><select id="np-grade"><option value="4th">4th</option><option value="5th">5th</option><option value="3rd">3rd</option><option value="6th">6th</option></select></div>
      </div>
      <div class="field"><label>Play Style / Position</label><select id="np-position"><option value="">-- Select --</option><option value="PG">Point Guard</option><option value="SG">Shooting Guard</option><option value="SF">Small Forward</option><option value="PF">Power Forward</option><option value="C">Center</option><option value="G">Guard</option><option value="F">Forward</option><option value="UTIL">Utility</option></select></div>
      <hr style="border-color:var(--border);margin:12px 0">
      <h3 style="font-size:12px;font-weight:700;color:var(--muted);margin-bottom:8px">PARENT / GUARDIAN INFO</h3>
      <div class="field"><label>Parent Full Name</label><input type="text" id="np-name" placeholder="e.g. Jane Johnson"></div>
      <div class="field"><label>Parent Email</label><input type="email" id="np-email" placeholder="e.g. jane@email.com"></div>
      <div class="field"><label>Relationship</label><select id="np-rel"><option value="mother">Mother</option><option value="father">Father</option><option value="guardian" selected>Guardian</option><option value="stepparent">Stepparent</option><option value="other">Other</option></select></div>
      <button class="btn btn-primary" style="width:100%;margin-top:8px" onclick="addPlayer()">Add Player & Parent</button>`,
    'record-payment': `<div class="field"><label>Parent Email</label><input type="email" id="rp-email"></div><div class="field"><label>Amount</label><input type="number" id="rp-amount"></div><div class="field"><label>Method</label><select id="rp-method"><option value="venmo">Venmo</option><option value="cash">Cash</option><option value="zelle">Zelle</option><option value="check">Check</option></select></div><button class="btn btn-primary" style="width:100%;margin-top:8px" onclick="recordPaymentByEmail()">Record Payment</button>`,
    'create-event': calEventForm(),
  };
  const titles = { 'add-player': 'Add Player & Parent', 'record-payment': 'Record Payment', 'create-event': 'Create Event', 'view-player': 'Profile Detail', 'view-broadcast': 'Broadcast Detail', 'edit-event': 'Edit Event', 'day-events': 'Day Events', 'link-parent': 'Link Parent', 'add-event': 'New Event' };
  document.getElementById('modal-title').textContent = titles[id] || '';
  if (templates[id]) document.getElementById('modal-body').innerHTML = templates[id];
  document.getElementById('modal-overlay').classList.add('open');
}
function closeModal() { document.getElementById('modal-overlay').classList.remove('open'); }

async function addPlayer() {
  const pFirst = (document.getElementById('np-pfirst')?.value || '').trim();
  const pLast = (document.getElementById('np-plast')?.value || '').trim();
  const grade = document.getElementById('np-grade')?.value || '';
  const parentName = (document.getElementById('np-name')?.value || '').trim();
  const parentEmail = (document.getElementById('np-email')?.value || '').trim().toLowerCase();
  const rel = document.getElementById('np-rel')?.value || 'guardian';
  if (!pFirst) return showToast('Player first name is required', 'error');
  if (!parentEmail) return showToast('Parent email is required', 'error');
  if (!osSupabase) return;
  try {
    const jersey = document.getElementById('np-jersey')?.value;
    const dob = document.getElementById('np-dob')?.value || null;
    const position = document.getElementById('np-position')?.value || null;
    // 1. Create athlete record
    const athleteRow = { first_name: pFirst, last_name: pLast || '', grade: grade, enrollment_status: 'active' };
    if (jersey !== '' && jersey != null) athleteRow.jersey_number = parseInt(jersey, 10);
    if (dob) athleteRow.date_of_birth = dob;
    if (position) athleteRow.position = position;
    const { data: athlete, error: athErr } = await osSupabase.from('athletes').insert(athleteRow).select('id').single();
    if (athErr) { showToast('Error creating player: ' + athErr.message, 'error'); return; }
    // 2. Find or create parent profile
    let profileId;
    const { data: existing } = await osSupabase.from('profiles').select('id').eq('email', parentEmail).maybeSingle();
    if (existing) { profileId = existing.id; }
    else {
      // Insert into profiles (note: may fail on FK if no auth.users row -- fallback to direct insert)
      const { data: newProf, error: profErr } = await osSupabase.from('profiles').insert({ email: parentEmail, full_name: parentName, player_name: pFirst + (pLast ? ' ' + pLast : ''), grade: grade, role: 'parent', approved: true }).select('id').single();
      if (profErr) { showToast('Error creating parent profile: ' + profErr.message + '. Parent may need to sign up first.', 'error'); return; }
      profileId = newProf.id;
    }
    // 3. Link parent to athlete
    const { error: linkErr } = await osSupabase.rpc('link_parent_to_athlete', { p_profile_id: profileId, p_athlete_id: athlete.id, p_relationship: rel, p_is_primary: true });
    if (linkErr) { showToast('Player created but link failed: ' + linkErr.message, 'error'); }
    else { showToast('Player & parent added!'); }
    closeModal(); loadPlayers();
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}
async function recordPaymentByEmail() {
  const email = (document.getElementById('rp-email').value || '').trim().toLowerCase();
  const amount = parseFloat(document.getElementById('rp-amount').value);
  const method = document.getElementById('rp-method').value;
  if (!email || !amount || amount <= 0) return showToast('Valid email and amount required', 'error');
  if (!osSupabase) return;
  try {
    // 1. Find parent profile
    const { data: prof, error: profErr } = await osSupabase.from('profiles').select('id,full_name').eq('email', email).maybeSingle();
    if (profErr || !prof) return showToast('No parent profile found for ' + email, 'error');
    // 2. Find or create enrollment (uses Full Program / Pay in Full defaults)
    let enrollmentId;
    const { data: enrollment } = await osSupabase.from('parent_dues_enrollment').select('id').eq('parent_email', email).maybeSingle();
    if (enrollment) { enrollmentId = enrollment.id; }
    else {
      // Auto-enroll: Full Program config + Pay in Full template
      const { data: cfg } = await osSupabase.from('season_dues_config').select('id,total_amount').eq('program', 'Full Program').eq('is_active', true).maybeSingle();
      if (!cfg) return showToast('No active season config found. Create one in Season Dues Config first.', 'error');
      const { data: plan } = await osSupabase.from('payment_plan_templates').select('id').eq('dues_config_id', cfg.id).eq('plan_name', 'Pay in Full').maybeSingle();
      if (!plan) return showToast('No Pay in Full plan template found for Full Program.', 'error');
      const { data: newEnroll, error: enrErr } = await osSupabase.from('parent_dues_enrollment').insert({
        parent_email: email, parent_name: prof.full_name || '', dues_config_id: cfg.id,
        plan_template_id: plan.id, total_owed: cfg.total_amount, total_paid: 0, status: 'active'
      }).select('id').single();
      if (enrErr) return showToast('Enrollment failed: ' + enrErr.message, 'error');
      enrollmentId = newEnroll.id;
    }
    // 3. Find next unpaid installment or create one
    let installmentId = null;
    const { data: unpaid } = await osSupabase.from('dues_installments').select('id,amount').eq('enrollment_id', enrollmentId).in('status', ['pending', 'overdue']).order('due_date').limit(1).maybeSingle();
    if (unpaid) { installmentId = unpaid.id; }
    else {
      // Create a one-off installment for this manual payment
      const { data: inst, error: instErr } = await osSupabase.from('dues_installments').insert({
        enrollment_id: enrollmentId, installment_number: 1, amount: amount,
        due_date: new Date().toISOString().split('T')[0], status: 'pending'
      }).select('id').single();
      if (instErr) return showToast('Installment creation failed: ' + instErr.message, 'error');
      installmentId = inst.id;
    }
    // 4. Record the payment
    const { error: payErr } = await osSupabase.from('dues_payments').insert({
      enrollment_id: enrollmentId, installment_id: installmentId,
      stripe_payment_intent: 'manual_' + method + '_' + Date.now(),
      amount: amount, currency: 'usd', status: 'succeeded', paid_at: new Date().toISOString()
    });
    if (payErr) return showToast('Payment insert failed: ' + payErr.message, 'error');
    // 5. Mark installment paid + update enrollment total_paid
    await osSupabase.from('dues_installments').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', installmentId);
    const { data: enr } = await osSupabase.from('parent_dues_enrollment').select('total_paid,total_owed').eq('id', enrollmentId).single();
    if (enr) {
      const newPaid = (parseFloat(enr.total_paid) || 0) + amount;
      const newStatus = newPaid >= parseFloat(enr.total_owed) ? 'paid_in_full' : 'active';
      await osSupabase.from('parent_dues_enrollment').update({ total_paid: newPaid, status: newStatus }).eq('id', enrollmentId);
    }
    showToast(`$${amount} via ${method} recorded!`); closeModal(); loadDues();
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

// ─── EDITOR HELPERS ─────────────────────────────────────────
function fmtEd(pre, post, id) { const t = document.getElementById(id), s = t.selectionStart, e = t.selectionEnd, v = t.value; t.value = v.slice(0, s) + pre + v.slice(s, e) + post + v.slice(e); t.focus(); t.selectionStart = s + pre.length; t.selectionEnd = e + pre.length; }
function fmtEdLine(prefix, id) { const t = document.getElementById(id), s = t.selectionStart, v = t.value; const ls = v.lastIndexOf('\n', s - 1) + 1; t.value = v.slice(0, ls) + prefix + v.slice(ls); t.focus(); }
// blog
window.fmt = (pre, post) => fmtEd(pre, post, 'blog-body');
window.fmtLine = (prefix) => fmtEdLine(prefix, 'blog-body');
window.insertTxt = (txt) => { const t = document.getElementById('blog-body'), s = t.selectionStart, v = t.value; t.value = v.slice(0, s) + txt + v.slice(s); t.focus(); };
// memo
window.fmtM = (pre, post) => fmtEd(pre, post, 'memo-body');
window.fmtMLine = (prefix) => fmtEdLine(prefix, 'memo-body');

function doLogout() { if (window.auth?.logout) window.auth.logout(); else window.location.href = 'index.html'; }

// ============================================================
// TOURNAMENT CATALOG + SCHEDULE BUILDER
// ============================================================

const TOURN_MOCK = [
  { id: 't1', name: 'Rocky Mountain Showdown', organizer_name: 'Bigfoot Hoops', organizer_circuit: 'Bigfoot Hoops', start_date: '2026-04-11', end_date: '2026-04-12', city: 'Denver', state: 'CO', region: 'Mountain West', event_type: 'tournament', gender: 'boys', age_groups: '10U-17U', cost_min: 325, cost_max: 375, game_guarantee: 3, rank_competition: 7, rank_exposure: 6, rank_circuit: 7, rank_composite: 6.7, rank_tier: 'Premier', ability_level: 'Competitive', is_certified: true, source_page: 'colorado' },
  { id: 't2', name: 'Front Range Classic', organizer_name: 'Prep Hoops', organizer_circuit: 'Prep Hoops', start_date: '2026-04-18', end_date: '2026-04-19', city: 'Aurora', state: 'CO', region: 'Mountain West', event_type: 'tournament', gender: 'boys', age_groups: '10U-14U', cost_min: 300, cost_max: 350, game_guarantee: 3, rank_competition: 8, rank_exposure: 8, rank_circuit: 8, rank_composite: 8.0, rank_tier: 'Elite', ability_level: 'Elite/Competitive', is_certified: true, source_page: 'colorado' },
  { id: 't3', name: 'Mile High Madness', organizer_name: 'Game Time Events', organizer_circuit: 'Game Time Events', start_date: '2026-04-25', end_date: '2026-04-26', city: 'Lakewood', state: 'CO', region: 'Mountain West', event_type: 'tournament', gender: 'coed', age_groups: '8U-14U', cost_min: 250, cost_max: 300, game_guarantee: 3, rank_competition: 6, rank_exposure: 5, rank_circuit: 7, rank_composite: 5.9, rank_tier: 'Select', ability_level: 'Competitive', is_certified: true, source_page: 'colorado' },
  { id: 't4', name: 'Pikes Peak Invitational', organizer_name: 'HoopSource', organizer_circuit: 'HoopSource', start_date: '2026-05-02', end_date: '2026-05-03', city: 'Colorado Springs', state: 'CO', region: 'Mountain West', event_type: 'tournament', gender: 'boys', age_groups: '10U-17U', cost_min: 350, cost_max: 400, game_guarantee: 4, rank_competition: 8, rank_exposure: 7, rank_circuit: 8, rank_composite: 7.7, rank_tier: 'Premier', ability_level: 'Elite/Competitive', is_certified: true, source_page: 'colorado' },
  { id: 't5', name: 'Colorado Crossover', organizer_name: 'Jr EYBL', organizer_circuit: 'Jr EYBL', start_date: '2026-05-09', end_date: '2026-05-10', city: 'Denver', state: 'CO', region: 'Mountain West', event_type: 'tournament', gender: 'boys', age_groups: '10U-17U', cost_min: 400, cost_max: 450, game_guarantee: 4, rank_competition: 9, rank_exposure: 9, rank_circuit: 8, rank_composite: 8.8, rank_tier: 'Elite', ability_level: 'Elite', is_certified: true, is_ncaa_certified: true, source_page: 'colorado' },
  { id: 't6', name: 'Spring Tipoff Classic', organizer_name: 'Bigfoot Hoops', organizer_circuit: 'Bigfoot Hoops', start_date: '2026-05-16', end_date: '2026-05-17', city: 'Thornton', state: 'CO', region: 'Mountain West', event_type: 'tournament', gender: 'boys', age_groups: '8U-14U', cost_min: 275, cost_max: 325, game_guarantee: 3, rank_competition: 6, rank_exposure: 5, rank_circuit: 7, rank_composite: 5.9, rank_tier: 'Select', ability_level: 'Competitive/Developmental', is_certified: true, source_page: 'colorado' },
  { id: 't7', name: 'Memorial Day Showcase', organizer_name: 'Prep Hoops', organizer_circuit: 'Prep Hoops', start_date: '2026-05-23', end_date: '2026-05-25', city: 'Denver', state: 'CO', region: 'Mountain West', event_type: 'showcase', gender: 'boys', age_groups: '12U-17U', cost_min: 450, cost_max: 500, game_guarantee: 4, rank_competition: 9, rank_exposure: 9, rank_circuit: 8, rank_composite: 8.8, rank_tier: 'Elite', ability_level: 'Elite', is_certified: true, is_ncaa_certified: true, source_page: 'colorado' },
  { id: 't8', name: 'Denver Dribble Fest', organizer_name: 'Colorado Hoops', organizer_circuit: 'Independent', start_date: '2026-04-11', end_date: '2026-04-11', city: 'Denver', state: 'CO', region: 'Mountain West', event_type: '1-day', gender: 'coed', age_groups: '8U-12U', cost_min: 75, cost_max: 100, game_guarantee: 2, rank_competition: 3, rank_exposure: 2, rank_circuit: 4, rank_composite: 2.9, rank_tier: 'Open', ability_level: 'Developmental', is_certified: false, source_page: 'colorado' },
  { id: 't9', name: 'Texas Takeover', organizer_name: 'Nike EYBL', organizer_circuit: 'Nike EYBL', start_date: '2026-06-06', end_date: '2026-06-08', city: 'Dallas', state: 'TX', region: 'South', event_type: 'tournament', gender: 'boys', age_groups: '10U-17U', cost_min: 500, cost_max: 600, game_guarantee: 5, rank_competition: 10, rank_exposure: 10, rank_circuit: 10, rank_composite: 10.0, rank_tier: 'Elite', ability_level: 'Elite', is_certified: true, is_ncaa_certified: true, source_page: 'texas' },
  { id: 't10', name: 'Lone Star Shootout', organizer_name: 'Prep Hoops', organizer_circuit: 'Prep Hoops', start_date: '2026-06-13', end_date: '2026-06-14', city: 'Houston', state: 'TX', region: 'South', event_type: 'tournament', gender: 'boys', age_groups: '10U-17U', cost_min: 375, cost_max: 425, game_guarantee: 4, rank_competition: 8, rank_exposure: 8, rank_circuit: 8, rank_composite: 8.0, rank_tier: 'Elite', ability_level: 'Elite/Competitive', is_certified: true, source_page: 'texas' },
  { id: 't11', name: 'Arizona Desert Classic', organizer_name: 'Game Time Events', organizer_circuit: 'Game Time Events', start_date: '2026-06-20', end_date: '2026-06-21', city: 'Phoenix', state: 'AZ', region: 'West', event_type: 'tournament', gender: 'boys', age_groups: '10U-14U', cost_min: 350, cost_max: 400, game_guarantee: 3, rank_competition: 7, rank_exposure: 6, rank_circuit: 7, rank_composite: 6.7, rank_tier: 'Premier', ability_level: 'Competitive', is_certified: true, source_page: 'arizona' },
  { id: 't12', name: 'Summer Slam Hoopfest', organizer_name: 'HoopSource', organizer_circuit: 'HoopSource', start_date: '2026-06-27', end_date: '2026-06-29', city: 'Denver', state: 'CO', region: 'Mountain West', event_type: 'tournament', gender: 'boys', age_groups: '10U-17U', cost_min: 400, cost_max: 475, game_guarantee: 4, rank_competition: 8, rank_exposure: 7, rank_circuit: 8, rank_composite: 7.7, rank_tier: 'Premier', ability_level: 'Elite/Competitive', is_certified: true, source_page: 'colorado' },
  { id: 't13', name: '4th of July Classic', organizer_name: 'Bigfoot Hoops', organizer_circuit: 'Bigfoot Hoops', start_date: '2026-07-03', end_date: '2026-07-05', city: 'Denver', state: 'CO', region: 'Mountain West', event_type: 'tournament', gender: 'boys', age_groups: '8U-17U', cost_min: 350, cost_max: 425, game_guarantee: 4, rank_competition: 7, rank_exposure: 6, rank_circuit: 7, rank_composite: 6.7, rank_tier: 'Premier', ability_level: 'Competitive', is_certified: true, source_page: 'colorado' },
  { id: 't14', name: 'Mountain West Championships', organizer_name: 'Jr EYBL', organizer_circuit: 'Jr EYBL', start_date: '2026-07-10', end_date: '2026-07-12', city: 'Denver', state: 'CO', region: 'Mountain West', event_type: 'tournament', gender: 'boys', age_groups: '10U-17U', cost_min: 450, cost_max: 525, game_guarantee: 5, rank_competition: 9, rank_exposure: 9, rank_circuit: 8, rank_composite: 8.8, rank_tier: 'Elite', ability_level: 'Elite', is_certified: true, is_ncaa_certified: true, source_page: 'colorado' },
  { id: 't15', name: 'All-American Showcase', organizer_name: 'Under Armour', organizer_circuit: 'Under Armour', start_date: '2026-07-17', end_date: '2026-07-19', city: 'Las Vegas', state: 'NV', region: 'West', event_type: 'showcase', gender: 'boys', age_groups: '12U-17U', cost_min: 550, cost_max: 650, game_guarantee: 5, rank_competition: 10, rank_exposure: 10, rank_circuit: 10, rank_composite: 10.0, rank_tier: 'Elite', ability_level: 'Elite', is_certified: true, is_ncaa_certified: true, source_page: 'nevada' },
  { id: 't16', name: 'Rocky Mountain 3v3 Jam', organizer_name: 'Colorado Hoops', organizer_circuit: 'Independent', start_date: '2026-05-02', end_date: '2026-05-02', city: 'Boulder', state: 'CO', region: 'Mountain West', event_type: '3v3', gender: 'coed', age_groups: '8U-14U', cost_min: 75, cost_max: 100, game_guarantee: 4, rank_competition: 3, rank_exposure: 2, rank_circuit: 4, rank_composite: 2.9, rank_tier: 'Open', ability_level: 'Developmental', is_certified: false, source_page: 'colorado' },
  { id: 't17', name: 'Centennial State Slam', organizer_name: 'Prep Hoops', organizer_circuit: 'Prep Hoops', start_date: '2026-05-30', end_date: '2026-05-31', city: 'Fort Collins', state: 'CO', region: 'Mountain West', event_type: 'tournament', gender: 'boys', age_groups: '10U-14U', cost_min: 300, cost_max: 350, game_guarantee: 3, rank_competition: 7, rank_exposure: 7, rank_circuit: 8, rank_composite: 7.3, rank_tier: 'Premier', ability_level: 'Competitive', is_certified: true, source_page: 'colorado' },
  { id: 't18', name: 'Kansas City Classic', organizer_name: 'Bigfoot Hoops', organizer_circuit: 'Bigfoot Hoops', start_date: '2026-06-06', end_date: '2026-06-07', city: 'Kansas City', state: 'KS', region: 'Midwest', event_type: 'tournament', gender: 'boys', age_groups: '10U-17U', cost_min: 325, cost_max: 375, game_guarantee: 3, rank_competition: 7, rank_exposure: 6, rank_circuit: 7, rank_composite: 6.7, rank_tier: 'Premier', ability_level: 'Competitive', is_certified: true, source_page: 'kansas' },
  { id: 't19', name: 'Utah Summer Hoops', organizer_name: 'HoopSource', organizer_circuit: 'HoopSource', start_date: '2026-07-24', end_date: '2026-07-25', city: 'Salt Lake City', state: 'UT', region: 'Mountain West', event_type: 'tournament', gender: 'boys', age_groups: '10U-14U', cost_min: 325, cost_max: 375, game_guarantee: 3, rank_competition: 7, rank_exposure: 6, rank_circuit: 8, rank_composite: 6.9, rank_tier: 'Premier', ability_level: 'Competitive', is_certified: true, source_page: 'utah' },
  { id: 't20', name: 'Western Regionals', organizer_name: 'Nike EYBL', organizer_circuit: 'Nike EYBL', start_date: '2026-07-31', end_date: '2026-08-02', city: 'Los Angeles', state: 'CA', region: 'West', event_type: 'tournament', gender: 'boys', age_groups: '10U-17U', cost_min: 550, cost_max: 650, game_guarantee: 5, rank_competition: 10, rank_exposure: 10, rank_circuit: 10, rank_composite: 10.0, rank_tier: 'Elite', ability_level: 'Elite', is_certified: true, is_ncaa_certified: true, source_page: 'california' },
  { id: 't21', name: 'Denver Skills Camp', organizer_name: 'Colorado Hoops', organizer_circuit: 'Independent', start_date: '2026-04-04', end_date: '2026-04-05', city: 'Denver', state: 'CO', region: 'Mountain West', event_type: 'camp', gender: 'coed', age_groups: '8U-14U', cost_min: 125, cost_max: 175, game_guarantee: null, rank_competition: 3, rank_exposure: 3, rank_circuit: 4, rank_composite: 3.3, rank_tier: 'Open', ability_level: 'Developmental', is_certified: false, source_page: 'colorado' },
  { id: 't22', name: 'New Mexico Invitational', organizer_name: 'Game Time Events', organizer_circuit: 'Game Time Events', start_date: '2026-06-13', end_date: '2026-06-14', city: 'Albuquerque', state: 'NM', region: 'Mountain West', event_type: 'tournament', gender: 'boys', age_groups: '10U-14U', cost_min: 300, cost_max: 350, game_guarantee: 3, rank_competition: 6, rank_exposure: 5, rank_circuit: 7, rank_composite: 5.9, rank_tier: 'Select', ability_level: 'Competitive', is_certified: true, source_page: 'new_mexico' },
  { id: 't23', name: 'Colorado Premier League', organizer_name: 'Jr EYBL', organizer_circuit: 'Jr EYBL', start_date: '2026-04-18', end_date: '2026-06-20', city: 'Denver', state: 'CO', region: 'Mountain West', event_type: 'league', gender: 'boys', age_groups: '10U-14U', cost_min: 600, cost_max: 750, game_guarantee: 10, rank_competition: 9, rank_exposure: 8, rank_circuit: 8, rank_composite: 8.5, rank_tier: 'Elite', ability_level: 'Elite/Competitive', is_certified: true, source_page: 'colorado' },
  { id: 't24', name: 'Oklahoma Thunder Classic', organizer_name: 'Prep Hoops', organizer_circuit: 'Prep Hoops', start_date: '2026-07-10', end_date: '2026-07-12', city: 'Oklahoma City', state: 'OK', region: 'South', event_type: 'tournament', gender: 'boys', age_groups: '10U-17U', cost_min: 350, cost_max: 400, game_guarantee: 4, rank_competition: 7, rank_exposure: 7, rank_circuit: 8, rank_composite: 7.3, rank_tier: 'Premier', ability_level: 'Competitive', is_certified: true, source_page: 'oklahoma' },
  { id: 't25', name: 'Wyoming Shootout', organizer_name: 'Bigfoot Hoops', organizer_circuit: 'Bigfoot Hoops', start_date: '2026-08-08', end_date: '2026-08-09', city: 'Cheyenne', state: 'WY', region: 'Mountain West', event_type: 'tournament', gender: 'boys', age_groups: '10U-14U', cost_min: 275, cost_max: 325, game_guarantee: 3, rank_competition: 5, rank_exposure: 4, rank_circuit: 7, rank_composite: 5.2, rank_tier: 'Select', ability_level: 'Competitive/Developmental', is_certified: true, source_page: 'wyoming' }
];

let allTournaments = [];
let filteredTourn = [];
let tournPage = 1;
const TOURN_PER_PAGE = 15;
let tournSortCol = 'start_date';
let tournSortDir = 'asc';
let tournSchedule = [];
const MONTH_NAMES_T = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

let tournLive = false;
async function loadTournaments() {
  tournLive = false;
  if (osSupabase) {
    try {
      const { data, error } = await osSupabase.from('tournament_catalog').select('*').order('start_date');
      if (!error && data && data.length > 0) {
        // Supabase returns NUMERIC columns as strings -- coerce to numbers
        allTournaments = data.map(t => ({
          ...t,
          cost_min: t.cost_min != null ? parseFloat(t.cost_min) : null,
          cost_max: t.cost_max != null ? parseFloat(t.cost_max) : null,
          rank_competition: t.rank_competition != null ? parseFloat(t.rank_competition) : null,
          rank_exposure: t.rank_exposure != null ? parseFloat(t.rank_exposure) : null,
          rank_circuit: t.rank_circuit != null ? parseFloat(t.rank_circuit) : null,
          rank_composite: t.rank_composite != null ? parseFloat(t.rank_composite) : null,
          game_guarantee: t.game_guarantee != null ? parseInt(t.game_guarantee, 10) : null
        }));
        tournLive = true;
      }
    } catch (e) { console.warn('tournament_catalog query failed, using mock:', e.message); }
  }
  if (!tournLive) allTournaments = TOURN_MOCK.slice();
  // Load schedule from Supabase if live
  if (osSupabase && tournLive) {
    try {
      const { data: sched } = await osSupabase.from('team_schedule_view').select('*').order('start_date');
      if (sched && sched.length > 0) {
        tournSchedule = sched.map(s => ({
          id: s.schedule_id, tournament_id: s.tournament_id, tournament_name: s.tournament_name,
          organizer_name: s.organizer_name, start_date: s.start_date, end_date: s.end_date,
          city: s.city, state: s.state, event_type: s.event_type, rank_tier: s.rank_tier,
          rank_composite: s.rank_composite, cost_min: s.cost_min, cost_max: s.cost_max,
          game_guarantee: s.game_guarantee, status: s.status, division: s.division,
          registration_cost: s.registration_cost, payment_status: s.payment_status,
          confirmation_code: s.confirmation_code, travel_required: s.travel_required,
          hotel_cost: s.hotel_cost, notes: s.schedule_notes, _live: true
        }));
      }
    } catch (e) { console.warn('team_schedule_view query failed:', e.message); }
  }
  const stSel = document.getElementById('tf-state');
  if (stSel && stSel.options.length <= 1) {
    const states = [...new Set(allTournaments.map(t => t.state))].sort();
    states.forEach(s => { const o = document.createElement('option'); o.value = s; o.textContent = s; stSel.appendChild(o); });
  }
  applyTournFilters();
  updateTournStats();
  renderSchedView();
  updateSchedBadge();
}

function switchTournTab(tab, btn) {
  document.querySelectorAll('#comp-tournaments .sub-tab, #panel-tournaments .sub-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.getElementById('ttab-catalog').style.display = tab === 'catalog' ? '' : 'none';
  document.getElementById('ttab-schedule').style.display = tab === 'schedule' ? '' : 'none';
  if (tab === 'schedule') renderSchedView();
}
window.switchTournTab = switchTournTab;

function updateTournStats() {
  const t = allTournaments;
  document.getElementById('tm-total').textContent = t.length;
  document.getElementById('tm-co').textContent = t.filter(x => x.state === 'CO').length;
  const costs = t.filter(x => x.cost_max != null).map(x => Number(x.cost_max));
  document.getElementById('tm-cost').textContent = costs.length ? '$' + Math.round(costs.reduce((a, b) => a + b, 0) / costs.length) : '--';
  // Tier breakdown badges
  const tierCounts = { Elite: 0, Premier: 0, Select: 0, Open: 0 };
  t.forEach(x => { if (x.rank_tier && tierCounts[x.rank_tier] !== undefined) tierCounts[x.rank_tier]++; });
  const tiersEl = document.getElementById('tm-tiers');
  if (tiersEl) tiersEl.innerHTML = Object.entries(tierCounts).map(([k, v]) => `<span class="tourn-tier ${k.toLowerCase()}" style="font-size:11px;padding:2px 8px">${k} ${v}</span>`).join('');
  // Source indicator
  const srcEl = document.getElementById('tm-source');
  if (srcEl) srcEl.textContent = tournLive ? 'Live from Supabase' : 'Mock data';
}

function applyTournFilters() {
  const st = document.getElementById('tf-state')?.value || '';
  const ty = document.getElementById('tf-type')?.value || '';
  const ti = document.getElementById('tf-tier')?.value || '';
  const ge = document.getElementById('tf-gender')?.value || '';
  const se = (document.getElementById('tf-search')?.value || '').toLowerCase();
  filteredTourn = allTournaments.filter(t => {
    if (st && t.state !== st) return false;
    if (ty && t.event_type !== ty) return false;
    if (ti && t.rank_tier !== ti) return false;
    if (ge && t.gender !== ge) return false;
    if (se && !t.name.toLowerCase().includes(se) && !(t.organizer_name || '').toLowerCase().includes(se) && !(t.city || '').toLowerCase().includes(se)) return false;
    return true;
  });
  tournPage = 1;
  // Update count label
  const cl = document.getElementById('tourn-count-label');
  if (cl) cl.textContent = filteredTourn.length === allTournaments.length
    ? `Showing all ${allTournaments.length} tournaments`
    : `Showing ${filteredTourn.length} of ${allTournaments.length} tournaments`;
  renderTournTable();
}
window.applyTournFilters = applyTournFilters;

function clearTournFilters() {
  ['tf-state', 'tf-type', 'tf-tier', 'tf-gender'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const se = document.getElementById('tf-search'); if (se) se.value = '';
  applyTournFilters();
}
window.clearTournFilters = clearTournFilters;

function sortTourn(col) {
  if (tournSortCol === col) tournSortDir = tournSortDir === 'asc' ? 'desc' : 'asc';
  else { tournSortCol = col; tournSortDir = 'asc'; }
  filteredTourn.sort((a, b) => {
    let va = a[col], vb = b[col];
    if (va == null) va = ''; if (vb == null) vb = '';
    if (typeof va === 'number' && typeof vb === 'number') return tournSortDir === 'asc' ? va - vb : vb - va;
    return tournSortDir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
  });
  renderTournTable();
}
window.sortTourn = sortTourn;

function tTierTag(tier) {
  if (!tier) return '<span class="tourn-tier open">Unrated</span>';
  return `<span class="tourn-tier ${tier.toLowerCase()}">${tier}</span>`;
}
function tCost(min, max) {
  const a = min != null ? Math.round(Number(min)) : null;
  const b = max != null ? Math.round(Number(max)) : null;
  if (!a && !b) return '--';
  if (a === b || !b) return '$' + a;
  if (!a) return '$' + b;
  return '$' + a + '-$' + b;
}
function tDate(start, end) {
  if (!start) return '--';
  const s = new Date(start + 'T12:00:00');
  if (!end || start === end) return s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const e = new Date(end + 'T12:00:00');
  if (s.getMonth() === e.getMonth()) return s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + '-' + e.getDate();
  return s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' - ' + e.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function isScheduled(t) { return tournSchedule.some(s => s.tournament_id === t.id && s.status !== 'cancelled'); }
function datesOverlap(s1, e1, s2, e2) { return s1 <= e2 && s2 <= e1; }

function renderTournTable() {
  const tbody = document.getElementById('tourn-tbody');
  if (!tbody) return;
  const start = (tournPage - 1) * TOURN_PER_PAGE;
  const page = filteredTourn.slice(start, start + TOURN_PER_PAGE);
  if (page.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--muted)">No tournaments match your filters</td></tr>';
  } else {
    tbody.innerHTML = page.map((t) => {
      const idx = allTournaments.indexOf(t);
      const onSched = isScheduled(t);
      const composite = t.rank_composite != null ? Number(t.rank_composite).toFixed(1) : '--';
      return `<tr style="cursor:pointer" onclick="openTournModal(${idx})">
        <td style="max-width:220px"><div style="font-weight:600;line-height:1.3">${t.name}</div><div style="color:var(--muted);font-size:12px">${t.organizer_name || ''}</div></td>
        <td style="white-space:nowrap">${tDate(t.start_date, t.end_date)}</td>
        <td>${t.city}, ${t.state}</td>
        <td style="text-align:right;white-space:nowrap">${tCost(t.cost_min, t.cost_max)}</td>
        <td style="text-align:center;font-weight:600">${composite}</td>
        <td style="text-align:center">${tTierTag(t.rank_tier)}</td>
        <td style="text-align:center" onclick="event.stopPropagation()">
          ${onSched
          ? '<button class="btn-tbl btn-tbl-rm" onclick="toggleSched(' + idx + ')">Remove</button>'
          : '<button class="btn-tbl btn-tbl-add" onclick="toggleSched(' + idx + ')">Add</button>'}
        </td></tr>`;
    }).join('');
  }
  // Pagination
  const totalPages = Math.ceil(filteredTourn.length / TOURN_PER_PAGE);
  const pag = document.getElementById('tourn-pagination');
  if (pag) {
    if (totalPages <= 1) { pag.innerHTML = ''; return; }
    let html = '';
    if (tournPage > 1) html += `<button class="btn-xs btn-ghost" onclick="setTournPage(${tournPage - 1})">Prev</button>`;
    html += `<span style="color:var(--muted);font-size:13px;padding:4px 8px">Page ${tournPage} of ${totalPages}</span>`;
    if (tournPage < totalPages) html += `<button class="btn-xs btn-ghost" onclick="setTournPage(${tournPage + 1})">Next</button>`;
    pag.innerHTML = html;
  }
}
function setTournPage(p) { tournPage = p; renderTournTable(); }
window.setTournPage = setTournPage;

function toggleSched(idx) {
  const t = allTournaments[idx]; if (!t) return;
  if (isScheduled(t)) removeSched(t); else addToSched(t);
}
window.toggleSched = toggleSched;

async function addToSched(t, force) {
  if (isScheduled(t)) { showToast(`"${t.name}" is already on the schedule`, 'error'); return; }
  const conflict = tournSchedule.find(s => s.status !== 'cancelled' && datesOverlap(s.start_date, s.end_date, t.start_date, t.end_date));
  if (conflict && !force) { confirmModal(`Schedule Conflict`, `"${t.name}" (${tDate(t.start_date, t.end_date)}) overlaps with "${conflict.tournament_name}" (${tDate(conflict.start_date, conflict.end_date)}).\n\nAdd anyway?`, () => addToSched(t, true)); return; }
  const entry = {
    id: 'sched-' + Date.now(), tournament_id: t.id, tournament_name: t.name, organizer_name: t.organizer_name,
    start_date: t.start_date, end_date: t.end_date, city: t.city, state: t.state, event_type: t.event_type,
    rank_tier: t.rank_tier, rank_composite: t.rank_composite, cost_min: t.cost_min, cost_max: t.cost_max,
    game_guarantee: t.game_guarantee, status: 'planned', division: '10U',
    registration_cost: t.cost_max || t.cost_min || 0, payment_status: 'unpaid',
    travel_required: t.state !== 'CO', hotel_cost: t.state !== 'CO' ? 150 : null, notes: ''
  };
  // Persist to Supabase if live
  if (osSupabase && tournLive) {
    try {
      const { data, error } = await osSupabase.from('team_tournament_schedule').insert({
        tournament_id: t.id, start_date: t.start_date, end_date: t.end_date,
        status: 'planned', division: '10U', registration_cost: entry.registration_cost,
        payment_status: 'unpaid', travel_required: entry.travel_required,
        hotel_cost: entry.hotel_cost
      }).select('id').single();
      if (error) { showToast('DB error: ' + error.message, 'error'); return; }
      entry.id = data.id; entry._live = true;
    } catch (e) { showToast('Save failed: ' + e.message, 'error'); return; }
  }
  tournSchedule.push(entry);
  showToast(`Added "${t.name}" to schedule`);
  updateSchedBadge(); renderTournTable(); renderSchedView();
}

async function removeSched(t) {
  const idx = tournSchedule.findIndex(s => s.tournament_id === t.id && s.status !== 'cancelled');
  if (idx >= 0) {
    const entry = tournSchedule[idx];
    if (osSupabase && entry._live) {
      const { error } = await osSupabase.from('team_tournament_schedule').delete().eq('id', entry.id);
      if (error) { showToast('DB error: ' + error.message, 'error'); return; }
    }
    tournSchedule.splice(idx, 1); showToast(`Removed "${t.name}" from schedule`); updateSchedBadge(); renderTournTable(); renderSchedView();
  }
}

function updateSchedBadge() {
  const active = tournSchedule.filter(s => s.status !== 'cancelled').length;
  const badge = document.getElementById('sched-badge');
  if (badge) { badge.textContent = active; badge.style.display = active > 0 ? '' : 'none'; }
  const tabBadge = document.getElementById('sched-tab-count');
  if (tabBadge) tabBadge.textContent = active;
}

function renderSchedView() {
  const container = document.getElementById('sched-content'); if (!container) return;
  const active = tournSchedule.filter(s => s.status !== 'cancelled');
  if (active.length === 0) {
    container.innerHTML = `<div class="ds-empty"><h3>No tournaments scheduled</h3><p>Browse the catalog and tap Add to build your season.</p></div>`;
    return;
  }
  active.sort((a, b) => a.start_date.localeCompare(b.start_date));
  const totalCost = active.reduce((s, x) => s + (parseFloat(x.registration_cost) || 0) + (parseFloat(x.hotel_cost) || 0), 0);
  const travelCount = active.filter(x => x.travel_required).length;
  const totalGames = active.reduce((s, x) => s + (parseInt(x.game_guarantee, 10) || 0), 0);
  // Metric cards
  let html = `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:28px">
    <div class="metric-card" style="padding:20px"><div class="label">Events</div><div class="val" style="font-size:26px;margin:6px 0 2px">${active.length}</div></div>
    <div class="metric-card" style="padding:20px"><div class="label">Est. Cost</div><div class="val" style="font-size:26px;margin:6px 0 2px">$${totalCost.toLocaleString()}</div></div>
    <div class="metric-card" style="padding:20px"><div class="label">Travel</div><div class="val" style="font-size:26px;margin:6px 0 2px">${travelCount}</div></div>
    <div class="metric-card" style="padding:20px"><div class="label">Games</div><div class="val" style="font-size:26px;margin:6px 0 2px">${totalGames}+</div></div>
  </div>`;
  // Event cards grouped by month
  let curMonth = '';
  active.forEach((s) => {
    const d = new Date(s.start_date + 'T12:00:00');
    const ml = MONTH_NAMES_T[d.getMonth()] + ' ' + d.getFullYear();
    if (ml !== curMonth) {
      curMonth = ml;
      const cnt = active.filter(x => { const xd = new Date(x.start_date + 'T12:00:00'); return MONTH_NAMES_T[xd.getMonth()] + ' ' + xd.getFullYear() === ml; }).length;
      html += `<div class="ds-month-label">${ml}<span class="ds-month-count">${cnt} event${cnt > 1 ? 's' : ''}</span></div>`;
    }
    const si = tournSchedule.indexOf(s);
    const cost = ((parseFloat(s.registration_cost) || 0) + (parseFloat(s.hotel_cost) || 0));
    const statusCls = s.status === 'paid' || s.status === 'registered' ? 'color:#4ade80' : 'color:#60a5fa';
    html += `<div class="ds-card" onclick="openSchedDetail(${si})">
      <div style="text-align:center;min-width:48px">
        <div class="ds-card-mon">${MONTH_NAMES_T[d.getMonth()]}</div>
        <div class="ds-card-day">${d.getDate()}</div>
        <div class="ds-card-range">${tDate(s.start_date, s.end_date)}</div>
      </div>
      <div class="ds-card-info">
        <h4>${s.tournament_name}</h4>
        <div class="ds-card-meta">
          <span>${s.city}, ${s.state}</span>
          <span>${s.event_type}</span>
          ${s.game_guarantee ? `<span>${s.game_guarantee} games</span>` : ''}
        </div>
        <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;align-items:center">
          ${tTierTag(s.rank_tier)}
          <span style="font-size:11px;font-weight:600;${statusCls}">${s.status}</span>
          <span style="font-size:11px;color:var(--muted)">${s.payment_status}</span>
          ${s.travel_required ? '<span style="font-size:11px;color:#fbbf24">Travel</span>' : ''}
        </div>
      </div>
      <div class="ds-card-right">
        <div style="font-weight:700;font-size:16px">${cost ? '$' + cost.toLocaleString() : ''}</div>
      </div>
    </div>`;
  });
  container.innerHTML = html;
}

function openSchedDetail(si) {
  const s = tournSchedule[si]; if (!s) return;
  document.getElementById('modal-title').textContent = s.tournament_name;
  document.getElementById('modal-body').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
      <div><span style="color:var(--muted);font-size:13px">Dates</span><br><strong>${tDate(s.start_date, s.end_date)}</strong></div>
      <div><span style="color:var(--muted);font-size:13px">Location</span><br><strong>${s.city}, ${s.state}</strong></div>
      <div><span style="color:var(--muted);font-size:13px">Type</span><br><strong>${s.event_type}</strong></div>
      <div><span style="color:var(--muted);font-size:13px">Tier</span><br>${tTierTag(s.rank_tier)}</div>
      <div><span style="color:var(--muted);font-size:13px">Composite</span><br><strong>${s.rank_composite != null ? Number(s.rank_composite).toFixed(1) : '--'}</strong></div>
      <div><span style="color:var(--muted);font-size:13px">Games</span><br><strong>${s.game_guarantee || '--'}</strong></div>
    </div>
    <div style="border-top:1px solid var(--border);padding-top:16px;display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
      <div class="field"><label>Status</label><select id="sd-status" style="padding:10px 14px">
        ${['planned', 'registered', 'paid', 'completed', 'cancelled'].map(v => `<option value="${v}" ${v === s.status ? 'selected' : ''}>${v.charAt(0).toUpperCase() + v.slice(1)}</option>`).join('')}
      </select></div>
      <div class="field"><label>Division</label><input id="sd-division" value="${s.division || ''}" style="padding:10px 14px"></div>
      <div class="field"><label>Registration Cost ($)</label><input id="sd-regcost" type="number" value="${s.registration_cost || ''}" style="padding:10px 14px"></div>
      <div class="field"><label>Payment Status</label><select id="sd-paystatus" style="padding:10px 14px">
        ${['unpaid', 'deposit', 'paid', 'refunded'].map(v => `<option value="${v}" ${v === s.payment_status ? 'selected' : ''}>${v.charAt(0).toUpperCase() + v.slice(1)}</option>`).join('')}
      </select></div>
      <div class="field"><label>Hotel ($)</label><input id="sd-hotel" type="number" value="${s.hotel_cost || ''}" style="padding:10px 14px"></div>
      <div class="field"><label>Confirmation Code</label><input id="sd-confirm" value="${s.confirmation_code || ''}" style="padding:10px 14px"></div>
    </div>
    <div class="field" style="margin-bottom:16px"><label>Notes</label><textarea id="sd-notes" rows="3" style="padding:10px 14px;width:100%;resize:vertical">${s.notes || ''}</textarea></div>
    <div style="display:flex;gap:12px;justify-content:flex-end">
      <button class="btn-sm btn-danger" onclick="removeSchedEntry(${si})">Remove</button>
      <button class="btn-sm btn-primary" onclick="saveSchedDetail(${si})">Save Changes</button>
    </div>`;
  openModal('modal-overlay');
}
window.openSchedDetail = openSchedDetail;

async function saveSchedDetail(si) {
  const s = tournSchedule[si]; if (!s) return;
  s.status = document.getElementById('sd-status').value;
  s.division = document.getElementById('sd-division').value;
  s.registration_cost = parseFloat(document.getElementById('sd-regcost').value) || 0;
  s.payment_status = document.getElementById('sd-paystatus').value;
  s.hotel_cost = parseFloat(document.getElementById('sd-hotel').value) || null;
  s.confirmation_code = document.getElementById('sd-confirm').value;
  s.notes = document.getElementById('sd-notes').value;
  if (osSupabase && s._live) {
    const { error } = await osSupabase.from('team_tournament_schedule').update({
      status: s.status, division: s.division, registration_cost: s.registration_cost,
      payment_status: s.payment_status, hotel_cost: s.hotel_cost,
      confirmation_code: s.confirmation_code, notes: s.notes
    }).eq('id', s.id);
    if (error) { showToast('DB save failed: ' + error.message, 'error'); return; }
  }
  showToast('Schedule entry updated'); closeModal(); renderSchedView(); updateSchedBadge();
}
window.saveSchedDetail = saveSchedDetail;

async function removeSchedEntry(si) {
  const s = tournSchedule[si]; if (!s) return;
  if (osSupabase && s._live) {
    const { error } = await osSupabase.from('team_tournament_schedule').delete().eq('id', s.id);
    if (error) { showToast('DB delete failed: ' + error.message, 'error'); return; }
  }
  tournSchedule.splice(si, 1); showToast('Removed from schedule'); closeModal(); renderSchedView(); renderTournTable(); updateSchedBadge();
}
window.removeSchedEntry = removeSchedEntry;

function openTournModal(idx) {
  const t = allTournaments[idx]; if (!t) return;
  const onSched = isScheduled(t);
  document.getElementById('modal-title').textContent = t.name;
  document.getElementById('modal-body').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
      <div><span style="color:var(--muted);font-size:13px">Organizer</span><br><strong>${t.organizer_name || '--'}</strong></div>
      <div><span style="color:var(--muted);font-size:13px">Circuit</span><br><strong>${t.organizer_circuit || '--'}</strong></div>
      <div><span style="color:var(--muted);font-size:13px">Dates</span><br><strong>${tDate(t.start_date, t.end_date)}</strong></div>
      <div><span style="color:var(--muted);font-size:13px">Location</span><br><strong>${t.city}, ${t.state}</strong></div>
      <div><span style="color:var(--muted);font-size:13px">Type</span><br><strong>${t.event_type}</strong></div>
      <div><span style="color:var(--muted);font-size:13px">Gender</span><br><strong>${t.gender}</strong></div>
      <div><span style="color:var(--muted);font-size:13px">Age Groups</span><br><strong>${t.age_groups || '--'}</strong></div>
      <div><span style="color:var(--muted);font-size:13px">Cost</span><br><strong>${tCost(t.cost_min, t.cost_max)}</strong></div>
      <div><span style="color:var(--muted);font-size:13px">Games</span><br><strong>${t.game_guarantee || '--'}</strong></div>
      <div><span style="color:var(--muted);font-size:13px">Ability</span><br><strong>${t.ability_level || '--'}</strong></div>
    </div>
    <div style="border-top:1px solid var(--border);padding-top:16px;margin-bottom:16px">
      <div style="font-weight:600;margin-bottom:8px">Rankings</div>
      <div style="display:flex;gap:16px;flex-wrap:wrap">
        <div>Competition: <strong>${t.rank_competition || '--'}</strong>/10</div>
        <div>Exposure: <strong>${t.rank_exposure || '--'}</strong>/10</div>
        <div>Circuit: <strong>${t.rank_circuit || '--'}</strong>/10</div>
        <div>Composite: <strong>${t.rank_composite != null ? Number(t.rank_composite).toFixed(1) : '--'}</strong></div>
        <div>Tier: ${tTierTag(t.rank_tier)}</div>
      </div>
    </div>
    <div style="display:flex;gap:12px;justify-content:flex-end;border-top:1px solid var(--border);padding-top:16px">
      ${onSched
      ? '<button class="btn-sm btn-danger" onclick="toggleSched(' + idx + ');closeModal()">Remove from Schedule</button>'
      : '<button class="btn-sm btn-primary" onclick="toggleSched(' + idx + ');closeModal()">Add to Schedule</button>'}
      <button class="btn-sm btn-ghost" onclick="closeModal()">Close</button>
    </div>`;
  openModal('modal-overlay');
}
window.openTournModal = openTournModal;

// ─── ONBOARDING ANALYTICS ────────────────────────────────────
let obAllRows = [];
let obCurrentFilter = 'all';

const OB_STEP_LABELS = {
  welcome: 'Welcome',
  account_created: 'Account Created',
  parent_guide: 'Season Guide',
  athletic_waiver: 'Athletic Waiver',
  medical_consent: 'Medical Consent',
  practice_consent: 'Practice Consent',
  code_of_conduct: 'Code of Conduct',
  media_release: 'Media Release',
  payment_setup: 'Payment Info',
  complete: 'Complete'
};

const OB_STEP_ORDER = Object.keys(OB_STEP_LABELS);

async function loadOnboarding() {
  if (!osSupabase) return;
  try {
    const { data, error } = await osSupabase
      .from('onboarding_sessions')
      .select('*')
      .order('last_activity', { ascending: false });

    if (error) throw error;
    obAllRows = (data || []).map(r => {
      const health = r.completed_at ? 'complete'
        : (new Date() - new Date(r.last_activity)) > 72 * 3600 * 1000 ? 'at_risk'
          : (new Date() - new Date(r.last_activity)) > 48 * 3600 * 1000 ? 'stale'
            : 'active';
      return { ...r, health };
    });

    renderObMetrics();
    renderObFunnel();
    renderObTable();
    updateObBadge();
  } catch (e) {
    console.error('Onboarding load failed:', e);
  }
}

function renderObMetrics() {
  const total = obAllRows.length;
  const done = obAllRows.filter(r => r.health === 'complete').length;
  const stale = obAllRows.filter(r => r.health === 'stale').length;
  const risk = obAllRows.filter(r => r.health === 'at_risk').length;

  document.getElementById('ob-m-total').textContent = total;
  document.getElementById('ob-m-done').textContent = done;
  document.getElementById('ob-m-stale').textContent = stale;
  document.getElementById('ob-m-risk').textContent = risk;
  document.getElementById('ob-m-rate').textContent = total ? Math.round((done / total) * 100) + '% completion rate' : '-- % completion rate';
}

function renderObFunnel() {
  const container = document.getElementById('ob-funnel');
  if (!container) return;

  // Count how many people reached or passed each step
  const counts = {};
  OB_STEP_ORDER.forEach(step => counts[step] = 0);
  obAllRows.forEach(row => {
    const idx = OB_STEP_ORDER.indexOf(row.current_step);
    for (let i = 0; i <= idx; i++) {
      counts[OB_STEP_ORDER[i]]++;
    }
  });

  const max = obAllRows.length || 1;
  container.innerHTML = OB_STEP_ORDER.map(step => {
    const count = counts[step];
    const pct = Math.round((count / max) * 100);
    const color = step === 'complete' ? '#22c55e' : 'var(--primary)';
    return `<div style="display:flex;align-items:center;gap:12px">
      <span style="min-width:120px;font-size:12px;color:var(--muted);text-align:right">${OB_STEP_LABELS[step]}</span>
      <div style="flex:1;height:24px;background:var(--surface);border-radius:6px;overflow:hidden;position:relative">
        <div style="height:100%;width:${pct}%;background:${color};border-radius:6px;transition:width 0.5s"></div>
      </div>
      <span style="min-width:50px;font-size:13px;font-weight:600;font-variant-numeric:tabular-nums">${count} <span style="font-weight:400;color:var(--muted);font-size:11px">(${pct}%)</span></span>
    </div>`;
  }).join('');
}

function renderObTable() {
  const tbody = document.getElementById('ob-tbody');
  if (!tbody) return;

  const filtered = obCurrentFilter === 'all' ? obAllRows : obAllRows.filter(r => r.health === obCurrentFilter);

  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--muted)">No onboarding sessions found</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(r => {
    const healthBadge = {
      active: '<span style="background:rgba(59,130,246,0.15);color:#60a5fa;padding:3px 10px;border-radius:99px;font-size:11px;font-weight:600">Active</span>',
      stale: '<span style="background:rgba(245,158,11,0.15);color:#fbbf24;padding:3px 10px;border-radius:99px;font-size:11px;font-weight:600">Stale</span>',
      at_risk: '<span style="background:rgba(239,68,68,0.15);color:#f87171;padding:3px 10px;border-radius:99px;font-size:11px;font-weight:600">At Risk</span>',
      complete: '<span style="background:rgba(34,197,94,0.15);color:#4ade80;padding:3px 10px;border-radius:99px;font-size:11px;font-weight:600">Complete</span>'
    }[r.health];

    const stepLabel = OB_STEP_LABELS[r.current_step] || r.current_step;
    const stepIdx = OB_STEP_ORDER.indexOf(r.current_step);
    const stepPct = Math.round(((stepIdx + 1) / OB_STEP_ORDER.length) * 100);

    const started = r.started_at ? new Date(r.started_at).toLocaleDateString() : '--';
    const lastAct = r.last_activity ? timeAgo(new Date(r.last_activity)) : '--';

    return `<tr>
      <td style="font-weight:600">${esc(r.parent_name || r.email || '--')}</td>
      <td>${esc(r.athlete_name || '--')}</td>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div style="flex:1;height:4px;background:var(--surface);border-radius:2px;min-width:60px">
            <div style="height:100%;width:${stepPct}%;background:${r.health === 'complete' ? '#22c55e' : 'var(--primary)'};border-radius:2px"></div>
          </div>
          <span style="font-size:12px;white-space:nowrap">${stepLabel}</span>
        </div>
      </td>
      <td>${healthBadge}</td>
      <td style="font-size:13px;color:var(--muted)">${started}</td>
      <td style="font-size:13px;color:var(--muted)">${lastAct}</td>
      <td style="text-align:center">${r.reminder_count || 0}</td>
      <td style="text-align:center">
        ${r.health !== 'complete' ? `<button class="btn-sm btn-ghost" onclick="sendObReminder('${r.id}','${esc(r.email)}')" title="Send reminder">Nudge</button>` : '<span style="color:var(--muted);font-size:12px">Done</span>'}
      </td>
    </tr>`;
  }).join('');
}

function obFilter(filter, btn) {
  obCurrentFilter = filter;
  document.querySelectorAll('.ob-filter').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderObTable();
}
window.obFilter = obFilter;
window.loadOnboarding = loadOnboarding;

function updateObBadge() {
  const badge = document.getElementById('ob-badge');
  if (!badge) return;
  const needsAttention = obAllRows.filter(r => r.health === 'stale' || r.health === 'at_risk').length;
  if (needsAttention > 0) {
    badge.style.display = 'inline';
    badge.textContent = needsAttention;
  } else {
    badge.style.display = 'none';
  }
}

async function sendObReminder(sessionId, email) {
  if (!osSupabase) return;
  try {
    // Invoke edge function
    const { error } = await osSupabase.functions.invoke('send-onboarding-reminder', {
      body: { session_id: sessionId, email: email }
    });
    if (error) throw error;

    // Update reminder count locally
    await osSupabase.from('onboarding_sessions')
      .update({ reminder_count: obAllRows.find(r => r.id === sessionId)?.reminder_count + 1 || 1, last_reminder: new Date().toISOString() })
      .eq('id', sessionId);

    showToast('Reminder sent to ' + email, 'success');
    loadOnboarding();
  } catch (e) {
    showToast('Failed to send reminder: ' + e.message, 'error');
  }
}
window.sendObReminder = sendObReminder;

// ─── ONBOARDING INVITE ──────────────────────────────────────
function openOnboardingInvite() {
  const form = document.getElementById('ob-invite-form');
  form.style.display = '';
  loadInviteRoster();
}
window.openOnboardingInvite = openOnboardingInvite;

function closeOnboardingInvite() {
  document.getElementById('ob-invite-form').style.display = 'none';
  document.getElementById('ob-inv-email').value = '';
  document.getElementById('ob-inv-name').value = '';
  document.getElementById('ob-inv-athlete').value = '';
}
window.closeOnboardingInvite = closeOnboardingInvite;

async function loadInviteRoster() {
  const container = document.getElementById('ob-inv-roster');
  if (!container || !osSupabase) { container.innerHTML = '<span style="color:var(--muted);font-size:12px">Connect to load roster</span>'; return; }

  try {
    const { data: parents } = await osSupabase
      .from('profiles')
      .select('id, full_name, email, player_name')
      .eq('role', 'parent')
      .eq('approved', true)
      .order('full_name');

    // Get emails that already have onboarding sessions
    const { data: sessions } = await osSupabase
      .from('onboarding_sessions')
      .select('email');
    const onboardedEmails = new Set((sessions || []).map(s => s.email?.toLowerCase()));

    const available = (parents || []).filter(p => !onboardedEmails.has(p.email?.toLowerCase()));

    if (!available.length) {
      container.innerHTML = '<span style="color:var(--muted);font-size:12px">All rostered parents have onboarding sessions</span>';
      return;
    }

    container.innerHTML = available.map(p => {
      const name = esc(p.full_name || p.email);
      const email = esc(p.email);
      const athlete = esc(p.player_name || '');
      return `<button class="btn btn-ghost btn-xs" style="border:1px solid var(--border);border-radius:8px;padding:6px 12px;font-size:12px" onclick="prefillInvite('${email}','${esc(p.full_name || '')}','${athlete}')" title="${email}">${name}</button>`;
    }).join('');
  } catch (e) {
    container.innerHTML = '<span style="color:var(--muted);font-size:12px">Error loading roster</span>';
  }
}

function prefillInvite(email, name, athlete) {
  document.getElementById('ob-inv-email').value = email;
  document.getElementById('ob-inv-name').value = name;
  document.getElementById('ob-inv-athlete').value = athlete;
}
window.prefillInvite = prefillInvite;

async function sendOnboardingInvite() {
  if (!osSupabase) return;
  const email = document.getElementById('ob-inv-email').value.trim();
  const parentName = document.getElementById('ob-inv-name').value.trim();
  const athleteName = document.getElementById('ob-inv-athlete').value.trim();
  const btn = document.getElementById('ob-inv-btn');

  if (!email) { showToast('Email is required', 'error'); return; }

  btn.textContent = 'Sending...'; btn.disabled = true;
  try {
    const { data, error } = await osSupabase.functions.invoke('send-onboarding-invite', {
      body: { email, parent_name: parentName || null, athlete_name: athleteName || null }
    });
    if (error) throw error;

    const result = data?.results?.[0];
    if (result?.status === 'sent') {
      showToast('Onboarding invite sent to ' + email, 'success');
      closeOnboardingInvite();
      loadOnboarding();
    } else if (result?.status === 'already_completed') {
      showToast(email + ' has already completed onboarding', 'info');
    } else {
      showToast('Failed: ' + (result?.status || 'unknown error'), 'error');
    }
  } catch (e) {
    showToast('Failed to send invite: ' + e.message, 'error');
  } finally {
    btn.textContent = 'Send'; btn.disabled = false;
  }
}
window.sendOnboardingInvite = sendOnboardingInvite;

async function sendBulkOnboardingInvites() {
  if (!osSupabase) return;

  try {
    // Get approved parents
    const { data: parents } = await osSupabase
      .from('profiles')
      .select('full_name, email, player_name')
      .eq('role', 'parent')
      .eq('approved', true);

    // Get existing onboarding emails
    const { data: sessions } = await osSupabase
      .from('onboarding_sessions')
      .select('email');
    const onboardedEmails = new Set((sessions || []).map(s => s.email?.toLowerCase()));

    const remaining = (parents || []).filter(p => p.email && !onboardedEmails.has(p.email.toLowerCase()));

    if (!remaining.length) {
      showToast('All rostered parents already have onboarding sessions', 'info');
      return;
    }

    if (!confirm(`Send onboarding invites to ${remaining.length} parent(s) who haven't started yet?`)) return;

    const invites = remaining.map(p => ({
      email: p.email,
      parent_name: p.full_name || null,
      athlete_name: p.player_name || null,
    }));

    const { data, error } = await osSupabase.functions.invoke('send-onboarding-invite', {
      body: { invites }
    });
    if (error) throw error;

    showToast(`Sent ${data?.sent || 0} of ${invites.length} onboarding invites`, 'success');
    loadOnboarding();
  } catch (e) {
    showToast('Bulk invite failed: ' + e.message, 'error');
  }
}
window.sendBulkOnboardingInvites = sendBulkOnboardingInvites;

function timeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes + 'm ago';
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + 'h ago';
  const days = Math.floor(hours / 24);
  return days + 'd ago';
}

function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
