// ============================================================
// admin-os.js — Godspeed Admin OS v3.01
// ============================================================
'use strict';

let osSupabase = null;
let currentPanel = 'dashboard';
let BLOG_POSTS = [], MEMOS = [], CAMPAIGNS = [], allPlayers = [], allRequests = [];
let allInstallments = [], allOrders = [], allBroadcasts = [], allCalEvents = [];
let duesFilter = 'all', ordersFilter = 'all';
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
  const map = {paid:'tag-green',completed:'tag-green',delivered:'tag-green',confirmed:'tag-green',
    pending:'tag-yellow',processing:'tag-yellow',unfulfilled:'tag-yellow',draft:'tag-yellow',
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
const PANEL_TITLES = {dashboard:'Dashboard',players:'Players & Parents',requests:'Login Requests',dues:'Season Dues',orders:'Pro Shop Orders',comms:'Messaging',dataEntry:'Data Entry',calendar:'Calendar',blog:'Blog Posts',memos:'Coach Memos'};

function switchPanel(id, btn) {
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.sb-link').forEach(b=>b.classList.remove('active'));
  const panel = document.getElementById('panel-'+id);
  if(panel) panel.classList.add('active');
  if(btn) btn.classList.add('active');
  document.getElementById('panel-title').textContent = PANEL_TITLES[id]||id;
  currentPanel = id;
  const loaders = {players:loadPlayers,requests:loadRequests,dues:loadDues,orders:loadOrders,comms:loadComms,dataEntry:loadDataEntry,calendar:loadCalendar,blog:loadBlog,memos:loadMemos};
  if(loaders[id]) loaders[id]();
}

function refreshCurrent() {
  const loaders = {dashboard:loadDashboard,players:loadPlayers,requests:loadRequests,dues:loadDues,orders:loadOrders,comms:loadComms,calendar:loadCalendar,blog:loadBlog,memos:loadMemos};
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
        osSupabase.from('payment_summary').select('*'),
      ]);
      profiles=p.data||[]; requests=r.data||[]; dues=d.data||[];
    }
  } catch(e){}
  const collected=dues.reduce((a,d)=>a+(+d.amount_paid||0),0);
  const outstanding=dues.reduce((a,d)=>a+(+d.balance||0),0);
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

// ─── PLAYERS ────────────────────────────────────────────────
async function loadPlayers() {
  try { if(osSupabase){ const {data}=await osSupabase.from('profiles').select('*').order('full_name'); allPlayers=data||[]; } } catch(e){}
  renderPlayers(allPlayers);
}
function renderPlayers(arr) {
  document.getElementById('players-tbody').innerHTML=arr.map(p=>`<tr>
    <td><div style="display:flex;align-items:center;gap:10px"><div class="avatar">${(p.full_name||p.email)[0].toUpperCase()}</div><div><div style="font-weight:600">${p.full_name||'--'}</div><div style="color:var(--muted);font-size:11px">${p.role}</div></div></div></td>
    <td>${p.player_name||'--'}</td><td>${p.grade?statusTag(p.grade):'--'}</td><td style="color:var(--muted)">${p.email}</td>
    <td style="color:var(--muted)">${p.phone||'--'}</td><td style="color:var(--muted)">--</td><td>${statusTag('Active')}</td>
    <td>${statusTag(p.approved?'Approved':'Pending')}</td>
    <td><button class="btn btn-ghost btn-xs" onclick="viewPlayer('${p.id}')">View</button></td></tr>`).join('');
}
function filterPlayers() {
  const q=document.getElementById('player-search').value.toLowerCase();
  renderPlayers(allPlayers.filter(p=>(p.full_name||'').toLowerCase().includes(q)||(p.email||'').toLowerCase().includes(q)||(p.player_name||'').toLowerCase().includes(q)));
}
function viewPlayer(id) {
  const p=allPlayers.find(x=>x.id===id); if(!p) return;
  openModal('view-player');
  document.getElementById('modal-title').textContent=p.full_name||p.email;
  document.getElementById('modal-body').innerHTML=`
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px">
      <div><label style="font-size:11px;color:var(--muted)">Email</label><div style="margin-top:4px">${p.email}</div></div>
      <div><label style="font-size:11px;color:var(--muted)">Phone</label><div style="margin-top:4px">${p.phone||'--'}</div></div>
      <div><label style="font-size:11px;color:var(--muted)">Player</label><div style="margin-top:4px">${p.player_name||'--'}</div></div>
      <div><label style="font-size:11px;color:var(--muted)">Grade</label><div style="margin-top:4px">${p.grade||'--'}</div></div>
      <div><label style="font-size:11px;color:var(--muted)">Role</label><div style="margin-top:4px">${statusTag(p.role)}</div></div>
      <div><label style="font-size:11px;color:var(--muted)">Status</label><div style="margin-top:4px;display:flex;align-items:center;gap:8px">${statusTag(p.approved?'Approved':'Pending')}${!p.approved?`<button class="btn btn-ghost btn-xs" onclick="approveProfile('${p.id}')">Approve</button>`:''}</div></div>
    </div>`;
}
async function approveProfile(id) {
  if(!confirm('Force approve this profile?')) return;
  try { if(osSupabase) await osSupabase.from('profiles').update({approved:true}).eq('id',id); } catch(e){ showToast('Failed: '+e.message,'error'); return; }
  closeModal(); showToast('Profile approved'); loadPlayers();
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
      <td>${r.status==='pending'?`<div style="display:flex;gap:6px"><button class="btn btn-ghost btn-xs" style="color:#34c759" onclick="approveReq('${r.id}','${r.email}')">Approve</button><button class="btn btn-ghost btn-xs" style="color:#ff3b30" onclick="denyReq('${r.id}','${r.email}')">Deny</button></div>`:statusTag(r.status)}</td></tr>`;
  }).join('');
}
async function approveReq(id, email) {
  if(!confirm(`Approve ${email}?`)) return;
  try {
    if(osSupabase) {
      await osSupabase.rpc('approve_login_request',{request_id:id});
      // Trigger welcome email
      try { await osSupabase.functions.invoke('send-welcome-email'); } catch(e){ console.warn('Welcome email invoke failed:',e); }
    }
  } catch(e){ console.error(e); }
  renderRequests(allRequests); await loadDashboard();
  showToast(`${email} approved! They can now log in.`);
}
async function denyReq(id, email) {
  const reason=prompt(`Reason for denying ${email}? (optional)`);
  if(reason===null) return;
  try { if(osSupabase) await osSupabase.rpc('deny_login_request',{request_id:id,reason}); } catch(e){ console.error(e); }
  renderRequests(allRequests);
}

// ─── SEASON DUES ────────────────────────────────────────────
async function loadDues() {
  try {
    if(osSupabase) {
      const {data,error}=await osSupabase.from('dues_installments').select(`id,amount,due_date,status,paid_at,enrollment:parent_dues_enrollment!enrollment_id(id,user:profiles!user_id(full_name,email))`).order('due_date',{ascending:true});
      if(!error) allInstallments=data||[];
      else { // fallback to payment_summary
        const {data:d}=await osSupabase.from('payment_summary').select('*');
        allInstallments=(d||[]).map((r,i)=>({id:r.id||i,amount:r.amount_due,due_date:null,status:r.payment_status==='paid'?'paid':r.payment_status,paid_at:null,enrollment:{user:{full_name:r.full_name,email:r.email||''}}}));
      }
    }
  } catch(e){ console.error('Dues load:',e); }
  renderDues();
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
    <td style="font-weight:600">${inst.enrollment?.user?.full_name||'--'}</td><td style="color:var(--muted)">--</td>
    <td>#${idx+1}</td><td>$${(+inst.amount||0).toFixed(0)}</td><td style="color:var(--muted)">${fmtShort(inst.due_date)}</td>
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
function renderRoster(prefix,roster) {
  if(prefix==='de') {
    document.getElementById('de-attendance').innerHTML=roster.map(a=>`
      <label class="attendance-item" onclick="this.classList.toggle('checked')">
        <input type="checkbox" value="${a.id}" checked> ${a.name}
      </label>`).join('');
  } else if(prefix==='gm') {
    const statCols=['MIN','PTS','FGM','FGA','3PM','3PA','FTM','FTA','OREB','DREB','AST','STL','BLK','TO','PF'];
    document.getElementById('gm-stats-grid').innerHTML=`<table><thead><tr><th style="text-align:left">Player</th>${statCols.map(c=>`<th>${c}</th>`).join('')}</tr></thead><tbody>${roster.map(a=>`<tr><td style="text-align:left;font-weight:600;white-space:nowrap">${a.name}</td>${statCols.map(c=>`<td><input type="number" min="0" value="0" data-athlete="${a.id}" data-stat="${c.toLowerCase()}"></td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }
}
function toggleAllAttendance(check) {
  document.querySelectorAll('#de-attendance input[type=checkbox]').forEach(cb=>{cb.checked=check; cb.closest('.attendance-item').classList.toggle('checked',check);});
}
function clearAllStats() {
  document.querySelectorAll('#gm-stats-grid input[type=number]').forEach(i=>i.value='0');
}
async function submitTrainingSession() {
  const teamId=document.getElementById('de-team').value;
  const sessionType=document.getElementById('de-session-type').value;
  const date=document.getElementById('de-date').value;
  const startTime=document.getElementById('de-start-time').value;
  const endTime=document.getElementById('de-end-time').value;
  const location=document.getElementById('de-location').value;
  const notes=document.getElementById('de-notes').value;
  if(!teamId||!date||!startTime||!endTime) return showToast('Team, date, and times are required','error');
  const cbs=document.querySelectorAll('#de-attendance input[type=checkbox]');
  if(!cbs.length) return showToast('Load a roster first','error');
  const attendance=[];
  cbs.forEach(cb=>attendance.push({athlete_id:cb.value,status:cb.checked?'present':'absent'}));
  if(!attendance.some(a=>a.status==='present')) return showToast('At least one athlete must be present','error');
  try {
    if(osSupabase) {
      const session=await osSupabase.auth.getSession();
      const {error}=await osSupabase.rpc('log_training_session',{p_team_id:teamId,p_session_type:sessionType,p_session_date:date,p_start_time:startTime,p_end_time:endTime,p_location:location,p_notes:notes,p_coach_id:session.data.session.user.id,p_attendance:JSON.stringify(attendance)});
      if(error) throw error;
    }
    showToast('Training session logged. Calendar event created.');
  } catch(e){ showToast('Error: '+e.message,'error'); }
}
async function submitGame() {
  const teamId=document.getElementById('gm-team').value;
  const opponent=document.getElementById('gm-opponent').value;
  const gameDate=document.getElementById('gm-date').value;
  const gameTime=document.getElementById('gm-time').value;
  const location=document.getElementById('gm-location').value;
  const gameType=document.getElementById('gm-type').value;
  const teamScore=document.getElementById('gm-team-score').value;
  const oppScore=document.getElementById('gm-opp-score').value;
  const season=document.getElementById('gm-season').value;
  if(!teamId||!opponent||!gameDate||!gameType) return showToast('Team, opponent, date, and type required','error');
  const stats=[];
  const rows=document.querySelectorAll('#gm-stats-grid tbody tr');
  rows.forEach(row=>{
    const inputs=row.querySelectorAll('input[type=number]');
    if(!inputs.length) return;
    const athleteId=inputs[0].dataset.athlete;
    const s={athlete_id:athleteId};
    inputs.forEach(inp=>{ s[inp.dataset.stat]=parseInt(inp.value)||0; });
    stats.push(s);
  });
  try {
    if(osSupabase) {
      const session=await osSupabase.auth.getSession();
      const {error}=await osSupabase.rpc('log_game',{p_team_id:teamId,p_opponent_name:opponent,p_game_date:gameDate,p_game_time:gameTime||null,p_location:location,p_team_score:teamScore?parseInt(teamScore):null,p_opponent_score:oppScore?parseInt(oppScore):null,p_game_type:gameType,p_season:season,p_coach_id:session.data.session.user.id,p_player_stats:JSON.stringify(stats)});
      if(error) throw error;
    }
    showToast('Game logged. Calendar event created.');
  } catch(e){ showToast('Error: '+e.message,'error'); }
}

// ─── CALENDAR ───────────────────────────────────────────────
async function loadCalendar() {
  const start=new Date(calYear,calMonth,1), end=new Date(calYear,calMonth+1,0);
  try {
    if(osSupabase) {
      const {data}=await osSupabase.from('calendar_events').select('*').gte('event_date',start.toISOString().split('T')[0]).lte('event_date',end.toISOString().split('T')[0]).order('event_date',{ascending:true});
      allCalEvents=data||[];
    }
  } catch(e){ console.error('Calendar load:',e); }
  renderCalendar();
}
function calNav(dir) { calMonth+=dir; if(calMonth>11){calMonth=0;calYear++;} if(calMonth<0){calMonth=11;calYear--;} loadCalendar(); }
function setCalView(v) {
  calView=v;
  document.getElementById('cal-view-month').style.opacity=v==='month'?'1':'0.5';
  document.getElementById('cal-view-list').style.opacity=v==='list'?'1':'0.5';
  renderCalendar();
}
function renderCalendar() {
  const label=new Date(calYear,calMonth).toLocaleDateString('en-US',{month:'long',year:'numeric'});
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
    dayEvents.slice(0,3).forEach(e=>html+=`<div class="cal-event ${e.event_type||'other'}" onclick="event.stopPropagation();editCalEvent('${e.id}')">${e.title||'Event'}</div>`);
    if(dayEvents.length>3) html+=`<div style="font-size:10px;color:var(--muted)">+${dayEvents.length-3} more</div>`;
    html+='</div>';
  }
  const remaining=7-((startDay+totalDays)%7); if(remaining<7) for(let i=0;i<remaining;i++) html+=`<div class="cal-day other-month"></div>`;
  html+='</div>';
  document.getElementById('cal-container').innerHTML=html;
}
function renderCalList() {
  document.getElementById('cal-container').innerHTML=`<div class="card"><table><thead><tr><th>Date</th><th>Time</th><th>Title</th><th>Type</th><th>Location</th><th>Actions</th></tr></thead><tbody>${allCalEvents.length?allCalEvents.map(e=>`<tr>
    <td>${fmtShort(e.event_date)}</td><td style="color:var(--muted)">${e.start_time||'--'}</td><td style="font-weight:600">${e.title}</td>
    <td>${statusTag(e.event_type||'other')}</td><td style="color:var(--muted)">${e.location||'--'}</td>
    <td><button class="btn btn-ghost btn-xs" onclick="editCalEvent('${e.id}')">Edit</button><button class="btn btn-ghost btn-xs" style="color:#ff3b30" onclick="deleteCalEvent('${e.id}')">Delete</button></td>
  </tr>`).join(''):'<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:32px">No events this month</td></tr>'}</tbody></table></div>`;
}
function showDayEvents(dateStr) {
  const dayEvents=allCalEvents.filter(e=>e.event_date===dateStr);
  openModal('day-events');
  document.getElementById('modal-title').textContent='Events on '+fmtShort(dateStr);
  document.getElementById('modal-body').innerHTML=dayEvents.length?dayEvents.map(e=>`
    <div style="padding:12px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px">
      <div style="font-weight:700">${e.title}</div>
      <div style="color:var(--muted);font-size:12px;margin-top:4px">${e.start_time||''} ${e.end_time?'- '+e.end_time:''} ${e.location?'| '+e.location:''}</div>
      ${e.source_type?`<div style="font-size:11px;color:var(--muted);margin-top:4px">Auto-created from ${e.source_type}</div>`:''}
    </div>`).join(''):'<p style="color:var(--muted)">No events on this day.</p>';
}
function editCalEvent(id) {
  const e=allCalEvents.find(x=>x.id===id); if(!e) return;
  openModal('edit-event');
  document.getElementById('modal-title').textContent='Edit Event';
  document.getElementById('modal-body').innerHTML=calEventForm(e);
}
async function deleteCalEvent(id) {
  if(!confirm('Delete this event?')) return;
  try { if(osSupabase) await osSupabase.from('calendar_events').delete().eq('id',id); showToast('Event deleted'); loadCalendar(); }
  catch(e){ showToast('Error: '+e.message,'error'); }
}
function calEventForm(e={}) {
  return `<div class="field"><label>Title</label><input type="text" id="ev-title" value="${e.title||''}"></div>
    <div class="grid2"><div class="field"><label>Type</label><select id="ev-type"><option value="practice" ${e.event_type==='practice'?'selected':''}>Practice</option><option value="game" ${e.event_type==='game'?'selected':''}>Game</option><option value="meeting" ${e.event_type==='meeting'?'selected':''}>Meeting</option><option value="deadline" ${e.event_type==='deadline'?'selected':''}>Deadline</option><option value="other" ${e.event_type==='other'?'selected':''}>Other</option></select></div>
    <div class="field"><label>Date</label><input type="date" id="ev-date" value="${e.event_date||''}"></div>
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
  const payload={p_id:id||null,p_title:document.getElementById('ev-title').value,p_event_type:document.getElementById('ev-type').value,p_event_date:document.getElementById('ev-date').value,p_start_time:document.getElementById('ev-start').value||null,p_end_time:document.getElementById('ev-end').value||null,p_location:document.getElementById('ev-location').value,p_description:document.getElementById('ev-desc').value};
  if(!payload.p_title||!payload.p_event_date) return showToast('Title and date required','error');
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
    'add-player': `<div class="field"><label>Full Name</label><input type="text" id="np-name"></div><div class="field"><label>Email</label><input type="email" id="np-email"></div><div class="field"><label>Player Name</label><input type="text" id="np-player"></div><div class="field"><label>Grade</label><select id="np-grade"><option>4th</option><option>5th</option></select></div><button class="btn btn-primary" style="width:100%;margin-top:8px" onclick="addPlayer()">Add Player</button>`,
    'record-payment': `<div class="field"><label>Parent Email</label><input type="email" id="rp-email"></div><div class="field"><label>Amount</label><input type="number" id="rp-amount"></div><div class="field"><label>Method</label><select id="rp-method"><option value="venmo">Venmo</option><option value="cash">Cash</option><option value="zelle">Zelle</option><option value="check">Check</option></select></div><button class="btn btn-primary" style="width:100%;margin-top:8px" onclick="recordPaymentByEmail()">Record Payment</button>`,
    'create-event': calEventForm(),
  };
  const titles={'add-player':'Add Player/Parent','record-payment':'Record Payment','create-event':'Create Event','view-player':'Profile Detail','view-broadcast':'Broadcast Detail','edit-event':'Edit Event','day-events':'Day Events'};
  document.getElementById('modal-title').textContent=titles[id]||'';
  if(templates[id]) document.getElementById('modal-body').innerHTML=templates[id];
  document.getElementById('modal-overlay').classList.add('open');
}
function closeModal() { document.getElementById('modal-overlay').classList.remove('open'); }

async function addPlayer() {
  const payload={email:document.getElementById('np-email').value,full_name:document.getElementById('np-name').value,player_name:document.getElementById('np-player').value,grade:document.getElementById('np-grade').value,role:'parent',approved:false};
  if(!payload.email) return showToast('Email required','error');
  if(osSupabase){ try { await osSupabase.from('profiles').insert(payload); } catch(e){ showToast('Error: '+e.message,'error'); return; } }
  showToast('Player added!'); closeModal(); loadPlayers();
}
async function recordPaymentByEmail() {
  const email=document.getElementById('rp-email').value, amount=parseFloat(document.getElementById('rp-amount').value), method=document.getElementById('rp-method').value;
  if(!email||!amount) return showToast('All fields required','error');
  if(osSupabase){ try {
    const {data:prof}=await osSupabase.from('profiles').select('id').eq('email',email).single();
    if(!prof) return showToast('Profile not found','error');
    const {data:fee}=await osSupabase.from('season_fees').select('id').eq('profile_id',prof.id).single();
    if(!fee) return showToast('No season fee found','error');
    await osSupabase.from('payments').insert({season_fee_id:fee.id,profile_id:prof.id,amount,method,status:'confirmed'});
  } catch(e){ showToast('Error: '+e.message,'error'); return; } }
  showToast(`$${amount} via ${method} recorded!`); closeModal(); loadDues();
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
