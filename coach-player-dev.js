/**
 * GODSPEED BASKETBALL. Development board, inside the Coach Portal.
 *
 * The 5-Year Vision, running on live data. A coach rates what he can see: 47
 * sub-skills, 1 to 5 in the Godspeed tryout words (Poor, Weak, Some good
 * actions, Consistent, Excellent), plus strength numbers scored against age
 * norms. The 11 phases are derived from the subs, never clicked. The board
 * names the three lowest, most important sub-skills for each player and hands
 * the coach the Godspeed drill and the exact rep at his level. The team has its top needs, the
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

  var POSITIONS = ['Guard', 'Wing', 'Big', 'Utility'];
  // Which skills a position leans on; a weak sub in one of these counts a little more.
  var POS_SKILLS = { Guard: ['handles', 'shooting', 'vision', 'iq', 'offInstincts'], Wing: ['shooting', 'offInstincts', 'defense', 'vision', 'handles'], Big: ['postGame', 'defense', 'strength', 'defInstincts', 'shooting'], Utility: ['strength', 'stamina', 'defense', 'coachability'] };
  // Category colors, same as the Command Center bank.
  var TAGS = { 'Culture': '#0071e3', 'Toughness': '#d92d20', 'Bigs': '#7c3aed', 'Guards': '#0d9488', 'Passing/Reads': '#4f46e5', 'Individual': '#64748b', 'Conditioning': '#d97706', 'Strength': '#57534e' };
  var TAG_ORDER = ['Culture', 'Toughness', 'Bigs', 'Guards', 'Passing/Reads', 'Individual', 'Conditioning', 'Strength'];
  var state = { activity: null, activityErr: null, activitySeen: null, loading: false, loaded: false, error: null, isAdmin: false, myTeams: [], cfg: DEFAULT_CFG, dev: {}, bank: [], shape: null, powerups: null, teamId: null, tab: 'players', q: '', swaps: {}, bankQ: '', bankTag: 'All', expanded: {}, workout: null, shareAccess: [], shares: {}, privileges: null };

  // ---------- data ----------
  async function loadAll() {
    var c = client(); if (!c) throw new Error('no_client');
    var s = await c.auth.getSession();
    if (!s || !s.data || !s.data.session) throw new Error('no_session');
    var uid = s.data.session.user.id; state.uid = uid;
    var r = await Promise.all([
      c.from('development_config').select('key,value'),
      c.from('player_development').select('athlete_id,skills,subs,position,strength_bench,focus,updated_at'),
      c.from('program_content').select('slug,body').in('slug', ['drills-bank', 'planner-practice-shape', 'planner-powerups', 'planner-workout']),
      c.from('coach_profiles').select('team_ids').eq('user_id', uid).maybeSingle(),
      c.rpc('is_program_admin'),
      c.from('coach_access').select('user_id,area,team_id,allowed').eq('area', 'share_development'),
      c.from('player_development_shares').select('athlete_id,shared_at,shared_by,note').order('shared_at', { ascending: false }).limit(400)
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
      if (row.slug === 'planner-workout') state.workout = row.body;
    });
    state.myTeams = (r[3].data && r[3].data.team_ids) || [];
    state.isAdmin = !!(r[4] && r[4].data === true);
    state.shareAccess = (r[5] && r[5].data) ? r[5].data.filter(function (x) { return x.user_id === uid; }) : [];
    state.shares = {}; ((r[6] && r[6].data) || []).forEach(function (x) { if (!state.shares[x.athlete_id]) state.shares[x.athlete_id] = x; });
  }
  // Director always; a coach only with the director's grant (coach_access, area share_development) for all teams or this team.
  function canShare(teamId) {
    if (state.isAdmin) return true;
    if (state.myTeams.indexOf(teamId) < 0) return false;
    var allow = state.shareAccess.some(function (a) { return a.allowed && (!a.team_id || a.team_id === teamId); });
    var deny = state.shareAccess.some(function (a) { return !a.allowed && (!a.team_id || a.team_id === teamId); });
    return allow && !deny;
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
    writeJson(CACHE_KEY, { at: new Date().toISOString(), uid: state.uid || null, cfg: state.cfg, dev: state.dev, bank: state.bank, shape: state.shape, powerups: state.powerups, workout: state.workout, shareAccess: state.shareAccess, shares: state.shares, myTeams: state.myTeams, isAdmin: state.isAdmin, roster: slimRoster(rw) });
  }
  function restoreCache() {
    var c = readJson(CACHE_KEY); if (!c || !c.roster) return false;
    state.cfg = Object.assign({}, DEFAULT_CFG, c.cfg || {}); state.dev = c.dev || {}; state.bank = c.bank || []; state.shape = c.shape; state.powerups = c.powerups; state.workout = c.workout || null; state.shareAccess = c.shareAccess || []; state.shares = c.shares || {}; state.myTeams = c.myTeams || []; state.isAdmin = !!c.isAdmin;
    state.cachedRoster = c.roster; sync.fromCache = true; sync.cachedAt = c.at; state.uid = state.uid || c.uid || null;
    replayQueue();
    return true;
  }
  function queue() { return readJson(QUEUE_KEY) || []; }
  function setQueue(q) { writeJson(QUEUE_KEY, q); }
  function enqueue(op) {
    var key = function (x) { return x.rpc + '|' + x.args.p_athlete_id + '|' + (x.args.p_sub || x.args.p_skill || x.args.p_field || x.args.p_key || (x.args.p_subs ? Object.keys(x.args.p_subs).sort().join(',') : '') || (x.args.p_team_id ? x.args.p_team_id + ':' + x.args.p_plan_date : '')); };
    var q = queue().filter(function (x) { return key(x) !== key(op); });
    op.id = Date.now() + '-' + Math.random().toString(36).slice(2, 8); op.at = new Date().toISOString(); op.uid = state.uid || null;
    q.push(op); setQueue(q); paintStatus();
  }
  // Re-apply queued changes on top of a cached snapshot so the board shows what the coach did.
  function replayQueue() {
    queue().forEach(function (op) {
      var a = op.args; if (!a.p_athlete_id) return; var d = state.dev[a.p_athlete_id] = state.dev[a.p_athlete_id] || { athlete_id: a.p_athlete_id, skills: {}, subs: {} };
      if (op.rpc === 'set_player_sub') { d.subs = d.subs || {}; if (a.p_score > 0) d.subs[a.p_sub] = a.p_score; else delete d.subs[a.p_sub]; d.skills = deriveSkills(d.subs); }
      else if (op.rpc === 'set_player_subs') { d.subs = d.subs || {}; Object.keys(a.p_subs || {}).forEach(function (k) { if (+a.p_subs[k] > 0) d.subs[k] = +a.p_subs[k]; else delete d.subs[k]; }); d.skills = deriveSkills(d.subs); }
      else if (op.rpc === 'set_player_position') d.position = a.p_position;
      else if (op.rpc === 'save_practice_plan') return;
      else if (op.rpc === 'set_player_dev_field' && a.p_field === 'focus') d.focus = a.p_value;
      else if (op.rpc === 'set_player_dev_field' && a.p_field === 'strength_bench') { d.strength_bench = d.strength_bench || {}; d.strength_bench[a.p_key] = a.p_value; }
    });
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
  function teamsOf(athleteId) { var rw = raw(); if (!rw) return []; return rw.rosters.filter(function (m) { return m.athlete_id === athleteId && !m.left_at; }).map(function (m) { return m.team_id; }); }
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
  function subsCfg() { return state.cfg.subskills || {}; }
  function skillOrder() { var c = subsCfg(); var o = (state.cfg.skills || []).filter(function (k) { return c[k]; }); Object.keys(c).forEach(function (k) { if (o.indexOf(k) < 0) o.push(k); }); return o; }
  function subList(skill) { return subsCfg()[skill] || []; }
  function subKeyLabel(key) { var p = key.split('.'); var s = subList(p[0]).filter(function (x) { return x.key === p[1]; })[0]; return s ? s.label : p[1]; }
  function subHint(key) { var p = key.split('.'); var s = subList(p[0]).filter(function (x) { return x.key === p[1]; })[0]; return s ? (s.hint || '') : ''; }
  function rubric(n) { return (state.cfg.rubric || ['Poor', 'Weak', 'Some good actions', 'Consistent', 'Excellent'])[n - 1] || ''; }
  function devOf(a) { return state.dev[a.id] || { skills: {}, subs: {} }; }
  function subScore(a, key) { var d = devOf(a); return +((d.subs || {})[key] || 0); }
  // Same math as the database: phase from the average of the rated subs, Elite capped by the prerequisite.
  function deriveSkills(subs) {
    var out = {}; var bands = state.cfg.phase_bands || { foundationMax: 2.5, intermediateMax: 4 }; var pr = state.cfg.prereqs || {};
    Object.keys(subsCfg()).forEach(function (sk) {
      var vals = Object.keys(subs || {}).filter(function (k) { return k.split('.')[0] === sk && +subs[k] > 0; }).map(function (k) { return +subs[k]; });
      var n = vals.length; var avg = n ? vals.reduce(function (x, y) { return x + y; }, 0) / n : 0;
      var p = !n ? 0 : avg < bands.foundationMax ? 1 : avg < bands.intermediateMax ? 2 : 3;
      out[sk] = { p: p, r: Math.round(avg * 2), a: Math.round(avg * 100) / 100, n: n };
    });
    Object.keys(pr).forEach(function (sk) { var rule = pr[sk]; if (out[sk] && out[sk].p === 3 && (!out[rule.need] || out[rule.need].p < (rule.needPhase || 2))) { out[sk].p = 2; out[sk].capped = true; } });
    return out;
  }
  function skillOf(a, sk) { var d = devOf(a); var v = d.skills && d.skills[sk]; return v && typeof v === 'object' ? { p: +v.p || 0, r: +v.r || 0, a: +v.a || 0, n: +v.n || 0, capped: !!v.capped } : { p: 0, r: 0, a: 0, n: 0 }; }
  function started(a) { var d = devOf(a); return Object.keys(d.subs || {}).some(function (k) { return +d.subs[k] > 0; }); }
  function ratedCount(a) { var d = devOf(a); return Object.keys(d.subs || {}).filter(function (k) { return +d.subs[k] > 0; }).length; }
  function totalSubs() { var n = 0; Object.keys(subsCfg()).forEach(function (sk) { n += subList(sk).length; }); return n; }
  function track(a, sk) { var t = targetsFor(ageOf(a))[sk] || 0; var p = skillOf(a, sk).p; if (!p) return 'none'; return p > t ? 'ahead' : p === t ? 'on' : 'behind'; }
  function behindCount(a) { return Object.keys(subsCfg()).filter(function (sk) { return track(a, sk) === 'behind' && (targetsFor(ageOf(a))[sk] || 0) > 0; }).length; }
  function prereqWarnings(a) { var out = []; var pr = state.cfg.prereqs || {}; Object.keys(pr).forEach(function (sk) { if (skillOf(a, sk).capped) out.push(pr[sk].msg); }); return out; }
  function overallPhase(a) { var ps = skillOrder().map(function (sk) { return skillOf(a, sk).p; }).filter(Boolean); if (!ps.length) return 'Not evaluated'; return phaseName(Math.round(ps.reduce(function (x, y) { return x + y; }, 0) / ps.length)); }
  function positionOf(a) { return devOf(a).position || ''; }
  // Strength numbers become a 1 to 5 score against the age band.
  function strengthScore(age, key, value) {
    var norms = state.cfg.strength_norms; if (!norms || !norms[key] || value == null || value === '') return 0;
    var bi = 0; (norms.bands || []).forEach(function (b, i) { if (age >= b[0] && age <= b[1]) bi = i; }); if (age > 14) bi = (norms.bands || []).length - 1;
    var t = norms[key].t[bi] || norms[key].t[0]; var v = +value; var s = 1;
    if (norms[key].lower) { t.forEach(function (th) { if (v <= th) s++; }); } else { t.forEach(function (th) { if (v >= th) s++; }); }
    return Math.min(5, s);
  }
  // The needs: every rated sub-skill scored by how low it is, how far the skill is
  // behind the age target, and whether his position leans on it. Top three, at most two per skill.
  function needsOf(a) {
    var pos = positionOf(a); var lean = POS_SKILLS[pos] || []; var tg = targetsFor(ageOf(a)); var d = devOf(a);
    var rows = [];
    skillOrder().forEach(function (sk) {
      if (sk === 'coachability') return;
      var st = skillOf(a, sk); var behind = st.p > 0 && st.p < (tg[sk] || 0);
      subList(sk).forEach(function (s) {
        var key = sk + '.' + s.key; var v = +((d.subs || {})[key] || 0); if (!v) return;
        var w = (5 - v) * (behind ? 1.5 : 1) + (lean.indexOf(sk) >= 0 ? 0.5 : 0);
        rows.push({ key: key, skill: sk, score: v, weight: w, behind: behind, phase: st.p || 1 });
      });
    });
    rows.sort(function (x, y) { return y.weight - x.weight || x.score - y.score; });
    var out = [], per = {};
    rows.forEach(function (r) { if (out.length >= 3) return; if ((per[r.skill] || 0) >= 2) return; per[r.skill] = (per[r.skill] || 0) + 1; out.push(r); });
    return out;
  }
  function unratedSkills(a) { return Object.keys(subsCfg()).filter(function (sk) { return skillOf(a, sk).n === 0; }); }
  function visibleBank() { return state.isAdmin ? state.bank : state.bank.filter(function (d) { return !d.review || d.import; }); }
  // The drill for a need: develops that sub (primary counts more), at his level, not flagged, not repeated.
  function drillsForSub(key, phase, exclude, limit) {
    var lvl = phase || 1;
    var pool = visibleBank().filter(function (d) { return (d.develops || []).indexOf(key) >= 0 && exclude.indexOf(d.name) < 0; });
    pool.forEach(function (d) {
      var ix = (d.develops || []).indexOf(key); var s = ix === 0 ? 4 : ix === 1 ? 2.5 : ix === 2 ? 1.5 : 1;
      var L = +d.level || 0; s += L === lvl ? 1.5 : L === 0 ? 1 : Math.abs(L - lvl) === 1 ? 0.5 : -1;
      if (d.review && !d.import) s -= 5; if (d.import) s -= 0.4;
      d.__s = s;
    });
    pool.sort(function (x, y) { return y.__s - x.__s || (x.min || 0) - (y.min || 0); });
    return pool.slice(0, limit || 1);
  }
  // The rep to start with: the first sub-rep tagged at his level.
  function repAt(d, phase) {
    var reps = (d.coaching && d.coaching.drills) || []; var prog = d.progression || [1, 1, 2, 2, 3]; var lvl = phase || 1;
    for (var i = 0; i < reps.length; i++) { if ((prog[i] || 1) === lvl) return { i: i, text: reps[i] }; }
    return reps.length ? { i: 0, text: reps[0] } : null;
  }
  function prescribe(a) {
    var used = [], out = [];
    needsOf(a).forEach(function (n) { var d = drillsForSub(n.key, n.phase, used, 1)[0]; if (!d) return; used.push(d.name); out.push({ need: n, drill: d, rep: repAt(d, n.phase) }); });
    return out;
  }
  function teamNeeds(players) {
    var count = {}, sum = {};
    players.forEach(function (a) { needsOf(a).forEach(function (n) { count[n.key] = (count[n.key] || 0) + 1; sum[n.key] = (sum[n.key] || 0) + n.score; }); });
    return Object.keys(count).map(function (k) { return { key: k, skill: k.split('.')[0], players: count[k], avg: sum[k] / count[k] }; }).sort(function (x, y) { return y.players - x.players || x.avg - y.avg; });
  }
  function workGroups(players) {
    var g = {};
    players.forEach(function (a) { var p = prescribe(a)[0]; if (!p) return; var k = p.drill.name; (g[k] = g[k] || { drill: p.drill, need: p.need, players: [] }).players.push(a); });
    return Object.keys(g).map(function (k) { return g[k]; }).sort(function (x, y) { return y.players.length - x.players.length; });
  }
  function gaps(players) {
    var out = [];
    var un = players.filter(function (a) { return !started(a); }).length;
    if (un) out.push(['red', un + (un > 1 ? ' players' : ' player') + ' not evaluated yet. Open Evaluate; three minutes each.']);
    var behind = 0; players.forEach(function (a) { behind += behindCount(a); });
    if (behind) out.push(['orange', behind + ' skill' + (behind > 1 ? 's' : '') + ' behind the age target across the roster.']);
    var pv = 0; players.forEach(function (a) { pv += prereqWarnings(a).length; });
    if (pv) out.push(['red', pv + ' skill' + (pv > 1 ? 's' : '') + ' held at Intermediate by a prerequisite.']);
    var partial = players.filter(function (a) { return started(a) && unratedSkills(a).length; }).length;
    if (partial) out.push(['grey', partial + ' player' + (partial > 1 ? 's' : '') + ' with skills not evaluated yet.']);
    var np = players.filter(function (a) { return !positionOf(a); }).length;
    if (np) out.push(['grey', np + ' player' + (np > 1 ? 's' : '') + ' without a position.']);
    var nf = players.filter(function (a) { return !devOf(a).focus; }).length;
    if (nf && nf < players.length) out.push(['grey', nf + ' player' + (nf > 1 ? 's' : '') + ' without a coach focus sentence.']);
    if (!out.length && players.length) out.push(['green', 'Every player evaluated, nobody behind target, no warnings. Keep the reps honest.']);
    return out;
  }
  function label(sk) { return (state.cfg.skill_labels || {})[sk] || sk; }
  function phaseName(p) { return (state.cfg.phases || DEFAULT_CFG.phases)[p] || ''; }
  function initials(a) { return ((a.first_name || '').charAt(0) + (a.last_name || '').charAt(0)).toUpperCase() || '?'; }
  function shortName(a) { return (a.first_name + ' ' + (a.last_name || '').charAt(0)).trim(); }
  function gradeText(a) { var g = String(a.grade || '').replace(/\D/g, ''); return g ? (g === '1' ? '1st' : g === '2' ? '2nd' : g === '3' ? '3rd' : g + 'th') + ' grade' : ''; }
  function fmtDay(iso) { var d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
  function tagColor(t) { return TAGS[t] || '#64748b'; }
  function tagChip(t, extra) { return '<span class="db-tag' + (extra ? ' ' + extra : '') + '" style="--tc:' + tagColor(t) + '">' + esc(t || 'Drill') + '</span>'; }


  // ---------- styles (the Command Center look: white cards on a soft ground, blue pills, colored category chips) ----------
  var CSS = '\
#devboard-view{--ac:#0071e3;--acd:#0060c0;--acs:#eaf3ff;--tx:#1d1d1f;--ts:#6e6e73;--tf:#a1a1a6;--bd:#d9d9de;--bl:#ececf0;--bg:#fff;--bgs:#f5f5f7;--bgt:#fafafc;--sh:0 1px 2px rgba(15,23,42,.04),0 6px 16px rgba(15,23,42,.06);--rc:16px;--rb:10px;--green:#159a52;--orange:#d9660a;--red:#d92d20}\
#devboard-view .db-tabs{display:inline-flex;gap:2px;padding:3px;background:rgba(118,118,128,.12);border-radius:11px;margin:0 0 14px;max-width:100%;overflow-x:auto;scrollbar-width:none}\
#devboard-view .db-tabs::-webkit-scrollbar{display:none}\
#devboard-view .db-tabs button{border:none;background:transparent;color:var(--ts);font-family:inherit;font-size:13px;font-weight:600;padding:6px 14px;border-radius:8px;cursor:pointer;min-height:32px;min-width:0;text-transform:none;white-space:nowrap}\
#devboard-view .db-tabs button.active{background:#fff;color:var(--tx);box-shadow:0 1px 3px rgba(0,0,0,.1)}\
#devboard-view .db-bar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:0 0 16px}\
#devboard-view .db-teams{display:inline-flex;gap:6px;flex-wrap:wrap}\
#devboard-view .db-teams button,#devboard-view .db-chipbtn{font:inherit;font-size:13px;font-weight:600;padding:7px 14px;border-radius:999px;border:1px solid var(--bd);background:#fff;color:var(--tx);cursor:pointer;min-height:0;min-width:0;text-transform:none;display:inline-flex;align-items:center;gap:7px}\
#devboard-view .db-teams button.active,#devboard-view .db-chipbtn.active{background:var(--tx);color:#fff;border-color:var(--tx)}\
#devboard-view .db-teams button .ro{font-weight:500;color:var(--tf);margin-left:2px}#devboard-view .db-teams button.active .ro{color:#8e8e93}\
#devboard-view .db-chipbtn i{width:8px;height:8px;border-radius:50%;background:var(--tc,#64748b);display:inline-block}\
#devboard-view .db-search{font:inherit;font-size:14px;padding:9px 12px 9px 36px;border:1px solid var(--bd);border-radius:12px;min-height:0;width:220px;margin-left:auto;background:#fff url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2716%27 height=%2716%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%23a1a1a6%27 stroke-width=%272%27%3E%3Ccircle cx=%2711%27 cy=%2711%27 r=%278%27/%3E%3Cpath d=%27m21 21-4.3-4.3%27/%3E%3C/svg%3E") 12px center no-repeat}\
#devboard-view .db-search:focus{outline:none;border-color:var(--ac);box-shadow:0 0 0 3px rgba(0,113,227,.15)}\
#devboard-view .db-lead{background:#fff;border:1px solid var(--bl);border-radius:var(--rc);padding:18px 22px;margin:0 0 16px;display:grid;grid-template-columns:1fr auto;gap:18px;align-items:center;box-shadow:var(--sh)}\
#devboard-view .db-lead h4{margin:0 0 4px;font-size:17px;font-weight:700;color:var(--tx);text-transform:none;letter-spacing:-.01em;padding-left:12px;border-left:3px solid var(--ac)}\
#devboard-view .db-lead p{margin:0;font-size:13.5px;line-height:1.5;color:var(--ts);max-width:720px;padding-left:15px}\
#devboard-view .db-lead .st{display:flex;gap:20px}#devboard-view .db-lead .st div{text-align:center}\
#devboard-view .db-lead .st b{display:block;font-size:24px;font-weight:700;color:var(--ac);line-height:1.1}\
#devboard-view .db-lead .st small{font-size:11px;color:var(--tf);text-transform:uppercase;letter-spacing:.05em;font-weight:600}\
#devboard-view .db-status{display:flex;align-items:center;gap:10px;font-size:13px;font-weight:500;border-radius:12px;padding:10px 14px;margin:0 0 14px;line-height:1.45}\
#devboard-view .db-status i{width:9px;height:9px;border-radius:50%;flex:0 0 9px}\
#devboard-view .db-status.off{background:#fff6ec;color:#9a3412}#devboard-view .db-status.off i{background:var(--orange)}\
#devboard-view .db-status.on{background:var(--acs);color:#0a3f7a}#devboard-view .db-status.on i{background:var(--ac)}\
#devboard-view .db-status .db-link{margin-left:auto;white-space:nowrap}\
#devboard-view .db-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:14px;align-items:start}\
#devboard-view .db-card{align-self:start;height:auto}\
#devboard-view .db-card{background:#fff;border:1px solid var(--bl);border-radius:var(--rc);box-shadow:var(--sh);min-width:0;overflow:hidden}\
#devboard-view .db-head{display:flex;align-items:center;gap:11px;padding:14px 15px;border-bottom:1px solid var(--bl)}\
#devboard-view .db-av{width:44px;height:44px;border-radius:12px;background:var(--acs);color:var(--ac);font-size:15px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;flex:0 0 44px}\
#devboard-view .db-head .nm{flex:1;min-width:0}\
#devboard-view .db-head .nm b{display:block;font-size:15px;font-weight:700;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\
#devboard-view .db-head .nm small{display:block;font-size:11.5px;color:var(--ts);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\
#devboard-view .db-head .pills{display:flex;flex-direction:column;gap:5px;align-items:flex-end}\
#devboard-view .db-pill{font-size:11.5px;font-weight:600;padding:4px 10px;border-radius:999px;white-space:nowrap;background:var(--bgs);color:var(--ts)}\
#devboard-view .db-pill.blue{background:var(--acs);color:var(--ac)}#devboard-view .db-pill.red{background:#fef2f2;color:var(--red)}#devboard-view .db-pill.green{background:#e9f7ef;color:var(--green)}#devboard-view .db-pill.orange{background:#fff6ec;color:var(--orange)}\
#devboard-view .db-toggle{width:34px;height:34px;border-radius:10px;border:1px solid var(--bd);background:#fff;cursor:pointer;min-height:0;min-width:0;padding:0;display:inline-flex;align-items:center;justify-content:center;color:var(--ts);flex:0 0 34px}\
#devboard-view .db-track{padding:12px 15px;border-bottom:1px solid var(--bl)}\
#devboard-view .db-track .lbl{display:flex;justify-content:space-between;align-items:center;font-size:13px;font-weight:600;margin-bottom:8px}\
#devboard-view .db-track .lbl small{font-weight:600;color:var(--tf);font-size:11px;text-transform:uppercase;letter-spacing:.05em}\
#devboard-view .db-bar2{height:6px;border-radius:3px;background:var(--bl);position:relative;overflow:visible}\
#devboard-view .db-bar2 i{display:block;height:100%;border-radius:3px;background:var(--ac)}\
#devboard-view .db-bar2 em{position:absolute;top:-6px;width:2px;height:18px;background:var(--red);border-radius:1px}\
#devboard-view .db-bar2 em:after{content:attr(data-l);position:absolute;top:-14px;left:50%;transform:translateX(-50%);font-size:10px;font-weight:700;color:var(--red);font-style:normal}\
#devboard-view .db-pos{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:12px 15px;background:var(--bgt);border-bottom:1px solid var(--bl)}\
#devboard-view .db-pos .k{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--tf);margin-right:2px}\
#devboard-view .db-pos button{font:inherit;font-size:12.5px;font-weight:600;padding:5px 12px;border-radius:999px;border:1px solid var(--bd);background:#fff;color:var(--ts);cursor:pointer;min-height:0;min-width:0;text-transform:none}\
#devboard-view .db-pos button.on{background:var(--ac);color:#fff;border-color:transparent}\
#devboard-view .db-pos button:disabled{cursor:default;opacity:.7}\
#devboard-view .db-body{padding:12px 15px 14px}\
#devboard-view .db-sec{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--tf);margin:4px 0 8px}\
#devboard-view .db-need{display:grid;grid-template-columns:1fr auto;gap:6px 10px;align-items:center;padding:8px 0;border-bottom:1px solid var(--bl)}\
#devboard-view .db-need b{font-weight:600;font-size:14px}\
#devboard-view .db-need small{display:block;font-size:12px;color:var(--ts);margin-top:1px}\
#devboard-view .db-need .sc{display:inline-flex;gap:3px;align-items:center}\
#devboard-view .db-need .sc i{width:9px;height:9px;border-radius:50%;background:var(--bl)}\
#devboard-view .db-need .sc i.f{background:var(--tx)}#devboard-view .db-need .sc i.lo{background:var(--red)}\
#devboard-view .db-need .sc span{font-size:11px;font-weight:700;color:var(--ts);margin-left:5px}\
#devboard-view .db-item{display:grid;grid-template-columns:1fr auto;gap:4px 10px;align-items:start;padding:10px 0;border-bottom:1px solid var(--bl);cursor:pointer}\
#devboard-view .db-item:hover .t{color:var(--ac)}\
#devboard-view .db-item .t{font-size:14px;font-weight:600;line-height:1.3}\
#devboard-view .db-item .c{font-size:12.5px;color:var(--ts);line-height:1.45;margin-top:2px}\
#devboard-view .db-item .rep{font-size:12.5px;color:var(--tx);background:var(--bgs);border-radius:8px;padding:7px 10px;margin-top:7px;line-height:1.4;grid-column:1/-1}\
#devboard-view .db-item .rep b{color:var(--ac);font-weight:700;font-size:10.5px;letter-spacing:.05em;text-transform:uppercase;margin-right:6px}\
#devboard-view .db-item .why{font-size:11.5px;color:var(--tf);margin-top:4px;grid-column:1/-1}\
#devboard-view .db-item .mn{font-size:12px;font-weight:600;color:var(--ts);white-space:nowrap;padding-top:2px}\
#devboard-view .db-tag{display:inline-block;font-size:10.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--tc);background:color-mix(in srgb,var(--tc) 12%,#fff);border-radius:999px;padding:3px 9px;margin-top:6px;white-space:nowrap}\
#devboard-view .db-tag.sm{margin:0;font-size:10px;padding:2px 7px}\
#devboard-view .db-focus{font-size:13.5px;color:var(--tx);background:var(--bgs);border-radius:10px;padding:10px 12px;line-height:1.45}\
#devboard-view .db-focus.empty{color:var(--tf)}\
#devboard-view .db-warn{font-size:12.5px;color:#9a3412;background:#fff6ec;border-radius:10px;padding:8px 12px;margin-top:10px}\
#devboard-view .db-foot{display:flex;gap:8px;padding:12px 15px 14px;border-top:1px solid var(--bl);background:var(--bgt)}\
#devboard-view .db-btn{font:inherit;font-size:13px;font-weight:600;padding:9px 16px;border-radius:var(--rb);border:1px solid var(--bd);cursor:pointer;min-height:0;min-width:0;text-transform:none;background:#fff;color:var(--tx);display:inline-flex;align-items:center;gap:6px}\
#devboard-view .db-btn.primary{background:var(--ac);color:#fff;border-color:transparent}\
#devboard-view .db-btn.soft{background:var(--acs);color:var(--ac);border-color:transparent;width:100%;justify-content:center}\
#devboard-view .db-btn:disabled{opacity:.55;cursor:default}\
#devboard-view .db-link{background:none;border:none;padding:0;font:inherit;font-size:13px;font-weight:600;color:var(--ac);cursor:pointer;min-height:0;min-width:0;text-transform:none}\
#devboard-view .db-link:disabled{color:var(--tf);cursor:default}\
#devboard-view .db-empty{padding:40px 20px;text-align:center;color:var(--ts);font-size:14px;background:#fff;border-radius:var(--rc);border:1px dashed var(--bd)}\
#devboard-view .db-two{display:grid;grid-template-columns:1.2fr 1fr;gap:14px}\
#devboard-view .db-panel{background:#fff;border:1px solid var(--bl);border-radius:var(--rc);padding:18px 20px;box-shadow:var(--sh);min-width:0}\
#devboard-view .db-panel h4{margin:0 0 2px;font-size:16px;font-weight:700;text-transform:none;letter-spacing:-.01em;padding-left:10px;border-left:3px solid var(--ac)}\
#devboard-view .db-panel .in{margin:0 0 12px;font-size:13px;color:var(--ts);padding-left:13px}\
#devboard-view .db-rank{display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:center;padding:9px 0;border-top:1px solid var(--bl);font-size:14px}\
#devboard-view .db-rank:first-of-type{border-top:none}\
#devboard-view .db-rank .k{width:24px;height:24px;border-radius:50%;background:var(--tx);color:#fff;font-size:12px;font-weight:700;display:inline-flex;align-items:center;justify-content:center}\
#devboard-view .db-rank b{font-weight:600}#devboard-view .db-rank b small{font-weight:500;color:var(--ts);margin-left:6px;font-size:12px}\
#devboard-view .db-rank .bar{height:6px;border-radius:3px;background:var(--bl);margin-top:6px;overflow:hidden}\
#devboard-view .db-rank .bar i{display:block;height:100%;background:var(--ac);border-radius:3px}\
#devboard-view .db-rank small.r{color:var(--ts);font-size:12px;white-space:nowrap}\
#devboard-view .db-gap{display:flex;gap:10px;align-items:flex-start;font-size:13.5px;padding:7px 0;line-height:1.45}\
#devboard-view .db-gap i{width:9px;height:9px;border-radius:50%;flex:0 0 9px;margin-top:6px}\
#devboard-view .db-gap.red i{background:var(--red)}#devboard-view .db-gap.orange i{background:var(--orange)}#devboard-view .db-gap.green i{background:var(--green)}#devboard-view .db-gap.grey i{background:#c7c7cc}\
#devboard-view .db-group{padding:10px 0;border-top:1px solid var(--bl);font-size:13.5px}\
#devboard-view .db-group:first-of-type{border-top:none}\
#devboard-view .db-group b{display:block;font-weight:600;font-size:14px}\
#devboard-view .db-group .who{color:var(--tx);margin-top:3px}\
#devboard-view .db-group .cue{color:var(--ts);font-size:12.5px;margin-top:2px}\
#devboard-view .db-block{display:grid;grid-template-columns:auto 64px 1fr;gap:16px;padding:14px 0;border-top:1px solid var(--bl)}\
#devboard-view .db-block:first-of-type{border-top:none;padding-top:0}\
#devboard-view .db-block .n{width:28px;height:28px;border-radius:8px;background:var(--bgs);font-weight:700;font-size:14px;display:inline-flex;align-items:center;justify-content:center;color:var(--tx)}\
#devboard-view .db-block .tm{font-size:15px;font-weight:700;letter-spacing:-.01em}\
#devboard-view .db-block .tm small{display:block;font-size:11px;font-weight:600;color:var(--tf);margin-top:2px}\
#devboard-view .db-block h5{margin:0 0 3px;font-size:15px;font-weight:700;text-transform:none}\
#devboard-view .db-block p{margin:0;font-size:13.5px;line-height:1.5;color:var(--ts)}\
#devboard-view .db-block .nt{font-size:12.5px;color:var(--tf);margin-top:4px}\
#devboard-view .db-fill{margin-top:8px;display:grid;gap:6px}\
#devboard-view .db-st{display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:start;background:var(--bgs);border-radius:10px;padding:9px 12px;font-size:13px}\
#devboard-view .db-st .k{font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--ac);padding-top:3px;white-space:nowrap}\
#devboard-view .db-st b{display:block;font-weight:600;font-size:13.5px}\
#devboard-view .db-st span{color:var(--ts)}\
#devboard-view .db-st .who{display:block;font-size:12px;color:var(--ts);margin-top:2px}\
#devboard-view .db-plan-bar{display:flex;gap:10px;align-items:center;margin-bottom:14px;flex-wrap:wrap}\
#devboard-view .db-tabs button .db-dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:#d92d20;margin-left:6px;vertical-align:2px}\
#devboard-view .db-act{display:grid;grid-template-columns:44px 1fr auto;gap:4px 12px;align-items:start;padding:12px 0;border-bottom:1px solid var(--bl)}\
#devboard-view .db-act .ic{width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;letter-spacing:.04em;color:#fff;background:var(--ac)}#devboard-view .db-act .ic.plan{background:#7c3aed}#devboard-view .db-act .ic.share{background:#159a52}\
#devboard-view .db-act b{font-size:14.5px;font-weight:700}#devboard-view .db-act p{margin:2px 0 0;font-size:13px;color:var(--ts);line-height:1.45}#devboard-view .db-act .when{font-size:12px;color:var(--tf);white-space:nowrap}#devboard-view .db-act.new b::after{content:"New";font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#d92d20;background:#fdecea;border-radius:999px;padding:2px 7px;margin-left:8px;vertical-align:1px}\
#devboard-view .db-act .chips{margin-top:6px;display:flex;flex-wrap:wrap;gap:4px}#devboard-view .db-act .chips span{font-size:11.5px;font-weight:600;background:var(--bgs);border-radius:999px;padding:3px 9px;color:var(--tx)}\
#devboard-view .db-bankgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px}\
#devboard-view .db-bk{background:#fff;border:1px solid var(--bl);border-radius:var(--rc);box-shadow:var(--sh);padding:16px 18px 14px;border-top:4px solid var(--tc,#64748b);min-width:0;display:flex;flex-direction:column;gap:8px;cursor:pointer}\
#devboard-view .db-bk:hover{border-color:var(--bd);border-top-color:var(--tc)}\
#devboard-view .db-bk .top{display:flex;justify-content:space-between;align-items:center;gap:8px}\
#devboard-view .db-bk .top .db-tag{margin:0}\
#devboard-view .db-bk h5{margin:0;font-size:15px;font-weight:700;text-transform:none;letter-spacing:-.01em}\
#devboard-view .db-bk .cue{font-size:13px;color:var(--ts);line-height:1.45;flex:1}\
#devboard-view .db-bk .meta{display:flex;align-items:center;gap:8px;font-size:12.5px;font-weight:600;color:var(--ts)}\
#devboard-view .db-bk .meta .lv{margin-left:auto;font-size:11px;color:var(--tf)}\
#devboard-view .db-bk .devs{display:flex;flex-wrap:wrap;gap:4px}\
#devboard-view .db-chip{display:inline-block;font-size:11px;font-weight:600;background:var(--bgs);color:#3a3a3c;border-radius:999px;padding:2px 8px}\
#devboard-view .db-chip.flag{background:#fff6ec;color:var(--orange)}#devboard-view .db-chip.imp{background:var(--acs);color:var(--ac)}#devboard-view .db-chip.hit{background:#fef2f2;color:var(--red)}\
#devboard-view .db-note{font-size:12px;color:var(--tf);margin-top:14px}\
#devboard-view .db-i{width:24px;height:24px;border-radius:50%;border:1px solid var(--bd);background:#fff;color:var(--tf);font-size:12px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;min-height:0;min-width:0;padding:0}\
#db-backdrop{position:fixed;inset:0;background:rgba(15,23,42,.38);z-index:400;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(2px)}\
#db-backdrop .db-sheet{background:#fff;border-radius:20px;width:min(640px,100%);max-height:92vh;overflow:auto;box-shadow:0 18px 48px rgba(15,23,42,.18);position:relative}\
#db-backdrop .db-sheet .hd{padding:26px 28px 20px;background:linear-gradient(180deg,color-mix(in srgb,var(--hc,#0071e3) 10%,#fff),#fff);position:relative}\
#db-backdrop .db-sheet .hd h3{margin:8px 0 6px;font-size:22px;font-weight:700;letter-spacing:-.02em;text-transform:none}\
#db-backdrop .db-sheet .hd p{margin:0;font-size:14px;color:#6e6e73;line-height:1.45}\
#db-backdrop .db-sheet .x{position:absolute;top:18px;right:18px;width:36px;height:36px;border-radius:50%;border:none;background:#f5f5f7;color:#1d1d1f;font-size:18px;cursor:pointer;min-height:0;min-width:0;padding:0;display:inline-flex;align-items:center;justify-content:center}\
#db-backdrop .db-sheet .bd{padding:6px 28px 26px}\
#db-backdrop .db-tag{display:inline-block;font-size:10.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--tc);background:color-mix(in srgb,var(--tc) 12%,#fff);border-radius:999px;padding:4px 10px;margin:0}\
#db-backdrop .sec{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--hc,#0071e3);margin:18px 0 8px}\
#db-backdrop ul.dots{list-style:none;margin:0;padding:0}\
#db-backdrop ul.dots li{position:relative;padding:5px 0 5px 20px;font-size:14.5px;line-height:1.5;color:#1d1d1f}\
#db-backdrop ul.dots li:before{content:"";position:absolute;left:4px;top:13px;width:7px;height:7px;border-radius:50%;background:var(--hc,#0071e3)}\
#db-backdrop ul.dots li .lv{display:inline-block;font-size:10px;font-weight:700;letter-spacing:.05em;color:#6e6e73;background:#f5f5f7;border-radius:999px;padding:1px 7px;margin-right:6px;vertical-align:1px}\
#db-backdrop ul.dots li.mine{background:#eaf3ff;border-radius:8px;margin:2px 0;padding-left:20px}\
#db-backdrop .box{display:grid;grid-template-columns:auto 1fr;gap:14px;align-items:start;background:#f5f5f7;border:1px solid #ececf0;border-radius:12px;padding:14px 16px;margin-top:10px;font-size:14.5px;font-weight:600;line-height:1.45}\
#db-backdrop .box .k{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--hc,#0071e3);padding-top:3px;white-space:nowrap}\
#db-backdrop .devs{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}\
#db-backdrop .db-chip{display:inline-block;font-size:11.5px;font-weight:600;background:#f5f5f7;color:#3a3a3c;border-radius:999px;padding:3px 9px}\
#db-backdrop .db-chip.hit{background:#fef2f2;color:#d92d20}\
#db-backdrop .rt-skill{margin-top:18px;padding-top:14px;border-top:1px solid #ececf0}\
#db-backdrop .rt-skill:first-child{margin-top:8px;border-top:none;padding-top:0}\
#db-backdrop .rt-head{display:flex;align-items:center;gap:10px;margin-bottom:6px;flex-wrap:wrap}\
#db-backdrop .rt-all{display:inline-flex;align-items:center;gap:4px;margin-left:auto}#db-backdrop .rt-all small{font-size:11px;color:#a1a1a6;margin-right:2px}\
#db-backdrop .rt-all button{width:24px;height:24px;border-radius:7px;border:1px solid #d9d9de;background:#fff;font-size:11.5px;font-weight:600;color:#6e6e73;cursor:pointer;padding:0}#db-backdrop .rt-all button:hover{border-color:#0071e3;color:#0071e3}#db-backdrop .rt-all button:disabled{opacity:.45;cursor:default}\
#db-backdrop .rt-bulk{display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:#f5f5f7;border:1px solid #ececf0;border-radius:12px;padding:10px 12px;margin:2px 0 14px}\
#db-backdrop .rt-bulk b{font-size:13px;font-weight:700}#db-backdrop .rt-bulk .seg{display:inline-flex;gap:4px}#db-backdrop .rt-bulk .seg button{height:32px;padding:0 12px;border-radius:9px;border:1px solid #d9d9de;background:#fff;font-size:13px;font-weight:600;color:#1d1d1f;cursor:pointer}#db-backdrop .rt-bulk .seg button:hover{border-color:#0071e3;color:#0071e3}#db-backdrop .rt-bulk .seg button:disabled{opacity:.45;cursor:default}#db-backdrop .rt-bulk small{font-size:11.5px;color:#6e6e73;flex-basis:100%}\
#db-backdrop .rt-head b{font-size:15px;font-weight:700}\
#db-backdrop .rt-head .ph{font-size:11.5px;font-weight:600;padding:3px 9px;border-radius:999px;background:#f5f5f7;color:#6e6e73}\
#db-backdrop .rt-head .ph.on{background:#e9f7ef;color:#159a52}#db-backdrop .rt-head .ph.behind{background:#fff6ec;color:#d9660a}#db-backdrop .rt-head .ph.ahead{background:#eaf3ff;color:#0071e3}\
#db-backdrop .rt-row{display:grid;grid-template-columns:1fr auto;gap:8px 12px;align-items:center;padding:7px 0}\
#db-backdrop .rt-row .lb{font-size:14px;font-weight:600}\
#db-backdrop .rt-row .lb small{display:block;font-size:11.5px;color:#a1a1a6;font-weight:500;margin-top:1px}\
#db-backdrop .rt-seg{display:inline-flex;gap:3px;padding:3px;background:rgba(118,118,128,.12);border-radius:10px}\
#db-backdrop .rt-seg button{width:38px;height:32px;border:none;border-radius:8px;background:transparent;font:inherit;font-size:13px;font-weight:700;color:#6e6e73;cursor:pointer;min-height:0;min-width:0;padding:0}\
#db-backdrop .rt-seg button.on{background:#0071e3;color:#fff;box-shadow:0 1px 3px rgba(0,0,0,.15)}\
#db-backdrop .rt-seg button:disabled{cursor:default;opacity:.6}\
#db-backdrop .rt-word{font-size:11.5px;color:#6e6e73;text-align:right;grid-column:2;margin-top:-4px;min-height:14px}\
#db-backdrop .rt-num{display:inline-flex;align-items:center;gap:6px}\
#db-backdrop .rt-num input{font:inherit;font-size:14px;width:76px;padding:7px 9px;border:1px solid #d9d9de;border-radius:8px;min-height:0;text-align:right}\
#db-backdrop .rt-num small{font-size:11.5px;color:#a1a1a6;width:34px}\
#db-backdrop .rt-num .sc{font-size:11.5px;font-weight:700;padding:3px 8px;border-radius:999px;background:#f5f5f7;color:#6e6e73;min-width:22px;text-align:center}\
#db-backdrop .rt-num .sc.g{background:#eaf3ff;color:#0071e3}\
#db-backdrop .pos{display:flex;gap:8px;flex-wrap:wrap}\
#db-backdrop .pos button{font:inherit;font-size:13px;font-weight:600;padding:7px 16px;border-radius:999px;border:1px solid #d9d9de;background:#fff;color:#6e6e73;cursor:pointer;min-height:0;min-width:0;text-transform:none}\
#db-backdrop .pos button.on{background:#0071e3;color:#fff;border-color:transparent}\
#db-backdrop textarea{font:inherit;font-size:14px;width:100%;padding:10px 12px;border:1px solid #d9d9de;border-radius:10px;min-height:64px;resize:vertical}\
#db-backdrop .err{margin-top:12px;font-size:13px;color:#d92d20;background:#fef2f2;border-radius:10px;padding:10px 12px;display:none}#db-backdrop .err.on{display:block}\
#db-backdrop .actions{display:flex;justify-content:flex-end;gap:10px;margin-top:18px;position:sticky;bottom:0;background:#fff;padding-top:12px}\
#db-backdrop .btn{font:inherit;font-size:14px;font-weight:600;padding:9px 16px;border-radius:10px;border:1px solid #d9d9de;cursor:pointer;min-height:0;min-width:0;text-transform:none;background:#fff;color:#1d1d1f}\
#db-backdrop .btn.primary{background:#0071e3;color:#fff;border-color:transparent}#db-backdrop .btn:disabled{opacity:.55}\
#db-backdrop .legend{display:flex;gap:12px;flex-wrap:wrap;font-size:12px;color:#6e6e73;margin:6px 0 4px}\
#db-backdrop .legend b{color:#1d1d1f;font-weight:700}\
.db-toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);background:#1d1d1f;color:#fff;font-size:13.5px;font-weight:600;padding:10px 18px;border-radius:999px;z-index:500;box-shadow:0 8px 24px rgba(0,0,0,.25)}\
@media (max-width:960px){#devboard-view .db-two{grid-template-columns:1fr}#devboard-view .db-lead{grid-template-columns:1fr}#devboard-view .db-search{width:100%;margin-left:0}}\
@media (max-width:640px){#devboard-view .db-grid{grid-template-columns:1fr}#devboard-view .db-block{grid-template-columns:auto 52px 1fr;gap:10px}#devboard-view .db-st{grid-template-columns:1fr auto}#devboard-view .db-st .k{grid-column:1/-1;padding-top:0}\
#db-backdrop{padding:0;align-items:flex-end}#db-backdrop .db-sheet{border-radius:20px 20px 0 0;max-height:94vh;max-height:94dvh}#db-backdrop .db-sheet .hd{padding:22px 20px 16px}#db-backdrop .db-sheet .bd{padding:4px 20px calc(18px + env(safe-area-inset-bottom))}\
#db-backdrop .rt-row{grid-template-columns:1fr;gap:6px}#db-backdrop .rt-word{grid-column:1;text-align:left}#db-backdrop .rt-seg{width:100%}#db-backdrop .rt-seg button{flex:1;height:40px}}\
@media print{#devboard-view .db-tabs,#devboard-view .db-bar,#devboard-view .db-plan-bar,#devboard-view .db-foot{display:none}}';
  function injectCss() { if (el('coach-devboard-css')) return; var s = document.createElement('style'); s.id = 'coach-devboard-css'; s.textContent = CSS; document.head.appendChild(s); }
  function toast(msg) { var t = document.createElement('div'); t.className = 'db-toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(function () { t.remove(); }, 2600); }


  // ---------- players tab ----------
  function scoreDots(v) { var h = '<span class="sc">'; for (var i = 1; i <= 5; i++) h += '<i class="' + (i <= v ? (v <= 2 ? 'f lo' : 'f') : '') + '"></i>'; return h + '<span>' + esc(rubric(v)) + '</span></span>'; }
  function trackPill(a) {
    if (!started(a)) return '<span class="db-pill">Not evaluated</span>';
    var b = behindCount(a); if (b) return '<span class="db-pill red">' + b + ' behind target</span>';
    var ahead = Object.keys(subsCfg()).filter(function (sk) { return track(a, sk) === 'ahead'; }).length;
    return ahead ? '<span class="db-pill green">On track, ' + ahead + ' ahead</span>' : '<span class="db-pill green">On track</span>';
  }
  function playerCard(a, teamId) {
    var d = devOf(a); var age = ageOf(a); var nd = needsOf(a); var rx = prescribe(a); var warn = prereqWarnings(a); var rc = ratedCount(a); var total = totalSubs(); var can = canEdit(teamId);
    var open = state.expanded[a.id] !== false;
    var meta = [a.jersey_number ? '#' + a.jersey_number : '', gradeText(a).replace(' grade', ''), 'Age ' + age].filter(Boolean).join(' \u00b7 ');
    var sh = state.shares[a.id];
    var h = '<article class="db-card" data-id="' + esc(a.id) + '">';
    h += '<div class="db-head"><div class="db-av">' + esc(a.jersey_number ? String(a.jersey_number) : initials(a)) + '</div><div class="nm"><b>' + esc(a.first_name + ' ' + (a.last_name || '')) + '</b><small>' + esc(meta) + (sh ? ' \u00b7 Shared ' + esc(fmtDay(sh.shared_at)) : '') + '</small></div><div class="pills"><span class="db-pill">' + rc + ' of ' + total + ' scored</span>' + trackPill(a) + '</div><button type="button" class="db-toggle" data-act="toggle" aria-label="Show or hide">' + (open ? '&#8963;' : '&#8964;') + '</button></div>';
    // rating coverage bar with the age-target marker
    var pct = total ? Math.round(rc / total * 100) : 0;
    h += '<div class="db-track"><div class="lbl"><span>' + rc + ' of ' + total + ' scored</span><small>' + (started(a) ? esc(overallPhase(a)) : 'Not evaluated') + '</small></div><div class="db-bar2"><i style="width:' + pct + '%"></i></div></div>';
    h += '<div class="db-pos"><span class="k">Position</span>' + POSITIONS.map(function (p) { return '<button type="button" data-pos="' + p + '" class="' + (positionOf(a) === p ? 'on' : '') + '"' + (can ? '' : ' disabled') + '>' + p + '</button>'; }).join('') + '</div>';
    if (open) {
      h += '<div class="db-body">';
      if (!started(a)) h += '<div class="db-focus empty">Not evaluated yet. Open Evaluate and score what you see; his card fills itself.</div>';
      else {
        h += '<div class="db-sec">Needs next</div>';
        if (!nd.length) h += '<div class="db-focus empty">Every scored sub-skill is Consistent or better. Score the rest, or raise the bar.</div>';
        nd.forEach(function (n) { h += '<div class="db-need"><div><b>' + esc(subKeyLabel(n.key)) + '</b><small>' + esc(label(n.skill)) + (n.behind ? ', behind the age target' : '') + (subHint(n.key) ? '. ' + esc(subHint(n.key)) : '') + '</small></div>' + scoreDots(n.score) + '</div>'; });
        var un = unratedSkills(a); if (un.length) h += '<div class="db-need" style="grid-template-columns:1fr"><small>Not scored yet: ' + esc(un.map(label).join(', ')) + '</small></div>';
        if (rx.length) {
          h += '<div class="db-sec" style="margin-top:14px">Run these</div>';
          rx.forEach(function (x) { var dr = x.drill; h += '<div class="db-item" data-drill="' + esc(dr.name) + '"><div><div class="t">' + esc(dr.name) + '</div><div class="c">' + esc(dr.cue || '') + '</div>' + tagChip(dr.tag) + '</div><div class="mn">' + esc(dr.min || 5) + ' min</div>' + (x.rep ? '<div class="rep"><b>Start here</b>' + esc(x.rep.text) + '</div>' : '') + '<div class="why">For ' + esc(subKeyLabel(x.need.key).toLowerCase()) + ' at ' + esc(phaseName(x.need.phase)) + '. Standard: ' + esc((dr.coaching && dr.coaching.standard) || 'game speed, both hands') + '</div></div>'; });
        }
      }
      warn.forEach(function (w) { h += '<div class="db-warn">' + esc(w) + '</div>'; });
      h += '<div class="db-sec" style="margin-top:14px">Coach focus</div><div class="db-focus' + (d.focus ? '' : ' empty') + '">' + esc(d.focus || 'One sentence for this kid. What he hears from every coach this month.') + '</div>';
      h += '</div>';
    }
    h += '<div class="db-foot"><button type="button" class="db-btn primary" data-act="rate"' + (can ? '' : ' disabled title="Only his own coach or the director can evaluate"') + '>' + (started(a) ? 'Evaluate' : 'Evaluate now') + '</button><button type="button" class="db-btn" data-act="drills">All drills for him</button>' + (canShare(teamId) && started(a) ? '<button type="button" class="db-btn" data-act="share" style="margin-left:auto">Share with parent</button>' : '') + '</div>';
    return h + '</article>';
  }
  function teamBar(withSearch) {
    var ts = teams(); if (!ts.length) return '';
    var h = '<div class="db-bar"><div class="db-teams">';
    ts.forEach(function (t) { var n = playersOf(t.id).length; if (!n && !state.isAdmin) return; h += '<button type="button" data-team="' + esc(t.id) + '"' + (t.id === state.teamId ? ' class="active"' : '') + '>' + esc(t.name.replace(/^Godspeed /, '')) + '<span class="ro">' + n + '</span></button>'; });
    h += '</div>';
    if (withSearch) h += '<input class="db-search" type="search" placeholder="Find a player" value="' + esc(state.q) + '" aria-label="Find a player">';
    return h + '</div>';
  }
  function playersHtml() {
    var ps = playersOf(state.teamId); var q = state.q.trim().toLowerCase();
    var vis = q ? ps.filter(function (a) { return (a.first_name + ' ' + a.last_name).toLowerCase().indexOf(q) >= 0; }) : ps;
    var rated = ps.filter(started).length; var behind = ps.filter(function (a) { return behindCount(a) > 0; }).length;
    var h = '<div class="db-lead"><div><h4>Score what you see. The board picks the drill.</h4><p>' + totalSubs() + ' sub-skills, 1 to 5 in our words. The phase comes from the scores, the needs come from the age targets, and every need gets the Godspeed drill and the rep to start with at his level.</p></div><div class="st"><div><b>' + ps.length + '</b><small>Players</small></div><div><b>' + rated + '</b><small>Evaluated</small></div><div><b>' + behind + '</b><small>Behind target</small></div></div></div>';
    h += teamBar(true);
    if (!ps.length) return h + '<div class="db-empty">No active players on this team.</div>';
    if (!vis.length) return h + '<div class="db-empty">No player matches that name.</div>';
    h += '<div class="db-grid">' + vis.map(function (a) { return playerCard(a, state.teamId); }).join('') + '</div>';
    if (!canEdit(state.teamId)) h += '<div class="db-note">You can read this team. Evaluating is for its own coaches and the director.</div>';
    return h;
  }

  // ---------- sheets ----------
  function sheet(html, color) {
    var old = el('db-backdrop'); if (old) old.remove();
    var b = document.createElement('div'); b.id = 'db-backdrop';
    b.innerHTML = '<div class="db-sheet" role="dialog" aria-modal="true" style="--hc:' + (color || '#0071e3') + '">' + html + '</div>';
    b.addEventListener('click', function (e) { if (e.target === b) closeSheet(); });
    document.body.appendChild(b); document.addEventListener('keydown', escClose);
    b.querySelectorAll('.x, [data-close]').forEach(function (x) { x.onclick = closeSheet; });
    return b;
  }
  function escClose(e) { if (e.key === 'Escape') closeSheet(); }
  function closeSheet() { var b = el('db-backdrop'); if (b) b.remove(); document.removeEventListener('keydown', escClose); }
  // Drill detail, the Command Center card: what to look for, standard, elite tell, drills to run with levels.
  function openDrill(d, a) {
    var c = d.coaching || {}; var color = tagColor(d.tag); var prog = d.progression || [1, 1, 2, 2, 3];
    var mySubs = a ? needsOf(a).map(function (n) { return n.key; }) : []; var myPhase = a && mySubs.length ? needsOf(a)[0].phase : 0;
    var h = '<div class="hd">' + tagChip(d.tag) + '<button type="button" class="x" aria-label="Close">&times;</button><h3>' + esc(d.name) + '</h3><p>' + esc(d.cue || '') + '</p></div><div class="bd">';
    h += '<div class="sec">Develops</div><div class="devs">' + (d.develops || []).map(function (k) { return '<span class="db-chip' + (mySubs.indexOf(k) >= 0 ? ' hit' : '') + '">' + esc(subKeyLabel(k)) + '</span>'; }).join('') + (d.level ? '<span class="db-chip">Level ' + esc(phaseName(d.level)) + '</span>' : '<span class="db-chip">Any level</span>') + (d.min ? '<span class="db-chip">' + esc(d.min) + ' min</span>' : '') + '</div>';
    if (c.look && c.look.length) h += '<div class="sec">What to look for</div><ul class="dots">' + c.look.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul>';
    if (c.standard) h += '<div class="box"><span class="k">Standard</span><span>' + esc(c.standard) + '</span></div>';
    if (c.elite) h += '<div class="box"><span class="k">Elite tell</span><span>' + esc(c.elite) + '</span></div>';
    if (c.drills && c.drills.length) h += '<div class="sec">Drills to run</div><ul class="dots">' + c.drills.map(function (r, i) { var L = prog[i] || 1; return '<li' + (myPhase && L === myPhase ? ' class="mine"' : '') + '><span class="lv">' + esc(phaseName(L).slice(0, 1)) + '</span>' + esc(r) + '</li>'; }).join('') + '</ul>';
    if (d.review) h += '<div class="box" style="background:#fff6ec;border-color:#fde3c8"><span class="k" style="color:#d9660a">Review</span><span style="font-weight:500">' + esc(d.review) + (d.source ? ' (' + esc(d.source) + ')' : '') + '</span></div>';
    h += '</div>';
    sheet(h, color);
  }
  function openDrills(a) {
    var seen = {}; var list = [];
    needsOf(a).forEach(function (n) { drillsForSub(n.key, n.phase, [], 4).forEach(function (d) { if (seen[d.name]) return; seen[d.name] = 1; list.push({ need: n, drill: d }); }); });
    var h = '<div class="hd"><span class="db-tag" style="--tc:#0071e3">Drills for him</span><button type="button" class="x" aria-label="Close">&times;</button><h3>' + esc(a.first_name) + '</h3><p>Everything in the bank that develops his three needs, best fit first. Tap one for the detail.</p></div><div class="bd">';
    if (!list.length) h += '<p style="color:#6e6e73">Nothing tagged for his needs yet, or he is not evaluated.</p>';
    var byNeed = {}; list.forEach(function (x) { (byNeed[x.need.key] = byNeed[x.need.key] || []).push(x.drill); });
    Object.keys(byNeed).forEach(function (k) {
      h += '<div class="sec">' + esc(subKeyLabel(k)) + ' <span style="color:#a1a1a6;font-weight:600">' + esc(rubric(subScore(a, k))) + '</span></div>';
      byNeed[k].forEach(function (d) { var rep = repAt(d, needsOf(a).filter(function (n) { return n.key === k; })[0].phase); h += '<div class="db-item" data-drill="' + esc(d.name) + '" style="display:grid;grid-template-columns:1fr auto;gap:4px 10px;padding:10px 0;border-bottom:1px solid #ececf0;cursor:pointer"><div><div style="font-weight:600;font-size:14.5px">' + esc(d.name) + '</div><div style="font-size:12.5px;color:#6e6e73;margin-top:2px">' + esc(d.cue || '') + '</div><div style="margin-top:6px">' + tagChip(d.tag, 'sm') + '</div></div><div style="font-size:12px;font-weight:600;color:#6e6e73;white-space:nowrap">' + esc(d.min || 5) + ' min</div>' + (rep ? '<div style="grid-column:1/-1;font-size:12.5px;background:#f5f5f7;border-radius:8px;padding:7px 10px;margin-top:6px"><b style="color:#0071e3;font-size:10.5px;letter-spacing:.05em;text-transform:uppercase;margin-right:6px">Start here</b>' + esc(rep.text) + '</div>' : '') + '</div>'; });
    });
    h += '</div>';
    var b = sheet(h, '#0071e3');
    b.querySelectorAll('[data-drill]').forEach(function (n) { n.onclick = function () { var d = findDrill(n.getAttribute('data-drill')); if (d) openDrill(d, a); }; });
  }

  // ---------- rate sheet (three minutes per player) ----------
  function rateRowHtml(a, sk, s, editable) {
    var key = sk + '.' + s.key; var v = subScore(a, key);
    if (sk === 'strength') {
      var raw_ = (devOf(a).strength_bench || {})[s.key]; var sc = strengthScore(ageOf(a), s.key, raw_);
      return '<div class="rt-row" data-sub="' + key + '"><div class="lb">' + esc(s.label) + '<small>' + esc(s.hint) + '</small></div><div class="rt-num"><input type="number" step="0.1" inputmode="decimal" data-bench="' + s.key + '" value="' + (raw_ == null ? '' : esc(raw_)) + '"' + (editable ? '' : ' disabled') + '><small>' + esc(s.unit || '') + '</small><span class="sc' + (sc ? ' g' : '') + '">' + (sc || '') + '</span></div></div>';
    }
    var h = '<div class="rt-row" data-sub="' + key + '"><div class="lb">' + esc(s.label) + (s.hint ? '<small>' + esc(s.hint) + '</small>' : '') + '</div><div class="rt-seg">';
    for (var i = 1; i <= 5; i++) h += '<button type="button" data-v="' + i + '" class="' + (i === v ? 'on' : '') + '" title="' + esc(rubric(i)) + '"' + (editable ? '' : ' disabled') + '>' + i + '</button>';
    return h + '</div><div class="rt-word">' + (v ? esc(rubric(v)) : '') + '</div></div>';
  }
  function skillHead(a, sk, editable) {
    var st = skillOf(a, sk); var tr = track(a, sk); var t = targetsFor(ageOf(a))[sk] || 0;
    var pill = !st.n ? '<span class="ph">Not scored</span>' : '<span class="ph ' + tr + '">' + esc(phaseName(st.p)) + (st.capped ? ', capped' : '') + (t && tr !== 'on' ? ', target ' + esc(phaseName(t)) : '') + '</span>';
    var all = sk === 'strength' ? '' : '<span class="rt-all" data-all="' + sk + '"><small>All</small>' + [1, 2, 3, 4, 5].map(function (i) { return '<button type="button" data-v="' + i + '" title="Set every ' + esc(label(sk).toLowerCase()) + ' skill to ' + esc(rubric(i)) + '"' + (editable === false ? ' disabled' : '') + '>' + i + '</button>'; }).join('') + '</span>';
    return '<div class="rt-head"><b>' + esc(label(sk)) + '</b>' + pill + all + '<span style="font-size:11.5px;color:#a1a1a6' + (all ? '' : ';margin-left:auto') + '">' + st.n + ' of ' + subList(sk).length + '</span></div>';
  }
  function openRate(a, teamId) {
    var editable = canEdit(teamId); var d = devOf(a);
    var h = '<div class="hd"><span class="db-tag" style="--tc:#0071e3">Evaluation</span><button type="button" class="x" aria-label="Close">&times;</button><h3>' + esc(a.first_name + ' ' + (a.last_name || '')) + '</h3><p>Age ' + ageOf(a) + (positionOf(a) ? ', ' + esc(positionOf(a)) : '') + '. Score what you see. Every tap saves. The phase for each skill comes from the scores.</p></div><div class="bd">';
    h += '<div class="legend"><span><b>1</b> Poor</span><span><b>2</b> Weak</span><span><b>3</b> Some good actions</span><span><b>4</b> Consistent</span><span><b>5</b> Excellent</span></div>';
    if (editable) h += '<div class="rt-bulk"><b>Set every skill to</b><span class="seg">' + [1, 2, 3, 4, 5].map(function (i) { return '<button type="button" data-bulk="' + i + '">' + i + ' ' + esc(rubric(i)) + '</button>'; }).join('') + '</span><small>One tap scores all ' + (totalSubs() - subList('strength').length) + ' skills. Strength stays on the numbers. Then change the ones you saw differently.</small></div>';
    h += '<div class="sec">Position</div><div class="pos">' + POSITIONS.map(function (p) { return '<button type="button" data-pos="' + p + '" class="' + (positionOf(a) === p ? 'on' : '') + '"' + (editable ? '' : ' disabled') + '>' + p + '</button>'; }).join('') + '</div>';
    skillOrder().forEach(function (sk) { h += '<div class="rt-skill" data-skill="' + sk + '">' + skillHead(a, sk, editable) + subList(sk).map(function (s) { return rateRowHtml(a, sk, s, editable); }).join('') + '</div>'; });
    h += '<div class="sec">Coach focus</div><textarea id="db-focus" maxlength="240"' + (editable ? '' : ' disabled') + ' placeholder="One sentence. What he hears from every coach this month.">' + esc(d.focus || '') + '</textarea>';
    h += '<div class="err" id="db-err"></div><div class="actions"><button type="button" class="btn" data-close>Close</button>' + (editable ? '<button type="button" class="btn primary" id="db-save-focus">Save focus</button>' : '') + '</div></div>';
    var b = sheet(h, '#0071e3');
    var err = function (m) { var e = b.querySelector('#db-err'); if (!e) return; e.textContent = m || ''; e.classList.toggle('on', !!m); };
    var refreshSkill = function (sk) { var box = b.querySelector('.rt-skill[data-skill="' + sk + '"]'); if (!box) return; var head = box.querySelector('.rt-head'); var tmp = document.createElement('div'); tmp.innerHTML = skillHead(a, sk, editable); var nh = tmp.firstChild; head.replaceWith(nh); bindAll(nh); };
    var syncRows = function () { b.querySelectorAll('.rt-row').forEach(function (row) { var key = row.getAttribute('data-sub'); if (key.split('.')[0] === 'strength') return; var v = subScore(a, key); row.querySelectorAll('[data-v]').forEach(function (x) { x.classList.toggle('on', +x.getAttribute('data-v') === v); }); var w = row.querySelector('.rt-word'); if (w) w.textContent = v ? rubric(v) : ''; }); };
    var bulk = async function (skills, v, btns) {
      var map = {}; skills.forEach(function (sk) { if (sk === 'strength') return; subList(sk).forEach(function (s) { map[sk + '.' + s.key] = v; }); });
      btns.forEach(function (x) { x.disabled = true; });
      var res = await commit('set_player_subs', { p_athlete_id: a.id, p_subs: map });
      btns.forEach(function (x) { x.disabled = false; });
      if (!res.ok) { err(res.error && res.error.message || 'Could not save.'); return; }
      var dd = state.dev[a.id] = state.dev[a.id] || { athlete_id: a.id, skills: {}, subs: {} }; dd.subs = dd.subs || {}; Object.keys(map).forEach(function (k) { dd.subs[k] = v; });
      dd.skills = res.data && res.data.skills ? res.data.skills : deriveSkills(dd.subs);
      syncRows(); Object.keys(subsCfg()).forEach(refreshSkill); err(''); paint();
      toast((skills.length > 1 ? 'Every skill' : label(skills[0])) + ' set to ' + rubric(v) + (res.queued ? '. Sends when you are online.' : '.'));
    };
    var bindAll = function (head) { head.querySelectorAll('.rt-all [data-v]').forEach(function (btn) { btn.onclick = function () { var sk = btn.closest('.rt-all').getAttribute('data-all'); bulk([sk], +btn.getAttribute('data-v'), [].slice.call(btn.parentNode.querySelectorAll('button'))); }; }); };
    b.querySelectorAll('.rt-head').forEach(bindAll);
    b.querySelectorAll('.rt-bulk [data-bulk]').forEach(function (btn) { btn.onclick = function () { bulk(skillOrder(), +btn.getAttribute('data-bulk'), [].slice.call(b.querySelectorAll('.rt-bulk [data-bulk]'))); }; });
    b.querySelectorAll('.rt-row [data-v]').forEach(function (btn) {
      btn.onclick = async function () {
        var row = btn.closest('.rt-row'); var key = row.getAttribute('data-sub'); var v = +btn.getAttribute('data-v'); if (v === subScore(a, key)) v = 0;
        var res = await commit('set_player_sub', { p_athlete_id: a.id, p_sub: key, p_score: v });
        if (!res.ok) { err(res.error && res.error.message || 'Could not save.'); return; }
        var dd = state.dev[a.id] = state.dev[a.id] || { athlete_id: a.id, skills: {}, subs: {} }; dd.subs = dd.subs || {}; if (v) dd.subs[key] = v; else delete dd.subs[key];
        dd.skills = res.data && res.data.skills ? res.data.skills : deriveSkills(dd.subs);
        row.querySelectorAll('[data-v]').forEach(function (x) { x.classList.toggle('on', +x.getAttribute('data-v') === v); }); row.querySelector('.rt-word').textContent = v ? rubric(v) : '';
        Object.keys(subsCfg()).forEach(refreshSkill); err(''); paint();
      };
    });
    b.querySelectorAll('input[data-bench]').forEach(function (inp) {
      inp.onchange = async function () {
        var k = inp.getAttribute('data-bench'); var val = inp.value === '' ? null : +inp.value; var key = 'strength.' + k; var sc = val == null ? 0 : strengthScore(ageOf(a), k, val);
        var r1 = val == null ? { ok: true } : await commit('set_player_dev_field', { p_athlete_id: a.id, p_field: 'strength_bench', p_key: k, p_value: val });
        if (!r1.ok) { err(r1.error && r1.error.message || 'Could not save.'); return; }
        var r2 = await commit('set_player_sub', { p_athlete_id: a.id, p_sub: key, p_score: sc });
        if (!r2.ok) { err(r2.error && r2.error.message || 'Could not save.'); return; }
        var dd = state.dev[a.id] = state.dev[a.id] || { athlete_id: a.id, skills: {}, subs: {} }; dd.strength_bench = dd.strength_bench || {}; if (val == null) delete dd.strength_bench[k]; else dd.strength_bench[k] = val; dd.subs = dd.subs || {}; if (sc) dd.subs[key] = sc; else delete dd.subs[key]; dd.skills = r2.data && r2.data.skills ? r2.data.skills : deriveSkills(dd.subs);
        var scEl = inp.parentNode.querySelector('.sc'); scEl.textContent = sc || ''; scEl.classList.toggle('g', !!sc); refreshSkill('strength'); err(''); paint();
      };
    });
    b.querySelectorAll('.pos [data-pos]').forEach(function (btn) { btn.onclick = async function () { await setPosition(a, btn.getAttribute('data-pos'), err); b.querySelectorAll('.pos [data-pos]').forEach(function (x) { x.classList.toggle('on', x.getAttribute('data-pos') === positionOf(a)); }); }; });
    var sf = b.querySelector('#db-save-focus');
    if (sf) sf.onclick = async function () {
      var txt = b.querySelector('#db-focus').value.trim(); sf.disabled = true;
      var r = await commit('set_player_dev_field', { p_athlete_id: a.id, p_field: 'focus', p_key: null, p_value: txt || null });
      if (!r.ok) err(r.error && r.error.message || 'Could not save.'); else { (state.dev[a.id] = state.dev[a.id] || { athlete_id: a.id, skills: {}, subs: {} }).focus = txt || null; toast(r.queued ? 'Focus saved on this device. It sends when you are online.' : 'Focus saved.'); paint(); }
      sf.disabled = false;
    };
  }
  async function setPosition(a, pos, err) {
    var next = positionOf(a) === pos ? null : pos;
    var r = await commit('set_player_position', { p_athlete_id: a.id, p_position: next });
    if (!r.ok) { if (err) err(r.error && r.error.message || 'Could not save.'); else toast(r.error && r.error.message || 'Could not save.'); return; }
    (state.dev[a.id] = state.dev[a.id] || { athlete_id: a.id, skills: {}, subs: {} }).position = next; paint();
  }

  // ---------- share with the parent ----------
  // What the parent sees: the phases, the three needs in plain words, the drills to work at home with the rep to start with, the coach note.
  function buildSummary(a) {
    var tg = targetsFor(ageOf(a));
    return {
      version: 1, age: ageOf(a), position: positionOf(a) || null, focus: devOf(a).focus || null, rated: ratedCount(a), total: totalSubs(),
      phases: skillOrder().map(function (sk) { var st = skillOf(a, sk); return { skill: sk, label: label(sk), phase: st.p, phaseName: phaseName(st.p), target: tg[sk] || 0, targetName: phaseName(tg[sk] || 0), track: track(a, sk), rated: st.n, of: subList(sk).length }; }),
      needs: needsOf(a).map(function (n) { return { key: n.key, label: subKeyLabel(n.key), skill: n.skill, skillLabel: label(n.skill), score: n.score, word: rubric(n.score), hint: subHint(n.key), behind: n.behind }; }),
      drills: prescribe(a).map(function (x) { var d = x.drill; var c = d.coaching || {}; return { name: d.name, cue: d.cue || '', tag: d.tag || '', min: d.min || 5, forKey: x.need.key, forLabel: subKeyLabel(x.need.key), rep: x.rep ? x.rep.text : '', standard: c.standard || '', look: (c.look || []).slice(0, 3) }; })
    };
  }
  function openShare(a, teamId) {
    var sm = buildSummary(a); var prev = state.shares[a.id];
    var h = '<div class="hd"><span class="db-tag" style="--tc:#159a52">Share with parent</span><button type="button" class="x" aria-label="Close">&times;</button><h3>' + esc(a.first_name + ' ' + (a.last_name || '')) + '</h3><p>This is what the parent will see in their portal. Nothing is emailed; it appears under Performance the next time they open it.' + (prev ? ' Last shared ' + esc(fmtDay(prev.shared_at)) + '.' : '') + '</p></div><div class="bd">';
    h += '<div class="sec">Where he is</div><div class="devs">' + sm.phases.filter(function (p) { return p.phase; }).map(function (p) { return '<span class="db-chip' + (p.track === 'behind' ? ' hit' : '') + '">' + esc(p.label) + ': ' + esc(p.phaseName) + '</span>'; }).join('') + '</div>';
    h += '<div class="sec">Working on next</div><ul class="dots">' + sm.needs.map(function (n) { return '<li><b>' + esc(n.label) + '</b> (' + esc(n.skillLabel) + '), ' + esc(n.word.toLowerCase()) + (n.behind ? ', behind the age target' : '') + '</li>'; }).join('') + '</ul>';
    h += '<div class="sec">Drills to work at home</div><ul class="dots">' + sm.drills.map(function (d) { return '<li><b>' + esc(d.name) + '</b>, ' + esc(d.min) + ' min. ' + esc(d.cue) + (d.rep ? '<br><span style="color:#6e6e73">Start here: ' + esc(d.rep) + '</span>' : '') + '</li>'; }).join('') + '</ul>';
    if (sm.focus) h += '<div class="box"><span class="k">Focus</span><span>' + esc(sm.focus) + '</span></div>';
    h += '<div class="sec">A note from you</div><textarea id="db-share-note" maxlength="600" placeholder="Two or three sentences for the parent. What you see, what to work on at home, what is next.">' + esc(prev && prev.note ? prev.note : '') + '</textarea>';
    h += '<div class="err" id="db-err"></div><div class="actions"><button type="button" class="btn" data-close>Cancel</button><button type="button" class="btn primary" id="db-share-go">Share with parent</button></div></div>';
    var b = sheet(h, '#159a52');
    var err = function (m) { var e = b.querySelector('#db-err'); if (!e) return; e.textContent = m || ''; e.classList.toggle('on', !!m); };
    b.querySelector('#db-share-go').onclick = async function () {
      var btn = b.querySelector('#db-share-go'); btn.disabled = true;
      var note = b.querySelector('#db-share-note').value.trim();
      var r = await commit('share_player_development', { p_athlete_id: a.id, p_note: note || null, p_summary: sm });
      if (!r.ok) { err(r.error && r.error.message || 'Could not share.'); btn.disabled = false; return; }
      state.shares[a.id] = { athlete_id: a.id, shared_at: (r.data && r.data.shared_at) || new Date().toISOString(), note: note || null };
      toast(r.queued ? 'Saved on this device. It shares when you are online.' : 'Shared with the parent.'); closeSheet(); paint();
    };
  }
  // Director: who may share. One toggle per coach, all teams.
  async function loadPrivileges() { if (state.privileges !== null) return; state.privileges = []; var c = client(); if (!c || !state.isAdmin) return; try { var r = await c.rpc('list_share_privileges'); if (!r.error) state.privileges = r.data || []; else state.privLoadError = r.error.message; } catch (e) { state.privLoadError = e.message; } }
  function privilegesHtml() {
    if (!state.isAdmin) return '';
    var h = '<div class="db-panel" style="margin-top:14px"><h4>Who can share with parents</h4><p class="in">You always can. A coach shares only after you turn it on here; it covers every team he coaches.</p>';
    if (state.privileges === null) h += '<div class="db-note">Loading coaches...</div>';
    else if (!state.privileges.length) h += '<div class="db-note">' + (state.privLoadError ? 'Could not load coaches: ' + esc(state.privLoadError) : 'No approved coaches yet.') + '</div>';
    else state.privileges.forEach(function (p) { h += '<div class="db-rank" style="grid-template-columns:1fr auto"><div><b>' + esc(p.name || p.email) + '<small>' + esc(p.email) + '</small></b></div><button type="button" class="db-btn' + (p.allowed ? ' primary' : '') + '" data-priv="' + esc(p.user_id) + '" data-on="' + (p.allowed ? '1' : '0') + '">' + (p.allowed ? 'Can share' : 'Cannot share') + '</button></div>'; });
    return h + '</div>';
  }
  async function togglePrivilege(userId, on) {
    var c = client(); if (!c) return; if (!sync.online) { toast('Privileges change online only.'); return; }
    try { var r = await c.rpc('set_coach_access', { p_user: userId, p_area: 'share_development', p_team: null, p_allowed: on ? true : null, p_note: 'Development board' }); if (r.error) throw r.error; (state.privileges || []).forEach(function (p) { if (p.user_id === userId) p.allowed = !!on; }); toast(on ? 'Coach can now share with parents.' : 'Sharing turned off for this coach.'); paint(); }
    catch (e) { toast(e.message || 'Could not change that.'); }
  }

  // ---------- team tab ----------
  function readOfWeek(players) { var top = teamNeeds(players)[0]; var key = top ? top.skill : 'handles'; return { skill: key, read: READS[key] || READS.handles }; }
  function teamHtml() {
    var ps = playersOf(state.teamId); var h = teamBar(false);
    if (!ps.length) return h + '<div class="db-empty">No active players on this team.</div>';
    var rated = ps.filter(started); var tn = teamNeeds(rated).slice(0, 5); var row = readOfWeek(rated); var wg = workGroups(rated); var gp = gaps(ps);
    h += '<div class="db-lead"><div><h4>' + esc(row.read[0]) + '</h4><p>The read of the week, from the top need on this roster. ' + esc(row.read[1]) + '</p></div><div class="st"><div><b>' + rated.length + '</b><small>Evaluated</small></div><div><b>' + (ps.length - rated.length) + '</b><small>To evaluate</small></div><div><b>' + wg.length + '</b><small>Stations</small></div></div></div>';
    h += '<div class="db-two"><div class="db-panel"><h4>Top needs</h4><p class="in">Sub-skills that show up in the most players\' next three.</p>';
    if (!rated.length) h += '<div class="db-note">Evaluate a few players first.</div>';
    tn.forEach(function (r, i) { h += '<div class="db-rank"><span class="k">' + (i + 1) + '</span><div><b>' + esc(subKeyLabel(r.key)) + '<small>' + esc(label(r.skill)) + '</small></b><div class="bar"><i style="width:' + Math.round(r.players / rated.length * 100) + '%"></i></div></div><small class="r">' + r.players + ' of ' + rated.length + ', avg ' + r.avg.toFixed(1) + '</small></div>'; });
    h += '</div><div class="db-panel"><h4>Gaps</h4><p class="in">What the director sees first.</p>';
    gp.forEach(function (g) { h += '<div class="db-gap ' + g[0] + '"><i></i><span>' + esc(g[1]) + '</span></div>'; });
    h += '</div></div>';
    h += '<div class="db-panel" style="margin-top:14px"><h4>Work groups for power-ups</h4><p class="in">Players bucketed by their first drill. One coach per two stations, rotate at five minutes.</p>';
    if (!wg.length) h += '<div class="db-note">Groups appear once players are evaluated.</div>';
    wg.forEach(function (g) { h += '<div class="db-group"><b>' + esc(g.drill.name) + ' <span style="font-weight:500;color:#6e6e73">for ' + esc(subKeyLabel(g.need.key).toLowerCase()) + ', ' + esc(g.drill.min || 5) + ' min</span></b><div class="who">' + esc(g.players.map(shortName).join(', ')) + '</div><div class="cue">' + esc(g.drill.cue || '') + '</div></div>'; });
    h += '</div>';
    if (state.isAdmin) {
      h += '<div class="db-panel" style="margin-top:14px"><h4>All teams</h4><p class="in">Director view. Evaluated players and behind-target skills per team.</p>';
      teams().forEach(function (t) { var tp = playersOf(t.id); if (!tp.length) return; var b = 0; tp.forEach(function (a) { b += behindCount(a); }); h += '<div class="db-rank"><span class="k" style="background:#0071e3">' + tp.length + '</span><div><b>' + esc(t.name) + '</b></div><small class="r">' + tp.filter(started).length + ' evaluated, ' + b + ' behind</small></div>'; });
      h += '</div>';
      if (state.privileges === null) loadPrivileges().then(function () { if (state.tab === 'team') paint(); });
      h += privilegesHtml();
    }
    return h;
  }

  // ---------- practice plan tab ----------
  function findDrill(name) { return state.bank.filter(function (d) { return d.name === name; })[0]; }
  function swapKey(block, i) { return state.teamId + ':' + block + ':' + i; }
  function pick(cands, block, i) { if (!cands.length) return null; var off = state.swaps[swapKey(block, i)] || 0; return cands[off % cands.length]; }
  function stationHtml(k, d, who, block, i, cands) {
    return '<div class="db-st"><span class="k">' + esc(k) + '</span><div data-drill="' + esc(d.name) + '" style="cursor:pointer"><b>' + esc(d.name) + '</b><span>' + esc(d.cue || '') + '</span>' + (who ? '<span class="who">' + esc(who) + '</span>' : '') + '</div>' + (cands && cands.length > 1 ? '<button type="button" class="db-link" data-swap="' + esc(block + '|' + i) + '">Swap</button>' : '<span style="font-size:12px;color:#6e6e73">' + esc(d.min || 5) + ' min</span>') + '</div>';
  }
  function planHtml() {
    var ps = playersOf(state.teamId); var h = teamBar(false);
    if (!state.shape) return h + '<div class="db-empty">The practice shape is not loaded.</div>';
    var rated = ps.filter(started); var wg = workGroups(rated); var row = readOfWeek(rated); var tn = teamNeeds(rated);
    var day = new Date(); var dow = day.getDay(); var next = dow < 2 ? 'Tuesday' : dow < 4 ? 'Thursday' : 'Tuesday';
    h += '<div class="db-lead"><div><h4>' + esc(next) + ', doors 5:55, ball at 6:00.</h4><p>Seven blocks from How we practice. Power-ups and the finishing bridge are filled from this roster\'s needs; the guided block teaches this week\'s read. Swap a drill if the gym says so.</p></div><div class="st"><div><b style="font-size:18px">' + esc(row.read[0]) + '</b><small>Read of the week</small></div></div></div>';
    h += '<div class="db-plan-bar">' + (canEdit(state.teamId) ? '<button type="button" class="db-btn primary" id="db-save-plan">Save plan</button>' : '') + '<button type="button" class="db-btn' + (canEdit(state.teamId) ? '' : ' primary') + '" id="db-print">Print</button><button type="button" class="db-btn" id="db-copy">Copy as text</button><span class="db-note" style="margin:0">' + (rated.length ? rated.length + ' evaluated players shape this plan.' : 'Nobody is evaluated yet, so the stations are the default power-ups.') + '</span></div>';
    h += '<div class="db-panel" id="db-plan">';
    state.shape.blocks.forEach(function (b, bi) {
      h += '<div class="db-block"><span class="n">' + (bi + 1) + '</span><div class="tm">' + esc(b.start) + '<small>' + esc(b.minutes) + ' min</small></div><div><h5>' + esc(b.name) + '</h5><p>' + esc(b.what) + '</p>' + (b.note ? '<div class="nt">' + esc(b.note) + '</div>' : '');
      if (/power-ups/i.test(b.name)) {
        h += '<div class="db-fill">';
        if (wg.length) wg.slice(0, 4).forEach(function (g, i) { var cands = drillsForSub(g.need.key, g.need.phase, [], 6); var d = pick(cands, 'pu', i) || g.drill; h += stationHtml('Station ' + (i + 1), d, g.players.map(shortName).join(', '), 'pu', i, cands); });
        var unr = ps.filter(function (a) { return !started(a); });
        if (wg.length && unr.length) { var ud = findDrill('Bodyweight strength circuit'); if (ud) h += stationHtml('Utility', ud, 'Not evaluated yet, so they work strength: ' + unr.map(shortName).join(', '), 'ut', 0, []); }
        if (!wg.length && state.powerups) ['Guard', 'Wing', 'Big'].forEach(function (k, i) { var list = state.powerups[k] || []; var d = list.length ? (findDrill(list[i % list.length].text) || { name: list[i % list.length].text, cue: '' }) : null; if (d) h += stationHtml(k, d, '', 'pu', i, []); });
        h += '</div>';
      }
      if (/finishing bridge/i.test(b.name)) {
        var cands = visibleBank().filter(function (d) { return (d.develops || []).indexOf('shooting.finishing') >= 0; });
        var need = tn.filter(function (r) { return /finishing|weakHand|footwork|attackAdvantage/.test(r.key); })[0];
        cands.sort(function (x, y) { return ((y.develops || []).indexOf('shooting.finishing') === 0 ? 1 : 0) - ((x.develops || []).indexOf('shooting.finishing') === 0 ? 1 : 0) || (x.import ? 1 : 0) - (y.import ? 1 : 0); });
        var d = pick(cands, 'fb', 0); if (d) h += '<div class="db-fill">' + stationHtml('Finish', d, need ? subKeyLabel(need.key) + ' is a top need on this roster' : '', 'fb', 0, cands) + '</div>';
      }
      if (/guided reads/i.test(b.name)) h += '<div class="db-fill"><div class="db-st"><span class="k">Read</span><div><b>' + esc(row.read[0]) + '</b><span>' + esc(row.read[1]) + '</span></div></div></div>';
      if (/competition/i.test(b.name) && tn[1]) h += '<div class="db-fill"><div class="db-st"><span class="k">Watch</span><div><b>' + esc(subKeyLabel(tn[1].key)) + '</b><span>Second need on this roster. Call it out when you see it, good or bad.</span></div></div></div>';
      h += '</div></div>';
    });
    h += '</div>';
    if (state.workout) {
      h += '<div class="db-panel" style="margin-top:14px"><h4>' + esc(state.workout.title || 'Workout track') + '</h4><p class="in">' + esc(state.workout.intro || '') + '</p>';
      (state.workout.blocks || []).forEach(function (b) { var d = findDrill(b.drill); h += '<div class="db-group"><b>' + esc(b.name) + ' <span style="font-weight:500;color:#6e6e73">' + esc(b.minutes) + ' min</span></b>' + (d ? '<div class="who" data-drill="' + esc(d.name) + '" style="cursor:pointer;color:#0071e3;font-weight:600">' + esc(d.name) + '</div>' : '') + (b.rx ? '<div class="cue">' + esc(b.rx.join('. ')) + '</div>' : '') + (b.note ? '<div class="cue">' + esc(b.note) + '</div>' : '') + '</div>'; });
      if (state.workout.progression) h += '<div class="db-sec" style="margin-top:12px">Progression</div>' + state.workout.progression.map(function (p) { return '<div class="db-gap grey"><i></i><span><b>' + esc(p[0]) + '</b>: ' + esc(p[1]) + '</span></div>'; }).join('');
      h += '</div>';
    }
    if (state.shape.rules && state.shape.rules.length) h += '<div class="db-note">' + state.shape.rules.map(esc).join('  ') + '</div>';
    return h;
  }
  function planText() {
    var v = el('db-plan'); if (!v) return '';
    var out = [];
    v.querySelectorAll('.db-block').forEach(function (b) { var tm = b.querySelector('.tm').childNodes[0].textContent; out.push(tm + '  ' + b.querySelector('h5').textContent + '\n   ' + b.querySelector('p').textContent); b.querySelectorAll('.db-st').forEach(function (s) { out.push('   - ' + s.querySelector('.k').textContent + ': ' + s.querySelector('b').textContent + (s.querySelector('.who') ? ' (' + s.querySelector('.who').textContent + ')' : '')); }); });
    return out.join('\n');
  }

  // ---------- the bank ----------
  function bankHtml() {
    var all = visibleBank(); var q = state.bankQ.trim().toLowerCase(); var tag = state.bankTag;
    var list = all.filter(function (d) { return (tag === 'All' || d.tag === tag) && (!q || (d.name + ' ' + (d.cue || '') + ' ' + (d.develops || []).map(subKeyLabel).join(' ')).toLowerCase().indexOf(q) >= 0); });
    var cov = {}; all.forEach(function (d) { (d.develops || []).forEach(function (k) { cov[k] = (cov[k] || 0) + 1; }); });
    var thin = []; Object.keys(subsCfg()).forEach(function (sk) { subList(sk).forEach(function (s) { if ((cov[sk + '.' + s.key] || 0) < 2) thin.push(sk + '.' + s.key); }); });
    var h = '<div class="db-lead"><div><h4>The Bank</h4><p>' + all.length + ' drills, each tagged with the sub-skills it develops and the level it is for. The tags decide which drill a player gets. Tap a card for the coaching detail.</p></div><div class="st"><div><b>' + all.length + '</b><small>Drills</small></div>' + (state.isAdmin ? '<div><b>' + all.filter(function (d) { return d.import; }).length + '</b><small>Imported</small></div><div><b>' + all.filter(function (d) { return d.review && !d.import; }).length + '</b><small>Flagged</small></div>' : '') + '</div></div>';
    h += '<div class="db-bar"><div class="db-teams"><button type="button" class="db-chipbtn' + (tag === 'All' ? ' active' : '') + '" data-tag="All">All</button>' + TAG_ORDER.map(function (t) { return '<button type="button" class="db-chipbtn' + (tag === t ? ' active' : '') + '" data-tag="' + esc(t) + '" style="--tc:' + tagColor(t) + '"><i></i>' + esc(t) + '</button>'; }).join('') + '</div><input class="db-search" type="search" placeholder="Search drills, cues, sub-skills" value="' + esc(state.bankQ) + '" aria-label="Search drills"></div>';
    if (state.isAdmin && thin.length) h += '<div class="db-status on"><i></i>Thin coverage (fewer than two drills): ' + esc(thin.map(subKeyLabel).join(', ')) + '</div>';
    h += '<div class="db-bankgrid">' + list.map(function (d) {
      return '<div class="db-bk" data-drill="' + esc(d.name) + '" style="--tc:' + tagColor(d.tag) + '"><div class="top">' + tagChip(d.tag) + '<button type="button" class="db-i" aria-label="Detail">i</button></div><h5>' + esc(d.name) + '</h5><div class="cue">' + esc(d.cue || '') + '</div><div class="meta"><span>' + esc(d.min || 5) + ' min</span><span class="lv">' + (d.level ? esc(phaseName(d.level)) : 'Any level') + '</span></div><div class="devs">' + (d.develops || []).slice(0, 4).map(function (k) { return '<span class="db-chip">' + esc(subKeyLabel(k)) + '</span>'; }).join('') + (d.import && state.isAdmin ? '<span class="db-chip imp">Imported</span>' : '') + (d.review && !d.import ? '<span class="db-chip flag">Flagged</span>' : '') + '</div></div>';
    }).join('') + '</div>';
    if (!list.length) h += '<div class="db-empty">No drill matches.</div>';
    h += '<div class="db-note">Editing tags, levels and flags from here is the next step. For now they change in the database.</div>';
    return h;
  }

  // ---------- paint and events ----------
  // The plan as saved: what is on the screen right now, block by block.
  function planData() {
    var root = el('db-plan'); var stations = [], blocks = [];
    if (root) root.querySelectorAll('.db-block').forEach(function (b) {
      var name = (b.querySelector('h5') || {}).textContent || ''; var min = ((b.querySelector('.tm small') || {}).textContent || '').replace(/\D/g, '');
      var st = []; b.querySelectorAll('.db-st').forEach(function (s) { var k = (s.querySelector('.k') || {}).textContent || ''; var drill = (s.querySelector('b') || {}).textContent || ''; var who = (s.querySelector('.who') || {}).textContent || ''; var row = { block: name, k: k, drill: drill.trim() }; if (who) row.who = who.trim(); st.push(row); stations.push(row); });
      blocks.push({ name: name, minutes: +min || null, stations: st });
    });
    var lead = document.querySelector('#devboard-view .db-lead h4');
    return { title: lead ? lead.textContent : 'Practice', team: (teams().filter(function (t) { return t.id === state.teamId; })[0] || {}).name || '', blocks: blocks, stations: stations, version: 1 };
  }
  function nextPracticeDate() { var d = new Date(); var dow = d.getDay(); var add = dow < 2 ? 2 - dow : dow < 4 ? 4 - dow : 9 - dow; d.setDate(d.getDate() + add); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  async function savePlan(btn) {
    if (!canEdit(state.teamId)) return; var plan = planData(); if (!plan.stations.length) { toast('Nothing to save yet. Evaluate a few players first.'); return; }
    btn.disabled = true; var r = await commit('save_practice_plan', { p_team_id: state.teamId, p_plan_date: nextPracticeDate(), p_plan: plan }); btn.disabled = false;
    if (!r.ok) { toast('Could not save the plan: ' + (r.error && r.error.message || 'error')); return; }
    toast(r.queued ? 'Plan saved on this device. It sends when you are online.' : 'Plan saved for ' + plan.title.split(',')[0] + '. ' + plan.stations.length + ' stations.');
  }
  // ---------- activity (director only) ----------
  async function loadActivity(force) {
    if (!state.isAdmin) return; if (state.activity !== null && !force) return; state.activity = state.activity || []; var c = client(); if (!c || !sync.online) return;
    try { var r = await c.rpc('list_coach_activity', { p_limit: 60 }); if (r.error) throw r.error; state.activity = r.data || []; state.activityErr = null; } catch (e) { state.activityErr = e.message; }
    try { state.activitySeen = localStorage.getItem('gs_devboard_activity_seen') || ''; } catch (e) { state.activitySeen = ''; }
    paint();
  }
  function markActivitySeen() { var top = (state.activity || [])[0]; if (!top) return; try { localStorage.setItem('gs_devboard_activity_seen', top.at); } catch (e) { /* optional */ } state.activitySeen = top.at; }
  function newActivityCount() { if (!state.activity || !state.activity.length) return 0; var seen = state.activitySeen || ''; return state.activity.filter(function (r) { return r.at > seen; }).length; }
  function ago(iso) { var ms = Date.now() - new Date(iso).getTime(); var m = Math.round(ms / 60000); if (m < 1) return 'just now'; if (m < 60) return m + ' min ago'; var h = Math.round(m / 60); if (h < 24) return h + ' hr ago'; return fmtDay(iso); }
  function activityHtml() {
    if (!state.isAdmin) return '';
    var h = '<div class="db-lead"><div><h4>What the coaches did</h4><p>Every evaluation, saved plan, and parent share by a coach, newest first. Taps by the same coach on the same player within twenty minutes show as one line.</p></div></div>';
    if (state.activity === null) return h + '<div class="db-empty">Loading...</div>';
    if (state.activityErr) return h + '<div class="db-empty">' + esc(state.activityErr) + '</div>';
    if (!state.activity.length) return h + '<div class="db-empty">Nothing yet. When a coach evaluates a player or saves a plan it shows up here.</div>';
    var seen = state.activitySeen || '';
    h += '<div class="db-panel">' + state.activity.map(function (r) {
      var d = r.detail || {}; var isNew = r.at > seen; var title, body, chips = '';
      if (r.kind === 'evaluation') {
        var bits = []; if (d.subs) bits.push(d.subs + ' skill' + (d.subs > 1 ? 's' : '') + ' scored'); if (d.position) bits.push('position set'); if (d.focus) bits.push('focus written');
        title = esc(r.actor) + ' evaluated ' + esc((r.athlete || 'a player').trim()); body = bits.join(', ') + (r.team ? ' on ' + esc(r.team) : '') + '.';
        chips = (d.sample || []).filter(function (x) { return /^sub\./.test(x); }).slice(0, 4).map(function (x) { var m = x.match(/^sub\.([^=]+)=(\d)/); return m ? '<span>' + esc(subKeyLabel(m[1])) + ' ' + m[2] + '</span>' : ''; }).join('');
      } else if (r.kind === 'plan') {
        title = esc(r.actor) + ' saved the plan for ' + esc(fmtDay(d.plan_date + 'T12:00:00')); body = (r.team ? esc(r.team) + '. ' : '') + ((d.drills || []).length) + ' drill' + ((d.drills || []).length === 1 ? '' : 's') + (d.saves > 1 ? ', saved ' + d.saves + ' times' : '') + '.';
        chips = (d.drills || []).slice(0, 6).map(function (x) { return '<span>' + esc(x) + '</span>'; }).join('');
      } else { title = esc(r.actor) + ' shared ' + esc((r.athlete || 'a player').trim()) + ' with his parents'; body = d.note ? '"' + esc(d.note) + '"' : 'No note.'; }
      var ic = r.kind === 'plan' ? 'PLAN' : r.kind === 'share' ? 'SENT' : 'EVAL';
      return '<div class="db-act' + (isNew ? ' new' : '') + '"' + (r.athlete_id ? ' data-act-athlete="' + esc(r.athlete_id) + '" style="cursor:pointer"' : '') + '><span class="ic ' + r.kind + '">' + ic + '</span><div><b>' + title + '</b><p>' + body + '</p>' + (chips ? '<div class="chips">' + chips + '</div>' : '') + '</div><span class="when">' + esc(ago(r.at)) + '</span></div>';
    }).join('') + '</div>';
    return h;
  }
  var TABS = [['players', 'Players'], ['team', 'Team'], ['plan', 'Practice plan'], ['bank', 'The Bank']];
  function html() {
    if (state.error) return '<div class="db-empty">' + esc(state.error) + '</div>';
    if (!state.loaded || !raw()) return '<div class="db-empty">Loading players and the bank...</div>';
    if (!state.teamId) { var ts = teams().filter(function (t) { return playersOf(t.id).length; }); var mine = ts.filter(function (t) { return state.myTeams.indexOf(t.id) >= 0; }); state.teamId = (mine[0] || ts[0] || {}).id || null; }
    var tabList = state.isAdmin ? TABS.concat([['activity', 'Activity']]) : TABS; var nn = newActivityCount();
    var tabs = '<div class="db-tabs" role="tablist">' + tabList.map(function (t) { return '<button type="button" role="tab" data-tab="' + t[0] + '"' + (t[0] === state.tab ? ' class="active"' : '') + '>' + t[1] + (t[0] === 'activity' && nn && state.tab !== 'activity' ? '<span class="db-dot" title="' + nn + ' new"></span>' : '') + '</button>'; }).join('') + '</div>';
    if (state.tab === 'activity' && !state.isAdmin) state.tab = 'players';
    var body = state.tab === 'team' ? teamHtml() : state.tab === 'plan' ? planHtml() : state.tab === 'bank' ? bankHtml() : state.tab === 'activity' ? activityHtml() : playersHtml();
    return tabs + '<div id="db-status">' + statusHtml() + '</div>' + body;
  }
  function paint() {
    var v = el('devboard-view'); if (!v) return;
    var act = document.activeElement; var focusQ = act && act.classList && act.classList.contains('db-search'); var pos = focusQ ? act.selectionStart : 0; var scrollTop = (document.querySelector('.dashboard-main') || {}).scrollTop;
    v.innerHTML = html();
    if (typeof scrollTop === 'number') { var m = document.querySelector('.dashboard-main'); if (m) m.scrollTop = scrollTop; }
    var sn = v.querySelector('#db-sync-now'); if (sn) sn.onclick = flush;
    v.querySelectorAll('.db-tabs button').forEach(function (b) { b.onclick = function () { state.tab = b.getAttribute('data-tab'); try { localStorage.setItem('gs_devboard_tab', state.tab); } catch (e) { /* optional */ } if (state.tab === 'activity') { loadActivity(true).then(function () { paint(); markActivitySeen(); }); } paint(); setSub(); var mm = document.querySelector('.dashboard-main'); if (mm) mm.scrollTop = 0; }; });
    v.querySelectorAll('.db-teams [data-team]').forEach(function (b) { b.onclick = function () { state.teamId = b.getAttribute('data-team'); paint(); }; });
    v.querySelectorAll('.db-teams [data-tag]').forEach(function (b) { b.onclick = function () { state.bankTag = b.getAttribute('data-tag'); paint(); }; });
    var q = v.querySelector('.db-search'); if (q) { q.oninput = function () { if (state.tab === 'bank') state.bankQ = q.value; else state.q = q.value; paint(); }; if (focusQ) { q.focus(); try { q.setSelectionRange(pos, pos); } catch (e) { /* fine */ } } }
    v.querySelectorAll('.db-card').forEach(function (card) {
      var a = playersOf(state.teamId).filter(function (x) { return x.id === card.getAttribute('data-id'); })[0]; if (!a) return;
      var rb = card.querySelector('[data-act="rate"]'); if (rb) rb.onclick = function () { openRate(a, state.teamId); };
      var db = card.querySelector('[data-act="drills"]'); if (db) db.onclick = function () { openDrills(a); };
      var sb = card.querySelector('[data-act="share"]'); if (sb) sb.onclick = function () { openShare(a, state.teamId); };
      var tg = card.querySelector('[data-act="toggle"]'); if (tg) tg.onclick = function () { state.expanded[a.id] = state.expanded[a.id] === false; paint(); };
      card.querySelectorAll('.db-pos [data-pos]').forEach(function (pb) { pb.onclick = function () { setPosition(a, pb.getAttribute('data-pos')); }; });
      card.querySelectorAll('.db-item[data-drill]').forEach(function (it) { it.onclick = function () { var d = findDrill(it.getAttribute('data-drill')); if (d) openDrill(d, a); }; });
    });
    v.querySelectorAll('.db-bk[data-drill], #db-plan [data-drill], .db-panel [data-drill]').forEach(function (n) { n.onclick = function () { var d = findDrill(n.getAttribute('data-drill')); if (d) openDrill(d, null); }; });
    v.querySelectorAll('[data-priv]').forEach(function (b) { b.onclick = function () { togglePrivilege(b.getAttribute('data-priv'), b.getAttribute('data-on') !== '1'); }; });
    v.querySelectorAll('[data-swap]').forEach(function (b) { b.onclick = function (e) { e.stopPropagation(); var k = b.getAttribute('data-swap').split('|'); var key = swapKey(k[0], +k[1]); state.swaps[key] = (state.swaps[key] || 0) + 1; paint(); }; });
    var pr = el('db-print'); if (pr) pr.onclick = function () { window.print(); };
    var sp = el('db-save-plan'); if (sp) sp.onclick = function () { savePlan(sp); };
    v.querySelectorAll('[data-act-athlete]').forEach(function (n) { n.onclick = function () { var id = n.getAttribute('data-act-athlete'); var a = (raw() ? raw().athletes : []).filter(function (x) { return x.id === id; })[0]; var tm = a && teamsOf(a.id)[0]; if (a && tm) { state.teamId = tm; state.tab = 'players'; state.expanded[a.id] = true; paint(); } }; });
    var cp = el('db-copy'); if (cp) cp.onclick = function () { var t = planText(); if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(function () { toast('Plan copied.'); }, function () { toast('Copy blocked by the browser.'); }); else toast('Copy is not available here.'); };
  }
  function setSub() {
    var s = document.querySelector('#coach-dashboard .dashboard-header .text-sub');
    if (s) s.textContent = { players: 'Needs and drills, per player.', team: 'Top needs, the read of the week, work groups.', plan: 'Tuesday and Thursday, built from the roster.', bank: 'Every drill and what it develops.', activity: 'What the coaches did.' }[state.tab] || 'Development board';
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
      if (state.isAdmin) loadActivity(true);
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
