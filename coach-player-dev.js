/**
 * GODSPEED BASKETBALL. Development board, inside the Coach Portal.
 *
 * The 5-Year Vision, running on live data: every player has a current read
 * (11 skills, four phases, age targets), the two or three skills holding him
 * back, and the Godspeed drills that fix them. The team has its top needs, the
 * read of the week, and work groups for stations. Tuesday and Thursday are
 * generated from the seven blocks with power-ups and the finishing bridge
 * filled from the roster's needs. A coach never goes to find a drill.
 *
 * Model (mirrors the Godspeed 5-Year Command Center, stored in
 * development_config): skills, phases 0 Not started / 1 Foundation /
 * 2 Intermediate / 3 Elite, age_targets per age 9 to 14, prereqs.
 *
 * Contract:
 *   window.CoachDevBoard.open(tab?)   renders into #devboard-view and shows it
 *   Reads: development_config, player_development, program_content
 *   (drills-bank, planner-practice-shape, planner-powerups), coach_profiles
 *   (own row), roster/athletes via window.CoachHome.state.raw.
 *   Writes: only through set_player_skill and set_player_dev_field RPCs, which
 *   allow a coach on his own teams and a director/founder on anyone.
 *   Admin-gated (is_program_admin): rating any team, the Drill bank tab, the
 *   flagged drills, the all-teams gaps view.
 *   No service key. No emojis. No em dashes in copy. Sentence case.
 */
(function () {
  'use strict';
  var el = function (id) { return document.getElementById(id); };
  function esc(s) { return (s == null ? '' : String(s)).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function client() { try { return window.auth && typeof window.auth.getSupabaseClient === 'function' ? window.auth.getSupabaseClient() : null; } catch (e) { return null; } }

  // ---------- fallbacks (the database row wins when it loads) ----------
  var DEFAULT_CFG = {
    skills: ['handles', 'shooting', 'postGame', 'vision', 'defense', 'offInstincts', 'defInstincts', 'iq', 'stamina', 'strength', 'coachability'],
    skill_labels: { handles: 'Handles', shooting: 'Shooting', postGame: 'Post game', vision: 'Vision and passing', defense: 'Defense', offInstincts: 'Offensive instincts', defInstincts: 'Defensive instincts', iq: 'IQ', stamina: 'Stamina', strength: 'Strength', coachability: 'Coachability' },
    phases: ['Not started', 'Foundation', 'Intermediate', 'Elite'],
    prereqs: { shooting: { need: 'handles', needPhase: 2, msg: 'Handles must be Intermediate before Shooting can go Elite' }, vision: { need: 'iq', needPhase: 2, msg: 'IQ must be Intermediate before Vision can go Elite' }, defense: { need: 'stamina', needPhase: 2, msg: 'Stamina must be Intermediate before Defense can go Elite' } },
    age_targets: {}
  };
  // The one read of the week, chosen from the team's top need.
  var READS = {
    handles: ['Closeout read', 'Catch with the ball in the air, feet in the air. Beat the closeout with one dribble, two feet in the paint.'],
    offInstincts: ['Stampede', 'Attack the second defender before he is set. Shoulder to chest, two feet, finish or one pass.'],
    shooting: ['Closeout catch to shot', 'Ball in the air, feet in the air. Shot fake only if his hand is up. Space, catch, see, shoot.'],
    vision: ['Drive, kick, swing', 'The driver makes the low man commit. One pass to the kick, one more to the swing. Nobody holds it.'],
    iq: ['Hand-off read', 'Reject or take the hand-off based on the trail defender. Say the read out loud before the whistle.'],
    postGame: ['Post read', 'Seal on the flight of the ball. Turn to the middle on a single, kick to the shooter on a double.'],
    defense: ['Take-two defender', 'On the drive the low man takes two. The next man rotates. Basket, ball, then weak side.'],
    defInstincts: ['Help and recover', 'One stops the ball, four are in help. Two-hand tag on the roller, recover to your man.'],
    stamina: ['Pace and pass ahead', 'Sprint the lanes, pass ahead to the first open man. Set, run, run.'],
    strength: ['Win the bump', 'Shoulder to chest on every finish. No extended arm. Two feet, then go up strong.'],
    coachability: ['Say it back', 'Every kid names the one thing before we play it live. Eyes on the coach, then eyes up.']
  };
  // Finishing bridge candidates, by drill name pattern, in priority order.
  var FINISH_RX = [/finish through contact/i, /two-foot power/i, /deceleration finish/i, /floater/i, /mikan/i, /rim protection/i];

  var state = { loading: false, loaded: false, error: null, isAdmin: false, myTeams: [], cfg: DEFAULT_CFG, dev: {}, bank: [], shape: null, powerups: null, teamId: null, tab: 'players', q: '', swaps: {} };

  // ---------- data ----------
  async function loadAll() {
    var c = client(); if (!c) throw new Error('no_client');
    var s = await c.auth.getSession();
    if (!s || !s.data || !s.data.session) throw new Error('no_session');
    var uid = s.data.session.user.id; state.uid = uid;
    var r = await Promise.all([
      c.from('development_config').select('key,value'),
      c.from('player_development').select('athlete_id,skills,shoot_sub,post_sub,strength_bench,focus,updated_at'),
      c.from('program_content').select('slug,body').in('slug', ['drills-bank', 'planner-practice-shape', 'planner-powerups']),
      c.from('coach_profiles').select('team_ids').eq('user_id', uid).maybeSingle(),
      c.rpc('is_program_admin')
    ]);
    if (r[0].error) throw new Error('config: ' + r[0].error.message);
    if (r[1].error) throw new Error('development: ' + r[1].error.message);
    if (r[2].error) throw new Error('content: ' + r[2].error.message);
    var cfg = Object.assign({}, DEFAULT_CFG);
    (r[0].data || []).forEach(function (row) { cfg[row.key] = row.value; });
    state.cfg = cfg;
    state.dev = {}; (r[1].data || []).forEach(function (row) { state.dev[row.athlete_id] = row; });
    (r[2].data || []).forEach(function (row) {
      if (row.slug === 'drills-bank') state.bank = (row.body && row.body.drills) || [];
      if (row.slug === 'planner-practice-shape') state.shape = row.body;
      if (row.slug === 'planner-powerups') state.powerups = row.body;
    });
    state.myTeams = (r[3].data && r[3].data.team_ids) || [];
    state.isAdmin = !!(r[4] && r[4].data === true);
  }
  // ---------- offline: snapshot cache, write queue, sync ----------
  // The board keeps a copy of what it last saw on this device and queues every
  // rating or focus change made without a connection. Nothing is dropped: the
  // queue drains, in order, the moment the browser is back online. Session and
  // RLS still decide on the server; the cache only holds what this coach was
  // already allowed to read.
  var CACHE_KEY = 'gs_devboard_cache', QUEUE_KEY = 'gs_devboard_queue';
  var sync = { online: typeof navigator === 'undefined' || navigator.onLine !== false, fromCache: false, cachedAt: null, flushing: false, lastError: null };
  function readJson(k) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function writeJson(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function isNetworkError(e) { var m = String((e && e.message) || e || '').toLowerCase(); return !sync.online || /fetch|network|failed to|load failed|timeout|abort|offline/.test(m); }
  function slimRoster(rw) {
    return { teams: rw.teams.map(function (t) { return { id: t.id, name: t.name, age_group: t.age_group || null }; }),
      rosters: rw.rosters.filter(function (m) { return !m.left_at; }).map(function (m) { return { team_id: m.team_id, athlete_id: m.athlete_id, role: m.role || null, left_at: null }; }),
      athletes: rw.athletes.map(function (a) { return { id: a.id, first_name: a.first_name, last_name: a.last_name || '', jersey_number: a.jersey_number, grade: a.grade || '', enrollment_status: a.enrollment_status, age: ageOf(a) }; }) };
  }
  function snapshot() {
    var rw = liveRaw(); if (!rw) return;
    writeJson(CACHE_KEY, { at: new Date().toISOString(), uid: state.uid || null, cfg: state.cfg, dev: state.dev, bank: state.bank, shape: state.shape, powerups: state.powerups, myTeams: state.myTeams, isAdmin: state.isAdmin, roster: slimRoster(rw) });
  }
  function restoreCache() {
    var c = readJson(CACHE_KEY); if (!c || !c.roster) return false;
    state.cfg = Object.assign({}, DEFAULT_CFG, c.cfg || {}); state.dev = c.dev || {}; state.bank = c.bank || []; state.shape = c.shape; state.powerups = c.powerups; state.myTeams = c.myTeams || []; state.isAdmin = !!c.isAdmin;
    state.cachedRoster = c.roster; sync.fromCache = true; sync.cachedAt = c.at; state.uid = state.uid || c.uid || null;
    replayQueue();
    return true;
  }
  function queue() { return readJson(QUEUE_KEY) || []; }
  function setQueue(q) { writeJson(QUEUE_KEY, q); }
  function enqueue(op) {
    var q = queue().filter(function (x) { return !(x.rpc === op.rpc && x.args.p_athlete_id === op.args.p_athlete_id && (x.args.p_skill || x.args.p_field) === (op.args.p_skill || op.args.p_field)); });
    op.id = Date.now() + '-' + Math.random().toString(36).slice(2, 8); op.at = new Date().toISOString(); op.uid = state.uid || null;
    q.push(op); setQueue(q); paintStatus();
  }
  // Re-apply queued changes on top of a cached snapshot so the board shows what the coach did.
  function replayQueue() {
    queue().forEach(function (op) { var a = op.args; var d = state.dev[a.p_athlete_id] = state.dev[a.p_athlete_id] || { athlete_id: a.p_athlete_id, skills: {} }; if (op.rpc === 'set_player_skill') { d.skills = d.skills || {}; d.skills[a.p_skill] = { p: a.p_phase, r: a.p_rating == null ? 0 : a.p_rating }; } else if (a.p_field === 'focus') d.focus = a.p_value; });
  }
  async function flush() {
    if (sync.flushing || !sync.online) return;
    var q = queue(); if (!q.length) return;
    var c = client(); if (!c) return;
    sync.flushing = true; sync.lastError = null; paintStatus();
    var me = null; try { var ss = await c.auth.getSession(); me = ss && ss.data && ss.data.session ? ss.data.session.user.id : null; } catch (e) { me = null; }
    if (!me) { sync.lastError = 'Sign in again to send ' + q.length + ' saved change' + (q.length > 1 ? 's' : '') + '.'; sync.flushing = false; paintStatus(); return; }
    var mine = q.filter(function (op) { return !op.uid || op.uid === me; }); var others = q.filter(function (op) { return op.uid && op.uid !== me; });
    while (mine.length) {
      var op = mine[0];
      try {
        var r = await c.rpc(op.rpc, op.args);
        if (r.error) throw r.error;
        mine.shift(); q = others.concat(mine); setQueue(q);
      } catch (e) {
        if (isNetworkError(e)) { sync.online = false; break; }              // still no connection: keep everything
        if (/jwt|token|sign in|not authenticated|401/i.test(String(e.message))) { sync.lastError = 'Sign in again to send ' + q.length + ' saved change' + (q.length > 1 ? 's' : '') + '.'; break; }
        mine.shift(); q = others.concat(mine); setQueue(q); toast('One change was refused by the server: ' + (e.message || 'error')); // a rule said no (for example, not your team): drop it, keep going
      }
    }
    sync.flushing = false;
    if (others.length) sync.lastError = others.length + ' saved change' + (others.length > 1 ? 's' : '') + ' belong to another sign-in on this device and will send when that coach signs in.';
    if (!mine.length && sync.online && !others.length) { snapshot(); toast('Everything is synced.'); }
    paintStatus();
  }
  // One write path for the whole board: apply on screen first, send now if we can, queue if we cannot.
  async function commit(rpcName, args) {
    var c = client();
    if (sync.online && c && !queue().length) {
      try { var r = await c.rpc(rpcName, args); if (r.error) throw r.error; snapshot(); return { ok: true, data: r.data }; }
      catch (e) { if (!isNetworkError(e)) return { ok: false, error: e }; sync.online = false; }
    }
    enqueue({ rpc: rpcName, args: args });
    if (sync.online) setTimeout(flush, 50);
    return { ok: true, queued: true };
  }
  function statusHtml() {
    var n = queue().length;
    if (!sync.online) return '<div class="db-status off"><i></i>Offline. Everything you enter is saved on this device' + (n ? ' (' + n + ' change' + (n > 1 ? 's' : '') + ' waiting)' : '') + ' and sends itself when you are back online.' + (sync.cachedAt ? ' Showing the copy from ' + esc(new Date(sync.cachedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })) + '.' : '') + '</div>';
    if (sync.flushing) return '<div class="db-status on"><i></i>Sending ' + n + ' saved change' + (n > 1 ? 's' : '') + '...</div>';
    if (sync.lastError) return '<div class="db-status off"><i></i>' + esc(sync.lastError) + '</div>';
    if (n) return '<div class="db-status on"><i></i>' + n + ' change' + (n > 1 ? 's' : '') + ' waiting to send. <button type="button" class="db-link" id="db-sync-now">Send now</button></div>';
    return '';
  }
  function paintStatus() { var v = el('devboard-view'); if (!v) return; var s = v.querySelector('#db-status'); if (!s) return; s.innerHTML = statusHtml(); var b = s.querySelector('#db-sync-now'); if (b) b.onclick = flush; }
  function goOnline() { sync.online = true; sync.lastError = null; paintStatus(); flush(); if (state.loaded && sync.fromCache) { if (window.CoachHome && window.CoachHome.reload) { try { window.CoachHome.reload(); } catch (e) { /* home decides */ } } refreshFromServer(); } }
  function goOffline() { sync.online = false; paintStatus(); }
  async function refreshFromServer() {
    try { await loadAll(); var tries = 0; while (!liveRaw() && tries++ < 20) { await new Promise(function (r) { setTimeout(r, 250); }); } if (liveRaw()) { state.cachedRoster = null; sync.fromCache = false; } replayQueue(); snapshot(); paint(); } catch (e) { /* stay on the cache */ }
  }
  // Offline entry: no network means no session check, so open the portal from what this device already knows.
  function offlineEntry(probe) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) sync.online = false;
    if (sync.online && !probe) return;
    var role = localStorage.getItem('gba_user_role');
    if (localStorage.getItem('isCoachLoggedIn') !== 'true' || ['coach', 'director', 'founder'].indexOf(role) < 0 || !readJson(CACHE_KEY)) return;
    var d = el('coach-dashboard'); if (d && d.style.display && d.style.display !== 'none') return;
    if (typeof window.enterPortal === 'function') { try { window.enterPortal(role); } catch (e) { /* the portal decides */ } }
  }
  function registerSw() {
    if (!('serviceWorker' in navigator) || location.protocol !== 'https:') return;
    try { navigator.serviceWorker.register('/coach-sw.js?v=1', { scope: '/coach-portal.html' }).catch(function (e) { console.warn('[devboard] offline worker not registered:', e.message); }); } catch (e) { /* older browser */ }
  }

  function liveRaw() { return window.CoachHome && window.CoachHome.state && window.CoachHome.state.raw; }
  function raw() { return liveRaw() || state.cachedRoster || null; }
  function teams() { var rw = raw(); return rw ? rw.teams.slice().sort(function (a, b) { return a.name.localeCompare(b.name); }) : []; }
  function playersOf(teamId) {
    var rw = raw(); if (!rw) return [];
    var byId = {}; rw.athletes.forEach(function (a) { byId[a.id] = a; });
    var out = [];
    rw.rosters.forEach(function (m) { if (m.left_at || m.team_id !== teamId) return; var a = byId[m.athlete_id]; if (a && a.enrollment_status !== 'inactive') out.push(a); });
    out.sort(function (a, b) { return (a.first_name + a.last_name).localeCompare(b.first_name + b.last_name); });
    return out;
  }
  function canEdit(teamId) { return state.isAdmin || state.myTeams.indexOf(teamId) >= 0; }

  // ---------- model ----------
  function ageOf(a) {
    if (typeof a.age === 'number') return a.age;
    if (a.date_of_birth) { var d = new Date(a.date_of_birth + 'T12:00:00'); if (!isNaN(d)) { var n = new Date(); var y = n.getFullYear() - d.getFullYear(); if (n < new Date(n.getFullYear(), d.getMonth(), d.getDate())) y--; return y; } }
    var g = parseInt(String(a.grade || '').replace(/\D/g, ''), 10);
    return g ? g + 6 : 11;
  }
  function targetsFor(age) { var t = state.cfg.age_targets || {}; var k = Math.min(14, Math.max(9, age)); return t[String(k)] || t[String(14)] || {}; }
  function skillOf(a, sk) { var d = state.dev[a.id]; var v = d && d.skills && d.skills[sk]; return v && typeof v === 'object' ? { p: +v.p || 0, r: +v.r || 0 } : { p: 0, r: 0 }; }
  function started(a) { return state.cfg.skills.some(function (sk) { return skillOf(a, sk).p > 0; }); }
  function track(a, sk) { var t = targetsFor(ageOf(a))[sk] || 0; var p = skillOf(a, sk).p; return p > t ? 'ahead' : p === t ? 'on' : 'behind'; }
  function behindCount(a) { var age = ageOf(a); return state.cfg.skills.filter(function (sk) { return skillOf(a, sk).p > 0 && track(a, sk) === 'behind' && (targetsFor(age)[sk] || 0) > 0; }).length; }
  // The needs: skills behind the age target first (biggest gap first), then the lowest phase and rating.
  // Coachability is culture, not a station: it never drives a drill.
  var DRILL_SKILLS = function () { return state.cfg.skills.filter(function (sk) { return sk !== 'coachability'; }); };
  function needsOf(a) {
    var tg = targetsFor(ageOf(a));
    var rows = DRILL_SKILLS().map(function (sk) { var s = skillOf(a, sk); return { skill: sk, p: s.p, r: s.r, target: tg[sk] || 0, gap: Math.max(0, (tg[sk] || 0) - s.p) }; });
    var rated = rows.filter(function (x) { return x.p > 0; });
    if (rated.length) rows = rated; // only what the coach has actually rated; unrated skills are listed separately
    rows.sort(function (x, y) { return y.gap - x.gap || x.p - y.p || x.r - y.r; });
    return rows.slice(0, 3);
  }
  function unrated(a) { return state.cfg.skills.filter(function (sk) { return skillOf(a, sk).p === 0; }); }
  function prereqWarnings(a) {
    var out = []; var pr = state.cfg.prereqs || {};
    Object.keys(pr).forEach(function (sk) { var rule = pr[sk]; if (skillOf(a, sk).p >= 2 && skillOf(a, rule.need).p < rule.needPhase) out.push(rule.msg); });
    return out;
  }
  function visibleBank() { return state.isAdmin ? state.bank : state.bank.filter(function (d) { return !d.review; }); }
  function drillsFor(skill, exclude, limit) {
    var pool = visibleBank().filter(function (d) { return (d.skills || []).indexOf(skill) >= 0 && exclude.indexOf(d.name) < 0; });
    pool.sort(function (x, y) { var xf = x.review ? 1 : 0, yf = y.review ? 1 : 0; var xi = x.skills.indexOf(skill), yi = y.skills.indexOf(skill); return xf - yf || xi - yi || (x.min || 0) - (y.min || 0); });
    return pool.slice(0, limit || 2);
  }
  // Prescribed drills: two per need, no repeats, in need order.
  function prescribe(a) {
    var used = [], out = [];
    needsOf(a).forEach(function (n) { drillsFor(n.skill, used, 1).forEach(function (d) { used.push(d.name); out.push({ need: n.skill, drill: d }); }); });
    return out;
  }
  function teamNeeds(players) {
    var count = {}, phase = {};
    players.forEach(function (a) { needsOf(a).forEach(function (n) { count[n.skill] = (count[n.skill] || 0) + 1; }); state.cfg.skills.forEach(function (sk) { phase[sk] = (phase[sk] || 0) + skillOf(a, sk).p; }); });
    var rows = state.cfg.skills.map(function (sk) { return { skill: sk, players: count[sk] || 0, avg: players.length ? phase[sk] / players.length : 0 }; });
    rows.sort(function (x, y) { return y.players - x.players || x.avg - y.avg; });
    return rows;
  }
  function workGroups(players) {
    var g = {};
    players.forEach(function (a) { var p = prescribe(a)[0]; if (!p) return; var k = p.drill.name; (g[k] = g[k] || { drill: p.drill, need: p.need, players: [] }).players.push(a); });
    return Object.keys(g).map(function (k) { return g[k]; }).sort(function (x, y) { return y.players.length - x.players.length; });
  }
  function gaps(players) {
    var out = [];
    var un = players.filter(function (a) { return !started(a); }).length;
    if (un) out.push(['red', un + (un > 1 ? ' players have' : ' player has') + ' no skills rated yet. Open Rate and click the dots.']);
    var behind = 0; players.forEach(function (a) { behind += behindCount(a); });
    if (behind) out.push(['orange', behind + ' rated skill' + (behind > 1 ? 's' : '') + ' behind age targets across the roster.']);
    var partial = players.filter(function (a) { return started(a) && unrated(a).length; }).length;
    if (partial) out.push(['grey', partial + ' player' + (partial > 1 ? 's' : '') + ' only partly rated.']);
    var pv = 0; players.forEach(function (a) { pv += prereqWarnings(a).length; });
    if (pv) out.push(['red', pv + ' prerequisite warning' + (pv > 1 ? 's' : '') + '. A skill is ahead of the skill it depends on.']);
    var nf = players.filter(function (a) { return !(state.dev[a.id] && state.dev[a.id].focus); }).length;
    if (nf && nf < players.length) out.push(['grey', nf + ' player' + (nf > 1 ? 's' : '') + ' without a coach focus sentence.']);
    if (!out.length && players.length) out.push(['green', 'Every player rated, nobody behind target, no warnings. Keep the reps honest.']);
    return out;
  }
  function label(sk) { return (state.cfg.skill_labels || {})[sk] || sk; }
  function phaseName(p) { return (state.cfg.phases || DEFAULT_CFG.phases)[p] || ''; }
  function initials(a) { return ((a.first_name || '').charAt(0) + (a.last_name || '').charAt(0)).toUpperCase() || '?'; }
  function gradeText(a) { var g = String(a.grade || '').replace(/\D/g, ''); return g ? (g === '1' ? '1st' : g === '2' ? '2nd' : g === '3' ? '3rd' : g + 'th') + ' grade' : ''; }

  // ---------- styles ----------
  var CSS = '\
#devboard-view .db-tabs{display:inline-flex;gap:2px;padding:3px;background:rgba(118,118,128,.12);border-radius:11px;margin:0 0 14px;max-width:100%;overflow-x:auto;scrollbar-width:none}\
#devboard-view .db-tabs::-webkit-scrollbar{display:none}\
#devboard-view .db-tabs button{border:none;background:transparent;color:#6E6E73;font-family:inherit;font-size:13px;font-weight:600;padding:6px 14px;border-radius:8px;cursor:pointer;min-height:32px;min-width:0;text-transform:none;white-space:nowrap}\
#devboard-view .db-tabs button.active{background:#fff;color:#1D1D1F;box-shadow:0 1px 3px rgba(0,0,0,.1)}\
#devboard-view .db-tabs button:focus-visible{outline:2px solid #0071E3;outline-offset:2px}\
#devboard-view .db-bar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:0 0 16px}\
#devboard-view .db-teams{display:inline-flex;gap:6px;flex-wrap:wrap}\
#devboard-view .db-teams button{font:inherit;font-size:13px;font-weight:600;padding:7px 14px;border-radius:999px;border:1px solid rgba(60,60,67,.14);background:#fff;color:#1D1D1F;cursor:pointer;min-height:0;min-width:0;text-transform:none}\
#devboard-view .db-teams button.active{background:#1D1D1F;color:#fff;border-color:#1D1D1F}\
#devboard-view .db-teams button .ro{font-weight:500;color:#A1A1A6;margin-left:4px}\
#devboard-view .db-teams button.active .ro{color:#8E8E93}\
#devboard-view .db-search{font:inherit;font-size:14px;padding:8px 12px;border:1px solid rgba(60,60,67,.18);border-radius:10px;min-height:0;width:200px;margin-left:auto}\
#devboard-view .db-lead{background:#0A0A0A;color:#fff;border-radius:16px;padding:20px 24px;margin:0 0 18px;display:grid;grid-template-columns:1fr auto;gap:18px;align-items:center}\
#devboard-view .db-lead h4{margin:0 0 4px;font-size:17px;font-weight:700;color:#fff;text-transform:none;letter-spacing:-.01em}\
#devboard-view .db-lead p{margin:0;font-size:13.5px;line-height:1.5;color:#C7C7CC;max-width:720px}\
#devboard-view .db-lead .st{display:flex;gap:18px}\
#devboard-view .db-lead .st div{text-align:center}\
#devboard-view .db-lead .st b{display:block;font-size:24px;font-weight:700;color:#FF5722;line-height:1.1}\
#devboard-view .db-lead .st small{font-size:11px;color:#8E8E93;text-transform:uppercase;letter-spacing:.05em;font-weight:600}\
#devboard-view .db-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:14px}\
#devboard-view .db-card{background:#fff;border:1px solid rgba(60,60,67,.07);border-radius:16px;padding:18px 20px;box-shadow:0 1px 2px rgba(15,23,42,.04),0 8px 24px rgba(15,23,42,.05);min-width:0;display:flex;flex-direction:column;gap:12px}\
#devboard-view .db-head{display:flex;align-items:center;gap:12px}\
#devboard-view .db-av{width:38px;height:38px;border-radius:50%;background:#EAF3FF;color:#0060C0;font-size:13px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;flex:0 0 38px}\
#devboard-view .db-head .nm{flex:1;min-width:0}\
#devboard-view .db-head .nm b{display:block;font-size:15px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\
#devboard-view .db-head .nm small{font-size:12px;color:#6E6E73}\
#devboard-view .db-pill{font-size:11px;font-weight:700;padding:4px 9px;border-radius:999px;white-space:nowrap}\
#devboard-view .db-pill.on{background:#E8F8EE;color:#1B7F3B}#devboard-view .db-pill.behind{background:#FFF1E8;color:#C2410C}#devboard-view .db-pill.ahead{background:#EAF3FF;color:#0060C0}#devboard-view .db-pill.none{background:#F2F2F7;color:#6E6E73}\
#devboard-view .db-sec{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#A1A1A6;margin:2px 0 6px}\
#devboard-view .db-need{display:flex;align-items:center;gap:10px;font-size:13.5px;padding:6px 0;border-top:1px solid rgba(60,60,67,.07)}\
#devboard-view .db-need:first-of-type{border-top:none}\
#devboard-view .db-need b{font-weight:600;flex:1;min-width:0}\
#devboard-view .db-dots{display:inline-flex;gap:4px}\
#devboard-view .db-dot{width:10px;height:10px;border-radius:50%;background:#E5E5EA;display:inline-block}\
#devboard-view .db-dot.f{background:#1D1D1F}#devboard-view .db-dot.t{box-shadow:0 0 0 2px #fff,0 0 0 3px #FF5722}\
#devboard-view .db-need small{font-size:12px;color:#6E6E73;white-space:nowrap}\
#devboard-view .db-drill{display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:start;font-size:13px;padding:8px 0;border-top:1px solid rgba(60,60,67,.07)}\
#devboard-view .db-drill:first-of-type{border-top:none}\
#devboard-view .db-drill .k{width:22px;height:22px;border-radius:50%;background:#1D1D1F;color:#fff;font-size:11px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;margin-top:1px}\
#devboard-view .db-drill b{display:block;font-weight:600;font-size:14px;color:#1D1D1F}\
#devboard-view .db-drill span{color:#3A3A3C;line-height:1.45}\
#devboard-view .db-drill .why{display:block;font-size:12px;color:#6E6E73;margin-top:2px}\
#devboard-view .db-drill .mn{font-size:12px;font-weight:600;color:#6E6E73;white-space:nowrap}\
#devboard-view .db-drill.flag b:after{content:"Flagged";font-size:10px;font-weight:700;color:#C2410C;background:#FFF1E8;border-radius:999px;padding:2px 7px;margin-left:8px;vertical-align:middle}\
#devboard-view .db-focus{font-size:13.5px;color:#1D1D1F;background:#F5F5F7;border-radius:10px;padding:10px 12px;line-height:1.45}\
#devboard-view .db-focus.empty{color:#A1A1A6;font-style:normal}\
#devboard-view .db-warn{font-size:12.5px;color:#C2410C;background:#FFF1E8;border-radius:10px;padding:8px 12px}\
#devboard-view .db-foot{display:flex;gap:14px;margin-top:auto;padding-top:4px}\
#devboard-view .db-link{background:none;border:none;padding:0;font:inherit;font-size:13px;font-weight:600;color:#0071E3;cursor:pointer;min-height:0;min-width:0;text-transform:none}\
#devboard-view .db-link:hover{opacity:.7}#devboard-view .db-link:disabled{color:#A1A1A6;cursor:default;opacity:1}\
#devboard-view .db-empty{padding:40px 20px;text-align:center;color:#6E6E73;font-size:14px;background:#fff;border-radius:16px;border:1px dashed rgba(60,60,67,.2)}\
#devboard-view .db-two{display:grid;grid-template-columns:1.2fr 1fr;gap:14px}\
#devboard-view .db-panel{background:#fff;border:1px solid rgba(60,60,67,.07);border-radius:16px;padding:18px 20px;box-shadow:0 1px 2px rgba(15,23,42,.04),0 8px 24px rgba(15,23,42,.05);min-width:0}\
#devboard-view .db-panel h4{margin:0 0 2px;font-size:16px;font-weight:700;text-transform:none;letter-spacing:-.01em}\
#devboard-view .db-panel .in{margin:0 0 12px;font-size:13px;color:#6E6E73}\
#devboard-view .db-rank{display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:center;padding:9px 0;border-top:1px solid rgba(60,60,67,.07);font-size:14px}\
#devboard-view .db-rank:first-of-type{border-top:none}\
#devboard-view .db-rank .k{width:24px;height:24px;border-radius:50%;background:#1D1D1F;color:#fff;font-size:12px;font-weight:700;display:inline-flex;align-items:center;justify-content:center}\
#devboard-view .db-rank .bar{height:6px;border-radius:3px;background:#F2F2F7;margin-top:6px;overflow:hidden}\
#devboard-view .db-rank .bar i{display:block;height:100%;background:#FF5722;border-radius:3px}\
#devboard-view .db-rank small{color:#6E6E73;font-size:12px;white-space:nowrap}\
#devboard-view .db-gap{display:flex;gap:10px;align-items:flex-start;font-size:13.5px;padding:7px 0;line-height:1.45}\
#devboard-view .db-gap i{width:9px;height:9px;border-radius:50%;flex:0 0 9px;margin-top:6px}\
#devboard-view .db-gap.red i{background:#D70015}#devboard-view .db-gap.orange i{background:#FF9500}#devboard-view .db-gap.green i{background:#34C759}#devboard-view .db-gap.grey i{background:#C7C7CC}\
#devboard-view .db-group{padding:10px 0;border-top:1px solid rgba(60,60,67,.07);font-size:13.5px}\
#devboard-view .db-group:first-of-type{border-top:none}\
#devboard-view .db-group b{display:block;font-weight:600;font-size:14px}\
#devboard-view .db-group .who{color:#3A3A3C;margin-top:3px}\
#devboard-view .db-group .cue{color:#6E6E73;font-size:12.5px;margin-top:2px}\
#devboard-view .db-block{display:grid;grid-template-columns:64px 1fr;gap:16px;padding:14px 0;border-top:1px solid rgba(60,60,67,.07)}\
#devboard-view .db-block:first-of-type{border-top:none;padding-top:0}\
#devboard-view .db-block .tm{font-size:15px;font-weight:700;letter-spacing:-.01em}\
#devboard-view .db-block .tm small{display:block;font-size:11px;font-weight:600;color:#A1A1A6;margin-top:2px}\
#devboard-view .db-block h5{margin:0 0 3px;font-size:15px;font-weight:700;text-transform:none}\
#devboard-view .db-block p{margin:0;font-size:13.5px;line-height:1.5;color:#3A3A3C}\
#devboard-view .db-block .nt{font-size:12.5px;color:#6E6E73;margin-top:4px}\
#devboard-view .db-fill{margin-top:8px;display:grid;gap:6px}\
#devboard-view .db-st{display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:start;background:#F5F5F7;border-radius:10px;padding:9px 12px;font-size:13px}\
#devboard-view .db-st .k{font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#FF5722;padding-top:3px;white-space:nowrap}\
#devboard-view .db-st b{display:block;font-weight:600;font-size:13.5px}\
#devboard-view .db-st span{color:#3A3A3C}\
#devboard-view .db-st .who{display:block;font-size:12px;color:#6E6E73;margin-top:2px}\
#devboard-view .db-st .db-link{font-size:12px;padding-top:2px}\
#devboard-view .db-plan-bar{display:flex;gap:10px;align-items:center;margin-bottom:14px;flex-wrap:wrap}\
#devboard-view .db-btn{font:inherit;font-size:13px;font-weight:600;padding:8px 16px;border-radius:999px;border:none;cursor:pointer;min-height:0;min-width:0;text-transform:none;background:#1D1D1F;color:#fff}\
#devboard-view .db-btn.ghost{background:rgba(0,0,0,.05);color:#1D1D1F}\
#devboard-view .db-bk{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:8px 16px;padding:11px 0;border-top:1px solid rgba(60,60,67,.07);font-size:13.5px}\
#devboard-view .db-bk:first-child{border-top:none;padding-top:0}\
#devboard-view .db-bk .nm b{font-weight:600;font-size:14px;margin-right:6px}\
#devboard-view .db-bk .cue{font-size:12.5px;color:#6E6E73;margin-top:2px}\
#devboard-view .db-bk .ch{display:flex;flex-wrap:wrap;gap:4px;align-content:flex-start}\
#devboard-view .db-chip.grp{background:#1D1D1F;color:#fff}\
@media (max-width:700px){#devboard-view .db-bk{grid-template-columns:1fr}}\
#devboard-view .db-chip{display:inline-block;font-size:11px;font-weight:600;background:#F2F2F7;color:#3A3A3C;border-radius:999px;padding:2px 8px;margin:1px 3px 1px 0}\
#devboard-view .db-chip.flag{background:#FFF1E8;color:#C2410C}\
#devboard-view .db-note{font-size:12px;color:#A1A1A6;margin-top:14px}\
#devboard-view .db-status{display:flex;align-items:center;gap:10px;font-size:13px;font-weight:500;border-radius:12px;padding:10px 14px;margin:0 0 14px;line-height:1.45}\
#devboard-view .db-status i{width:9px;height:9px;border-radius:50%;flex:0 0 9px}\
#devboard-view .db-status.off{background:#FFF1E8;color:#9A3412}#devboard-view .db-status.off i{background:#FF5722}\
#devboard-view .db-status.on{background:#EAF3FF;color:#0A3F7A}#devboard-view .db-status.on i{background:#0071E3}\
#devboard-view .db-status .db-link{margin-left:auto;white-space:nowrap}\
#db-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.36);z-index:400;display:flex;align-items:center;justify-content:center;padding:16px}\
#db-backdrop .ra-modal{background:#fff;border-radius:18px;width:min(520px,100%);max-height:92vh;overflow:auto;box-shadow:0 24px 80px rgba(0,0,0,.28);padding:22px 24px}\
#db-backdrop .ra-modal h3{margin:0 0 2px;font-size:18px;font-weight:700;letter-spacing:-.01em;text-transform:none}\
#db-backdrop .ra-sub{margin:0 0 16px;font-size:13px;color:#6E6E73}\
#db-backdrop .ra-hint{font-size:12px;color:#A1A1A6}\
#db-backdrop .ra-field{display:flex;flex-direction:column;gap:5px}#db-backdrop .ra-field label{font-size:12px;font-weight:600;color:#6E6E73}\
#db-backdrop .ra-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:18px}\
#db-backdrop .ra-btn{font:inherit;font-size:14px;font-weight:600;padding:9px 16px;border-radius:999px;border:none;cursor:pointer;min-height:0;min-width:0;text-transform:none}\
#db-backdrop .ra-btn.primary{background:#0071E3;color:#fff}#db-backdrop .ra-btn.primary:disabled{opacity:.55}#db-backdrop .ra-btn.ghost{background:rgba(0,0,0,.05);color:#1D1D1F}\
#db-backdrop .ra-err{margin-top:12px;font-size:13px;color:#D70015;background:#FFF1F0;border-radius:10px;padding:10px 12px;display:none}#db-backdrop .ra-err.on{display:block}\
#db-backdrop .ra-modal.db-rate{width:min(640px,100%)}\
.db-rate .row{display:grid;grid-template-columns:190px auto 1fr auto;gap:12px;align-items:center;padding:8px 0;border-top:1px solid rgba(60,60,67,.07)}\
.db-rate .row:first-of-type{border-top:none}\
.db-rate .row .lb{font-size:14px;font-weight:600}\
.db-rate .row .lb small{display:block;font-size:11px;color:#A1A1A6;font-weight:600}\
.db-rate .ph{display:inline-flex;gap:5px}\
.db-rate .ph button{width:22px;height:22px;border-radius:50%;border:2px solid #D1D1D6;background:#fff;cursor:pointer;min-height:0;min-width:0;padding:0}\
.db-rate .ph button.f{background:#1D1D1F;border-color:#1D1D1F}\
.db-rate .ph button.t{box-shadow:0 0 0 2px #fff,0 0 0 3px #FF5722}\
.db-rate .ph button:disabled{cursor:default;opacity:.6}\
.db-rate .rt{display:flex;gap:2px}\
.db-rate .rt button{flex:1;height:14px;border-radius:3px;border:none;background:#E5E5EA;cursor:pointer;min-height:0;min-width:0;padding:0}\
.db-rate .rt button.f{background:#0071E3}\
.db-rate .rt button:disabled{cursor:default}\
.db-rate .st{font-size:11px;font-weight:700;width:52px;text-align:right}\
.db-rate .st.on{color:#1B7F3B}.db-rate .st.behind{color:#C2410C}.db-rate .st.ahead{color:#0060C0}\
.db-rate textarea{font:inherit;font-size:14px;width:100%;padding:10px 12px;border:1px solid rgba(60,60,67,.18);border-radius:10px;min-height:64px;resize:vertical}\
.db-rate .legend{display:flex;gap:14px;font-size:12px;color:#6E6E73;margin:0 0 10px}\
.db-rate .legend i{display:inline-block;width:10px;height:10px;border-radius:50%;background:#1D1D1F;margin-right:5px;vertical-align:-1px}\
.db-rate .legend i.t{background:#fff;box-shadow:0 0 0 2px #FF5722}\
.db-toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);background:#1D1D1F;color:#fff;font-size:13.5px;font-weight:600;padding:10px 18px;border-radius:999px;z-index:500;box-shadow:0 8px 24px rgba(0,0,0,.25)}\
@media (max-width:960px){#devboard-view .db-two{grid-template-columns:1fr}#devboard-view .db-lead{grid-template-columns:1fr}#devboard-view .db-search{width:100%;margin-left:0}}\
@media (max-width:640px){.db-rate .row{grid-template-columns:1fr auto;grid-template-areas:"lb st" "ph ph" "rt rt";padding:10px 0}.db-rate .row .lb{grid-area:lb}.db-rate .row .st{grid-area:st}.db-rate .row .ph{grid-area:ph}.db-rate .row .rt{grid-area:rt}.db-rate .ph button{width:30px;height:30px}.db-rate .rt button{height:22px}\
#db-backdrop{padding:0;align-items:flex-end}#db-backdrop .ra-modal{border-radius:18px 18px 0 0;max-height:94vh;max-height:94dvh;padding:20px 18px calc(18px + env(safe-area-inset-bottom))}#db-backdrop .ra-actions{position:sticky;bottom:0;background:#fff;padding:12px 0 0;margin-top:14px}\
#devboard-view .db-lead{padding:18px 20px}#devboard-view .db-lead .st{gap:22px}#devboard-view .db-lead .st b{font-size:22px}#devboard-view .db-block{grid-template-columns:52px 1fr;gap:12px}#devboard-view .db-drill{grid-template-columns:auto 1fr}#devboard-view .db-drill .mn{grid-column:2;text-align:left}#devboard-view .db-st{grid-template-columns:1fr auto}#devboard-view .db-st .k{grid-column:1/-1;padding-top:0}#devboard-view .db-foot{gap:18px}#devboard-view .db-foot .db-link{min-height:44px;display:inline-flex;align-items:center}#devboard-view .db-teams button{min-height:36px}}\
@media print{#devboard-view .db-tabs,#devboard-view .db-bar,#devboard-view .db-plan-bar,#devboard-view .db-foot{display:none}}';
  function injectCss() { if (el('coach-devboard-css')) return; var s = document.createElement('style'); s.id = 'coach-devboard-css'; s.textContent = CSS; document.head.appendChild(s); }
  function toast(msg) { var t = document.createElement('div'); t.className = 'db-toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(function () { t.remove(); }, 2600); }

  // ---------- players tab ----------
  function dots(p, t) { var h = '<span class="db-dots" aria-label="Phase ' + p + ' of 3, target ' + t + '">'; for (var i = 1; i <= 3; i++) h += '<i class="db-dot' + (i <= p ? ' f' : '') + (i === t && t > 0 ? ' t' : '') + '"></i>'; return h + '</span>'; }
  function playerCard(a, teamId) {
    var d = state.dev[a.id] || {}; var age = ageOf(a); var nd = needsOf(a); var rx = prescribe(a); var warn = prereqWarnings(a);
    var behind = behindCount(a); var un = unrated(a);
    var pill = !started(a) ? '<span class="db-pill none">Not rated</span>' : behind ? '<span class="db-pill behind">' + behind + ' behind</span>' : '<span class="db-pill on">On track</span>';
    var meta = [a.jersey_number ? '#' + a.jersey_number : '', 'Age ' + age + (a.date_of_birth ? '' : ' (from grade)'), gradeText(a)].filter(Boolean).join('  ');
    var h = '<article class="db-card" data-id="' + esc(a.id) + '"><div class="db-head"><div class="db-av">' + esc(initials(a)) + '</div><div class="nm"><b>' + esc(a.first_name + ' ' + (a.last_name || '')) + '</b><small>' + esc(meta) + '</small></div>' + pill + '</div>';
    h += '<div><div class="db-sec">Needs next</div>';
    if (!started(a)) h += '<div class="db-focus empty">No rating yet. Open Rate and click the dots; it takes two minutes.</div>';
    else nd.forEach(function (n) { h += '<div class="db-need"><b>' + esc(label(n.skill)) + '</b>' + dots(n.p, n.target) + '<small>' + esc(phaseName(n.p)) + (n.gap ? ', target ' + esc(phaseName(n.target)) : '') + '</small></div>'; });
    if (started(a) && un.length) h += '<div class="db-need" style="color:#A1A1A6;font-size:12.5px"><span>Not rated yet: ' + esc(un.map(label).join(', ')) + '</span></div>';
    h += '</div>';
    if (started(a)) {
      h += '<div><div class="db-sec">Run these</div>';
      if (!rx.length) h += '<div class="db-focus empty">No drill in the bank is tagged for these needs yet.</div>';
      rx.forEach(function (x, i) { var dr = x.drill; h += '<div class="db-drill' + (dr.review ? ' flag' : '') + '"><span class="k">' + (i + 1) + '</span><div><b>' + esc(dr.name) + '</b><span>' + esc(dr.cue || '') + '</span><span class="why">For ' + esc(label(x.need)) + '. Standard: ' + esc((dr.coaching && dr.coaching.standard) || 'game speed, both hands') + '</span></div><span class="mn">' + esc(dr.min || 5) + ' min</span></div>'; });
      h += '</div>';
    }
    warn.forEach(function (w) { h += '<div class="db-warn">' + esc(w) + '</div>'; });
    h += '<div><div class="db-sec">Coach focus</div><div class="db-focus' + (d.focus ? '' : ' empty') + '">' + esc(d.focus || 'One sentence for this kid. What he hears from every coach this month.') + '</div></div>';
    h += '<div class="db-foot"><button type="button" class="db-link" data-act="rate"' + (canEdit(teamId) ? '' : ' disabled title="Only his own coach or the director can rate"') + '>' + (started(a) ? 'Rate' : 'Rate now') + '</button><button type="button" class="db-link" data-act="drills">All drills for him</button></div></article>';
    return h;
  }
  function teamBar() {
    var ts = teams(); if (!ts.length) return '';
    var h = '<div class="db-bar"><div class="db-teams">';
    ts.forEach(function (t) { var n = playersOf(t.id).length; if (!n && !state.isAdmin) return; h += '<button type="button" data-team="' + esc(t.id) + '"' + (t.id === state.teamId ? ' class="active"' : '') + '>' + esc(t.name.replace(/^Godspeed /, '')) + '<span class="ro">' + n + '</span></button>'; });
    h += '</div>';
    if (state.tab === 'players') h += '<input class="db-search" type="search" placeholder="Find a player" value="' + esc(state.q) + '" aria-label="Find a player">';
    return h + '</div>';
  }
  function playersHtml() {
    var ps = playersOf(state.teamId); var q = state.q.trim().toLowerCase();
    var vis = q ? ps.filter(function (a) { return (a.first_name + ' ' + a.last_name).toLowerCase().indexOf(q) >= 0; }) : ps;
    var rated = ps.filter(started).length; var behind = 0; ps.forEach(function (a) { if (started(a) && needsOf(a)[0] && needsOf(a)[0].gap > 0) behind++; });
    var h = '<div class="db-lead"><div><h4>Every player has a next step. Every step has a drill.</h4><p>Needs come from the age targets in our 5-Year Vision. Drills come from the Godspeed bank, matched to the need. Rate a kid in two minutes and his card fills itself.</p></div><div class="st"><div><b>' + ps.length + '</b><small>Players</small></div><div><b>' + rated + '</b><small>Rated</small></div><div><b>' + behind + '</b><small>Behind target</small></div></div></div>';
    h += teamBar();
    if (!ps.length) return h + '<div class="db-empty">No active players on this team.</div>';
    if (!vis.length) return h + '<div class="db-empty">No player matches that name.</div>';
    h += '<div class="db-grid">' + vis.map(function (a) { return playerCard(a, state.teamId); }).join('') + '</div>';
    if (!canEdit(state.teamId)) h += '<div class="db-note">You can read this team. Rating is for its own coaches and the director.</div>';
    return h;
  }

  // ---------- rate modal (evaluate in the portal) ----------
  function modal(html, cls) {
    var old = el('db-backdrop'); if (old) old.remove();
    var b = document.createElement('div'); b.className = 'ra-backdrop'; b.id = 'db-backdrop';
    b.innerHTML = '<div class="ra-modal ' + (cls || '') + '" role="dialog" aria-modal="true">' + html + '</div>';
    b.addEventListener('click', function (e) { if (e.target === b) closeModal(); });
    document.body.appendChild(b);
    document.addEventListener('keydown', escClose);
    return b;
  }
  function escClose(e) { if (e.key === 'Escape') closeModal(); }
  function closeModal() { var b = el('db-backdrop'); if (b) b.remove(); document.removeEventListener('keydown', escClose); }
  function rateRow(a, sk, editable) {
    var s = skillOf(a, sk); var t = targetsFor(ageOf(a))[sk] || 0; var st = track(a, sk);
    var h = '<div class="row" data-skill="' + sk + '"><div class="lb">' + esc(label(sk)) + '<small>' + esc(phaseName(s.p)) + (t && t !== s.p ? ', target ' + esc(phaseName(t)) : '') + '</small></div><div class="ph">';
    for (var p = 1; p <= 3; p++) h += '<button type="button" data-phase="' + p + '" class="' + (p <= s.p ? 'f' : '') + (p === t ? ' t' : '') + '" title="' + esc(phaseName(p)) + '"' + (editable ? '' : ' disabled') + ' aria-label="' + esc(label(sk)) + ' ' + esc(phaseName(p)) + '"></button>';
    h += '</div><div class="rt" aria-label="Rating ' + s.r + ' of 10">';
    for (var r = 1; r <= 10; r++) h += '<button type="button" data-rating="' + r + '" class="' + (r <= s.r ? 'f' : '') + '"' + (editable ? '' : ' disabled') + ' title="' + r + ' of 10"></button>';
    return h + '</div><div class="st ' + st + '">' + (s.p === 0 ? '' : st === 'on' ? 'On track' : st === 'ahead' ? 'Ahead' : 'Behind') + '</div></div>';
  }
  function openRate(a, teamId) {
    var editable = canEdit(teamId); var d = state.dev[a.id] || {};
    var h = '<h3>' + esc(a.first_name + ' ' + (a.last_name || '')) + '</h3><p class="ra-sub">Age ' + ageOf(a) + '. Click a dot to set the phase, a bar to set the rating inside it. Click the last filled one again to step back. Every click saves.</p>';
    h += '<div class="legend"><span><i></i>Phase reached</span><span><i class="t"></i>Age target</span></div>';
    h += '<div id="db-rate-rows">' + state.cfg.skills.map(function (sk) { return rateRow(a, sk, editable); }).join('') + '</div>';
    h += '<div style="margin-top:14px"><div class="ra-field"><label>Coach focus (one sentence)</label><textarea id="db-focus" maxlength="240"' + (editable ? '' : ' disabled') + ' placeholder="What he hears from every coach this month.">' + esc(d.focus || '') + '</textarea></div></div>';
    h += '<div class="ra-err" id="db-err"></div><div class="ra-actions">' + (editable ? '<button type="button" class="ra-btn ghost" id="db-close">Close</button><button type="button" class="ra-btn primary" id="db-save-focus">Save focus</button>' : '<button type="button" class="ra-btn primary" id="db-close">Close</button>') + '</div>';
    var b = modal(h, 'db-rate');
    b.querySelector('#db-close').onclick = closeModal;
    var err = function (m) { var e = b.querySelector('#db-err'); if (!e) return; e.textContent = m || ''; e.classList.toggle('on', !!m); };
    b.querySelectorAll('.row').forEach(function (row) { rebindRow(a, row.getAttribute('data-skill'), row, err); });
    var sf = b.querySelector('#db-save-focus');
    if (sf) sf.onclick = async function () {
      var txt = b.querySelector('#db-focus').value.trim(); sf.disabled = true;
      try { var r = await commit('set_player_dev_field', { p_athlete_id: a.id, p_field: 'focus', p_key: null, p_value: txt || null }); if (!r.ok) throw r.error; (state.dev[a.id] = state.dev[a.id] || { athlete_id: a.id, skills: {} }).focus = txt || null; toast(r.queued ? 'Focus saved on this device. It sends when you are online.' : 'Focus saved.'); paint(); }
      catch (e) { err(e.message || 'Could not save.'); }
      sf.disabled = false;
    };
  }
  async function save(a, sk, p, r, row, err) {
    try {
      var res = await commit('set_player_skill', { p_athlete_id: a.id, p_skill: sk, p_phase: p, p_rating: r }); if (!res.ok) throw res.error;
      var d = state.dev[a.id] = state.dev[a.id] || { athlete_id: a.id, skills: {} }; d.skills = d.skills || {}; d.skills[sk] = res.data ? res.data.value : { p: p, r: r };
      var fresh = document.createElement('div'); fresh.innerHTML = rateRow(a, sk, true); var nr = fresh.firstChild; row.parentNode.replaceChild(nr, row);
      rebindRow(a, sk, nr, err); err('');
      paint();
    } catch (e) { err(e.message || 'Could not save.'); }
  }
  function rebindRow(a, sk, row, err) {
    row.querySelectorAll('[data-phase]').forEach(function (btn) {
      btn.onclick = async function () {
        var cur = skillOf(a, sk); var p = +btn.getAttribute('data-phase'); if (p === cur.p) p = p - 1;
        var rule = (state.cfg.prereqs || {})[sk]; if (p === 3 && rule && skillOf(a, rule.need).p < rule.needPhase) { err(rule.msg + '.'); return; }
        await save(a, sk, p, p === 0 ? 0 : (cur.r || 1), row, err);
      };
    });
    row.querySelectorAll('[data-rating]').forEach(function (btn) {
      btn.onclick = async function () { var cur = skillOf(a, sk); var r = +btn.getAttribute('data-rating'); if (r === cur.r) r = r - 1; await save(a, sk, cur.p || 1, r, row, err); };
    });
  }
  function openDrills(a) {
    var seen = {}; var list = [];
    needsOf(a).forEach(function (n) { drillsFor(n.skill, [], 6).forEach(function (d) { if (seen[d.name]) return; seen[d.name] = 1; list.push({ need: n.skill, drill: d }); }); });
    var h = '<h3>Drills for ' + esc(a.first_name) + '</h3><p class="ra-sub">Everything in the bank tagged for his three needs. Cue, what to look for, the standard.</p>';
    if (!list.length) h += '<div class="ra-hint">Nothing tagged yet.</div>';
    list.forEach(function (x) { var d = x.drill; var c = d.coaching || {}; h += '<div style="padding:12px 0;border-top:1px solid rgba(60,60,67,.08)"><div style="display:flex;justify-content:space-between;gap:10px"><b style="font-size:15px">' + esc(d.name) + '</b><span class="ra-hint">' + esc(label(x.need)) + ', ' + esc(d.min || 5) + ' min</span></div><div style="font-size:13.5px;color:#3A3A3C;margin-top:3px">' + esc(d.cue || '') + '</div>' + (c.look && c.look.length ? '<ul style="margin:8px 0 0;padding-left:18px;font-size:13px;color:#3A3A3C;line-height:1.5">' + c.look.slice(0, 3).map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul>' : '') + (c.standard ? '<div style="font-size:12.5px;color:#6E6E73;margin-top:6px">Standard: ' + esc(c.standard) + '</div>' : '') + '</div>'; });
    h += '<div class="ra-actions"><button type="button" class="ra-btn primary" id="db-close">Close</button></div>';
    modal(h).querySelector('#db-close').onclick = closeModal;
  }

  // ---------- team tab ----------
  function readOfWeek(players) { var top = teamNeeds(players).filter(function (r) { return r.players > 0 && r.skill !== 'coachability'; })[0]; var key = top ? top.skill : 'handles'; return { skill: key, read: READS[key] || READS.handles }; }
  function teamHtml() {
    var ps = playersOf(state.teamId); var h = teamBar();
    if (!ps.length) return h + '<div class="db-empty">No active players on this team.</div>';
    var rated = ps.filter(started); var tn = teamNeeds(rated).slice(0, 3); var row = readOfWeek(rated); var wg = workGroups(rated); var gp = gaps(ps);
    h += '<div class="db-lead"><div><h4>' + esc(row.read[0]) + '</h4><p>The read of the week, chosen from the top need. ' + esc(row.read[1]) + '</p></div><div class="st"><div><b>' + rated.length + '</b><small>Rated</small></div><div><b>' + (ps.length - rated.length) + '</b><small>To rate</small></div><div><b>' + wg.length + '</b><small>Stations</small></div></div></div>';
    h += '<div class="db-two"><div class="db-panel"><h4>Top three needs</h4><p class="in">How many players have each skill in their next three, and the average phase.</p>';
    if (!rated.length) h += '<div class="ra-hint">Rate a few players first.</div>';
    tn.forEach(function (r, i) { h += '<div class="db-rank"><span class="k">' + (i + 1) + '</span><div><b>' + esc(label(r.skill)) + '</b><div class="bar"><i style="width:' + Math.round(r.players / rated.length * 100) + '%"></i></div></div><small>' + r.players + ' of ' + rated.length + ', avg ' + r.avg.toFixed(1) + '</small></div>'; });
    h += '</div><div class="db-panel"><h4>Gaps</h4><p class="in">What the director sees first.</p>';
    gp.forEach(function (g) { h += '<div class="db-gap ' + g[0] + '"><i></i><span>' + esc(g[1]) + '</span></div>'; });
    h += '</div></div>';
    h += '<div class="db-panel" style="margin-top:14px"><h4>Work groups for power-ups</h4><p class="in">Players bucketed by their first drill. One coach per two stations, rotate at five minutes.</p>';
    if (!wg.length) h += '<div class="ra-hint">Groups appear once players are rated.</div>';
    wg.forEach(function (g) { h += '<div class="db-group"><b>' + esc(g.drill.name) + ' <span style="font-weight:500;color:#6E6E73">for ' + esc(label(g.need)) + ', ' + esc(g.drill.min || 5) + ' min</span></b><div class="who">' + esc(g.players.map(function (a) { return (a.first_name + ' ' + (a.last_name || '').charAt(0)).trim(); }).join(', ')) + '</div><div class="cue">' + esc(g.drill.cue || '') + '</div></div>'; });
    h += '</div>';
    if (state.isAdmin) {
      h += '<div class="db-panel" style="margin-top:14px"><h4>All teams</h4><p class="in">Director view. Rated players and behind-target skills per team.</p>';
      teams().forEach(function (t) { var tp = playersOf(t.id); if (!tp.length) return; var b = 0; tp.forEach(function (a) { b += behindCount(a); }); h += '<div class="db-rank"><span class="k" style="background:#0071E3">' + tp.length + '</span><div><b>' + esc(t.name) + '</b></div><small>' + tp.filter(started).length + ' rated, ' + b + ' behind</small></div>'; });
      h += '</div>';
    }
    return h;
  }

  // ---------- practice plan tab ----------
  function findDrill(name) { return state.bank.filter(function (d) { return d.name === name; })[0]; }
  function swapKey(block, i) { return state.teamId + ':' + block + ':' + i; }
  function pick(cands, block, i) { if (!cands.length) return null; var off = state.swaps[swapKey(block, i)] || 0; return cands[off % cands.length]; }
  function stationHtml(k, d, who, block, i, cands) {
    return '<div class="db-st"><span class="k">' + esc(k) + '</span><div><b>' + esc(d.name) + '</b><span>' + esc(d.cue || '') + '</span>' + (who ? '<span class="who">' + esc(who) + '</span>' : '') + '</div>' + (cands && cands.length > 1 ? '<button type="button" class="db-link" data-swap="' + esc(block + '|' + i) + '">Swap</button>' : '<span class="mn" style="font-size:12px;color:#6E6E73">' + esc(d.min || 5) + ' min</span>') + '</div>';
  }
  function planHtml() {
    var ps = playersOf(state.teamId); var h = teamBar();
    if (!state.shape) return h + '<div class="db-empty">The practice shape is not loaded.</div>';
    var rated = ps.filter(started); var wg = workGroups(rated); var row = readOfWeek(rated); var tn = teamNeeds(rated);
    var day = new Date(); var dow = day.getDay(); var next = dow < 2 ? 'Tuesday' : dow < 4 ? 'Thursday' : 'Tuesday';
    h += '<div class="db-lead"><div><h4>' + esc(next) + ', doors 5:55, ball at 6:00.</h4><p>Seven blocks from How we practice. Power-ups and the finishing bridge are filled from this roster\'s needs; the guided block teaches this week\'s read. Swap a drill if the gym says so.</p></div><div class="st"><div><b>' + esc(row.read[0]) + '</b><small>Read of the week</small></div></div></div>';
    h += '<div class="db-plan-bar"><button type="button" class="db-btn" id="db-print">Print</button><button type="button" class="db-btn ghost" id="db-copy">Copy as text</button><span class="ra-hint">' + (rated.length ? rated.length + ' rated players shape this plan.' : 'Nobody is rated yet, so the stations are the default power-ups.') + '</span></div>';
    h += '<div class="db-panel" id="db-plan">';
    state.shape.blocks.forEach(function (b, bi) {
      h += '<div class="db-block"><div class="tm">' + esc(b.start) + '<small>' + esc(b.minutes) + ' min</small></div><div><h5>' + esc(b.name) + '</h5><p>' + esc(b.what) + '</p>' + (b.note ? '<div class="nt">' + esc(b.note) + '</div>' : '');
      if (/power-ups/i.test(b.name)) {
        h += '<div class="db-fill">';
        if (wg.length) wg.slice(0, 4).forEach(function (g, i) { var cands = drillsFor(g.need, [], 6); var d = pick(cands, 'pu', i) || g.drill; h += stationHtml('Station ' + (i + 1), d, g.players.map(function (a) { return (a.first_name + ' ' + (a.last_name || '').charAt(0)).trim(); }).join(', '), 'pu', i, cands); });
        var unr = ps.filter(function (a) { return !started(a); });
        if (wg.length && unr.length) { var ud = visibleBank().filter(function (d) { return /bodyweight strength|core and bracing/i.test(d.name); })[0]; if (ud) h += stationHtml('Utility', ud, 'Not rated yet, so they work strength: ' + unr.map(function (a) { return (a.first_name + ' ' + (a.last_name || '').charAt(0)).trim(); }).join(', '), 'ut', 0, []); }
        if (!wg.length && state.powerups) ['Guard', 'Wing', 'Big'].forEach(function (k, i) { var list = state.powerups[k] || []; var d = list.length ? (findDrill(list[i % list.length].text) || { name: list[i % list.length].text, cue: '' }) : null; if (d) h += stationHtml(k, d, '', 'pu', i, []); });
        h += '</div>';
      }
      if (/finishing bridge/i.test(b.name)) {
        var cands = []; FINISH_RX.forEach(function (rx) { visibleBank().forEach(function (d) { if (rx.test(d.name) && cands.indexOf(d) < 0) cands.push(d); }); });
        var need = tn.filter(function (r) { return ['strength', 'shooting', 'postGame', 'handles'].indexOf(r.skill) >= 0 && r.players > 0; })[0];
        if (need) cands.sort(function (x, y) { return ((y.skills || []).indexOf(need.skill) >= 0 ? 1 : 0) - ((x.skills || []).indexOf(need.skill) >= 0 ? 1 : 0); });
        var d = pick(cands, 'fb', 0); if (d) h += '<div class="db-fill">' + stationHtml('Finish', d, need ? label(need.skill) + ' is a top need on this roster' : '', 'fb', 0, cands) + '</div>';
      }
      if (/guided reads/i.test(b.name)) h += '<div class="db-fill"><div class="db-st"><span class="k">Read</span><div><b>' + esc(row.read[0]) + '</b><span>' + esc(row.read[1]) + '</span></div></div></div>';
      if (/competition/i.test(b.name) && tn[1] && tn[1].players) h += '<div class="db-fill"><div class="db-st"><span class="k">Watch</span><div><b>' + esc(label(tn[1].skill)) + '</b><span>Second need on this roster. Call it out when you see it, good or bad.</span></div></div></div>';
      h += '</div></div>';
    });
    h += '</div>';
    if (state.shape.rules && state.shape.rules.length) h += '<div class="db-note">' + state.shape.rules.map(esc).join('  ') + '</div>';
    return h;
  }
  function planText() {
    var v = el('db-plan'); if (!v) return '';
    var out = [];
    v.querySelectorAll('.db-block').forEach(function (b) { var tm = b.querySelector('.tm').childNodes[0].textContent; out.push(tm + '  ' + b.querySelector('h5').textContent + '\n   ' + b.querySelector('p').textContent); b.querySelectorAll('.db-st').forEach(function (s) { out.push('   - ' + s.querySelector('.k').textContent + ': ' + s.querySelector('b').textContent + (s.querySelector('.who') ? ' (' + s.querySelector('.who').textContent + ')' : '')); }); });
    return out.join('\n');
  }

  // ---------- drill bank tab (director only) ----------
  function bankHtml() {
    var h = '<div class="db-lead"><div><h4>The Godspeed drill bank</h4><p>' + state.bank.length + ' drills, each tagged with the skills it develops. Tags decide which drill a player gets. Flagged drills are hidden from coaches until you decide.</p></div><div class="st"><div><b>' + state.bank.filter(function (d) { return d.review; }).length + '</b><small>Flagged</small></div><div><b>' + state.bank.filter(function (d) { return !(d.skills && d.skills.length); }).length + '</b><small>Untagged</small></div></div></div>';
    var cov = {}; state.bank.forEach(function (d) { (d.skills || []).forEach(function (s) { cov[s] = (cov[s] || 0) + 1; }); });
    h += '<div class="db-panel" style="margin-bottom:14px"><h4>Coverage</h4><p class="in">Drills per skill. A skill with fewer than three is thin.</p><div>' + state.cfg.skills.map(function (s) { return '<span class="db-chip' + ((cov[s] || 0) < 3 ? ' flag' : '') + '">' + esc(label(s)) + ' ' + (cov[s] || 0) + '</span>'; }).join('') + '</div></div>';
    h += '<div class="db-panel"><div class="db-bank">';
    state.bank.forEach(function (d) { h += '<div class="db-bk"><div class="nm"><b>' + esc(d.name) + '</b>' + (d.review ? '<span class="db-chip flag">Flagged</span>' : '') + '<div class="cue">' + esc(d.cue || '') + '</div></div><div class="ch"><span class="db-chip grp">' + esc(d.tag || '') + (d.min ? ', ' + esc(d.min) + ' min' : '') + '</span>' + (d.skills || []).map(function (sk) { return '<span class="db-chip">' + esc(label(sk)) + '</span>'; }).join('') + '</div></div>'; });
    h += '</div></div><div class="db-note">Editing tags and age targets from here is the next step. For now they change in the database.</div>';
    return h;
  }

  // ---------- paint and events ----------
  var TABS = [['players', 'Players'], ['team', 'Team'], ['plan', 'Practice plan'], ['bank', 'Drill bank']];
  function html() {
    if (state.error) return '<div class="db-empty">' + esc(state.error) + '</div>';
    if (!state.loaded || !raw()) return '<div class="db-empty">Loading players and the drill bank...</div>';
    if (!state.teamId) { var ts = teams().filter(function (t) { return playersOf(t.id).length; }); var mine = ts.filter(function (t) { return state.myTeams.indexOf(t.id) >= 0; }); state.teamId = (mine[0] || ts[0] || {}).id || null; }
    var tabs = '<div class="db-tabs" role="tablist">' + TABS.filter(function (t) { return t[0] !== 'bank' || state.isAdmin; }).map(function (t) { return '<button type="button" role="tab" data-tab="' + t[0] + '"' + (t[0] === state.tab ? ' class="active"' : '') + '>' + t[1] + '</button>'; }).join('') + '</div>';
    var body = state.tab === 'team' ? teamHtml() : state.tab === 'plan' ? planHtml() : state.tab === 'bank' && state.isAdmin ? bankHtml() : playersHtml();
    return tabs + '<div id="db-status">' + statusHtml() + '</div>' + body;
  }
  function paint() {
    var v = el('devboard-view'); if (!v) return;
    var focusQ = document.activeElement && document.activeElement.classList.contains('db-search'); var pos = focusQ ? document.activeElement.selectionStart : 0;
    v.innerHTML = html();
    var sn = v.querySelector('#db-sync-now'); if (sn) sn.onclick = flush;
    v.querySelectorAll('.db-tabs button').forEach(function (b) { b.onclick = function () { state.tab = b.getAttribute('data-tab'); try { localStorage.setItem('gs_devboard_tab', state.tab); } catch (e) { /* optional */ } paint(); setSub(); }; });
    v.querySelectorAll('.db-teams button').forEach(function (b) { b.onclick = function () { state.teamId = b.getAttribute('data-team'); paint(); }; });
    var q = v.querySelector('.db-search'); if (q) { q.oninput = function () { state.q = q.value; paint(); }; if (focusQ) { q.focus(); try { q.setSelectionRange(pos, pos); } catch (e) { /* fine */ } } }
    v.querySelectorAll('.db-card').forEach(function (card) {
      var a = playersOf(state.teamId).filter(function (x) { return x.id === card.getAttribute('data-id'); })[0]; if (!a) return;
      var rb = card.querySelector('[data-act="rate"]'); if (rb) rb.onclick = function () { openRate(a, state.teamId); };
      var db = card.querySelector('[data-act="drills"]'); if (db) db.onclick = function () { openDrills(a); };
    });
    v.querySelectorAll('[data-swap]').forEach(function (b) { b.onclick = function () { var k = b.getAttribute('data-swap').split('|'); var key = swapKey(k[0], +k[1]); state.swaps[key] = (state.swaps[key] || 0) + 1; paint(); }; });
    var pr = el('db-print'); if (pr) pr.onclick = function () { window.print(); };
    var cp = el('db-copy'); if (cp) cp.onclick = function () { var t = planText(); if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(function () { toast('Plan copied.'); }, function () { toast('Copy blocked by the browser.'); }); else toast('Copy is not available here.'); };
  }
  function setSub() {
    var s = document.querySelector('#coach-dashboard .dashboard-header .text-sub');
    if (s) s.textContent = { players: 'Needs and drills, per player.', team: 'Top needs, the read of the week, work groups.', plan: 'Tuesday and Thursday, built from the roster.', bank: 'Every drill and what it develops.' }[state.tab] || 'Development board';
  }
  function ensureView() {
    var v = el('devboard-view'); if (v) return v;
    var main = document.querySelector('.dashboard-main'); if (!main) return null;
    v = document.createElement('div'); v.id = 'devboard-view'; v.style.display = 'none';
    try { state.tab = localStorage.getItem('gs_devboard_tab') || state.tab; } catch (e) { /* optional */ }
    var after = main.querySelector('.dashboard-toolbar') || main.querySelector('.dashboard-header');
    if (after && after.nextSibling) main.insertBefore(v, after.nextSibling); else main.appendChild(v);
    return v;
  }
  async function load() {
    if (state.loading) return; state.loading = true; state.error = null; paint();
    try {
      if (!sync.online) throw new Error('offline');
      await loadAll();
      var tries = 0; while (!liveRaw() && tries++ < 40) { await new Promise(function (r) { setTimeout(r, 250); }); }
      if (!liveRaw()) throw new Error('Rosters did not load. Open Home, then come back.');
      state.cachedRoster = null; sync.fromCache = false; replayQueue(); snapshot();
      state.loaded = true;
      flush();
    } catch (e) {
      if ((e.message === 'offline' || isNetworkError(e)) && restoreCache()) { sync.online = false; state.loaded = true; }
      else state.error = e.message === 'no_session' ? 'Sign in with your email to use the development board.' : e.message === 'no_client' ? 'Sign-in service not loaded.' : e.message === 'offline' ? 'No connection, and no saved copy on this device yet. Open the board once while online and it will work offline after that.' : e.message;
    }
    state.loading = false; paint(); setSub();
  }
  function open(tab) {
    injectCss(); var v = ensureView(); if (!v) return;
    if (tab) state.tab = tab;
    v.parentNode.querySelectorAll('div[id$="-view"]').forEach(function (x) { if (x !== v) x.style.display = 'none'; });
    document.querySelectorAll('.team-nav-item.active, .segment-btn.active').forEach(function (n) { n.classList.remove('active'); });
    var item = el('devboard-nav-item'); if (item) item.classList.add('active');
    var tabs = el('view-tabs'); if (tabs) tabs.style.display = 'none';
    var t = el('view-title'); if (t) t.textContent = 'Development board';
    v.style.display = 'block';
    if (!state.loaded && !state.loading) load(); else { paint(); setSub(); }
    if (window.CoachPortalShell) window.CoachPortalShell.closeDrawer();
  }
  function mountNav() {
    if (el('devboard-nav-item')) return true;
    var anchor = el('academy-nav'); if (!anchor) return false;
    var a = document.createElement('div');
    a.className = 'team-nav-item'; a.id = 'devboard-nav-item'; a.setAttribute('role', 'button'); a.tabIndex = 0;
    a.style.cssText = 'display:flex;align-items:center;gap:12px;';
    a.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:.7" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg><span>Development board</span>';
    a.onclick = function () { open(); }; a.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } };
    var dev = el('develop-nav-item');
    if (dev && dev.nextSibling) anchor.insertBefore(a, dev.nextSibling); else anchor.appendChild(a);
    var orig = window.switchTeamView;
    if (typeof orig === 'function' && !orig.__dbWrapped) {
      var w = function () { var v = el('devboard-view'); if (v) v.style.display = 'none'; var t = el('view-tabs'); if (t) t.style.display = ''; a.classList.remove('active'); return orig.apply(this, arguments); };
      w.__dbWrapped = true; window.switchTeamView = w;
    }
    return true;
  }
  document.addEventListener('DOMContentLoaded', function () {
    injectCss();
    var tries = 0;
    var timer = setInterval(function () {
      var d = el('coach-dashboard');
      if (d && d.style.display && d.style.display !== 'none' && mountNav()) clearInterval(timer);
      if (++tries > 120) clearInterval(timer);
    }, 700);
    window.addEventListener('online', goOnline); window.addEventListener('offline', goOffline);
    registerSw();
    setTimeout(offlineEntry, 1800);
    // Captive wifi or a dead link can report "online" while nothing gets through: probe once, then enter from the cache.
    setTimeout(function () { var d = el('coach-dashboard'); if (d && d.style.display && d.style.display !== 'none') return; if (!readJson(CACHE_KEY)) return; fetch('/coach-portal.html?probe=' + Date.now(), { method: 'HEAD', cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('probe'); }).catch(function () { sync.online = false; offlineEntry(true); }); }, 6000);
    // Leaving with changes waiting: the browser keeps them in localStorage; nothing to do but say so.
    window.CoachDevBoard = { open: open, mountNav: mountNav, reload: function () { state.loaded = false; return load(); }, state: state, sync: sync, flush: flush, queue: queue };
  });
})();
