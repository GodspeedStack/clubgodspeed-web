/**
 * GODSPEED BASKETBALL. Training log, inside the Coach Portal.
 *
 * The trainer taps the player, the length, the skills he worked on, the drills
 * if he wants, a note if he wants, and Save. That is the whole screen.
 *
 * Every save calls log_training_session, which creates the individual workout
 * and the attendance row, so the hours come off the family's package the same
 * way they always have, and the parent portal shows what was worked on.
 * Saves go through the Development board's write path, so they queue offline.
 *
 * Contract: depends on window.CoachDevBoard (commit, toast, config) and
 * window.CoachHome (scoped roster). No emojis. No em dashes. Sentence case.
 */
(function () {
  'use strict';
  var el = function (id) { return document.getElementById(id); };
  function esc(s) { return (s == null ? '' : String(s)).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function client() { try { return window.auth && typeof window.auth.getSupabaseClient === 'function' ? window.auth.getSupabaseClient() : null; } catch (e) { return null; } }
  var board = function () { return window.CoachDevBoard || null; };
  var LENGTHS = [30, 45, 60, 90];
  var COLORS = { handles: '#0071e3', shooting: '#d92d20', defense: '#0d9488', iq: '#4f46e5', vision: '#7c3aed', offInstincts: '#d97706', defInstincts: '#0f766e', postGame: '#9333ea', stamina: '#b45309', strength: '#57534e', coachability: '#64748b' };

  var state = { athleteId: null, minutes: 60, date: today(), subs: {}, drills: {}, notes: '', q: '', packages: {}, recent: [], showDrills: false, saving: false, loaded: false };

  function today() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function cfg() { var b = board(); return (b && b.state && b.state.cfg) || {}; }
  function subsCfg() { return cfg().subskills || {}; }
  function skillOrder() { var c = cfg(); return (c.skills || Object.keys(subsCfg())).filter(function (k) { return subsCfg()[k]; }); }
  function label(sk) { return ((cfg().skill_labels || {})[sk]) || sk; }
  function subLabel(key) { var p = key.split('.'); var s = (subsCfg()[p[0]] || []).filter(function (x) { return x.key === p[1]; })[0]; return s ? s.label : p[1]; }
  function bank() { var b = board(); return (b && b.state && b.state.bank) || []; }
  function raw() { return window.CoachHome && window.CoachHome.state && window.CoachHome.state.raw; }
  function athletes() {
    var rw = raw(); if (!rw) return [];
    var onRoster = {}; rw.rosters.forEach(function (m) { if (!m.left_at) onRoster[m.athlete_id] = true; });
    return rw.athletes.filter(function (a) { return onRoster[a.id]; }).slice().sort(function (x, y) {
      var px = state.packages[x.id] ? 1 : 0, py = state.packages[y.id] ? 1 : 0; if (px !== py) return py - px;
      return (x.first_name + ' ' + (x.last_name || '')).localeCompare(y.first_name + ' ' + (y.last_name || ''));
    });
  }
  function athlete() { return athletes().filter(function (a) { return a.id === state.athleteId; })[0] || null; }
  function shortName(a) { return (a.first_name + ' ' + (a.last_name || '').charAt(0)).trim(); }
  function fullName(a) { return (a.first_name + ' ' + (a.last_name || '')).trim(); }
  function selectedSubs() { return Object.keys(state.subs).filter(function (k) { return state.subs[k]; }); }
  function selectedDrills() { return Object.keys(state.drills).filter(function (k) { return state.drills[k]; }); }
  function drillsForSelected() {
    var keys = selectedSubs(); if (!keys.length) return [];
    var out = []; bank().forEach(function (d) { var dev = d.develops || []; var hit = keys.filter(function (k) { return dev.indexOf(k) >= 0; }).length; if (hit) out.push({ d: d, hit: hit, primary: keys.indexOf(dev[0]) >= 0 ? 1 : 0 }); });
    out.sort(function (x, y) { return (y.d.core ? 1 : 0) - (x.d.core ? 1 : 0) || y.primary - x.primary || y.hit - x.hit || (x.d.import ? 1 : 0) - (y.d.import ? 1 : 0); });
    return out.slice(0, 12).map(function (x) { return x.d; });
  }
  function fmtDay(iso) { var d = new Date(iso + (iso.length === 10 ? 'T12:00:00' : '')); return isNaN(d) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }

  var CSS = '\
#trainlog-view{font-family:Inter,-apple-system,BlinkMacSystemFont,"Helvetica Neue",sans-serif;color:#1d1d1f;padding-bottom:96px}\
#trainlog-view .tl-lead{background:#fff;border:1px solid #ececf0;border-radius:16px;padding:16px 20px;margin-bottom:14px;box-shadow:0 1px 2px rgba(15,23,42,.04),0 6px 16px rgba(15,23,42,.06);border-left:4px solid #0071e3}\
#trainlog-view .tl-lead h4{margin:0 0 4px;font-size:17px;font-weight:800;letter-spacing:-.01em;text-transform:none}#trainlog-view .tl-lead p{margin:0;font-size:13.5px;color:#6e6e73}\
#trainlog-view .tl-sec{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#0071e3;margin:18px 0 8px;display:flex;align-items:center;gap:10px}#trainlog-view .tl-sec small{font-weight:600;color:#a1a1a6;letter-spacing:0;text-transform:none;font-size:12px}\
#trainlog-view .tl-panel{background:#fff;border:1px solid #ececf0;border-radius:16px;padding:14px 16px;box-shadow:0 1px 2px rgba(15,23,42,.04),0 6px 16px rgba(15,23,42,.06)}\
#trainlog-view .tl-chips{display:flex;flex-wrap:wrap;gap:8px}\
#trainlog-view .tl-chip{display:inline-flex;align-items:center;gap:6px;min-height:40px;padding:0 14px;border-radius:999px;border:1px solid #d9d9de;background:#fff;font-size:14px;font-weight:600;color:#1d1d1f;cursor:pointer;-webkit-tap-highlight-color:transparent}\
#trainlog-view .tl-chip small{font-size:11.5px;font-weight:600;color:#6e6e73}#trainlog-view .tl-chip.on{background:#0071e3;border-color:#0071e3;color:#fff}#trainlog-view .tl-chip.on small{color:#eaf3ff}\
#trainlog-view .tl-chip.pkg::before{content:"";width:7px;height:7px;border-radius:50%;background:#159a52}#trainlog-view .tl-chip.on.pkg::before{background:#fff}\
#trainlog-view .tl-search{width:100%;box-sizing:border-box;height:40px;border:1px solid #d9d9de;border-radius:10px;padding:0 12px;font-size:14px;margin-bottom:10px}\
#trainlog-view .tl-seg{display:inline-flex;gap:6px;flex-wrap:wrap}#trainlog-view .tl-seg button{height:44px;min-width:64px;padding:0 16px;border-radius:12px;border:1px solid #d9d9de;background:#fff;font-size:15px;font-weight:700;color:#1d1d1f;cursor:pointer}#trainlog-view .tl-seg button.on{background:#0071e3;border-color:#0071e3;color:#fff}\
#trainlog-view input[type=date]{height:44px;border:1px solid #d9d9de;border-radius:12px;padding:0 12px;font-size:14px;font-family:inherit;background:#fff;color:#1d1d1f}\
#trainlog-view .tl-row{display:flex;gap:14px;flex-wrap:wrap;align-items:center}\
#trainlog-view .tl-group{padding:10px 0;border-bottom:1px solid #ececf0}#trainlog-view .tl-group:last-child{border-bottom:0}\
#trainlog-view .tl-group b{display:block;font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--gc);margin-bottom:8px}\
#trainlog-view .tl-group .tl-chip{min-height:38px;font-size:13.5px}#trainlog-view .tl-group .tl-chip.on{background:var(--gc);border-color:var(--gc)}\
#trainlog-view textarea{width:100%;box-sizing:border-box;min-height:80px;border:1px solid #d9d9de;border-radius:12px;padding:10px 12px;font-size:14px;font-family:inherit;resize:vertical}\
#trainlog-view .tl-link{background:none;border:0;color:#0071e3;font-weight:600;font-size:13.5px;cursor:pointer;padding:0}\
#trainlog-view .tl-save{position:fixed;left:0;right:0;bottom:0;z-index:40;padding:12px 16px calc(12px + env(safe-area-inset-bottom));background:rgba(255,255,255,.92);backdrop-filter:blur(10px);border-top:1px solid #ececf0;display:flex;gap:10px;align-items:center;justify-content:flex-end}\
#trainlog-view .tl-save .sum{margin-right:auto;font-size:13.5px;color:#6e6e73}#trainlog-view .tl-save .sum b{color:#1d1d1f}\
#trainlog-view .tl-btn{height:48px;padding:0 22px;border-radius:12px;border:1px solid #d9d9de;background:#fff;font-size:15px;font-weight:700;cursor:pointer;color:#1d1d1f}#trainlog-view .tl-btn.primary{background:#0071e3;border-color:#0071e3;color:#fff}#trainlog-view .tl-btn:disabled{opacity:.45;cursor:default}\
#trainlog-view .tl-recent{display:grid;grid-template-columns:auto 1fr auto;gap:2px 12px;align-items:start;padding:10px 0;border-bottom:1px solid #ececf0}#trainlog-view .tl-recent:last-child{border-bottom:0}\
#trainlog-view .tl-recent .d{font-size:12.5px;font-weight:700;color:#6e6e73;white-space:nowrap}#trainlog-view .tl-recent b{font-size:14px;font-weight:700}#trainlog-view .tl-recent p{margin:2px 0 0;font-size:13px;color:#6e6e73}#trainlog-view .tl-recent .m{font-size:12.5px;font-weight:600;color:#a1a1a6;white-space:nowrap}\
#trainlog-view .tl-empty{color:#6e6e73;font-size:13.5px;padding:8px 0}\
@media (min-width:900px){#trainlog-view .tl-save{left:auto;right:24px;bottom:24px;border:1px solid #ececf0;border-radius:16px;box-shadow:0 12px 32px rgba(15,23,42,.14);width:min(560px,calc(100% - 48px))}}';
  function injectCss() { if (el('trainlog-css')) return; var s = document.createElement('style'); s.id = 'trainlog-css'; s.textContent = CSS; document.head.appendChild(s); }

  function html() {
    var b = board(); if (!b || !b.state.loaded) return '<div class="tl-lead"><h4>Loading players and skills...</h4></div>';
    var list = athletes(); var q = state.q.trim().toLowerCase(); if (q) list = list.filter(function (a) { return fullName(a).toLowerCase().indexOf(q) >= 0; });
    var a = athlete(); var pk = a && state.packages[a.id];
    var h = '<div class="tl-lead"><h4>Tap what he worked on. Save. The parent sees it.</h4><p>Player, length, skills. Drills and a note if you want. Hours come off the package by themselves.</p></div>';
    h += '<div class="tl-sec">Player' + (a ? '<small>' + esc(fullName(a)) + (pk ? ', ' + pk.remaining + ' hr left on ' + esc(pk.label) : ', no training package') + '</small>' : '') + '</div><div class="tl-panel">';
    if (athletes().length > 8) h += '<input class="tl-search" type="search" placeholder="Find a player" value="' + esc(state.q) + '">';
    h += '<div class="tl-chips">' + list.map(function (x) { var p = state.packages[x.id]; return '<button type="button" class="tl-chip' + (x.id === state.athleteId ? ' on' : '') + (p ? ' pkg' : '') + '" data-athlete="' + esc(x.id) + '">' + esc(shortName(x)) + (p ? '<small>' + p.remaining + ' hr</small>' : '') + '</button>'; }).join('') + (list.length ? '' : '<div class="tl-empty">No player matches.</div>') + '</div></div>';
    h += '<div class="tl-sec">Length and day</div><div class="tl-panel"><div class="tl-row"><span class="tl-seg">' + LENGTHS.map(function (m) { return '<button type="button" data-min="' + m + '" class="' + (m === state.minutes ? 'on' : '') + '">' + m + ' min</button>'; }).join('') + '</span><input type="date" id="tl-date" value="' + esc(state.date) + '" max="' + esc(today()) + '"></div></div>';
    h += '<div class="tl-sec">Skills he worked on<small>' + (selectedSubs().length ? selectedSubs().length + ' picked' : 'tap all that apply') + '</small></div><div class="tl-panel">';
    skillOrder().forEach(function (sk) {
      if (sk === 'strength') return;
      h += '<div class="tl-group" style="--gc:' + (COLORS[sk] || '#64748b') + '"><b>' + esc(label(sk)) + '</b><div class="tl-chips">' + (subsCfg()[sk] || []).map(function (s) { var k = sk + '.' + s.key; return '<button type="button" class="tl-chip' + (state.subs[k] ? ' on' : '') + '" data-sub="' + esc(k) + '" title="' + esc(s.hint || '') + '">' + esc(s.label) + '</button>'; }).join('') + '</div></div>';
    });
    h += '</div>';
    var cands = drillsForSelected();
    h += '<div class="tl-sec">Drills used<small>optional</small>' + (cands.length && !state.showDrills ? '<button type="button" class="tl-link" id="tl-show-drills">Show ' + cands.length + ' that fit</button>' : '') + '</div>';
    if (state.showDrills || selectedDrills().length) h += '<div class="tl-panel"><div class="tl-chips">' + cands.map(function (d) { return '<button type="button" class="tl-chip' + (state.drills[d.name] ? ' on' : '') + '" data-drill="' + esc(d.name) + '">' + esc(d.name) + '<small>' + esc(d.core ? 'Core ' + d.core : (d.tag || '')) + '</small></button>'; }).join('') + (cands.length ? '' : '<div class="tl-empty">Pick a skill first and the drills that develop it show up here.</div>') + '</div></div>';
    h += '<div class="tl-sec">Note for the parent<small>optional</small></div><div class="tl-panel"><textarea id="tl-notes" maxlength="1000" placeholder="What you saw, what is next. One or two sentences.">' + esc(state.notes) + '</textarea></div>';
    if (a) {
      h += '<div class="tl-sec">Recent sessions<small>' + esc(shortName(a)) + '</small></div><div class="tl-panel">';
      if (!state.recent.length) h += '<div class="tl-empty">No training logged yet for ' + esc(a.first_name) + '.</div>';
      state.recent.forEach(function (r) { h += '<div class="tl-recent"><span class="d">' + esc(fmtDay(r.session_date)) + '</span><div><b>' + esc((r.focus_areas || []).map(subLabel).join(', ') || r.title || 'Training') + '</b>' + (r.session_notes ? '<p>' + esc(r.session_notes) + '</p>' : '') + '</div><span class="m">' + esc(r.duration_minutes || '') + ' min</span></div>'; });
      h += '</div>';
    }
    var ready = a && selectedSubs().length && !state.saving;
    h += '<div class="tl-save"><span class="sum">' + (a ? '<b>' + esc(shortName(a)) + '</b>, ' + state.minutes + ' min, ' + (selectedSubs().length || 'no') + ' skill' + (selectedSubs().length === 1 ? '' : 's') : 'Pick a player') + '</span><button type="button" class="tl-btn" id="tl-clear">Clear</button><button type="button" class="tl-btn primary" id="tl-save"' + (ready ? '' : ' disabled') + '>' + (state.saving ? 'Saving...' : 'Save session') + '</button></div>';
    return h;
  }

  function paint() {
    var v = el('trainlog-view'); if (!v) return;
    var act = document.activeElement; var keepQ = act && act.classList && act.classList.contains('tl-search'); var pos = keepQ ? act.selectionStart : 0;
    v.innerHTML = html();
    v.querySelectorAll('[data-athlete]').forEach(function (b) { b.onclick = function () { pick(b.getAttribute('data-athlete')); }; });
    v.querySelectorAll('[data-min]').forEach(function (b) { b.onclick = function () { state.minutes = +b.getAttribute('data-min'); paint(); }; });
    v.querySelectorAll('[data-sub]').forEach(function (b) { b.onclick = function () { var k = b.getAttribute('data-sub'); state.subs[k] = !state.subs[k]; paint(); }; });
    v.querySelectorAll('[data-drill]').forEach(function (b) { b.onclick = function () { var k = b.getAttribute('data-drill'); state.drills[k] = !state.drills[k]; paint(); }; });
    var sd = el('tl-show-drills'); if (sd) sd.onclick = function () { state.showDrills = true; paint(); };
    var dt = el('tl-date'); if (dt) dt.onchange = function () { state.date = dt.value || today(); };
    var nt = el('tl-notes'); if (nt) nt.oninput = function () { state.notes = nt.value; };
    var q = v.querySelector('.tl-search'); if (q) { q.oninput = function () { state.q = q.value; paint(); }; if (keepQ) { q.focus(); try { q.setSelectionRange(pos, pos); } catch (e) { /* fine */ } } }
    var cl = el('tl-clear'); if (cl) cl.onclick = function () { reset(false); paint(); };
    var sv = el('tl-save'); if (sv) sv.onclick = save;
  }
  function reset(all) { state.subs = {}; state.drills = {}; state.notes = ''; state.showDrills = false; state.minutes = 60; state.date = today(); if (all) { state.athleteId = null; state.recent = []; } }
  async function pick(id) { state.athleteId = state.athleteId === id ? null : id; state.recent = []; paint(); if (state.athleteId) loadRecent(state.athleteId); }
  async function loadRecent(id) {
    var c = client(); if (!c) return;
    try {
      var r = await c.from('training_attendance').select('session_id, training_sessions!inner(session_date, duration_minutes, title, focus_areas, session_notes, session_type)').eq('athlete_id', id).eq('status', 'present').limit(60);
      if (r.error) throw r.error;
      var rows = (r.data || []).map(function (x) { return x.training_sessions; }).filter(function (s) { return s && s.session_type === 'individual_workout'; }).sort(function (a, b) { return (b.session_date || '').localeCompare(a.session_date || ''); }).slice(0, 8);
      if (state.athleteId === id) { state.recent = rows; paint(); }
    } catch (e) { /* offline or not readable; the form still works */ }
  }
  async function loadPackages() {
    var c = client(); if (!c) return;
    try {
      var r = await c.from('training_hours_summary').select('athlete_id, package_label, hours_remaining, purchase_date').order('purchase_date', { ascending: true });
      if (r.error) throw r.error;
      var m = {}; (r.data || []).forEach(function (p) { var cur = m[p.athlete_id]; if (!cur || +p.hours_remaining > 0) m[p.athlete_id] = { label: p.package_label, remaining: Math.round(+p.hours_remaining * 10) / 10 }; });
      state.packages = m;
    } catch (e) { /* offline: no package badges */ }
  }
  async function save() {
    var a = athlete(); var b = board(); if (!a || !b || state.saving) return;
    var subs = selectedSubs(); if (!subs.length) return;
    state.saving = true; paint();
    var r = await b.commit('log_training_session', { p_athlete_id: a.id, p_date: state.date, p_minutes: state.minutes, p_subs: subs, p_drills: selectedDrills(), p_notes: state.notes.trim() || null });
    state.saving = false;
    if (!r.ok) { paint(); b.toast('Could not save: ' + (r.error && r.error.message || 'error')); return; }
    var rem = r.data && r.data.hours_remaining != null ? Math.round(+r.data.hours_remaining * 10) / 10 : null;
    if (rem != null && state.packages[a.id]) state.packages[a.id].remaining = rem;
    b.toast(r.queued ? 'Saved on this device. It sends when you are online.' : shortName(a) + ': ' + state.minutes + ' min logged' + (rem != null && state.packages[a.id] ? ', ' + rem + ' hr left.' : '.'));
    var keep = a.id; reset(true); state.athleteId = keep; paint(); loadRecent(keep); loadPackages().then(paint);
  }

  function ensureView() {
    var v = el('trainlog-view'); if (v) return v;
    var main = document.querySelector('.dashboard-main'); if (!main) return null;
    v = document.createElement('div'); v.id = 'trainlog-view'; v.style.display = 'none';
    var after = main.querySelector('.dashboard-toolbar') || main.querySelector('.dashboard-header');
    if (after && after.nextSibling) main.insertBefore(v, after.nextSibling); else main.appendChild(v);
    return v;
  }
  function open() {
    injectCss(); var v = ensureView(); if (!v) return;
    v.parentNode.querySelectorAll('div[id$="-view"]').forEach(function (x) { if (x !== v) x.style.display = 'none'; });
    document.querySelectorAll('.team-nav-item.active, .segment-btn.active').forEach(function (n) { n.classList.remove('active'); });
    var item = el('trainlog-nav-item'); if (item) item.classList.add('active');
    var tabs = el('view-tabs'); if (tabs) tabs.style.display = 'none';
    var t = el('view-title'); if (t) t.textContent = 'Training log';
    var s = document.querySelector('#coach-dashboard .dashboard-header .text-sub'); if (s) s.textContent = 'What he worked on, for the parent.';
    v.style.display = 'block'; paint();
    var b = board();
    if (b) b.ensureConfig().then(function () { return loadPackages(); }).then(function () { paint(); var s2 = document.querySelector('#coach-dashboard .dashboard-header .text-sub'); if (s2) s2.textContent = 'What he worked on, for the parent.'; var t2 = el('view-title'); if (t2) t2.textContent = 'Training log'; });
    if (window.CoachPortalShell) window.CoachPortalShell.closeDrawer();
  }
  function mountNav() {
    if (el('trainlog-nav-item')) return true;
    var anchor = el('academy-nav'); if (!anchor) return false;
    var a = document.createElement('div');
    a.className = 'team-nav-item'; a.id = 'trainlog-nav-item'; a.setAttribute('role', 'button'); a.tabIndex = 0;
    a.style.cssText = 'display:flex;align-items:center;gap:12px;';
    a.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:.7" aria-hidden="true"><path d="M4 12h4l2-5 4 10 2-5h4"/></svg><span>Training log</span>';
    a.onclick = function () { open(); }; a.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } };
    var dev = el('devboard-nav-item') || el('develop-nav-item');
    if (dev && dev.nextSibling) anchor.insertBefore(a, dev.nextSibling); else anchor.appendChild(a);
    var orig = window.switchTeamView;
    if (typeof orig === 'function' && !orig.__tlWrapped) {
      var w = function () { var v = el('trainlog-view'); if (v) v.style.display = 'none'; a.classList.remove('active'); return orig.apply(this, arguments); };
      w.__tlWrapped = true; window.switchTeamView = w;
    }
    // the Development board hides sibling views when it opens; hide ours when its nav item is used
    var db = el('devboard-nav-item'); if (db && !db.__tlHooked) { db.__tlHooked = true; db.addEventListener('click', function () { a.classList.remove('active'); }); }
    return true;
  }
  document.addEventListener('DOMContentLoaded', function () {
    injectCss();
    var tries = 0;
    var timer = setInterval(function () {
      var d = el('coach-dashboard');
      if (d && d.style.display && d.style.display !== 'none' && el('devboard-nav-item') && mountNav()) clearInterval(timer);
      if (++tries > 140) clearInterval(timer);
    }, 700);
    window.CoachTrainingLog = { open: open, mountNav: mountNav, state: state };
  });
})();
