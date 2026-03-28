// ============================================================
// admin-os.js — Godspeed Admin OS Data Layer
// Tables: profiles, login_requests, season_fees, payments,
//         blog_posts, memos, campaigns, campaign_events
// ============================================================

'use strict';

let osSupabase = null;
let currentPanel = 'dashboard';
let BLOG_POSTS = [];
let MEMOS = [];
let CAMPAIGNS = [];

// ─── EMPTY DEFAULTS (no mock data -- live Supabase only) ───
const MOCK_PROFILES = [];
const MOCK_REQUESTS = [];
const MOCK_DUES = [];
const MOCK_CAMPAIGNS = [];

// ─── INIT ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('topbar-date').textContent = new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
  setTimeout(init, 900);
});

/**
 * Build or retrieve a Supabase client. Falls back to constructing one from
 * the CDN global + SUPABASE_CONFIG (set by env-injector.js).
 */
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
    const isPreview = window.location.search.includes('preview=1');
    osSupabase = isPreview ? null : getOrCreateSupabaseClient();

    if (osSupabase) {
      msg.textContent = 'Verifying session...';
      const { data: { session } } = await osSupabase.auth.getSession();

      if (!session) {
        loading.style.display = 'none';
        loginScreen.style.display = 'flex';
        return;
      }

      msg.textContent = 'Verifying director credentials...';
      const {data, error} = await osSupabase.from('profiles').select('role,approved,full_name,email').eq('id',session.user.id).single();

      if (data?.role === 'director' && data?.approved) {
        document.getElementById('director-name').textContent = data.full_name || 'Director';
        document.getElementById('director-email').textContent = data.email;
        if(document.getElementById('director-initials')) {
            document.getElementById('director-initials').textContent = (data.full_name || 'D').charAt(0).toUpperCase();
        }

        loading.style.display = 'none';
        loginScreen.style.display = 'none';
        await loadDashboard();
        return;
      } else {
        msg.textContent = 'Unauthorized: Director access required.';
        loading.querySelector('h2').style.webkitTextFillColor = '#ef4444';
        setTimeout(async () => {
          await osSupabase.auth.signOut();
          window.location.reload();
        }, 2000);
        return;
      }
    }

    // Offline fallback -- no Supabase client available
    loading.style.display = 'none';
    document.getElementById('director-name').textContent = 'Offline Mode';
    document.getElementById('director-email').textContent = 'No connection';
    await loadDashboard();

  } catch(e) {
    console.error(e);
    loading.style.display = 'none';
    await loadDashboard();
  }
}

// ─── LOGIN HANDLER ──────────────────────────────────────────
window.handleAdminLogin = async function() {
  const email = document.getElementById('admin-email').value;
  const password = document.getElementById('admin-pass').value;
  const btn = document.getElementById('admin-login-btn');
  const errBox = document.getElementById('login-error-box');

  btn.textContent = 'Authenticating...';
  btn.disabled = true;
  errBox.style.display = 'none';

  try {
    // Ensure we have a client (may have been null on first init)
    if (!osSupabase) osSupabase = getOrCreateSupabaseClient();
    if (!osSupabase) throw new Error('Cannot connect to authentication service. Check your network connection.');

    const { error } = await osSupabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    // Auth successful — reload to run init() which checks director status
    window.location.reload();
  } catch (error) {
    let msg = error.message;
    if (msg === 'Invalid login credentials') msg = 'Invalid email or password.';
    errBox.textContent = msg;
    errBox.style.display = 'block';
    btn.textContent = 'Secure Login';
    btn.disabled = false;
  }
};

// ─── PANEL ROUTING ──────────────────────────────────────────
const PANEL_TITLES = {dashboard:'Dashboard',players:'Players & Parents',requests:'Login Requests',dues:'Orders & Dues',comms:'Email / SMS',blog:'Blog Posts',memos:'Coach Memos'};

function switchPanel(id) {
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.sb-link').forEach(b=>b.classList.remove('active'));
  document.getElementById('panel-'+id).classList.add('active');
  event.currentTarget.classList.add('active');
  document.getElementById('panel-title').textContent = PANEL_TITLES[id];
  currentPanel = id;
  const loaders = {players:loadPlayers,requests:loadRequests,dues:loadDues,comms:loadComms,blog:loadBlog,memos:loadMemos};
  if(loaders[id]) loaders[id]();
}

function refreshCurrent() {
  const loaders = {dashboard:loadDashboard,players:loadPlayers,requests:loadRequests,dues:loadDues,comms:loadComms,blog:loadBlog,memos:loadMemos};
  if(loaders[currentPanel]) loaders[currentPanel]();
}

// ─── DASHBOARD ──────────────────────────────────────────────
async function loadDashboard() {
  let profiles = [], requests = [], dues = [];
  try {
    if(osSupabase) {
      const [{data:p},{data:r},{data:d}] = await Promise.all([
        osSupabase.from('profiles').select('*'),
        osSupabase.from('login_requests').select('*').eq('status','pending'),
        osSupabase.from('payment_summary').select('*'),
      ]);
      profiles=p||[]; requests=r||[]; dues=d||[];
    }
  } catch(e) { profiles=MOCK_PROFILES; requests=MOCK_REQUESTS; dues=MOCK_DUES; }
  if(!profiles.length) { profiles=MOCK_PROFILES; requests=MOCK_REQUESTS; dues=MOCK_DUES; }

  const collected = dues.reduce((a,d)=>a+(+d.amount_paid||0),0);
  const outstanding = dues.reduce((a,d)=>a+(+d.balance||0),0);

  document.getElementById('m-members').textContent = profiles.filter(p=>p.approved).length;
  document.getElementById('m-pending').textContent = requests.length;
  document.getElementById('m-collected').textContent = '$'+collected.toFixed(0);
  document.getElementById('m-outstanding').textContent = '$'+outstanding.toFixed(0);
  document.getElementById('pending-badge').textContent = requests.length;

  const pl = document.getElementById('dash-pending-list');
  pl.innerHTML = requests.length ? requests.slice(0,4).map(r=>`
    <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
      <div><div style="font-weight:600;font-size:13px">${r.full_name||r.email}</div><div style="color:var(--muted);font-size:11px">${r.email}</div></div>
      <div style="display:flex;gap:6px">
        <button class="btn btn-green btn-sm" onclick="approveReq('${r.id}','${r.email}')">✓</button>
        <button class="btn btn-danger btn-sm" onclick="denyReq('${r.id}','${r.email}')">✕</button>
      </div>
    </div>`).join('') : '<p style="color:var(--muted);font-size:13px">No pending requests.</p>';

  const dl = document.getElementById('dash-dues-list');
  const unpaid = dues.filter(d=>d.payment_status==='unpaid'||d.payment_status==='partial');
  dl.innerHTML = unpaid.length ? unpaid.slice(0,4).map(d=>`
    <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
      <div><div style="font-weight:600;font-size:13px">${d.full_name}</div><div style="color:var(--muted);font-size:11px">Balance: $${(+d.balance).toFixed(0)}</div></div>
      <span class="tag ${d.payment_status==='partial'?'tag-yellow':'tag-red'}">${d.payment_status}</span>
    </div>`).join('') : '<p style="color:var(--muted);font-size:13px">All dues current!</p>';

  document.getElementById('dash-activity').innerHTML = `
    <p style="color:var(--muted);font-size:13px">No recent activity.</p>`;
}

// ─── PLAYERS ────────────────────────────────────────────────
let allPlayers = [];
async function loadPlayers() {
  try {
    if(osSupabase) {
      const {data} = await osSupabase.from('profiles').select('*').order('full_name');
      allPlayers = data||[];
    }
  } catch(e) {}
  if(!allPlayers.length) allPlayers = MOCK_PROFILES;
  renderPlayers(allPlayers);
}

function renderPlayers(arr) {
  const tb = document.getElementById('players-tbody');
  tb.innerHTML = arr.map(p=>`
    <tr>
      <td><div style="display:flex;align-items:center;gap:10px"><div class="avatar">${(p.full_name||p.email)[0].toUpperCase()}</div><div><div style="font-weight:600">${p.full_name||'—'}</div><div style="color:var(--muted);font-size:11px">${p.role}</div></div></div></td>
      <td>${p.player_name||'—'}</td>
      <td>${p.grade?`<span class="tag tag-purple">${p.grade}</span>`:'—'}</td>
      <td style="color:var(--blue)">${p.email}</td>
      <td style="color:var(--muted)">${p.phone||'—'}</td>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div class="progress-bar" style="width:80px"><div class="progress-fill" style="width:${Math.floor(Math.random()*80+10)}%;background:var(--blue)"></div></div>
          <span style="font-size:11px;color:var(--muted)">${Math.floor(Math.random()*8+1)}</span>
        </div>
      </td>
      <td><span class="tag tag-green">Active</span></td>
      <td><span class="tag ${p.approved?'tag-green':'tag-yellow'}">${p.approved?'Approved':'Pending'}</span></td>
      <td><button class="btn btn-ghost btn-sm" onclick="viewPlayer('${p.id}')">View</button></td>
    </tr>`).join('');
}

function filterPlayers() {
  const q = document.getElementById('player-search').value.toLowerCase();
  renderPlayers(allPlayers.filter(p=>(p.full_name||'').toLowerCase().includes(q)||(p.email||'').toLowerCase().includes(q)||(p.player_name||'').toLowerCase().includes(q)));
}

function viewPlayer(id) {
  const p = allPlayers.find(x=>x.id===id)||MOCK_PROFILES.find(x=>x.id===id);
  if(!p) return;
  openModal('view-player');
  document.getElementById('modal-title').textContent = p.full_name||p.email;
  document.getElementById('modal-body').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px">
      <div><label>Email</label><div style="color:var(--blue)">${p.email}</div></div>
      <div><label>Phone</label><div>${p.phone||'—'}</div></div>
      <div><label>Player Name</label><div>${p.player_name||'—'}</div></div>
      <div><label>Grade</label><div>${p.grade||'—'}</div></div>
      <div><label>Role</label><div><span class="tag tag-purple">${p.role}</span></div></div>
      <div>
        <label>Status</label>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="tag ${p.approved?'tag-green':'tag-yellow'}">${p.approved?'Approved':'Pending'}</span>
          ${!p.approved ? `<button class="btn btn-sm btn-ghost" style="padding:4px 8px;font-size:10px" onclick="approveProfile('${p.id}')">Approve</button>` : ''}
        </div>
      </div>
    </div>
    <div style="border-top:1px solid var(--border);padding-top:16px">
      <label style="margin-bottom:10px;display:block">Record Payment</label>
      <div style="display:flex;gap:8px">
        <input type="number" id="pay-amount" placeholder="Amount $" style="width:140px">
        <select id="pay-method" style="width:160px"><option value="venmo">Venmo</option><option value="cash">Cash</option><option value="zelle">Zelle</option><option value="check">Check</option><option value="cashapp">Cash App</option></select>
        <button class="btn btn-green" onclick="recordPayment('${p.id}')">+ Record</button>
      </div>
    </div>`;
}

async function approveProfile(id) {
  if(!confirm('Force approve this profile directly?')) return;
  try {
    if(osSupabase){ await osSupabase.from('profiles').update({approved:true}).eq('id',id); }
    else { const p=allPlayers.find(x=>x.id===id); if(p) p.approved=true; }
  } catch(e){
    console.error(e);
    alert('Failed to approve profile. Check console for details.');
  }
  closeModal();
  loadPlayers();
}

// ─── LOGIN REQUESTS ──────────────────────────────────────────
let allRequests = [];
async function loadRequests() {
  try {
    if(osSupabase){ const {data}=await osSupabase.from('login_requests').select('*').order('created_at',{ascending:false}); allRequests=data||[]; }
  } catch(e){}
  if(!allRequests.length) allRequests=MOCK_REQUESTS;
  renderRequests(allRequests);
}

function renderRequests(arr) {
  const pending = arr.filter(r=>r.status==='pending');
  document.getElementById('req-count-label').textContent = `${pending.length} pending`;
  document.getElementById('pending-badge').textContent = pending.length;
  const tb = document.getElementById('req-tbody');
  tb.innerHTML = arr.map(r=>{
    const d = new Date(r.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
    const statusCls = {pending:'tag-yellow',approved:'tag-green',denied:'tag-red'}[r.status]||'tag-gray';
    return `<tr>
      <td style="font-weight:600">${r.full_name||'—'}</td>
      <td style="color:var(--blue)">${r.email}</td>
      <td><span class="tag tag-purple">${r.requested_role}</span></td>
      <td>${r.grade||'—'} ${r.player_name?'/ '+r.player_name:''}</td>
      <td style="color:var(--muted);font-size:12px">${d}</td>
      <td style="color:var(--muted);font-size:11px">${r.ip_address||'—'}</td>
      <td>${r.status==='pending'?`<div style="display:flex;gap:6px"><button class="btn btn-green btn-sm" onclick="approveReq('${r.id}','${r.email}')">Approve</button><button class="btn btn-danger btn-sm" onclick="denyReq('${r.id}','${r.email}')">Deny</button></div>`:`<span class="tag ${statusCls}">${r.status}</span>`}</td>
    </tr>`;
  }).join('');
}

async function approveReq(id, email) {
  if(!confirm(`Approve ${email}?`)) return;
  try {
    if(osSupabase){ await osSupabase.rpc('approve_login_request',{request_id:id}); }
    else { const r=allRequests.find(x=>x.id===id); if(r) r.status='approved'; }
  } catch(e){ console.error(e); }
  renderRequests(allRequests);
  await loadDashboard();
  alert(`${email} approved! They can now log in.`);
}

async function denyReq(id, email) {
  const reason = prompt(`Reason for denying ${email}? (optional)`);
  if(reason===null) return;
  try {
    if(osSupabase){ await osSupabase.rpc('deny_login_request',{request_id:id,reason}); }
    else { const r=allRequests.find(x=>x.id===id); if(r) r.status='denied'; }
  } catch(e){ console.error(e); }
  renderRequests(allRequests);
}

// ─── DUES ───────────────────────────────────────────────────
async function loadDues() {
  let dues = [];
  try {
    if(osSupabase){ const {data}=await osSupabase.from('payment_summary').select('*'); dues=data||[]; }
  } catch(e){}
  if(!dues.length) dues=MOCK_DUES;
  const collected=dues.reduce((a,d)=>a+(+d.amount_paid||0),0);
  const outstanding=dues.reduce((a,d)=>a+(+d.balance||0),0);
  const billed=dues.reduce((a,d)=>a+(+d.amount_due||0),0);
  document.getElementById('d-collected').textContent='$'+collected.toFixed(0);
  document.getElementById('d-outstanding').textContent='$'+outstanding.toFixed(0);
  document.getElementById('d-billed').textContent='$'+billed.toFixed(0);
  const clsMap={paid:'tag-green',partial:'tag-yellow',unpaid:'tag-red',waived:'tag-gray'};
  document.getElementById('dues-tbody').innerHTML=dues.map(d=>`
    <tr>
      <td><div style="font-weight:600">${d.full_name}</div><div style="color:var(--muted);font-size:11px">${d.player_name||''}</div></td>
      <td style="color:var(--muted)">${d.season}</td>
      <td>${d.grade?`<span class="tag tag-purple">${d.grade}</span>`:'—'}</td>
      <td>$${(+d.amount_due).toFixed(0)}</td>
      <td style="color:var(--green)">$${(+d.amount_paid).toFixed(0)}</td>
      <td style="color:${+d.balance>0?'var(--red)':'var(--green)'}">$${(+d.balance).toFixed(0)}</td>
      <td style="color:var(--muted)">${d.method||'—'}</td>
      <td><span class="tag ${clsMap[d.payment_status]||'tag-gray'}">${d.payment_status}</span></td>
    </tr>`).join('');
}

async function recordPayment(profileId) {
  const amount = parseFloat(document.getElementById('pay-amount').value);
  const method = document.getElementById('pay-method').value;
  if(!amount||amount<=0) return alert('Enter a valid amount.');
  try {
    if(osSupabase){
      const {data:fee}=await osSupabase.from('season_fees').select('id').eq('profile_id',profileId).single();
      if(fee){ await osSupabase.from('payments').insert({season_fee_id:fee.id,profile_id:profileId,amount,method,status:'confirmed',recorded_by:null}); }
    }
    alert(`$${amount} recorded via ${method}`);
    closeModal(); loadDues();
  } catch(e){ alert('Failed: '+e.message); }
}

// ─── COMMS ──────────────────────────────────────────────────
async function loadComms() {
  try {
    if(osSupabase){ const {data}=await osSupabase.from('campaign_stats').select('*').order('sent_at',{ascending:false}); CAMPAIGNS=data||[]; }
  } catch(e){}
  if(!CAMPAIGNS.length) CAMPAIGNS=MOCK_CAMPAIGNS;
  const avgOpen = CAMPAIGNS.filter(c=>c.open_rate_pct).reduce((a,c)=>a+(+c.open_rate_pct),0)/(CAMPAIGNS.filter(c=>c.open_rate_pct).length||1);
  const avgClick = CAMPAIGNS.filter(c=>c.click_rate_pct).reduce((a,c)=>a+(+c.click_rate_pct),0)/(CAMPAIGNS.filter(c=>c.click_rate_pct).length||1);
  document.getElementById('c-sent').textContent=CAMPAIGNS.filter(c=>c.status==='sent').length;
  document.getElementById('c-open').textContent=avgOpen.toFixed(0)+'%';
  document.getElementById('c-click').textContent=avgClick.toFixed(0)+'%';
  const list=document.getElementById('campaigns-list');
  list.innerHTML=CAMPAIGNS.map(c=>`
    <div onclick="showCampaign('${c.id}')" style="padding:12px;border-radius:8px;cursor:pointer;border:1px solid var(--border);margin-bottom:8px;transition:.15s" onmouseover="this.style.background='rgba(255,255,255,.04)'" onmouseout="this.style.background=''">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div style="font-weight:600;font-size:13px">${c.name}</div>
        <span class="tag ${c.type==='email'?'tag-blue':'tag-green'}">${c.type}</span>
      </div>
      <div style="color:var(--muted);font-size:11px;margin-top:4px">Open rate: <strong style="color:var(--text)">${c.open_rate_pct||0}%</strong></div>
    </div>`).join('');
}

function showCampaign(id) {
  const c=CAMPAIGNS.find(x=>x.id===id); if(!c) return;
  document.getElementById('campaign-detail').innerHTML=`
    <div style="margin-bottom:16px"><div style="font-size:18px;font-weight:700">${c.name}</div><div style="color:var(--muted);font-size:12px">${c.sent_at?'Sent '+new Date(c.sent_at).toLocaleDateString():'Draft'}</div></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px">
      <div class="metric-card blue"><div class="label">Recipients</div><div class="val">${c.total_recipients||0}</div></div>
      <div class="metric-card green"><div class="label">Delivered</div><div class="val">${c.delivered||0}</div></div>
      <div class="metric-card yellow"><div class="label">Opened</div><div class="val">${c.opened||0}</div></div>
      <div class="metric-card purple"><div class="label">Clicked</div><div class="val">${c.clicked||0}</div></div>
    </div>
    <div class="field"><label>Open Rate</label><div class="progress-bar"><div class="progress-fill" style="width:${c.open_rate_pct||0}%;background:var(--yellow)"></div></div><div style="font-size:12px;color:var(--muted);margin-top:4px">${c.open_rate_pct||0}%</div></div>
    <div class="field"><label>Click Rate</label><div class="progress-bar"><div class="progress-fill" style="width:${c.click_rate_pct||0}%;background:var(--purple)"></div></div><div style="font-size:12px;color:var(--muted);margin-top:4px">${c.click_rate_pct||0}%</div></div>`;
}

// ─── BLOG ───────────────────────────────────────────────────
async function loadBlog() {
  try {
    if(osSupabase){ const {data}=await osSupabase.from('blog_posts').select('id,title,status,published_at,excerpt,body,tags').order('created_at',{ascending:false}); BLOG_POSTS=data||[]; }
  } catch(e){}
  if(!BLOG_POSTS.length) BLOG_POSTS=[{id:'b1',title:'Welcome to the 2026 Season',status:'published',published_at:new Date().toISOString(),excerpt:'Exciting things ahead.',body:'# Welcome\n\nWe are thrilled to kick off another great season!',tags:['news','season']}];
  renderBlogList();
}

function renderBlogList() {
  document.getElementById('blog-list').innerHTML=BLOG_POSTS.map(p=>`
    <div onclick="editBlog('${p.id}')" style="padding:10px;border-radius:8px;cursor:pointer;margin-bottom:6px;border:1px solid var(--border)" onmouseover="this.style.background='rgba(255,255,255,.04)'" onmouseout="this.style.background=''">
      <div style="font-weight:600;font-size:13px;margin-bottom:4px">${p.title}</div>
      <span class="tag ${p.status==='published'?'tag-green':p.status==='draft'?'tag-yellow':'tag-gray'}">${p.status}</span>
    </div>`).join('');
}

function newBlogPost() {
  document.getElementById('blog-editing-id').value='';
  document.getElementById('blog-title').value='';
  document.getElementById('blog-excerpt').value='';
  document.getElementById('blog-tags').value='';
  document.getElementById('blog-body').value='';
  document.getElementById('blog-editor-title').textContent='New Post';
}

function editBlog(id) {
  const p=BLOG_POSTS.find(x=>x.id===id); if(!p) return;
  document.getElementById('blog-editing-id').value=p.id;
  document.getElementById('blog-title').value=p.title;
  document.getElementById('blog-excerpt').value=p.excerpt||'';
  document.getElementById('blog-tags').value=(p.tags||[]).join(', ');
  document.getElementById('blog-body').value=p.body||'';
  document.getElementById('blog-editor-title').textContent='Editing: '+p.title;
}

async function saveBlogDraft() {
  await saveBlog('draft');
}

async function publishBlogPost() {
  await saveBlog('published');
}

async function saveBlog(status) {
  const id=document.getElementById('blog-editing-id').value;
  const payload={title:document.getElementById('blog-title').value,body:document.getElementById('blog-body').value,excerpt:document.getElementById('blog-excerpt').value,tags:document.getElementById('blog-tags').value.split(',').map(t=>t.trim()).filter(Boolean),status};
  if(!payload.title) return alert('Title is required.');
  try {
    if(osSupabase){
      if(id){ await osSupabase.from('blog_posts').update(payload).eq('id',id); }
      else { const {data}=await osSupabase.from('blog_posts').insert({...payload,author_id:(await window.auth.getCurrentUser())?.id}).select('id').single(); if(data) document.getElementById('blog-editing-id').value=data.id; }
    } else {
      if(id){ const p=BLOG_POSTS.find(x=>x.id===id); if(p) Object.assign(p,payload); }
      else { BLOG_POSTS.unshift({id:'b'+Date.now(),...payload}); }
    }
    alert(status==='published'?'Published to site!':'Draft saved!');
    await loadBlog();
  } catch(e){ alert('Error: '+e.message); }
}

// ─── MEMOS ──────────────────────────────────────────────────
async function loadMemos() {
  try {
    if(osSupabase){ const {data}=await osSupabase.from('memo_summary').select('*').order('created_at',{ascending:false}); MEMOS=data||[]; }
  } catch(e){}
  if(!MEMOS.length) MEMOS=[{id:'m1',subject:'Practice Schedule - Week 2',recipient:'all_coaches',author_name:'Scott G.',created_at:new Date().toISOString(),ack_count:3,body:'Practice will be at 6pm Tuesday at the main gym.'}];
  renderMemoList();
}

function renderMemoList() {
  document.getElementById('memos-list').innerHTML=MEMOS.map(m=>`
    <div onclick="viewMemo('${m.id}')" style="padding:10px;border-radius:8px;cursor:pointer;margin-bottom:6px;border:1px solid var(--border)" onmouseover="this.style.background='rgba(255,255,255,.04)'" onmouseout="this.style.background=''">
      <div style="font-weight:600;font-size:13px;margin-bottom:4px">${m.subject}</div>
      <div style="display:flex;justify-content:space-between"><span class="tag tag-purple">${m.recipient}</span><span style="color:var(--muted);font-size:11px">Acks: ${m.ack_count||0}</span></div>
    </div>`).join('');
}

function newMemo() {
  document.getElementById('memo-editing-id').value='';
  document.getElementById('memo-subject').value='';
  document.getElementById('memo-body').value='';
  document.getElementById('memo-acks').innerHTML='';
  document.getElementById('memo-editor-title').textContent='New Memo';
}

function viewMemo(id) {
  const m=MEMOS.find(x=>x.id===id); if(!m) return;
  document.getElementById('memo-editing-id').value=m.id;
  document.getElementById('memo-subject').value=m.subject;
  document.getElementById('memo-body').value=m.body||'';
  document.getElementById('memo-recipient').value=m.recipient;
  document.getElementById('memo-editor-title').textContent=m.subject;
  document.getElementById('memo-acks').innerHTML=`<div style="padding:12px;background:rgba(255,255,255,.03);border-radius:8px"><div style="font-size:12px;font-weight:700;color:var(--muted);margin-bottom:6px">ACKNOWLEDGMENTS</div><div style="font-size:13px">${m.ack_count>0?`<span style="color:var(--green)">✓ ${m.ack_count} coaches acknowledged</span>`:'<span style="color:var(--muted)">No acknowledgments yet</span>'}</div></div>`;
}

async function sendMemo() {
  const id=document.getElementById('memo-editing-id').value;
  const payload={subject:document.getElementById('memo-subject').value,body:document.getElementById('memo-body').value,recipient:document.getElementById('memo-recipient').value};
  if(!payload.subject) return alert('Subject is required.');
  try {
    if(osSupabase){
      const user=await window.auth.getCurrentUser();
      if(id){ await osSupabase.from('memos').update(payload).eq('id',id); }
      else { await osSupabase.from('memos').insert({...payload,author_id:user?.id}); }
    } else {
      MEMOS.unshift({id:'m'+Date.now(),...payload,author_name:'Scott G.',created_at:new Date().toISOString(),ack_count:0});
    }
    alert('📋 Memo sent to '+payload.recipient+'!');
    await loadMemos(); newMemo();
  } catch(e){ alert('Error: '+e.message); }
}

// ─── MODAL ──────────────────────────────────────────────────
function openModal(id) {
  const templates = {
    'add-player': `<div class="field"><label>Full Name</label><input type="text" id="np-name"></div><div class="field"><label>Email</label><input type="email" id="np-email"></div><div class="field"><label>Player Name</label><input type="text" id="np-player"></div><div class="field"><label>Grade</label><select id="np-grade"><option>4th</option><option>5th</option></select></div><button class="btn btn-primary" style="width:100%;margin-top:8px" onclick="addPlayer()">Add Player</button>`,
    'record-payment': `<div class="field"><label>Parent Email</label><input type="email" id="rp-email"></div><div class="field"><label>Amount</label><input type="number" id="rp-amount"></div><div class="field"><label>Method</label><select id="rp-method"><option value="venmo">Venmo</option><option value="cash">Cash</option><option value="zelle">Zelle</option><option value="check">Check</option></select></div><button class="btn btn-green" style="width:100%;margin-top:8px" onclick="recordPaymentByEmail()">Record Payment</button>`,
    'new-campaign': `<div class="field"><label>Campaign Name</label><input type="text" id="nc-name"></div><div class="field"><label>Type</label><select id="nc-type"><option value="email">Email</option><option value="sms">SMS</option></select></div><div class="field"><label>Subject (Email only)</label><input type="text" id="nc-subject"></div><div class="field"><label>Body</label><textarea class="editor" id="nc-body" style="min-height:120px;border:1px solid var(--border);border-radius:8px"></textarea></div><button class="btn btn-primary" style="width:100%;margin-top:8px" onclick="saveCampaign()">Save Campaign</button>`,
  };
  document.getElementById('modal-title').textContent = {
    'add-player':'Add Player/Parent','record-payment':'Record Payment','new-campaign':'New Campaign','view-player':'Profile Detail'
  }[id]||'';
  if(templates[id]) document.getElementById('modal-body').innerHTML=templates[id];
  document.getElementById('modal-overlay').classList.add('open');
}

function closeModal() { document.getElementById('modal-overlay').classList.remove('open'); }

async function addPlayer() {
  const payload={email:document.getElementById('np-email').value,full_name:document.getElementById('np-name').value,player_name:document.getElementById('np-player').value,grade:document.getElementById('np-grade').value,role:'parent',approved:false};
  if(!payload.email) return alert('Email required.');
  if(osSupabase){ try { await osSupabase.from('profiles').insert(payload); } catch(e){ alert('Error: '+e.message); return; } }
  alert('Player added!'); closeModal(); loadPlayers();
}

async function recordPaymentByEmail() {
  const email=document.getElementById('rp-email').value;
  const amount=parseFloat(document.getElementById('rp-amount').value);
  const method=document.getElementById('rp-method').value;
  if(!email||!amount) return alert('All fields required.');
  if(osSupabase){
    try {
      const {data:prof}=await osSupabase.from('profiles').select('id').eq('email',email).single();
      if(!prof) return alert('Profile not found for that email.');
      const {data:fee}=await osSupabase.from('season_fees').select('id').eq('profile_id',prof.id).single();
      if(!fee) return alert('No season fee found. Set one up first.');
      await osSupabase.from('payments').insert({season_fee_id:fee.id,profile_id:prof.id,amount,method,status:'confirmed'});
    } catch(e){ alert('Error: '+e.message); return; }
  }
  alert(`$${amount} via ${method} recorded!`); closeModal(); loadDues();
}

async function saveCampaign() {
  const payload={name:document.getElementById('nc-name').value,type:document.getElementById('nc-type').value,subject:document.getElementById('nc-subject').value,body:document.getElementById('nc-body').value,status:'draft',recipient_list:[]};
  if(!payload.name||!payload.body) return alert('Name and body required.');
  if(osSupabase){
    try { const user=await window.auth.getCurrentUser(); await osSupabase.from('campaigns').insert({...payload,sent_by:user?.id}); }
    catch(e){ alert('Error: '+e.message); return; }
  } else { CAMPAIGNS.unshift({id:'c'+Date.now(),...payload,open_rate_pct:0,click_rate_pct:0}); }
  alert('Campaign saved!'); closeModal(); loadComms();
}

// ─── EDITOR HELPERS ─────────────────────────────────────────
function fmt(pre,post) {
  const t=document.getElementById('blog-body');
  const s=t.selectionStart,e=t.selectionEnd,v=t.value;
  t.value=v.slice(0,s)+pre+v.slice(s,e)+post+v.slice(e);
  t.focus(); t.selectionStart=s+pre.length; t.selectionEnd=e+pre.length;
}
function fmtLine(prefix) {
  const t=document.getElementById('blog-body'),s=t.selectionStart,v=t.value;
  const ls=v.lastIndexOf('\n',s-1)+1;
  t.value=v.slice(0,ls)+prefix+v.slice(ls); t.focus();
}
function insertTxt(txt) { const t=document.getElementById('blog-body'),s=t.selectionStart,v=t.value; t.value=v.slice(0,s)+txt+v.slice(s); t.focus(); }
function fmtM(pre,post) {
  const t=document.getElementById('memo-body');
  const s=t.selectionStart,e=t.selectionEnd,v=t.value;
  t.value=v.slice(0,s)+pre+v.slice(s,e)+post+v.slice(e);
  t.focus(); t.selectionStart=s+pre.length; t.selectionEnd=e+pre.length;
}
function fmtMLine(prefix) {
  const t=document.getElementById('memo-body'),s=t.selectionStart,v=t.value;
  const ls=v.lastIndexOf('\n',s-1)+1;
  t.value=v.slice(0,ls)+prefix+v.slice(ls); t.focus();
}

function doLogout() { if(window.auth?.logout) window.auth.logout(); else window.location.href='index.html'; }
