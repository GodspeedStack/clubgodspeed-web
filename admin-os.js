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
let rosterView = 'players'; // 'players' or 'parents'
let calYear, calMonth, calView = 'month';
let teamRosterCache = {};

// ─── SHARED UTILITIES ───────────────────────────────────────
const fmt = (iso) => iso ? new Date(iso).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '--';
const fmtShort = (iso) => iso ? new Date(iso).toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '--';

function showToast(message, type='success') {
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = message;
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity='0'; setTimeout(()=>t.remove(),300); }, 3000);
}

function statusTag(status) {
  const map = {paid:'tag-green',completed:'tag-green',delivered:'tag-green',confirmed:'tag-green',manual:'tag-green',
    pending:'tag-yellow',processing:'tag-yellow',unfulfilled:'tag-yellow',draft:'tag-yellow',pending_venmo:'tag-blue',
    overdue:'tag-red',refunded:'tag-red',denied:'tag-red',
    shipped:'tag-blue',sent:'tag-blue',published:'tag-green',partial:'tag-yellow',unpaid:'tag-red',waived:'tag-gray'};
  return `<span class="tag ${map[status]||'tag-gray'}">${status}</span>`;
}

// ─── INIT ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('topbar-date').textContent = new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
  const now = new Date(); calYear = now.getFullYear(); calMonth = now.getMonth();
  document.querySelectorAll('input[name="bc-audience"]').forEach(r => r.addEventListener('change', () => {
    document.getElementById('bc-team').style.display = r.value==='team'&&r.checked ? 'block' : 'none';
  }));
  setTimeout(init, 900);
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
  try {
    osSupabase = window.location.search.includes('preview=1') ? null : getOrCreateSupabaseClient();
    if (osSupabase) {
      msg.textContent = 'Verifying session...';
      const { data: { session } } = await osSupabase.auth.getSession();
      if (!session) { loading.style.display='none'; loginScreen.style.display='flex'; return; }
      msg.textContent = 'Verifying director credentials...';
      const {data} = await osSupabase.from('profiles').select('role,approved,full_name,email').eq('id',session.user.id).single();
      if (data?.role === 'director' && data?.approved) {
        document.getElementById('director-name').textContent = data.full_name || 'Director';
        document.getElementById('director-email').textContent = data.email;
        document.getElementById('director-initials').textContent = (data.full_name||'D').charAt(0).toUpperCase();
        loading.style.display='none'; loginScreen.style.display='none';
        await loadDashboard(); loadTeamsDropdowns(); return;
      } else {
        msg.textContent = 'Unauthorized: Director access required.';
        loading.querySelector('h2').style.webkitTextFillColor = '#ef4444';
        setTimeout(async()=>{ await osSupabase.auth.signOut(); window.location.reload(); },2000); return;
      }
    }
    loading.style.display='none';
    document.getElementById('director-name').textContent='Offline Mode';
    document.getElementById('director-email').textContent='No connection';
    await loadDashboard();
  } catch(e) { console.error(e); loading.style.display='none'; await loadDashboard(); }
}

// ─── LOGIN ──────────────────────────────────────────────────
window.handleAdminLogin = async function() {
  const email=document.getElementById('admin-email').value, password=document.getElementById('admin-pass').value;
  const btn=document.getElementById('admin-login-btn'), errBox=document.getElementById('login-error-box');
  btn.textContent='Authenticating...'; btn.disabled=true; errBox.style.display='none';
  try {
    if(!osSupabase) osSupabase=getOrCreateSupabaseClient();
    if(!osSupabase) throw new Error('Cannot connect to authentication service.');
    const {error}=await osSupabase.auth.signInWithPassword({email,password});
    if(error) throw error;
    window.location.reload();
  } catch(e) {
    errBox.textContent=e.message==='Invalid login credentials'?'Invalid email or password.':e.message;
    errBox.style.display='block'; btn.textContent='Secure Login'; btn.disabled=false;
  }
};

// ─── PANEL ROUTING ──────────────────────────────────────────
const PANEL_TITLES = {dashboard:'Dashboard',players:'Players & Parents',requests:'Login Requests',dues:'Season Dues',fundraising:'Fundraising',orders:'Pro Shop Orders',comms:'Messaging',dataEntry:'Data Entry',calendar:'Calendar',blog:'Blog Posts',memos:'Coach Memos'};

function switchPanel(id, btn) {
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.sb-link').forEach(b=>b.classList.remove('active'));
  const panel = document.getElementById('panel-'+id);
  if(panel) panel.classList.add('active');
  if(btn) btn.classList.add('active');
  document.getElementById('panel-title').textContent = PANEL_TITLES[id]||id;
  currentPanel = id;
  const loaders = {players:loadPlayers,requests:loadRequests,dues:loadDues,fundraising:loadFundraising,orders:loadOrders,comms:loadComms,dataEntry:loadDataEntry,calendar:loadCalendar,blog:loadBlog,memos:loadMemos};
  if(loaders[id]) loaders[id]();
}

function refreshCurrent() {
  const loaders = {dashboard:loadDashboard,players:loadPlayers,requests:loadRequests,dues:loadDues,fundraising:loadFundraising,orders:loadOrders,comms:loadComms,calendar:loadCalendar,blog:loadBlog,memos:loadMemos};
  if(loaders[currentPanel]) loaders[currentPanel]();
}

// ─── TEAMS DROPDOWN LOADER ─────────────────────────────────
async function loadTeamsDropdowns() {
  if(!osSupabase) return;
  try {
    const {data}=await osSupabase.from('teams').select('id,name').order('name');
    const teams=data||[];
    ['de-team','gm-team','bc-team'].forEach(selId=>{
      const sel=document.getElementById(selId);
      if(!sel) return;
      const firstOpt=sel.querySelector('option');
      sel.innerHTML='';
      if(firstOpt) sel.appendChild(firstOpt);
      teams.forEach(t=>{ const o=document.createElement('option'); o.value=t.id; o.textContent=t.name; sel.appendChild(o); });
    });
  } catch(e){ console.error('Teams load error:',e); }
}

// ─── DASHBOARD ──────────────────────────────────────────────
async function loadDashboard() {
  let profiles=[], requests=[], dues=[];
  try {
    if(osSupabase) {
      const [p,r,d] = await Promise.all([
        osSupabase.from('profiles').select('*'),
        osSupabase.from('login_requests').select('*').eq('status','pending'),
        osSupabase.from('parent_dues_enrollment').select('id,total_owed,total_paid,status'),
      ]);
      profiles=p.data||[]; requests=r.data||[]; dues=d.data||[];
    }
  } catch(e){}
  const collected=dues.reduce((a,d)=>a+(+d.total_paid||0),0);
  const outstanding=dues.reduce((a,d)=>a+((+d.total_owed||0)-(+d.total_paid||0)),0);
  document.getElementById('m-members').textContent=profiles.filter(p=>p.approved).length;
  document.getElementById('m-pending').textContent=requests.length;
  document.getElementById('m-collected').textContent='$'+collected.toFixed(0);
  document.getElementById('m-outstanding').textContent='$'+outstanding.toFixed(0);
  document.getElementById('pending-badge').textContent=requests.length;

  document.getElementById('dash-pending-list').innerHTML = requests.length ? requests.slice(0,4).map(r=>`
    <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
      <div><div style="font-weight:600;font-size:13px">${r.full_name||r.email}</div><div style="color:var(--muted);font-size:11px">${r.email}</div></div>
      <div style="display:flex;gap:6px">
        <button class="btn btn-ghost btn-xs" style="color:#34c759" onclick="approveReq('${r.id}','${r.email}')">Approve</button>
        <button class="btn btn-ghost btn-xs" style="color:#ff3b30" onclick="denyReq('${r.id}','${r.email}')">Deny</button>
      </div>
    </div>`).join('') : '<p style="color:var(--muted);font-size:13px">No pending requests.</p>';

  const unpaid=dues.filter(d=>d.payment_status==='unpaid'||d.payment_status==='partial');
  document.getElementById('dash-dues-list').innerHTML = unpaid.length ? unpaid.slice(0,4).map(d=>`
    <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
      <div><div style="font-weight:600;font-size:13px">${d.full_name}</div><div style="color:var(--muted);font-size:11px">Balance: $${(+d.balance).toFixed(0)}</div></div>
      ${statusTag(d.payment_status)}
    </div>`).join('') : '<p style="color:var(--muted);font-size:13px">All dues current!</p>';

  document.getElementById('dash-activity').innerHTML='<p style="color:var(--muted);font-size:13px">No recent activity.</p>';
}

// ─── PLAYERS & PARENTS ──────────────────────────────────────
async function loadPlayers() {
  try {
    if(!osSupabase) return;
    // Load profiles (parents) for the parent view and linking
    const {data:profiles}=await osSupabase.from('profiles').select('*').order('full_name');
    allPlayers=profiles||[];
    // Load roster with linked parents via RPC
    const {data:roster,error}=await osSupabase.rpc('get_roster_with_parents');
    if(!error) allRosterAthletes=roster||[];
  } catch(e){ console.error('loadPlayers:',e); }
  if(rosterView==='players') renderRosterByPlayer(allRosterAthletes); else renderRosterByParent(allPlayers);
}

function switchRosterView(view) {
  rosterView=view;
  document.querySelectorAll('.roster-tab').forEach(t=>t.classList.toggle('active',t.dataset.view===view));
  if(view==='players') renderRosterByPlayer(allRosterAthletes); else renderRosterByParent(allPlayers);
}

// ── Player-centric view ──
function renderRosterByPlayer(arr) {
  const q=(document.getElementById('player-search')?.value||'').toLowerCase();
  const filtered=q?arr.filter(a=>(a.display_name||'').toLowerCase().includes(q)||(a.parents||[]).some(p=>(p.full_name||'').toLowerCase().includes(q)||(p.email||'').toLowerCase().includes(q))):arr;
  const tbody=document.getElementById('players-tbody');
  if(!filtered.length){ tbody.innerHTML='<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:32px">No players found. Click "+ Add" to add a player.</td></tr>'; return; }
  tbody.innerHTML=filtered.map(a=>{
    const esc=s=>(s||'').replace(/"/g,'&quot;');
    const parentInputs=(a.parents||[]).length?(a.parents||[]).map(p=>`<input class="row-input row-input-sm" value="${esc(p.full_name||p.email)}" data-profile-id="${p.profile_id}" data-field="full_name" onblur="saveParentInline(this)" onkeydown="if(event.key==='Enter'){this.blur()}" placeholder="Parent name">`).join(''):`<span style="color:var(--muted);font-size:12px">No parent linked</span>`;
    const parentEmails=(a.parents||[]).map(p=>p.email).join(', ')||'--';
    const parentPhones=(a.parents||[]).map(p=>p.phone).filter(Boolean).join(', ')||'--';
    return `<tr>
      <td><div style="display:flex;align-items:center;gap:8px"><div class="avatar">${(a.first_name||'?')[0].toUpperCase()}</div><div><input class="row-input" value="${esc(a.display_name)}" data-athlete-id="${a.athlete_id}" data-orig-first="${esc(a.first_name)}" data-orig-last="${esc(a.last_name)}" onblur="savePlayerInline(this)" onkeydown="if(event.key==='Enter'){this.blur()}" placeholder="Player name"><div style="color:var(--muted);font-size:11px;padding-left:6px">${a.enrollment_status||'active'}</div></div></div></td>
      <td style="min-width:140px">${parentInputs}</td>
      <td>${a.grade?statusTag(a.grade):'--'}</td>
      <td style="color:var(--muted);font-size:12px">${parentEmails}</td>
      <td style="color:var(--muted)">${parentPhones}</td>
      <td>${statusTag(a.enrollment_status==='active'?'Active':'Inactive')}</td>
      <td><button class="btn btn-ghost btn-xs" onclick="viewAthlete('${a.athlete_id}')">View</button></td></tr>`;
  }).join('');
}

// ── Parent-centric view ──
function renderRosterByParent(arr) {
  const q=(document.getElementById('player-search')?.value||'').toLowerCase();
  const parentOnly=arr.filter(p=>p.role==='parent');
  const filtered=q?parentOnly.filter(p=>(p.full_name||'').toLowerCase().includes(q)||(p.email||'').toLowerCase().includes(q)||(p.player_name||'').toLowerCase().includes(q)):parentOnly;
  const tbody=document.getElementById('players-tbody');
  if(!filtered.length){ tbody.innerHTML='<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:32px">No parents found.</td></tr>'; return; }
  const esc=s=>(s||'').replace(/"/g,'&quot;');
  tbody.innerHTML=filtered.map(p=>`<tr>
    <td><div style="display:flex;align-items:center;gap:8px"><div class="avatar">${(p.full_name||p.email)[0].toUpperCase()}</div><div><input class="row-input" value="${esc(p.full_name)}" data-profile-id="${p.id}" data-field="full_name" onblur="saveParentInline(this)" onkeydown="if(event.key==='Enter'){this.blur()}" placeholder="Parent name"><div style="color:var(--muted);font-size:11px;padding-left:6px">${p.role}</div></div></div></td>
    <td><input class="row-input row-input-sm" value="${esc(p.player_name)}" data-profile-id="${p.id}" data-field="player_name" onblur="saveParentInline(this)" onkeydown="if(event.key==='Enter'){this.blur()}" placeholder="Player name"></td>
    <td>${p.grade?statusTag(p.grade):'--'}</td>
    <td style="color:var(--muted)">${p.email}</td>
    <td style="color:var(--muted)">${p.phone||'--'}</td>
    <td>${statusTag(p.approved?'Approved':'Pending')}</td>
    <td><button class="btn btn-ghost btn-xs" onclick="viewParentProfile('${p.id}')">View</button></td></tr>`).join('');
}

// ── Inline save: player name ──
async function savePlayerInline(el) {
  const athleteId=el.dataset.athleteId;
  const newName=el.value.trim();
  if(!newName||!athleteId||!osSupabase) return;
  const parts=newName.split(/\s+/);
  const firstName=parts[0];
  const lastName=parts.slice(1).join(' ');
  // Skip save if unchanged
  if(firstName===el.dataset.origFirst && lastName===el.dataset.origLast) return;
  try {
    const {error}=await osSupabase.from('athletes').update({first_name:firstName,last_name:lastName}).eq('id',athleteId);
    if(error){ showToast('Save failed: '+error.message,'error'); return; }
    el.classList.add('saved'); setTimeout(()=>el.classList.remove('saved'),1200);
    // Update roster cache
    const a=allRosterAthletes.find(x=>x.athlete_id===athleteId);
    const newDisplay=firstName+(lastName?' '+lastName:'');
    if(a){ a.first_name=firstName; a.last_name=lastName; a.display_name=newDisplay; }
    el.dataset.origFirst=firstName; el.dataset.origLast=lastName;
    // Sync player_name on linked parent profiles so Parents tab stays current
    if(a&&a.parents) {
      for(const pp of a.parents) {
        const p=allPlayers.find(x=>x.id===pp.profile_id);
        if(p) p.player_name=newDisplay;
        await osSupabase.from('profiles').update({player_name:newDisplay}).eq('id',pp.profile_id).then(()=>{});
      }
    }
  } catch(e){ showToast('Error: '+e.message,'error'); }
}

// ── Inline save: parent name / player_name on profile ──
async function saveParentInline(el) {
  const profileId=el.dataset.profileId;
  const field=el.dataset.field;
  const newVal=el.value.trim();
  if(!profileId||!field||!osSupabase) return;
  try {
    const {error}=await osSupabase.from('profiles').update({[field]:newVal}).eq('id',profileId);
    if(error){ showToast('Save failed: '+error.message,'error'); return; }
    el.classList.add('saved'); setTimeout(()=>el.classList.remove('saved'),1200);
    // Update profiles cache (Parents tab source)
    const p=allPlayers.find(x=>x.id===profileId);
    if(p) p[field]=newVal;
    // Sync into roster cache (Players tab source) so tab switch reflects changes
    allRosterAthletes.forEach(a=>{(a.parents||[]).forEach(pp=>{if(pp.profile_id===profileId) pp[field]=newVal;});});
    // If parent full_name changed, also update parent_dues_enrollment.parent_name for dues consistency
    if(field==='full_name') {
      await osSupabase.from('parent_dues_enrollment').update({parent_name:newVal}).eq('parent_email',p?.email).then(()=>{});
    }
  } catch(e){ showToast('Error: '+e.message,'error'); }
}

function filterPlayers() {
  if(rosterView==='players') renderRosterByPlayer(allRosterAthletes); else renderRosterByParent(allPlayers);
}

// ── View Athlete Detail (player-centric) ──
function viewAthlete(athleteId) {
  const a=allRosterAthletes.find(x=>x.athlete_id===athleteId); if(!a) return;
  openModal('view-player');
  document.getElementById('modal-title').textContent=a.display_name;
  const parentsHtml=(a.parents||[]).length?(a.parents||[]).map(p=>`
    <div style="padding:12px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-weight:600">${p.full_name||'--'}</div>
          <div style="color:var(--muted);font-size:12px">${p.email} ${p.phone?' | '+p.phone:''}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px">${p.relationship||'guardian'} ${p.is_primary?'(primary)':''}</div>
        </div>
        <div style="display:flex;align-items:center;gap:6px">${statusTag(p.approved?'Approved':'Pending')}</div>
      </div>
    </div>`).join(''):'<p style="color:var(--muted)">No parents linked yet.</p>';
  document.getElementById('modal-body').innerHTML=`
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
      <div><label style="font-size:11px;color:var(--muted)">Player Name</label><div style="margin-top:4px;font-weight:600">${a.display_name}</div></div>
      <div><label style="font-size:11px;color:var(--muted)">Grade</label><div style="margin-top:4px">${a.grade||'--'}</div></div>
      <div><label style="font-size:11px;color:var(--muted)">Status</label><div style="margin-top:4px">${statusTag(a.enrollment_status==='active'?'Active':'Inactive')}</div></div>
    </div>
    <h3 style="font-size:13px;font-weight:700;margin-bottom:8px;color:var(--muted)">LINKED PARENTS</h3>
    ${parentsHtml}
    <button class="btn btn-primary" style="width:100%;margin-top:12px" onclick="openLinkParentModal('${athleteId}','${a.display_name}')"><i data-lucide="user-plus" style="width:16px;height:16px;margin-right:6px"></i>Link Parent Account</button>`;
  if(window.lucide) lucide.createIcons();
}

// ── View Parent Profile ──
function viewParentProfile(id) {
  const p=allPlayers.find(x=>x.id===id); if(!p) return;
  openModal('view-player');
  document.getElementById('modal-title').textContent=p.full_name||p.email;
  document.getElementById('modal-body').innerHTML=`
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px">
      <div><label style="font-size:11px;color:var(--muted)">Parent Name</label><div style="margin-top:4px">${p.full_name||'--'}</div></div>
      <div><label style="font-size:11px;color:var(--muted)">Email</label><div style="margin-top:4px">${p.email}</div></div>
      <div><label style="font-size:11px;color:var(--muted)">Phone</label><div style="margin-top:4px">${p.phone||'--'}</div></div>
      <div><label style="font-size:11px;color:var(--muted)">Player(s)</label><div style="margin-top:4px">${p.player_name||'--'}</div></div>
      <div><label style="font-size:11px;color:var(--muted)">Grade</label><div style="margin-top:4px">${p.grade||'--'}</div></div>
      <div><label style="font-size:11px;color:var(--muted)">Status</label><div style="margin-top:4px;display:flex;align-items:center;gap:8px">${statusTag(p.approved?'Approved':'Pending')}${!p.approved?`<button class="btn btn-ghost btn-xs" onclick="approveProfile('${p.id}')">Approve</button>`:''}</div></div>
    </div>
    <div style="border-top:1px solid var(--border);padding-top:12px;margin-top:4px">
      <button class="btn btn-ghost btn-sm" onclick="resendVerification('${p.email}')" style="width:100%;justify-content:center;gap:6px"><i data-lucide="mail" style="width:14px;height:14px"></i>Resend Email Verification</button>
    </div>`;
}

// ── Link existing parent to athlete ──
function openLinkParentModal(athleteId,athleteName) {
  closeModal();
  openModal('link-parent');
  document.getElementById('modal-title').textContent='Link Parent to '+athleteName;
  const parentOpts=allPlayers.filter(p=>p.role==='parent').map(p=>`<option value="${p.id}">${p.full_name||p.email}</option>`).join('');
  document.getElementById('modal-body').innerHTML=`
    <div class="field"><label>Select Existing Parent</label><select id="lp-profile" style="width:100%"><option value="">-- Select Parent --</option>${parentOpts}</select></div>
    <div style="text-align:center;color:var(--muted);margin:12px 0;font-size:12px">-- OR add new parent below --</div>
    <div class="field"><label>New Parent Name</label><input type="text" id="lp-name" placeholder="e.g. Jane Smith"></div>
    <div class="field"><label>New Parent Email</label><input type="email" id="lp-email" placeholder="e.g. jane@email.com"></div>
    <div class="field"><label>Relationship</label><select id="lp-rel"><option value="mother">Mother</option><option value="father">Father</option><option value="guardian" selected>Guardian</option><option value="stepparent">Stepparent</option><option value="other">Other</option></select></div>
    <button class="btn btn-primary" style="width:100%;margin-top:8px" onclick="linkParentToAthlete('${athleteId}')">Link Parent</button>`;
}

async function linkParentToAthlete(athleteId) {
  if(!osSupabase) return;
  let profileId=document.getElementById('lp-profile').value;
  const newName=document.getElementById('lp-name').value.trim();
  const newEmail=document.getElementById('lp-email').value.trim();
  const rel=document.getElementById('lp-rel').value;
  try {
    // If no existing parent selected, create new profile
    if(!profileId && newEmail) {
      const {data:existing}=await osSupabase.from('profiles').select('id').eq('email',newEmail.toLowerCase()).maybeSingle();
      if(existing) { profileId=existing.id; }
      else {
        const {data:ins,error:insErr}=await osSupabase.from('profiles').insert({email:newEmail.toLowerCase(),full_name:newName,role:'parent',approved:true}).select('id').single();
        if(insErr) { showToast('Error creating parent: '+insErr.message,'error'); return; }
        profileId=ins.id;
      }
    }
    if(!profileId) { showToast('Select a parent or enter a new email','error'); return; }
    const {error}=await osSupabase.rpc('link_parent_to_athlete',{p_profile_id:profileId,p_athlete_id:athleteId,p_relationship:rel,p_is_primary:false});
    if(error) { showToast('Link failed: '+error.message,'error'); return; }
    showToast('Parent linked!'); closeModal(); loadPlayers();
  } catch(e){ showToast('Error: '+e.message,'error'); }
}

async function approveProfile(id) {
  if(!confirm('Approve this profile?')) return;
  try {
    if(!osSupabase) return;
    // Fetch profile before update so we have email/name for the welcome email
    const { data: prof, error: fetchErr } = await osSupabase.from('profiles').select('email,full_name').eq('id',id).single();
    if(fetchErr) throw fetchErr;
    // Persist approval
    const { error: updateErr } = await osSupabase.from('profiles').update({approved:true}).eq('id',id);
    if(updateErr) throw updateErr;
    // Update local cache immediately so re-render reflects new state
    const cached = allPlayers.find(x => x.id === id);
    if(cached) cached.approved = true;
    // Re-render the modal in-place — shows Approved status, hides Approve button
    viewParentProfile(id);
    // Send welcome email
    let emailNote = '';
    try {
      await osSupabase.functions.invoke('send-welcome-email', {
        body: { email: prof.email, full_name: prof.full_name || '' }
      });
      emailNote = ' — welcome email sent';
    } catch(e) { console.warn('Welcome email invoke failed:', e); }
    showToast('Profile approved' + emailNote);
    loadPlayers(); // refresh backing table in background
  } catch(e) { showToast('Failed: '+e.message,'error'); }
}

// ─── LOGIN REQUESTS ─────────────────────────────────────────
async function loadRequests() {
  try { if(osSupabase){ const {data}=await osSupabase.from('login_requests').select('*').order('created_at',{ascending:false}); allRequests=data||[]; } } catch(e){}
  renderRequests(allRequests);
}
function renderRequests(arr) {
  const pending=arr.filter(r=>r.status==='pending');
  document.getElementById('req-count-label').textContent=`${pending.length} pending`;
  document.getElementById('pending-badge').textContent=pending.length;
  document.getElementById('req-tbody').innerHTML=arr.map(r=>{
    const d=fmt(r.created_at);
    return `<tr><td style="font-weight:600">${r.full_name||'--'}</td><td style="color:var(--muted)">${r.email}</td>
      <td>${statusTag(r.requested_role)}</td><td>${r.grade||'--'} ${r.player_name?'/ '+r.player_name:''}</td>
      <td style="color:var(--muted);font-size:12px">${d}</td><td style="color:var(--muted);font-size:11px">${r.ip_address||'--'}</td>
      <td>${r.status==='pending'?`<div style="display:flex;gap:6px"><button class="btn btn-ghost btn-xs" style="color:#34c759" onclick="approveReq('${r.id}','${r.email}')">Approve</button><button class="btn btn-ghost btn-xs" style="color:#ff3b30" onclick="denyReq('${r.id}','${r.email}')">Deny</button><button class="btn btn-ghost btn-xs" onclick="resendVerification('${r.email}')" title="Resend verification email">Resend</button></div>`:statusTag(r.status)}</td></tr>`;
  }).join('');
}
async function approveReq(id, email) {
  if(!confirm(`Approve ${email}?`)) return;
  try {
    if(!osSupabase) return;
    await osSupabase.rpc('approve_login_request',{request_id:id});
    // Fetch name so the welcome email can be personalised
    const { data: prof } = await osSupabase.from('profiles').select('full_name').eq('email', email).maybeSingle();
    // Send welcome email directly (no queue dependency)
    try {
      await osSupabase.functions.invoke('send-welcome-email', {
        body: { email, full_name: prof?.full_name || '' }
      });
    } catch(e){ console.warn('Welcome email invoke failed:',e); }
  } catch(e){ console.error(e); }
  // Reload from DB so the approved row no longer shows pending
  await loadRequests();
  await loadDashboard();
  showToast(`${email} approved — welcome email sent!`);
}
async function denyReq(id, email) {
  const reason=prompt(`Reason for denying ${email}? (optional)`);
  if(reason===null) return;
  try { if(osSupabase) await osSupabase.rpc('deny_login_request',{request_id:id,reason}); } catch(e){ console.error(e); }
  renderRequests(allRequests);
}

// ─── FUNDRAISING ────────────────────────────────────────────
let allFundraising = [];

async function loadFundraising() {
  if(!osSupabase) return;
  try {
    const [frRes, enrRes] = await Promise.all([
      osSupabase.from('fundraising_totals').select('*').order('total_raised',{ascending:false}),
      osSupabase.from('parent_dues_enrollment').select('athlete_name,parent_name,total_owed,total_paid,status')
    ]);
    const fundraisingRows = frRes.data || [];
    const enrollments = enrRes.data || [];

    // Match fundraising to enrollment by first name (enrollment uses first name only)
    allFundraising = enrollments.map(e => {
      const firstName = (e.athlete_name||'').split(' ')[0].toLowerCase();
      const match = fundraisingRows.find(f => {
        const fFirst = (f.athlete_name||'').split(' ')[0].toLowerCase();
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
    }).sort((a,b) => b.raised - a.raised);
  } catch(e) { console.error('Fundraising load:', e); }
  renderFundraising();
}

function renderFundraising() {
  const totalRaised = allFundraising.reduce((s,r) => s + r.raised, 0);
  const participants = allFundraising.filter(r => r.raised > 0).length;
  const avg = participants ? totalRaised / participants : 0;

  document.getElementById('fr-total-raised').textContent = '$' + totalRaised.toFixed(0);
  document.getElementById('fr-participants').textContent = participants;
  document.getElementById('fr-avg').textContent = '$' + avg.toFixed(0);

  const container = document.getElementById('fundraising-cards');
  if(!allFundraising.length) {
    container.innerHTML = '<div style="text-align:center;color:var(--muted);padding:32px">No enrollment data found</div>';
    return;
  }

  const maxOwed = Math.max(...allFundraising.map(r => r.totalOwed), 1);

  container.innerHTML = `<div style="display:grid;grid-template-columns:180px 1fr 120px;padding:8px 20px;border-bottom:1px solid var(--border)">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--muted)">Player</div>
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--muted)">Dues Breakdown</div>
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--muted);text-align:right">Remaining</div>
  </div>` + allFundraising.map((r, idx) => {
    const remaining = Math.max(r.totalOwed - r.totalPaid - r.raised, 0);
    const paidPct = (r.totalPaid / maxOwed) * 100;
    const raisedPct = (r.raised / maxOwed) * 100;
    const owesPct = (r.totalOwed / maxOwed) * 100;
    const raisedLeft = paidPct; // raised bar starts where paid ends
    const delay = idx * 80;
    const isZero = remaining <= 0;

    return `<div class="fr-row fr-animate" style="animation-delay:${delay}ms">
      <div>
        <div style="font-weight:700;font-size:14px">${r.fullName || r.athlete}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px">${r.parent || '--'}</div>
      </div>
      <div>
        <div class="fr-bar-track">
          <div class="fr-bar-dues" data-width="${owesPct}" style="width:0%"></div>
          <div class="fr-bar-paid" data-width="${paidPct}" style="width:0%">
            ${r.totalPaid > 0 ? `<span class="fr-bar-label" style="color:#34c759;right:4px">$${r.totalPaid.toFixed(0)} paid</span>` : ''}
          </div>
          <div class="fr-bar-raised" data-width="${raisedPct}" data-left="${raisedLeft}" style="width:0%;left:${raisedLeft}%">
            ${r.raised > 0 ? `<span class="fr-bar-label" style="color:#ffd60a;right:4px">$${r.raised.toFixed(0)} raised</span>` : ''}
          </div>
        </div>
        <div style="display:flex;gap:12px;margin-top:4px;font-size:10px;color:var(--muted)">
          <span>Dues: $${r.totalOwed.toFixed(0)}</span>
          ${r.totalPaid > 0 ? `<span style="color:#34c759">Paid: $${r.totalPaid.toFixed(0)}</span>` : ''}
          ${r.raised > 0 ? `<span style="color:#ffd60a">Raised: $${r.raised.toFixed(0)}</span>` : ''}
          ${r.raised > 0 && r.raised >= r.totalOwed - r.totalPaid ? `<span style="color:#34c759;font-weight:700">COVERED</span>` : ''}
        </div>
      </div>
      <div class="fr-remaining ${isZero ? 'zero' : ''}" style="text-align:right">
        ${isZero ? '$0' : '$' + remaining.toFixed(0)}
      </div>
    </div>`;
  }).join('');

  // Trigger bar animations after DOM paint
  requestAnimationFrame(() => {
    setTimeout(() => {
      container.querySelectorAll('.fr-bar-dues').forEach(el => { el.style.width = el.dataset.width + '%'; });
      container.querySelectorAll('.fr-bar-paid').forEach(el => { el.style.width = el.dataset.width + '%'; });
      container.querySelectorAll('.fr-bar-raised').forEach(el => { el.style.width = el.dataset.width + '%'; });
    }, 50);
  });
}

// ─── EMAIL VERIFICATION RESEND ──────────────────────────────
async function resendVerification(email) {
  if(!osSupabase) { showToast('Not connected','error'); return; }
  try {
    const {error}=await osSupabase.auth.resend({type:'signup',email});
    if(error) throw error;
    showToast(`Verification email resent to ${email}`);
  } catch(e) {
    // If user already confirmed, Supabase returns an error — surface it clearly
    const msg=e.message||String(e);
    if(msg.includes('already confirmed')||msg.includes('Email link is invalid')) {
      showToast(`${email} is already verified`,'info');
    } else {
      showToast(`Resend failed for ${email}: ${msg}`,'error');
    }
  }
}

async function resendAllVerifications() {
  if(!osSupabase) { showToast('Not connected','error'); return; }
  // Gather all parent emails from profiles
  const parents=allPlayers.filter(p=>p.role==='parent'&&p.email);
  if(!parents.length) { showToast('No parent profiles found','error'); return; }
  if(!confirm(`Resend verification emails to all ${parents.length} parent accounts?\n\nAlready-verified users will be skipped automatically.`)) return;
  let sent=0, skipped=0, failed=0;
  showToast(`Sending verification emails to ${parents.length} users...`);
  for(const p of parents) {
    try {
      const {error}=await osSupabase.auth.resend({type:'signup',email:p.email});
      if(error) {
        const msg=error.message||'';
        if(msg.includes('already confirmed')||msg.includes('Email link is invalid')) skipped++;
        else { failed++; console.warn(`Resend failed for ${p.email}:`,msg); }
      } else { sent++; }
    } catch(e) { failed++; console.warn(`Resend error for ${p.email}:`,e); }
    // Small delay to respect rate limits
    await new Promise(r=>setTimeout(r,200));
  }
  showToast(`Verification emails: ${sent} sent, ${skipped} already verified, ${failed} failed`);
}

// ─── SEASON DUES ────────────────────────────────────────────
async function loadDues() {
  try {
    if(osSupabase) {
      const {data,error}=await osSupabase.from('dues_installments').select(`id,installment_number,amount,due_date,status,paid_at,enrollment:parent_dues_enrollment!enrollment_id(id,parent_name,parent_email,athlete_name,total_owed,total_paid,status)`).order('due_date',{ascending:true});
      if(!error) allInstallments=data||[];
      else {
        const {data:d}=await osSupabase.from('payment_summary').select('*');
        allInstallments=(d||[]).map((r,i)=>({id:r.id||i,amount:r.amount_due,due_date:null,status:r.payment_status==='paid'?'paid':r.payment_status,paid_at:null,enrollment:{user:{full_name:r.full_name,email:r.email||''}}}));
      }
      // Load dues_payments submitted via parent portal Pay Tuition flow
      try {
        const {data:dp}=await osSupabase.from('dues_payments').select('*').order('payment_date',{ascending:false}).limit(50);
        if(dp && dp.length) renderDuesPaymentsFeed(dp);
      } catch(e){ /* table may not exist yet */ }
    }
  } catch(e){ console.error('Dues load:',e); }
  renderDues();

  // Realtime: push toast when a parent submits a new payment
  if(osSupabase && !window._duesPaymentsChannel) {
    window._duesPaymentsChannel = osSupabase
      .channel('admin-dues-payments')
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'dues_payments'},(payload)=>{
        const isVenmo = payload.new.status === 'pending_venmo';
        showToast(`${isVenmo?'📱':'💳'} ${isVenmo?'Venmo pending':'Payment'}: ${payload.new.parent_name||payload.new.parent_email} — $${(+payload.new.amount).toFixed(2)}`);
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
      actionBtn = `<button class="btn btn-primary btn-xs" style="background:#34c759;border-color:#34c759" onclick="confirmVenmoPayment('${p.id}','${(+p.amount).toFixed(2)}','${(p.parent_email||'').replace(/'/g,"\\'")}','${(p.player_name||'').replace(/'/g,"\\'")}')">Confirm</button>`;
    } else if (!done) {
      actionBtn = `<button class="btn btn-ghost btn-xs" onclick="markDuesPaymentPaid('${p.id}')">Mark Paid</button>`;
    }
    return `<tr${isVenmoPending?' style="background:rgba(0,140,255,0.06)"':''}>
      <td style="font-weight:600">${p.parent_name||p.parent_email||'--'}</td>
      <td style="color:var(--muted)">${p.player_name||'--'}</td>
      <td>$${(+p.amount).toFixed(2)}</td>
      <td style="color:var(--muted);font-size:12px">${p.note||'--'}</td>
      <td style="color:var(--muted);font-size:12px">${d}</td>
      <td>${statusTag(displayStatus)}</td>
      <td>${actionBtn}</td>
    </tr>`;
  }).join('');
}
async function markDuesPaymentPaid(id) {
  if(!confirm('Mark this payment as completed?')) return;
  try { if(osSupabase) await osSupabase.from('dues_payments').update({status:'manual'}).eq('id',id); }
  catch(e){ showToast('Error: '+e.message,'error'); return; }
  showToast('Payment marked as completed'); loadDues();
}
async function confirmVenmoPayment(paymentId, amount, parentEmail, playerName) {
  if(!confirm(`Confirm Venmo payment of $${amount} from ${parentEmail||playerName}?`)) return;
  try {
    if(!osSupabase) return;
    // 1. Mark dues_payments row as completed
    await osSupabase.from('dues_payments').update({status:'completed'}).eq('id',paymentId);
    // 2. Find enrollment and update total_paid
    if(parentEmail) {
      const {data:enr}=await osSupabase.from('parent_dues_enrollment').select('id,total_paid,total_owed,status').eq('parent_email',parentEmail).maybeSingle();
      if(enr) {
        const newPaid=parseFloat(enr.total_paid||0)+parseFloat(amount);
        const newStatus=newPaid>=parseFloat(enr.total_owed)?'paid_in_full':enr.status;
        await osSupabase.from('parent_dues_enrollment').update({total_paid:newPaid,status:newStatus}).eq('id',enr.id);
      }
    }
    // 3. Find next unpaid installment and mark it paid
    if(parentEmail) {
      const {data:inst}=await osSupabase.from('dues_installments')
        .select('id,enrollment:parent_dues_enrollment!enrollment_id(parent_email)')
        .in('status',['pending','overdue'])
        .order('installment_number',{ascending:true}).limit(50);
      const match=(inst||[]).find(i=>i.enrollment?.parent_email===parentEmail);
      if(match) await osSupabase.from('dues_installments').update({status:'paid',paid_at:new Date().toISOString()}).eq('id',match.id);
    }
    showToast('Venmo payment confirmed'); loadDues();
  } catch(e) { showToast('Error: '+e.message,'error'); }
}
function renderDues() {
  let items=allInstallments;
  if(duesFilter!=='all') items=items.filter(i=>i.status===duesFilter);
  const paid=allInstallments.filter(i=>i.status==='paid'||i.status==='completed');
  const paidTotal=paid.reduce((a,i)=>a+(+i.amount||0),0);
  const pending=allInstallments.filter(i=>i.status==='pending'||i.status==='overdue');
  const outTotal=pending.reduce((a,i)=>a+(+i.amount||0),0);
  const overdue=allInstallments.filter(i=>i.status==='overdue');
  const enrolled=new Set(allInstallments.map(i=>i.enrollment?.id)).size;

  document.getElementById('d-enrolled').textContent=enrolled;
  document.getElementById('d-collected').textContent='$'+paidTotal.toFixed(0);
  document.getElementById('d-outstanding').textContent='$'+outTotal.toFixed(0);
  document.getElementById('d-overdue').textContent=overdue.length;

  document.querySelectorAll('#dues-filters .filter-chip').forEach(c=>c.classList.toggle('active',c.textContent.toLowerCase()===duesFilter));

  document.getElementById('dues-tbody').innerHTML=items.length ? items.map((inst,idx)=>`<tr>
    <td style="font-weight:600">${inst.enrollment?.parent_name||'--'}</td><td style="color:var(--muted)">${inst.enrollment?.athlete_name||'--'}</td>
    <td>#${inst.installment_number||idx+1}</td><td>$${(+inst.amount||0).toFixed(0)}</td><td style="color:var(--muted)">${fmtShort(inst.due_date)}</td>
    <td>${statusTag(inst.status)}</td><td style="color:var(--muted)">${inst.paid_at?fmtShort(inst.paid_at):'--'}</td>
    <td><div style="display:flex;gap:4px">${inst.status!=='paid'?`<button class="btn btn-ghost btn-xs" onclick="markInstallmentPaid('${inst.id}')">Mark Paid</button>`:''}</div></td>
  </tr>`).join('') : '<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:32px">No installments found</td></tr>';
}
function filterDues(f) { duesFilter=f; renderDues(); }
async function markInstallmentPaid(id) {
  if(!confirm('Mark this installment as paid?')) return;
  try { if(osSupabase) await osSupabase.from('dues_installments').update({status:'paid',paid_at:new Date().toISOString()}).eq('id',id); }
  catch(e){ showToast('Error: '+e.message,'error'); return; }
  showToast('Installment marked as paid'); loadDues();
}

// ─── PRO SHOP ORDERS ────────────────────────────────────────
async function loadOrders() {
  try {
    if(osSupabase) {
      const {data}=await osSupabase.from('orders').select('*,order_items(*)').order('created_at',{ascending:false}).limit(50);
      allOrders=data||[];
    }
  } catch(e){ console.error('Orders load:',e); }
  renderOrders();
}
function renderOrders() {
  let items=allOrders;
  if(ordersFilter!=='all') items=items.filter(o=>o.fulfillment_status===ordersFilter);
  const totalRev=allOrders.filter(o=>o.payment_status==='paid').reduce((a,o)=>a+(+o.total_amount||0),0);
  const pendFulfill=allOrders.filter(o=>o.fulfillment_status==='unfulfilled'&&o.payment_status==='paid').length;
  const refunded=allOrders.filter(o=>o.payment_status==='refunded').reduce((a,o)=>a+(+o.total_amount||0),0);

  document.getElementById('o-total').textContent=allOrders.length;
  document.getElementById('o-revenue').textContent='$'+totalRev.toFixed(0);
  document.getElementById('o-pending').textContent=pendFulfill;
  document.getElementById('o-refunded').textContent='$'+refunded.toFixed(0);

  document.querySelectorAll('#order-filters .filter-chip').forEach(c=>c.classList.toggle('active',c.textContent.toLowerCase()===ordersFilter));

  document.getElementById('orders-tbody').innerHTML=items.length ? items.map(o=>`<tr>
    <td style="font-weight:600">#${(o.id||'').slice(0,8)}</td><td>${o.customer_name||o.customer_email||'--'}</td>
    <td>$${(+o.total_amount||0).toFixed(2)}</td><td>${statusTag(o.payment_status||'pending')}</td>
    <td>${statusTag(o.fulfillment_status||'unfulfilled')}</td><td style="color:var(--muted)">${fmtShort(o.created_at)}</td>
    <td><select onchange="updateFulfillment('${o.id}',this.value)" style="background:rgba(0,0,0,.3);border:1px solid var(--border);border-radius:6px;color:#fff;padding:4px 8px;font-size:11px">
      <option value="unfulfilled" ${o.fulfillment_status==='unfulfilled'?'selected':''}>Unfulfilled</option>
      <option value="processing" ${o.fulfillment_status==='processing'?'selected':''}>Processing</option>
      <option value="shipped" ${o.fulfillment_status==='shipped'?'selected':''}>Shipped</option>
      <option value="delivered" ${o.fulfillment_status==='delivered'?'selected':''}>Delivered</option>
    </select></td></tr>`).join('') : '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:32px">No orders yet</td></tr>';
}
function filterOrders(f) { ordersFilter=f; renderOrders(); }
async function updateFulfillment(id,status) {
  try { if(osSupabase) await osSupabase.from('orders').update({fulfillment_status:status}).eq('id',id); showToast('Order updated'); }
  catch(e){ showToast('Error: '+e.message,'error'); }
}

// ─── MESSAGING ──────────────────────────────────────────────
async function loadComms() {
  try {
    if(osSupabase) {
      const {data}=await osSupabase.from('broadcast_messages').select('*').order('created_at',{ascending:false});
      allBroadcasts=data||[];
    }
  } catch(e){}
  renderBroadcasts();
}
function renderBroadcasts() {
  document.getElementById('broadcast-tbody').innerHTML=allBroadcasts.length ? allBroadcasts.map(m=>`<tr style="cursor:pointer" onclick="viewBroadcast('${m.id}')">
    <td style="font-weight:600">${m.subject||'--'}</td><td>${m.audience||'--'}</td>
    <td style="color:var(--muted)">${fmtShort(m.created_at)}</td>
    <td>${m.recipient_count||'--'}</td><td>${m.delivered_count||'--'}</td><td>${m.read_count||'--'}</td>
  </tr>`).join('') : '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:32px">No messages yet</td></tr>';
}
async function sendBroadcast() {
  const subject=document.getElementById('bc-subject').value;
  const body=document.getElementById('bc-body').value;
  const channel=document.querySelector('input[name="bc-channel"]:checked')?.value||'both';
  const audRadio=document.querySelector('input[name="bc-audience"]:checked')?.value;
  const teamId=document.getElementById('bc-team').value;
  const audience=audRadio==='team'&&teamId?`team:${teamId}`:'all_parents';
  if(!subject||!body) return showToast('Subject and body required','error');
  if(!confirm(`Send broadcast to ${audience}?`)) return;
  try {
    if(osSupabase) {
      const session=await osSupabase.auth.getSession();
      const {data:msgId,error}=await osSupabase.rpc('send_broadcast',{p_sender_id:session.data.session.user.id,p_subject:subject,p_body:body,p_channel:channel,p_audience:audience});
      if(error) throw error;
      if(msgId) {
        showToast('Broadcasting...','info');
        await sendAndPoll(msgId);
      }
    }
    document.getElementById('bc-subject').value='';
    document.getElementById('bc-body').value='';
    showToast('Broadcast sent successfully');
    loadComms();
  } catch(e){ showToast('Error: '+e.message,'error'); }
}
async function sendAndPoll(messageId) {
  let pending=true, attempts=0;
  while(pending && attempts<30) {
    try {
      const {data}=await osSupabase.functions.invoke('send-broadcast',{body:{message_id:messageId}});
      pending=(data?.still_pending||0)>0;
    } catch(e){ pending=false; }
    if(pending) await new Promise(r=>setTimeout(r,2000));
    attempts++;
  }
}
function viewBroadcast(id) {
  const m=allBroadcasts.find(x=>x.id===id); if(!m) return;
  openModal('view-broadcast');
  document.getElementById('modal-title').textContent=m.subject;
  document.getElementById('modal-body').innerHTML=`
    <div style="margin-bottom:16px;color:var(--muted);font-size:12px">Sent ${fmt(m.created_at)} to ${m.audience}</div>
    <div style="background:rgba(0,0,0,.2);padding:20px;border-radius:12px;margin-bottom:20px;font-size:14px;line-height:1.6;white-space:pre-wrap">${m.body||''}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
      <div style="text-align:center;padding:16px;background:rgba(255,255,255,.03);border-radius:8px"><div style="font-size:24px;font-weight:800">${m.recipient_count||0}</div><div style="font-size:11px;color:var(--muted);margin-top:4px">RECIPIENTS</div></div>
      <div style="text-align:center;padding:16px;background:rgba(255,255,255,.03);border-radius:8px"><div style="font-size:24px;font-weight:800">${m.delivered_count||0}</div><div style="font-size:11px;color:var(--muted);margin-top:4px">DELIVERED</div></div>
      <div style="text-align:center;padding:16px;background:rgba(255,255,255,.03);border-radius:8px"><div style="font-size:24px;font-weight:800">${m.read_count||0}</div><div style="font-size:11px;color:var(--muted);margin-top:4px">READ</div></div>
    </div>`;
}

// ─── DATA ENTRY ─────────────────────────────────────────────
const FOCUS_AREAS = ['shooting','ball_handling','defense','passing','rebounding','conditioning','court_vision','finishing'];
let guestCounter = 0;

function loadDataEntry() { /* teams already loaded in init */ }
function switchDataTab(tab, btn) {
  document.querySelectorAll('.sub-tab').forEach(t=>t.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('data-training').style.display=tab==='training'?'block':'none';
  document.getElementById('data-game').style.display=tab==='game'?'block':'none';
}

async function loadTeamRoster(prefix) {
  const teamId=document.getElementById(prefix+'-team').value;
  if(!teamId||!osSupabase) return;
  if(teamRosterCache[teamId]) { renderRoster(prefix,teamRosterCache[teamId]); return; }
  try {
    const {data}=await osSupabase.from('team_rosters').select('athlete_id,athletes!inner(id,first_name,last_name)').eq('team_id',teamId).eq('status','active');
    const roster=(data||[]).map(r=>({id:r.athletes.id,name:`${r.athletes.first_name} ${r.athletes.last_name}`}));
    teamRosterCache[teamId]=roster;
    renderRoster(prefix,roster);
  } catch(e){ console.error('Roster load:',e); }
}

function renderRoster(prefix, roster) {
  if (prefix === 'de') {
    document.getElementById('de-player-cards').innerHTML = roster.map(a => buildPlayerCard(a.id, a.name, false)).join('');
  } else if (prefix === 'gm') {
    const statCols = ['MIN','PTS','FGM','FGA','3PM','3PA','FTM','FTA','OREB','DREB','AST','STL','BLK','TO','PF'];
    document.getElementById('gm-stats-grid').innerHTML = `<table><thead><tr><th style="text-align:left">Player</th>${statCols.map(c=>`<th>${c}</th>`).join('')}</tr></thead><tbody>${roster.map(a=>`<tr><td style="text-align:left;font-weight:600;white-space:nowrap">${a.name}</td>${statCols.map(c=>`<td><input type="number" min="0" value="0" data-athlete="${a.id}" data-stat="${c.toLowerCase()}"></td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }
}

function buildPlayerCard(athleteId, name, isGuest) {
  const focusOpts = FOCUS_AREAS.map(f => `<option value="${f}">${f.replace(/_/g,' ')}</option>`).join('');
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
          ${[1,2,3,4,5].map(n => `<button onclick="setEffort(this,${n})">${n}</button>`).join('')}
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

// ─── CALENDAR ───────────────────────────────────────────────
async function loadCalendar() {
  try {
    if(osSupabase) {
      let query=osSupabase.from('calendar_events').select('*').order('start_date',{ascending:true});
      if(calView==='list') {
        // List view: all events from Jan 1 of viewed year onward
        query=query.gte('start_date',`${calYear}-01-01`).lte('start_date',`${calYear}-12-31`);
      } else {
        const start=new Date(calYear,calMonth,1), end=new Date(calYear,calMonth+1,0);
        query=query.gte('start_date',start.toISOString().split('T')[0]).lte('start_date',end.toISOString().split('T')[0]);
      }
      const {data}=await query;
      // Expand multi-day events so they appear on every date in the range
      allCalEvents=[];
      for(const e of (data||[])) {
        allCalEvents.push({...e, event_date: e.start_date});
        if(e.end_date && e.end_date !== e.start_date) {
          const start=new Date(e.start_date+'T00:00:00');
          const end=new Date(e.end_date+'T00:00:00');
          const cursor=new Date(start);
          cursor.setDate(cursor.getDate()+1);
          while(cursor<=end) {
            allCalEvents.push({...e, event_date: cursor.toISOString().split('T')[0], _isSpan: true});
            cursor.setDate(cursor.getDate()+1);
          }
        }
      }
    }
  } catch(e){ console.error('Calendar load:',e); }
  renderCalendar();
}
function calNav(dir) { if(calView==='list'){calYear+=dir;}else{calMonth+=dir;if(calMonth>11){calMonth=0;calYear++;}if(calMonth<0){calMonth=11;calYear--;}} loadCalendar(); }
function setCalView(v) {
  calView=v;
  document.getElementById('cal-view-month').style.opacity=v==='month'?'1':'0.5';
  document.getElementById('cal-view-list').style.opacity=v==='list'?'1':'0.5';
  loadCalendar();
}
function renderCalendar() {
  const label=calView==='list'?String(calYear):new Date(calYear,calMonth).toLocaleDateString('en-US',{month:'long',year:'numeric'});
  document.getElementById('cal-month-label').textContent=label;
  if(calView==='list') { renderCalList(); return; }
  const first=new Date(calYear,calMonth,1), last=new Date(calYear,calMonth+1,0);
  const startDay=first.getDay(), totalDays=last.getDate();
  const days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const today=new Date(); const todayStr=today.toISOString().split('T')[0];
  let html='<div class="cal-grid">';
  days.forEach(d=>html+=`<div class="cal-header">${d}</div>`);
  for(let i=0;i<startDay;i++) html+=`<div class="cal-day other-month"></div>`;
  for(let d=1;d<=totalDays;d++) {
    const dateStr=`${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isToday=dateStr===todayStr;
    const dayEvents=allCalEvents.filter(e=>e.event_date===dateStr);
    html+=`<div class="cal-day${isToday?' today':''}" onclick="showDayEvents('${dateStr}')"><div class="day-num">${d}</div>`;
    dayEvents.slice(0,3).forEach(e=>{
      let regTag='';
      if(e.event_type==='tournament') {
        const cl=Array.isArray(e.admin_checklist)?e.admin_checklist:(e.admin_checklist?JSON.parse(e.admin_checklist):[]);
        const reg=cl.find(c=>c.id==='register');
        if(!reg||!reg.done) regTag='<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#ff3b30;margin-right:3px;vertical-align:middle" title="Not Registered"></span>';
      }
      html+=`<div class="cal-event ${e.event_type||'other'}" onclick="event.stopPropagation();editCalEvent('${e.id}')">${regTag}${e.title||'Event'}</div>`;
    });
    if(dayEvents.length>3) html+=`<div style="font-size:10px;color:var(--muted)">+${dayEvents.length-3} more</div>`;
    html+='</div>';
  }
  const remaining=7-((startDay+totalDays)%7); if(remaining<7) for(let i=0;i<remaining;i++) html+=`<div class="cal-day other-month"></div>`;
  html+='</div>';
  document.getElementById('cal-container').innerHTML=html;
}
function renderCalList() {
  // Deduplicate expanded multi-day events for list view (show once per real event)
  const seen=new Set();
  const uniqueEvents=allCalEvents.filter(e=>{
    if(seen.has(e.id)) return false;
    seen.add(e.id); return true;
  });
  // Group events by month for readability
  const months={};
  uniqueEvents.forEach(e=>{
    const d=new Date(e.event_date+'T00:00:00');
    const key=d.toLocaleDateString('en-US',{month:'long',year:'numeric'});
    if(!months[key]) months[key]=[];
    months[key].push(e);
  });
  const monthKeys=Object.keys(months);
  let rows='';
  if(monthKeys.length) {
    monthKeys.forEach(mk=>{
      rows+=`<tr><td colspan="6" style="background:var(--card-bg);font-weight:700;padding:10px 16px;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;color:var(--accent);border-top:2px solid var(--border)">${mk}</td></tr>`;
      months[mk].forEach(e=>{
        const dateLabel=e.end_date&&e.end_date!==e.event_date?fmtShort(e.event_date)+' - '+fmtShort(e.end_date):fmtShort(e.event_date);
        let regTag='';
        if(e.event_type==='tournament') {
          const cl=Array.isArray(e.admin_checklist)?e.admin_checklist:(e.admin_checklist?JSON.parse(e.admin_checklist):[]);
          const reg=cl.find(c=>c.id==='register');
          if(!reg||!reg.done) regTag='<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:rgba(255,59,48,0.15);color:#ff3b30;font-weight:600;margin-left:6px">NOT REG</span>';
        }
        rows+=`<tr>
        <td>${dateLabel}</td><td style="color:var(--muted)">${e.start_time||'--'}</td><td style="font-weight:600">${e.title}${regTag}</td>
        <td>${statusTag(e.event_type||'other')}${e.event_type==='tournament'?tournamentProgressBadge(e):''}</td><td style="color:var(--muted)">${e.location||'--'}</td>
        <td><button class="btn btn-ghost btn-xs" onclick="editCalEvent('${e.id}')">${e.event_type==='tournament'?'Details':'Edit'}</button><button class="btn btn-ghost btn-xs" style="color:#ff3b30" onclick="deleteCalEvent('${e.id}')">Delete</button></td>
      </tr>`;
      });
    });
  } else {
    rows=`<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:32px">No events in ${calYear}</td></tr>`;
  }
  document.getElementById('cal-container').innerHTML=`<div class="card"><table><thead><tr><th>Date</th><th>Time</th><th>Title</th><th>Type</th><th>Location</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
function showDayEvents(dateStr) {
  const dayEvents=allCalEvents.filter(e=>e.event_date===dateStr);
  openModal('day-events');
  document.getElementById('modal-title').textContent='Events on '+fmtShort(dateStr);
  const eventsHtml=dayEvents.length?dayEvents.map(e=>`
    <div style="padding:12px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px;display:flex;align-items:flex-start;justify-content:space-between">
      <div>
        <div style="font-weight:700">${e.title}</div>
        <div style="color:var(--muted);font-size:12px;margin-top:4px">${e.start_time||''} ${e.end_time?'- '+e.end_time:''} ${e.location?'| '+e.location:''}</div>
        ${e.source_type?`<div style="font-size:11px;color:var(--muted);margin-top:4px">Auto-created from ${e.source_type}</div>`:''}
      </div>
      <button class="btn btn-ghost btn-xs" onclick="editCalEvent('${e.id}')" style="flex-shrink:0;margin-left:8px">Edit</button>
    </div>`).join(''):'<p style="color:var(--muted)">No events on this day.</p>';
  document.getElementById('modal-body').innerHTML=eventsHtml+`<button class="btn btn-primary" style="width:100%;margin-top:12px" onclick="addCalEventForDate('${dateStr}')"><i data-lucide="plus" style="width:16px;height:16px;margin-right:6px"></i>Add Event on ${fmtShort(dateStr)}</button>`;
  if(window.lucide) lucide.createIcons();
}
function addCalEventForDate(dateStr) {
  openModal('add-event');
  document.getElementById('modal-title').textContent='New Event';
  document.getElementById('modal-body').innerHTML=calEventForm({event_date:dateStr});
}
function editCalEvent(id) {
  const e=allCalEvents.find(x=>x.id===id); if(!e) return;
  // Tournaments open the detail/checklist panel instead of raw form
  if(e.event_type==='tournament') { openTournamentDetail(id); return; }
  openModal('edit-event');
  document.getElementById('modal-title').textContent='Edit Event';
  document.getElementById('modal-body').innerHTML=calEventForm(e);
}
async function deleteCalEvent(id) {
  if(!confirm('Delete this event?')) return;
  try { if(osSupabase) await osSupabase.from('calendar_events').delete().eq('id',id); showToast('Event deleted'); loadCalendar(); }
  catch(e){ showToast('Error: '+e.message,'error'); }
}

async function publishCalendarToParents() {
  const btn = document.getElementById('btn-publish-calendar');
  if (!osSupabase) { showToast('Not connected to database', 'error'); return; }

  // Find unpublished events (published_at IS NULL)
  const { data: unpublished, error: fetchErr } = await osSupabase
    .from('calendar_events')
    .select('id, title, event_type, start_date, start_time, location')
    .is('published_at', null)
    .in('visibility', ['public', 'team_only'])
    .order('start_date', { ascending: true });

  if (fetchErr) { showToast('Error: ' + fetchErr.message, 'error'); return; }
  if (!unpublished || !unpublished.length) { showToast('All events are already published.', 'info'); return; }

  if (!confirm(`Publish ${unpublished.length} event(s) to the parent portal and send email notification?`)) return;

  if (btn) { btn.disabled = true; btn.textContent = 'Publishing...'; }

  try {
    // Set published_at on all unpublished events
    const ids = unpublished.map(e => e.id);
    const now = new Date().toISOString();
    const { error: updateErr } = await osSupabase
      .from('calendar_events')
      .update({ published_at: now })
      .in('id', ids);

    if (updateErr) throw updateErr;

    // Invoke edge function to send email notifications
    try {
      await osSupabase.functions.invoke('send-calendar-update', {
        body: { event_ids: ids }
      });
    } catch (emailErr) {
      console.error('Email notification error (events still published):', emailErr);
    }

    showToast(`Published ${unpublished.length} event(s) to parents.`, 'success');
    loadCalendar();
  } catch (e) {
    showToast('Publish error: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Publish to Parents'; }
  }
}

function calEventForm(e={}) {
  const types=['practice','game','tournament','meeting','camp','tryout','fundraiser','deadline','other'];
  const typeOpts=types.map(t=>`<option value="${t}" ${e.event_type===t?'selected':''}>${t.charAt(0).toUpperCase()+t.slice(1)}</option>`).join('');
  const gradeVis=e.event_type==='tournament'?'':'display:none';
  return `<div class="field"><label>Title</label><input type="text" id="ev-title" value="${e.title||''}"></div>
    <div class="grid2"><div class="field"><label>Type</label><select id="ev-type" onchange="document.getElementById('ev-grade-wrap').style.display=this.value==='tournament'?'':'none'">${typeOpts}</select></div>
    <div class="field" id="ev-grade-wrap" style="${gradeVis}"><label>Grade Level</label><select id="ev-grade"><option value="" ${!e.grade_level?'selected':''}>--</option><option value="4th" ${e.grade_level==='4th'?'selected':''}>4th Grade</option><option value="5th" ${e.grade_level==='5th'?'selected':''}>5th Grade</option><option value="both" ${e.grade_level==='both'?'selected':''}>Both</option></select></div>
    <div class="field"><label>Date</label><input type="date" id="ev-date" value="${e.event_date||e.start_date||''}"></div>
    <div class="field"><label>Start Time</label><input type="time" id="ev-start" value="${e.start_time||''}"></div>
    <div class="field"><label>End Time</label><input type="time" id="ev-end" value="${e.end_time||''}"></div></div>
    <div class="field"><label>Location</label><input type="text" id="ev-location" value="${e.location||''}"></div>
    <div class="field"><label>Description</label><textarea id="ev-desc" style="min-height:80px;border:1px solid var(--border);border-radius:12px;background:rgba(0,0,0,0.3);color:#fff;padding:16px;width:100%;font-family:var(--font-sans);font-size:14px;resize:vertical">${e.description||''}</textarea></div>
    ${e.source_type?`<div style="font-size:12px;color:var(--muted);margin-bottom:12px">Auto-created from ${e.source_type}</div>`:''}
    <input type="hidden" id="ev-id" value="${e.id||''}">
    <button class="btn btn-primary" style="width:100%;margin-top:8px" onclick="saveCalEvent()">Save Event</button>
    ${e.id?`<button class="btn btn-danger" style="width:100%;margin-top:8px" onclick="deleteCalEvent('${e.id}');closeModal()">Delete Event</button>`:''}`;
}
async function saveCalEvent() {
  const id=document.getElementById('ev-id').value;
  const evType=document.getElementById('ev-type').value;
  const gradeEl=document.getElementById('ev-grade');
  const payload={
    p_id:id||null,
    p_title:document.getElementById('ev-title').value,
    p_event_type:evType,
    p_start_date:document.getElementById('ev-date').value,
    p_start_time:document.getElementById('ev-start').value||null,
    p_end_time:document.getElementById('ev-end').value||null,
    p_location:document.getElementById('ev-location').value,
    p_description:document.getElementById('ev-desc').value||null,
    p_grade_level:evType==='tournament'&&gradeEl?gradeEl.value||null:null
  };
  if(!payload.p_title||!payload.p_start_date) return showToast('Title and date required','error');
  try {
    if(osSupabase) {
      const session=await osSupabase.auth.getSession();
      payload.p_created_by=session.data.session.user.id;
      payload.p_team_id=null; payload.p_all_day=false;
      const {error}=await osSupabase.rpc('upsert_calendar_event',payload);
      if(error) throw error;
    }
    showToast(id?'Event updated':'Event created'); closeModal(); loadCalendar();
  } catch(e){ showToast('Error: '+e.message,'error'); }
}

// ─── BULK TOURNAMENT UPLOAD ──────────────────────────────────
function openBulkTournamentUpload() {
  openModal('bulk-tournament');
  document.getElementById('modal-title').textContent='Add Tournaments';
  document.getElementById('modal-body').innerHTML=`
    <p style="color:var(--muted);font-size:13px;margin-bottom:12px">Paste tournament info from a website, email, or flyer. Dates, locations, grades, and costs are picked up automatically.</p>
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
    <button class="btn btn-primary" style="width:100%;margin-top:4px" onclick="addTournaments()" id="bulk-add-btn">Add Tournaments</button>
    <div id="bulk-result" style="margin-top:12px"></div>`;
}

async function addTournaments() {
  const raw=document.getElementById('bulk-raw').value.trim();
  const hint=document.getElementById('bulk-hint');
  const textarea=document.getElementById('bulk-raw');
  const btn=document.getElementById('bulk-add-btn');
  const resultDiv=document.getElementById('bulk-result');

  // Reset state
  textarea.style.borderColor='var(--border)';
  hint.style.opacity='0';
  resultDiv.innerHTML='';

  if(!raw) {
    textarea.style.borderColor='#ff3b30';
    hint.innerHTML='<span style="color:#ff3b30">Paste tournament info above to get started.</span>';
    hint.style.opacity='1';
    textarea.focus();
    return;
  }

  btn.textContent='Adding...'; btn.disabled=true;
  try {
    const parsed=parseTournamentText(raw);

    if(!parsed.length) {
      textarea.style.borderColor='#ff9500';
      hint.innerHTML='<span style="color:#ff9500">Could not find tournament details. Make sure you include a name and date.</span>';
      hint.style.opacity='1';
      btn.textContent='Add Tournaments'; btn.disabled=false;
      return;
    }

    // Check each parsed entry for required fields
    const valid=[], issues=[];
    parsed.forEach(t=>{
      if(!t.title&&!t.start_date) issues.push('One entry is missing both a name and date.');
      else if(!t.start_date) issues.push(`"${t.title}" is missing a date.`);
      else if(!t.title) issues.push('One entry has a date but no name.');
      else valid.push(t);
    });

    if(!valid.length) {
      textarea.style.borderColor='#ff9500';
      hint.innerHTML=`<span style="color:#ff9500">${issues[0]||'Could not find a tournament name and date.'}</span>`;
      hint.style.opacity='1';
      btn.textContent='Add Tournaments'; btn.disabled=false;
      return;
    }

    // Save all valid tournaments
    if(!osSupabase) { showToast('Not connected','error'); btn.textContent='Add Tournaments'; btn.disabled=false; return; }
    const session=await osSupabase.auth.getSession();
    const userId=session.data.session.user.id;
    let saved=0, errors=0;

    for(const t of valid) {
      try {
        const {error}=await osSupabase.rpc('upsert_calendar_event',{
          p_title:t.title, p_event_type:'tournament', p_start_date:t.start_date,
          p_end_date:t.end_date||null, p_start_time:t.start_time||null, p_location:t.location||'',
          p_grade_level:t.grade_level||'both', p_created_by:userId, p_visibility:'public',
          p_cost:t.cost||null, p_registration_deadline:t.registration_deadline||null,
          p_notes:t.notes||null, p_admin_checklist:JSON.stringify(buildTournamentChecklist())
        });
        if(error) throw error;
        saved++;
      } catch(e) { console.error('Save error:',e); errors++; }
    }

    // Show success summary inline
    textarea.style.borderColor='#34c759';
    const cards=valid.map(t=>{
      const dateLabel=t.end_date&&t.end_date!==t.start_date?fmtShort(t.start_date)+' - '+fmtShort(t.end_date):fmtShort(t.start_date);
      return `<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:rgba(52,199,89,0.08);border-radius:8px;margin-bottom:4px">
        <span style="color:#34c759;font-size:16px">&#10003;</span>
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${t.title}</div>
          <div style="font-size:11px;color:var(--muted)">${dateLabel}${t.location?' -- '+t.location:''}${t.grade_level&&t.grade_level!=='both'?' -- '+t.grade_level+' grade':''}</div>
        </div>
      </div>`;
    }).join('');

    resultDiv.innerHTML=cards;
    if(issues.length) {
      hint.innerHTML=`<span style="color:#ff9500">${saved} added. ${issues.length} skipped (missing info).</span>`;
      hint.style.opacity='1';
    } else {
      hint.innerHTML=`<span style="color:#34c759">${saved} tournament${saved!==1?'s':''} added to the calendar.</span>`;
      hint.style.opacity='1';
    }

    btn.textContent='Add Tournaments'; btn.disabled=false;
    // Reload calendar in background
    loadCalendar();
    // Auto-close after brief delay so user sees confirmation
    setTimeout(()=>{ if(document.querySelector('.modal.active')) closeModal(); }, 2200);

  } catch(e) {
    showToast('Error: '+e.message,'error');
    btn.textContent='Add Tournaments'; btn.disabled=false;
  }
}

function parseTournamentText(raw) {
  // Smart parser: collapses blank lines, detects event boundaries by title patterns,
  // handles pipe-delimited "CITY, STATE | MONTH DAY-DAY" and infers missing year.
  const allLines=raw.split('\n').map(l=>l.trim()).filter(Boolean);
  if(!allLines.length) return [];

  const detailRe=/^(please note|your team|no refunds|if you need|powered by|registration|open to|unsigned|normal|excellent|\d\+\s*game|championship|awards|teams must|proof of|\$\d)/i;
  const dateRe=/\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d/i;
  const phoneRe=/^\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}$/;

  function isTitleLine(line) {
    if(line.length<4) return false;
    if(detailRe.test(line)||phoneRe.test(line)) return false;
    if(/^\$/.test(line)) return false;
    // Must be mostly uppercase (>55% of alpha chars)
    const alpha=line.replace(/[^a-zA-Z]/g,'');
    if(alpha.length<3) return false;
    return (alpha.replace(/[^A-Z]/g,'').length/alpha.length)>0.55;
  }

  // Split into event blocks using title detection
  const eventBlocks=[];
  let cur=[];
  let curHasDate=false;
  for(const line of allLines) {
    // If this looks like a new title AND the current block already has date info, start new event
    if(cur.length>0&&curHasDate&&isTitleLine(line)&&!line.includes('|')) {
      eventBlocks.push(cur);
      cur=[];
      curHasDate=false;
    }
    cur.push(line);
    if(dateRe.test(line)||/\|\s*\w+\s+\d{1,2}/i.test(line)||/\d{1,2}\/\d{1,2}\/\d{2,4}/.test(line)) curHasDate=true;
  }
  if(cur.length) eventBlocks.push(cur);

  const thisYear=new Date().getFullYear();
  const results=[];
  for(const lines of eventBlocks) {
    const entry={title:'',start_date:'',end_date:'',location:'',grade_level:'both',start_time:null};

    // Title: first line, strip trailing date portion
    entry.title=lines[0].replace(/^[-*]\s*/,'')
      .replace(/\s*[-\u2013]+\s*\w+\s+\d{1,2}(?:\s*[-\u2013]\s*\d{1,2})?,?\s*\d{4}\s*$/i,'')
      .replace(/\s*[-\u2013]+\s*\d{1,2}\/\d{1,2}\/\d{2,4}\s*$/,'')
      .replace(/\s*[-:]?\s*$/,'');

    for(const line of lines) {
      // Pipe format: "CITY, STATE | MAY 2-3" (year inferred)
      const pipeMatch=line.match(/^(.+?)\s*\|\s*(\w+)\s+(\d{1,2})(?:\s*[-\u2013]\s*(\d{1,2}))?/i);
      if(pipeMatch&&!entry.start_date) {
        const loc=pipeMatch[1].trim();
        if(loc&&!entry.location) entry.location=loc;
        entry.start_date=toISO(pipeMatch[2],pipeMatch[3],thisYear);
        if(pipeMatch[4]) entry.end_date=toISO(pipeMatch[2],pipeMatch[4],thisYear);
        continue;
      }
      // Standard date: "Month Day-Day, Year", "Month Day-Day", "M/D/YYYY", cross-month ranges
      if(!entry.start_date) {
        const dateMatch=line.match(/(\w+\s+\d{1,2}(?:(?:st|nd|rd|th))?(?:\s*[-\u2013]\s*(?:\w+\s+)?\d{1,2}(?:(?:st|nd|rd|th))?)?,?\s*\d{0,4})/i)
          ||line.match(/(\d{1,2}\/\d{1,2}\/\d{2,4}(?:\s*[-\u2013]\s*\d{1,2}\/\d{1,2}\/\d{2,4})?)/);
        if(dateMatch) {
          const parsed=parseDateRange(dateMatch[1]);
          if(parsed.start) entry.start_date=parsed.start;
          if(parsed.end) entry.end_date=parsed.end;
        }
      }
      // Location: prefixed format
      if(!entry.location) {
        const locMatch=line.match(/\b(?:location|venue)\s*[:\-]?\s*(.+)/i)||line.match(/(?:^|\s)(?:at|@)\s*[:\-]\s*(.+)/i);
        if(locMatch) entry.location=(locMatch[1]||locMatch[2]||'').trim();
      }
      // Location: "City, State" standalone (no pipe, no date, no detail)
      if(!entry.location&&/^[A-Z][A-Za-z\s.]+,\s*[A-Za-z\s]+$/.test(line)&&!dateRe.test(line)&&!detailRe.test(line)) {
        entry.location=line;
      }
      // Grade detection
      if(/4th\s*grade|4th\s*gr|u10.*4|grade\s*4/i.test(line)&&!/5th/i.test(line)) entry.grade_level='4th';
      else if(/5th\s*grade|5th\s*gr|u11.*5|grade\s*5/i.test(line)&&!/4th/i.test(line)) entry.grade_level='5th';
      else if(/both|all\s*grades|4th.*5th|5th.*4th/i.test(line)) entry.grade_level='both';
      // Time detection
      const timeMatch=line.match(/(\d{1,2}:\d{2}\s*(?:am|pm)?)/i);
      if(timeMatch&&!entry.start_time) entry.start_time=convertTo24(timeMatch[1]);
    }
    // Cost detection: "$395-450", "$250", "$100 per team"
    for(const line of lines) {
      const costMatch=line.match(/(\$\d[\d,]*(?:\s*[-–]\s*\$?\d[\d,]*)?(?:\s*(?:per|\/)\s*\w+)?)/i);
      if(costMatch&&!entry.cost) { entry.cost=costMatch[1]; break; }
    }
    // Registration deadline: "Registration Closes April 26th, 2026"
    for(const line of lines) {
      const regMatch=line.match(/registration\s+(?:closes?|deadline|due|ends?)\s+(\w+\s+\d{1,2}(?:st|nd|rd|th)?,?\s*\d{4})/i);
      if(regMatch&&!entry.registration_deadline) {
        const cleaned=regMatch[1].replace(/(st|nd|rd|th)/i,'');
        const p=parseDateRange(cleaned);
        if(p.start) entry.registration_deadline=p.start;
        break;
      }
    }
    // Notes: collect detail lines (rules, requirements, etc) that aren't title/date/location
    const noteLines=[];
    for(const line of lines) {
      if(line===entry.title||line===entry.location) continue;
      if(/\|\s*\w+\s+\d/i.test(line)) continue; // pipe date line
      if(phoneRe.test(line)||/^\$/.test(line)) continue;
      if(detailRe.test(line)||/call\/text|further assistance/i.test(line)) noteLines.push(line);
    }
    if(noteLines.length) entry.notes=noteLines.join('\n');

    if(entry.title) results.push(entry);
  }
  return results;
}

function parseDateRange(str) {
  // Handle many date formats: "April 12-13, 2026", "4/12/2026", "May 3-4",
  // "April 12, 2026 - April 13, 2026", "April 12th-13th, 2026"
  const result={start:null,end:null};
  const thisYear=new Date().getFullYear();
  const cleaned=str.replace(/(st|nd|rd|th)\b/gi,'');

  // "Month Day - Month Day, Year" or "Month Day, Year - Month Day, Year"
  const crossMonthMatch=cleaned.match(/(\w+)\s+(\d{1,2}),?\s*(?:\d{4})?\s*[-–]\s*(\w+)\s+(\d{1,2}),?\s*(\d{4})?/i);
  if(crossMonthMatch) {
    const year=crossMonthMatch[5]||thisYear;
    result.start=toISO(crossMonthMatch[1],crossMonthMatch[2],year);
    result.end=toISO(crossMonthMatch[3],crossMonthMatch[4],year);
    return result;
  }
  // "Month Day-Day, Year" or "Month Day-Day" (year optional)
  const rangeMatch=cleaned.match(/(\w+)\s+(\d{1,2})\s*[-–]\s*(\d{1,2}),?\s*(\d{4})?/i);
  if(rangeMatch) {
    const year=rangeMatch[4]||thisYear;
    result.start=toISO(rangeMatch[1],rangeMatch[2],year);
    result.end=toISO(rangeMatch[1],rangeMatch[3],year);
    return result;
  }
  // "Month Day, Year"
  const singleMatch=cleaned.match(/(\w+)\s+(\d{1,2}),?\s*(\d{4})?/i);
  if(singleMatch) {
    const year=singleMatch[3]||thisYear;
    result.start=toISO(singleMatch[1],singleMatch[2],year);
    return result;
  }
  // "M/D/YYYY - M/D/YYYY"
  const slashRangeMatch=cleaned.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*[-–]\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if(slashRangeMatch) {
    let y1=slashRangeMatch[3],y2=slashRangeMatch[6];
    if(y1.length===2) y1='20'+y1; if(y2.length===2) y2='20'+y2;
    result.start=`${y1}-${slashRangeMatch[1].padStart(2,'0')}-${slashRangeMatch[2].padStart(2,'0')}`;
    result.end=`${y2}-${slashRangeMatch[4].padStart(2,'0')}-${slashRangeMatch[5].padStart(2,'0')}`;
    return result;
  }
  // "M/D/YYYY"
  const slashMatch=cleaned.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if(slashMatch) {
    let y=slashMatch[3]; if(y.length===2) y='20'+y;
    result.start=`${y}-${slashMatch[1].padStart(2,'0')}-${slashMatch[2].padStart(2,'0')}`;
    return result;
  }
  return result;
}

function toISO(month,day,year) {
  const months={jan:1,feb:2,mar:3,apr:4,april:4,may:5,jun:6,june:6,jul:7,july:7,aug:8,sep:9,sept:9,oct:10,nov:11,dec:12};
  const m=months[month.toLowerCase().slice(0,3)]||parseInt(month);
  return `${year}-${String(m).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}

function convertTo24(timeStr) {
  const match=timeStr.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
  if(!match) return null;
  let h=parseInt(match[1]), m=match[2];
  if(match[3]) {
    const pm=match[3].toLowerCase()==='pm';
    if(pm&&h<12) h+=12; if(!pm&&h===12) h=0;
  }
  return `${String(h).padStart(2,'0')}:${m}`;
}

// renderBulkPreview and saveBulkTournaments removed -- replaced by unified addTournaments() above

// ─── TOURNAMENT DETAIL + CHECKLIST ──────────────────────────
function tournamentProgressBadge(e) {
  const cl=Array.isArray(e.admin_checklist)?e.admin_checklist:(e.admin_checklist?JSON.parse(e.admin_checklist):[]);
  if(!cl.length) return '';
  const done=cl.filter(c=>c.done).length, total=cl.length, pct=Math.round(done/total*100);
  const color=pct===100?'#30d158':pct>0?'#ff9500':'rgba(255,255,255,0.2)';
  return ` <span style="display:inline-flex;align-items:center;gap:4px;margin-left:6px;font-size:11px;color:${color};font-weight:600"><span style="display:inline-block;width:32px;height:4px;background:rgba(255,255,255,0.1);border-radius:2px;overflow:hidden"><span style="display:block;width:${pct}%;height:100%;background:${color};border-radius:2px"></span></span>${done}/${total}</span>`;
}

function buildTournamentChecklist() {
  return [
    {id:'register',label:'Register team on tournament site',done:false,done_at:null,done_by:null},
    {id:'payment',label:'Submit tournament payment',done:false,done_at:null,done_by:null},
    {id:'rosters',label:'Upload/submit team roster',done:false,done_at:null,done_by:null},
    {id:'proof',label:'Prepare proof of age/grade docs',done:false,done_at:null,done_by:null},
    {id:'travel',label:'Coordinate travel/hotels if needed',done:false,done_at:null,done_by:null},
    {id:'notify',label:'Notify parents of tournament details',done:false,done_at:null,done_by:null},
    {id:'confirm',label:'Confirm registration received',done:false,done_at:null,done_by:null}
  ];
}

function openTournamentDetail(id) {
  const e=allCalEvents.find(x=>x.id===id);
  if(!e) return;
  openModal('tournament-detail');
  document.getElementById('modal-title').textContent=e.title||'Tournament';
  const checklist=Array.isArray(e.admin_checklist)?e.admin_checklist:(e.admin_checklist?JSON.parse(e.admin_checklist):[]);
  const doneCount=checklist.filter(c=>c.done).length;
  const total=checklist.length;
  const pct=total?Math.round(doneCount/total*100):0;
  const startFmt=e.start_date?fmtShort(e.start_date):'TBD';
  const endFmt=e.end_date&&e.end_date!==e.start_date?' - '+fmtShort(e.end_date):'';
  const deadlineFmt=e.registration_deadline?fmtShort(e.registration_deadline):null;
  const daysUntil=e.start_date?Math.ceil((new Date(e.start_date)-new Date())/(1000*60*60*24)):null;
  const urgencyColor=daysUntil!==null&&daysUntil<=7?'#ff3b30':daysUntil!==null&&daysUntil<=14?'#ff9500':'var(--muted)';

  let html=`<div style="display:flex;flex-direction:column;gap:16px">`;

  // Header info cards
  html+=`<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px">`;
  html+=`<div style="padding:12px;background:rgba(255,255,255,0.04);border-radius:10px;border:1px solid var(--border)">
    <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px">Date</div>
    <div style="font-weight:700;margin-top:4px">${startFmt}${endFmt}</div>
    ${daysUntil!==null?`<div style="font-size:12px;color:${urgencyColor};margin-top:2px">${daysUntil>0?daysUntil+' days away':daysUntil===0?'Today':'Passed'}</div>`:''}
  </div>`;
  if(e.location) html+=`<div style="padding:12px;background:rgba(255,255,255,0.04);border-radius:10px;border:1px solid var(--border)">
    <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px">Location</div>
    <div style="font-weight:700;margin-top:4px">${e.location}</div>
  </div>`;
  if(e.cost) html+=`<div style="padding:12px;background:rgba(255,255,255,0.04);border-radius:10px;border:1px solid var(--border)">
    <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px">Cost</div>
    <div style="font-weight:700;margin-top:4px">${e.cost}</div>
  </div>`;
  if(e.grade_level) html+=`<div style="padding:12px;background:rgba(255,255,255,0.04);border-radius:10px;border:1px solid var(--border)">
    <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px">Grade</div>
    <div style="font-weight:700;margin-top:4px">${e.grade_level==='both'?'4th + 5th':e.grade_level+' Grade'}</div>
  </div>`;
  if(deadlineFmt) {
    const deadlineDays=Math.ceil((new Date(e.registration_deadline)-new Date())/(1000*60*60*24));
    const dlColor=deadlineDays<=3?'#ff3b30':deadlineDays<=7?'#ff9500':'var(--text)';
    html+=`<div style="padding:12px;background:rgba(255,255,255,0.04);border-radius:10px;border:1px solid var(--border)">
      <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px">Reg. Deadline</div>
      <div style="font-weight:700;margin-top:4px;color:${dlColor}">${deadlineFmt}</div>
      <div style="font-size:12px;color:${dlColor};margin-top:2px">${deadlineDays>0?deadlineDays+' days left':deadlineDays===0?'Today':'Overdue'}</div>
    </div>`;
  }
  html+=`</div>`;

  // Registration status tag
  const registerItem=checklist.find(c=>c.id==='register');
  const isRegistered=registerItem&&registerItem.done;
  if(!isRegistered) {
    html+=`<div style="display:flex;align-items:center;gap:6px;padding:8px 12px;background:rgba(255,59,48,0.1);border:1px solid rgba(255,59,48,0.25);border-radius:8px">
      <span style="color:#ff3b30;font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:0.5px">Not Registered</span>
    </div>`;
  }

  // Checklist section (above details/notes)
  if(checklist.length) {
    html+=`<div style="border:1px solid var(--border);border-radius:10px;overflow:hidden">
      <div style="padding:12px 16px;display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,0.04)">
        <div style="font-weight:700;font-size:14px">To Do</div>
        <div style="display:flex;align-items:center;gap:8px">
          <div style="width:80px;height:6px;background:rgba(255,255,255,0.1);border-radius:3px;overflow:hidden">
            <div style="width:${pct}%;height:100%;background:${pct===100?'#30d158':'var(--accent)'};border-radius:3px;transition:width 0.3s"></div>
          </div>
          <span style="font-size:12px;color:${pct===100?'#30d158':'var(--muted)'};font-weight:600">${doneCount}/${total}</span>
        </div>
      </div>`;
    checklist.forEach((item,idx)=>{
      const doneStyle=item.done?'text-decoration:line-through;color:var(--muted)':'';
      const checkIcon=item.done
        ?'<div style="width:20px;height:20px;border-radius:6px;background:#30d158;display:flex;align-items:center;justify-content:center;flex-shrink:0;cursor:pointer"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg></div>'
        :'<div style="width:20px;height:20px;border-radius:6px;border:2px solid rgba(255,255,255,0.2);flex-shrink:0;cursor:pointer"></div>';
      const doneInfo=item.done&&item.done_at?`<span style="font-size:10px;color:var(--muted);margin-left:8px">${fmtShort(item.done_at.split('T')[0])}</span>`:'';
      html+=`<div style="padding:10px 16px;display:flex;align-items:center;gap:12px;border-top:1px solid var(--border);cursor:pointer;${item.done?'opacity:0.7':''}" id="check-row-${idx}" onclick="toggleTournamentCheck('${e.id}',${idx})">
        ${checkIcon}
        <div style="flex:1;font-size:13px;${doneStyle}">${item.label}${doneInfo}</div>
      </div>`;
    });
    html+=`</div>`;
  } else {
    html+=`<div style="text-align:center;padding:16px;color:var(--muted);font-size:13px">No checklist items. <a href="#" onclick="initTournamentChecklist('${e.id}');return false" style="color:var(--accent)">Add default checklist</a></div>`;
  }

  // Notes / extended details section (below checklist)
  if(e.notes) {
    html+=`<div style="padding:12px;background:rgba(255,255,255,0.04);border-radius:10px;border:1px solid var(--border)">
      <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">Tournament Details</div>
      <div style="font-size:13px;color:var(--text);white-space:pre-line;line-height:1.5">${e.notes}</div>
    </div>`;
  }

  // Registration URL
  if(e.registration_url) {
    html+=`<a href="${e.registration_url}" target="_blank" style="display:block;padding:10px 16px;background:var(--accent);color:#000;border-radius:8px;text-align:center;font-weight:600;font-size:13px;text-decoration:none">Open Registration Page</a>`;
  }

  // Action buttons
  html+=`<div style="display:flex;gap:8px;margin-top:4px">
    <button class="btn btn-ghost btn-sm" style="flex:1" onclick="editCalEvent('${e.id}')">Edit Event</button>
    <button class="btn btn-ghost btn-sm" style="flex:1;color:#ff3b30" onclick="deleteCalEvent('${e.id}');closeModal()">Delete</button>
  </div>`;
  html+=`</div>`;

  document.getElementById('modal-body').innerHTML=html;
}

async function toggleTournamentCheck(eventId, idx) {
  const e=allCalEvents.find(x=>x.id===eventId);
  if(!e) return;
  const checklist=Array.isArray(e.admin_checklist)?[...e.admin_checklist]:(e.admin_checklist?JSON.parse(e.admin_checklist):[]);
  if(!checklist[idx]) return;
  const session=await osSupabase.auth.getSession();
  const userId=session.data.session?.user?.id||null;
  checklist[idx].done=!checklist[idx].done;
  checklist[idx].done_at=checklist[idx].done?new Date().toISOString():null;
  checklist[idx].done_by=checklist[idx].done?userId:null;
  try {
    const {error}=await osSupabase.from('calendar_events').update({admin_checklist:checklist}).eq('id',eventId);
    if(error) throw error;
    e.admin_checklist=checklist;
    openTournamentDetail(eventId); // re-render
  } catch(err) { showToast('Error saving: '+err.message,'error'); }
}

async function initTournamentChecklist(eventId) {
  const checklist=buildTournamentChecklist();
  try {
    const {error}=await osSupabase.from('calendar_events').update({admin_checklist:checklist}).eq('id',eventId);
    if(error) throw error;
    const e=allCalEvents.find(x=>x.id===eventId);
    if(e) e.admin_checklist=checklist;
    openTournamentDetail(eventId);
  } catch(err) { showToast('Error: '+err.message,'error'); }
}

// ─── BLOG ───────────────────────────────────────────────────
async function loadBlog() {
  try { if(osSupabase){ const {data}=await osSupabase.from('blog_posts').select('id,title,status,published_at,excerpt,body,tags').order('created_at',{ascending:false}); BLOG_POSTS=data||[]; } } catch(e){}
  if(!BLOG_POSTS.length) BLOG_POSTS=[{id:'b1',title:'Welcome to the 2026 Season',status:'published',published_at:new Date().toISOString(),excerpt:'Exciting things ahead.',body:'# Welcome\n\nWe are thrilled to kick off another great season!',tags:['news']}];
  renderBlogList();
}
function renderBlogList() {
  document.getElementById('blog-list').innerHTML=BLOG_POSTS.map(p=>`<div onclick="editBlog('${p.id}')" style="padding:10px;border-radius:8px;cursor:pointer;margin-bottom:6px;border:1px solid var(--border)" onmouseover="this.style.background='rgba(255,255,255,.04)'" onmouseout="this.style.background=''"><div style="font-weight:600;font-size:13px;margin-bottom:4px">${p.title}</div>${statusTag(p.status)}</div>`).join('');
}
function newBlogPost() { ['blog-editing-id','blog-title','blog-excerpt','blog-tags','blog-body'].forEach(id=>document.getElementById(id).value=''); document.getElementById('blog-editor-title').textContent='New Post'; }
function editBlog(id) { const p=BLOG_POSTS.find(x=>x.id===id); if(!p) return; document.getElementById('blog-editing-id').value=p.id; document.getElementById('blog-title').value=p.title; document.getElementById('blog-excerpt').value=p.excerpt||''; document.getElementById('blog-tags').value=(p.tags||[]).join(', '); document.getElementById('blog-body').value=p.body||''; document.getElementById('blog-editor-title').textContent='Editing: '+p.title; }
async function saveBlogDraft() { await saveBlog('draft'); }
async function publishBlogPost() { await saveBlog('published'); }
async function saveBlog(status) {
  const id=document.getElementById('blog-editing-id').value;
  const payload={title:document.getElementById('blog-title').value,body:document.getElementById('blog-body').value,excerpt:document.getElementById('blog-excerpt').value,tags:document.getElementById('blog-tags').value.split(',').map(t=>t.trim()).filter(Boolean),status};
  if(!payload.title) return showToast('Title is required','error');
  try {
    if(osSupabase){ if(id){ await osSupabase.from('blog_posts').update(payload).eq('id',id); } else { const {data}=await osSupabase.from('blog_posts').insert({...payload,author_id:(await window.auth.getCurrentUser())?.id}).select('id').single(); if(data) document.getElementById('blog-editing-id').value=data.id; } }
    else { if(id){ const p=BLOG_POSTS.find(x=>x.id===id); if(p) Object.assign(p,payload); } else { BLOG_POSTS.unshift({id:'b'+Date.now(),...payload}); } }
    showToast(status==='published'?'Published to site!':'Draft saved!'); await loadBlog();
  } catch(e){ showToast('Error: '+e.message,'error'); }
}

// ─── MEMOS ──────────────────────────────────────────────────
async function loadMemos() {
  try { if(osSupabase){ const {data}=await osSupabase.from('memo_summary').select('*').order('created_at',{ascending:false}); MEMOS=data||[]; } } catch(e){}
  if(!MEMOS.length) MEMOS=[{id:'m1',subject:'Practice Schedule - Week 2',recipient:'all_coaches',author_name:'Scott G.',created_at:new Date().toISOString(),ack_count:3,body:'Practice at 6pm Tuesday.'}];
  renderMemoList();
}
function renderMemoList() {
  document.getElementById('memos-list').innerHTML=MEMOS.map(m=>`<div onclick="viewMemo('${m.id}')" style="padding:10px;border-radius:8px;cursor:pointer;margin-bottom:6px;border:1px solid var(--border)" onmouseover="this.style.background='rgba(255,255,255,.04)'" onmouseout="this.style.background=''"><div style="font-weight:600;font-size:13px;margin-bottom:4px">${m.subject}</div><div style="display:flex;justify-content:space-between">${statusTag(m.recipient)}<span style="color:var(--muted);font-size:11px">Acks: ${m.ack_count||0}</span></div></div>`).join('');
}
function newMemo() { ['memo-editing-id','memo-subject','memo-body'].forEach(id=>document.getElementById(id).value=''); document.getElementById('memo-acks').innerHTML=''; document.getElementById('memo-editor-title').textContent='New Memo'; }
function viewMemo(id) { const m=MEMOS.find(x=>x.id===id); if(!m) return; document.getElementById('memo-editing-id').value=m.id; document.getElementById('memo-subject').value=m.subject; document.getElementById('memo-body').value=m.body||''; document.getElementById('memo-recipient').value=m.recipient; document.getElementById('memo-editor-title').textContent=m.subject; document.getElementById('memo-acks').innerHTML=`<div style="padding:12px;background:rgba(255,255,255,.03);border-radius:8px"><div style="font-size:12px;font-weight:700;color:var(--muted);margin-bottom:6px">ACKNOWLEDGMENTS</div><div style="font-size:13px">${m.ack_count>0?`${m.ack_count} coaches acknowledged`:'No acknowledgments yet'}</div></div>`; }
async function sendMemo() {
  const id=document.getElementById('memo-editing-id').value;
  const payload={subject:document.getElementById('memo-subject').value,body:document.getElementById('memo-body').value,recipient:document.getElementById('memo-recipient').value};
  if(!payload.subject) return showToast('Subject is required','error');
  try {
    if(osSupabase){ const user=await window.auth.getCurrentUser(); if(id){ await osSupabase.from('memos').update(payload).eq('id',id); } else { await osSupabase.from('memos').insert({...payload,author_id:user?.id}); } }
    else { MEMOS.unshift({id:'m'+Date.now(),...payload,author_name:'Scott G.',created_at:new Date().toISOString(),ack_count:0}); }
    showToast('Memo sent to '+payload.recipient); await loadMemos(); newMemo();
  } catch(e){ showToast('Error: '+e.message,'error'); }
}

// ─── MODAL ──────────────────────────────────────────────────
function openModal(id) {
  const templates = {
    'add-player': `
      <h3 style="font-size:12px;font-weight:700;color:var(--muted);margin-bottom:8px">PLAYER INFO</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div class="field"><label>Player First Name</label><input type="text" id="np-pfirst" placeholder="e.g. Aiden"></div>
        <div class="field"><label>Player Last Name</label><input type="text" id="np-plast" placeholder="e.g. Johnson"></div>
      </div>
      <div class="field"><label>Grade</label><select id="np-grade"><option value="4th">4th</option><option value="5th">5th</option><option value="3rd">3rd</option><option value="6th">6th</option></select></div>
      <hr style="border-color:var(--border);margin:12px 0">
      <h3 style="font-size:12px;font-weight:700;color:var(--muted);margin-bottom:8px">PARENT / GUARDIAN INFO</h3>
      <div class="field"><label>Parent Full Name</label><input type="text" id="np-name" placeholder="e.g. Jane Johnson"></div>
      <div class="field"><label>Parent Email</label><input type="email" id="np-email" placeholder="e.g. jane@email.com"></div>
      <div class="field"><label>Relationship</label><select id="np-rel"><option value="mother">Mother</option><option value="father">Father</option><option value="guardian" selected>Guardian</option><option value="stepparent">Stepparent</option><option value="other">Other</option></select></div>
      <button class="btn btn-primary" style="width:100%;margin-top:8px" onclick="addPlayer()">Add Player & Parent</button>`,
    'record-payment': `<div class="field"><label>Parent Email</label><input type="email" id="rp-email"></div><div class="field"><label>Amount</label><input type="number" id="rp-amount"></div><div class="field"><label>Method</label><select id="rp-method"><option value="venmo">Venmo</option><option value="cash">Cash</option><option value="zelle">Zelle</option><option value="check">Check</option></select></div><button class="btn btn-primary" style="width:100%;margin-top:8px" onclick="recordPaymentByEmail()">Record Payment</button>`,
    'create-event': calEventForm(),
  };
  const titles={'add-player':'Add Player & Parent','record-payment':'Record Payment','create-event':'Create Event','view-player':'Profile Detail','view-broadcast':'Broadcast Detail','edit-event':'Edit Event','day-events':'Day Events','link-parent':'Link Parent','add-event':'New Event'};
  document.getElementById('modal-title').textContent=titles[id]||'';
  if(templates[id]) document.getElementById('modal-body').innerHTML=templates[id];
  document.getElementById('modal-overlay').classList.add('open');
}
function closeModal() { document.getElementById('modal-overlay').classList.remove('open'); }

async function addPlayer() {
  const pFirst=(document.getElementById('np-pfirst')?.value||'').trim();
  const pLast=(document.getElementById('np-plast')?.value||'').trim();
  const grade=document.getElementById('np-grade')?.value||'';
  const parentName=(document.getElementById('np-name')?.value||'').trim();
  const parentEmail=(document.getElementById('np-email')?.value||'').trim().toLowerCase();
  const rel=document.getElementById('np-rel')?.value||'guardian';
  if(!pFirst) return showToast('Player first name is required','error');
  if(!parentEmail) return showToast('Parent email is required','error');
  if(!osSupabase) return;
  try {
    // 1. Create athlete record
    const {data:athlete,error:athErr}=await osSupabase.from('athletes').insert({first_name:pFirst,last_name:pLast||'',grade:grade,enrollment_status:'active'}).select('id').single();
    if(athErr) { showToast('Error creating player: '+athErr.message,'error'); return; }
    // 2. Find or create parent profile
    let profileId;
    const {data:existing}=await osSupabase.from('profiles').select('id').eq('email',parentEmail).maybeSingle();
    if(existing) { profileId=existing.id; }
    else {
      // Insert into profiles (note: may fail on FK if no auth.users row -- fallback to direct insert)
      const {data:newProf,error:profErr}=await osSupabase.from('profiles').insert({email:parentEmail,full_name:parentName,player_name:pFirst+(pLast?' '+pLast:''),grade:grade,role:'parent',approved:true}).select('id').single();
      if(profErr) { showToast('Error creating parent profile: '+profErr.message+'. Parent may need to sign up first.','error'); return; }
      profileId=newProf.id;
    }
    // 3. Link parent to athlete
    const {error:linkErr}=await osSupabase.rpc('link_parent_to_athlete',{p_profile_id:profileId,p_athlete_id:athlete.id,p_relationship:rel,p_is_primary:true});
    if(linkErr) { showToast('Player created but link failed: '+linkErr.message,'error'); }
    else { showToast('Player & parent added!'); }
    closeModal(); loadPlayers();
  } catch(e){ showToast('Error: '+e.message,'error'); }
}
async function recordPaymentByEmail() {
  const email=(document.getElementById('rp-email').value||'').trim().toLowerCase();
  const amount=parseFloat(document.getElementById('rp-amount').value);
  const method=document.getElementById('rp-method').value;
  if(!email||!amount||amount<=0) return showToast('Valid email and amount required','error');
  if(!osSupabase) return;
  try {
    // 1. Find parent profile
    const {data:prof,error:profErr}=await osSupabase.from('profiles').select('id,full_name').eq('email',email).maybeSingle();
    if(profErr||!prof) return showToast('No parent profile found for '+email,'error');
    // 2. Find or create enrollment (uses Full Program / Pay in Full defaults)
    let enrollmentId;
    const {data:enrollment}=await osSupabase.from('parent_dues_enrollment').select('id').eq('parent_email',email).maybeSingle();
    if(enrollment) { enrollmentId=enrollment.id; }
    else {
      // Auto-enroll: Full Program config + Pay in Full template
      const {data:cfg}=await osSupabase.from('season_dues_config').select('id,total_amount').eq('program','Full Program').eq('is_active',true).maybeSingle();
      if(!cfg) return showToast('No active season config found. Create one in Season Dues Config first.','error');
      const {data:plan}=await osSupabase.from('payment_plan_templates').select('id').eq('dues_config_id',cfg.id).eq('plan_name','Pay in Full').maybeSingle();
      if(!plan) return showToast('No Pay in Full plan template found for Full Program.','error');
      const {data:newEnroll,error:enrErr}=await osSupabase.from('parent_dues_enrollment').insert({
        parent_email:email, parent_name:prof.full_name||'', dues_config_id:cfg.id,
        plan_template_id:plan.id, total_owed:cfg.total_amount, total_paid:0, status:'active'
      }).select('id').single();
      if(enrErr) return showToast('Enrollment failed: '+enrErr.message,'error');
      enrollmentId=newEnroll.id;
    }
    // 3. Find next unpaid installment or create one
    let installmentId=null;
    const {data:unpaid}=await osSupabase.from('dues_installments').select('id,amount').eq('enrollment_id',enrollmentId).in('status',['pending','overdue']).order('due_date').limit(1).maybeSingle();
    if(unpaid) { installmentId=unpaid.id; }
    else {
      // Create a one-off installment for this manual payment
      const {data:inst,error:instErr}=await osSupabase.from('dues_installments').insert({
        enrollment_id:enrollmentId, installment_number:1, amount:amount,
        due_date:new Date().toISOString().split('T')[0], status:'pending'
      }).select('id').single();
      if(instErr) return showToast('Installment creation failed: '+instErr.message,'error');
      installmentId=inst.id;
    }
    // 4. Record the payment
    const {error:payErr}=await osSupabase.from('dues_payments').insert({
      enrollment_id:enrollmentId, installment_id:installmentId,
      stripe_payment_intent:'manual_'+method+'_'+Date.now(),
      amount:amount, currency:'usd', status:'succeeded', paid_at:new Date().toISOString()
    });
    if(payErr) return showToast('Payment insert failed: '+payErr.message,'error');
    // 5. Mark installment paid + update enrollment total_paid
    await osSupabase.from('dues_installments').update({status:'paid',paid_at:new Date().toISOString()}).eq('id',installmentId);
    const {data:enr}=await osSupabase.from('parent_dues_enrollment').select('total_paid,total_owed').eq('id',enrollmentId).single();
    if(enr) {
      const newPaid=(parseFloat(enr.total_paid)||0)+amount;
      const newStatus=newPaid>=parseFloat(enr.total_owed)?'paid_in_full':'active';
      await osSupabase.from('parent_dues_enrollment').update({total_paid:newPaid,status:newStatus}).eq('id',enrollmentId);
    }
    showToast(`$${amount} via ${method} recorded!`); closeModal(); loadDues();
  } catch(e){ showToast('Error: '+e.message,'error'); }
}

// ─── EDITOR HELPERS ─────────────────────────────────────────
function fmtEd(pre,post,id) { const t=document.getElementById(id),s=t.selectionStart,e=t.selectionEnd,v=t.value; t.value=v.slice(0,s)+pre+v.slice(s,e)+post+v.slice(e); t.focus(); t.selectionStart=s+pre.length; t.selectionEnd=e+pre.length; }
function fmtEdLine(prefix,id) { const t=document.getElementById(id),s=t.selectionStart,v=t.value; const ls=v.lastIndexOf('\n',s-1)+1; t.value=v.slice(0,ls)+prefix+v.slice(ls); t.focus(); }
// blog
window.fmt = (pre,post) => fmtEd(pre,post,'blog-body');
window.fmtLine = (prefix) => fmtEdLine(prefix,'blog-body');
window.insertTxt = (txt) => { const t=document.getElementById('blog-body'),s=t.selectionStart,v=t.value; t.value=v.slice(0,s)+txt+v.slice(s); t.focus(); };
// memo
window.fmtM = (pre,post) => fmtEd(pre,post,'memo-body');
window.fmtMLine = (prefix) => fmtEdLine(prefix,'memo-body');

function doLogout() { if(window.auth?.logout) window.auth.logout(); else window.location.href='index.html'; }
