/**
 * GODSPEED BASKETBALL. Coach Portal: live data + Home overview.
 *
 * Why this exists: the coach portal read teams and rosters from the localStorage
 * cache (gba_db) that only the PARENT portal filled, and even then it matched
 * roster rows on athletes.team_name (a string) against teams.id (a uuid), so
 * every team came back empty. Coaches saw "Select a team" and nothing else.
 *
 * What it does:
 *   1. When the dashboard is shown, reads teams, team_rosters, athletes,
 *      training_sessions, training_attendance, player_evaluations and games
 *      with the signed-in coach's own JWT (RLS decides what comes back).
 *   2. Writes teams[] and roster[] into gba_db in the shape coach-portal.js
 *      already renders (one roster entry per team membership, keyed by
 *      team_rosters.team_id), then re-runs initDashboard() so the sidebar fills.
 *   3. Renders a Home view (first thing a coach sees): greeting, next practice,
 *      counts, team cards that open a roster, recent grades, upcoming sessions.
 *
 * Contract: read-only. No writes to Supabase. No service key. Fails soft: if a
 * fetch fails the cached data stays and the Home view says so. No emojis. No em
 * dashes in copy. Depends on window.auth.getSupabaseClient (auth-supabase.js),
 * getDB/saveDB (portal-data.js), initDashboard/loadTeamRoster (coach-portal.js).
 */
(function () {
  'use strict';

  var el = function (id) { return document.getElementById(id); };
  function esc(s) { return (s == null ? '' : String(s)).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // Team practice days and times are program facts (Scott, 2026-09-04).
  var PRACTICE = { days: [2, 4], doors: '5:55 pm', start: '6:00 pm', end: '8:00 pm' };

  var state = { loading: false, loaded: false, error: null, raw: null, loadedAt: null };

  function client() {
    try { return window.auth && typeof window.auth.getSupabaseClient === 'function' ? window.auth.getSupabaseClient() : null; } catch (e) { return null; }
  }

  function initials(f, l) { return ((f || '').charAt(0) + (l || '').charAt(0)).toUpperCase() || '?'; }
  function tierFor(status, role) {
    if (status === 'inactive') return 'Inactive';
    if (role === 'starter' || role === 'captain') return 'Elite Starter';
    if (role === 'development') return 'Development';
    return 'Rotation';
  }
  function trendFor(vals) {
    if (!vals || vals.length < 2) return 'steady';
    var recent = vals.slice(0, 3), older = vals.slice(3, 6);
    if (!older.length) return 'steady';
    var avg = function (a) { return a.reduce(function (x, y) { return x + y; }, 0) / a.length; };
    var d = avg(recent) - avg(older);
    return d > 0.5 ? 'improving' : d < -0.5 ? 'declining' : 'steady';
  }

  async function fetchAll() {
    var c = client();
    if (!c) throw new Error('no_client');
    var s = await c.auth.getSession();
    if (!s || !s.data || !s.data.session) throw new Error('no_session');
    var r = await Promise.all([
      c.from('teams').select('id,name,age_group,head_coach,season').order('name'),
      c.from('team_rosters').select('team_id,athlete_id,role,left_at'),
      c.from('athletes').select('id,first_name,last_name,jersey_number,enrollment_status,notes,team_name,grade,date_of_birth'),
      c.from('training_sessions').select('id,session_date,session_type,title,team_id,start_time,location').order('session_date', { ascending: false }).limit(60),
      c.from('training_attendance').select('id,session_id,athlete_id,effort_rating,skill_ratings,coach_notes,created_at').order('created_at', { ascending: false }).limit(200),
      c.from('player_evaluations').select('athlete_id,evaluation_date,overall_rating').order('evaluation_date', { ascending: false }).limit(300),
      c.from('games').select('id,game_date,game_time,team_id,opponent_name,location,result,team_score,opponent_score').order('game_date', { ascending: false }).limit(30),
      c.from('profiles').select('full_name').eq('id', s.data.session.user.id).maybeSingle()
    ]);
    var names = ['teams', 'rosters', 'athletes', 'sessions', 'attendance', 'evaluations', 'games', 'me'];
    var out = {};
    r.forEach(function (res, i) { if (res.error && names[i] !== 'me') throw new Error(names[i] + ': ' + res.error.message); out[names[i]] = res.data || (names[i] === 'me' ? null : []); });
    return out;
  }

  function buildDb(raw) {
    var evalsBy = {};
    raw.evaluations.forEach(function (e) { (evalsBy[e.athlete_id] = evalsBy[e.athlete_id] || []).push(parseFloat(e.overall_rating) || 0); });
    var attBy = {};
    raw.attendance.forEach(function (a) { (attBy[a.athlete_id] = attBy[a.athlete_id] || []).push(a.effort_rating || 0); });
    var athleteById = {};
    raw.athletes.forEach(function (a) { athleteById[a.id] = a; });

    var teams = raw.teams.map(function (t) { return { id: t.id, name: t.name, category: t.age_group || 'Teams', coach: t.head_coach || '' }; });

    var roster = [];
    raw.rosters.forEach(function (m) {
      if (m.left_at) return;
      var a = athleteById[m.athlete_id];
      if (!a) return;
      var ev = evalsBy[a.id] || [];
      roster.push({
        athleteId: a.id,
        teamId: m.team_id,
        name: a.first_name,
        lastName: a.last_name || '',
        jersey: a.jersey_number,
        initials: initials(a.first_name, a.last_name),
        tier: tierFor(a.enrollment_status, m.role),
        avg_grade: ev.length ? ev[0] : 0,
        trend: ev.length ? trendFor(ev) : trendFor(attBy[a.id]),
        notes: a.notes || '',
        status: a.enrollment_status || 'active',
        grade: a.grade || '',
        dob: a.date_of_birth || ''
      });
    });
    return { teams: teams, roster: roster };
  }

  function writeDb(built) {
    if (typeof getDB !== 'function' || typeof saveDB !== 'function') return;
    var db = getDB();
    var merged = Object.assign({}, db, { teams: built.teams, roster: built.roster, _coachLiveLoaded: true, _coachLoadedAt: new Date().toISOString() });
    saveDB(merged);
    try { GBA_DB_CACHE = null; } catch (e) { /* older portal-data.js */ }
  }

  // ---------- Home view ----------
  var CSS = '\
#home-view .hm-greet{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin:0 0 18px}\
#home-view .hm-greet h3{font-size:22px;font-weight:700;letter-spacing:-.02em;margin:0}\
#home-view .hm-greet p{margin:4px 0 0;font-size:14px;color:#6E6E73}\
#home-view .hm-tiles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:22px}\
#home-view .hm-tile{background:#fff;border:1px solid rgba(60,60,67,.07);border-radius:14px;padding:16px 18px;box-shadow:0 1px 2px rgba(15,23,42,.04),0 8px 24px rgba(15,23,42,.05);min-width:0}\
#home-view .hm-tile .k{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#A1A1A6;margin-bottom:8px}\
#home-view .hm-tile .v{font-size:26px;font-weight:700;letter-spacing:-.02em;color:#1D1D1F;line-height:1.1}\
#home-view .hm-tile .v.small{font-size:17px;line-height:1.3}\
#home-view .hm-tile .s{font-size:12.5px;color:#6E6E73;margin-top:6px}\
#home-view .hm-tile.dark{background:#0A0A0A;border-color:#0A0A0A}\
#home-view .hm-tile.dark .k{color:#8E8E93}#home-view .hm-tile.dark .v{color:#fff}#home-view .hm-tile.dark .s{color:#A1A1A6}\
#home-view .hm-tile.dark .v b{color:#FF5722;font-weight:700}\
#home-view .hm-sec{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#A1A1A6;margin:22px 2px 10px}\
#home-view .hm-teams{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}\
#home-view .hm-team{background:#fff;border:1px solid rgba(60,60,67,.07);border-radius:14px;padding:16px 18px;box-shadow:0 1px 2px rgba(15,23,42,.04),0 8px 24px rgba(15,23,42,.05);cursor:pointer;text-align:left;font:inherit;color:inherit;display:flex;flex-direction:column;gap:6px;transition:border-color .15s,transform .15s}\
#home-view .hm-team:hover{border-color:rgba(60,60,67,.18)}#home-view .hm-team:focus-visible{outline:2px solid #0071E3;outline-offset:2px}\
#home-view .hm-team .n{font-size:15px;font-weight:600;display:flex;align-items:center;gap:8px}\
#home-view .hm-team .n i{width:9px;height:9px;border-radius:50%;display:inline-block;flex:0 0 9px}\
#home-view .hm-team .m{font-size:13px;color:#6E6E73}\
#home-view .hm-team .a{margin-top:6px;font-size:13px;font-weight:600;color:#0071E3}\
#home-view .hm-two{display:grid;grid-template-columns:1.4fr 1fr;gap:12px}\
#home-view .hm-list{background:#fff;border:1px solid rgba(60,60,67,.07);border-radius:14px;box-shadow:0 1px 2px rgba(15,23,42,.04),0 8px 24px rgba(15,23,42,.05);overflow:hidden}\
#home-view .hm-row{display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid rgba(60,60,67,.07);font-size:14px}\
#home-view .hm-row:last-child{border-bottom:none}\
#home-view .hm-row .av{width:30px;height:30px;border-radius:50%;background:#EAF3FF;color:#0060C0;font-size:11px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;flex:0 0 30px}\
#home-view .hm-row .t{flex:1;min-width:0}#home-view .hm-row .t b{font-weight:600}#home-view .hm-row .t small{display:block;font-size:12px;color:#6E6E73;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\
#home-view .hm-row .sc{font-size:14px;font-weight:700;color:#1D1D1F;min-width:34px;text-align:right}\
#home-view .hm-row .sc.lo{color:#FF5722}\
#home-view .hm-row .d{font-size:12px;color:#6E6E73;white-space:nowrap}\
#home-view .hm-empty{padding:22px 16px;font-size:13.5px;color:#6E6E73;text-align:center}\
#home-view .hm-note{font-size:12px;color:#A1A1A6;margin-top:14px}\
#home-view .hm-skel{height:14px;border-radius:6px;background:linear-gradient(90deg,#ECECF0 25%,#F5F5F7 50%,#ECECF0 75%);background-size:200% 100%;animation:hmsk 1.2s infinite}\
@keyframes hmsk{0%{background-position:200% 0}100%{background-position:-200% 0}}\
@media (max-width:960px){#home-view .hm-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}#home-view .hm-two{grid-template-columns:1fr}}\
@media (prefers-reduced-motion:reduce){#home-view .hm-skel{animation:none}}';

  function injectCss() { if (el('coach-home-css')) return; var s = document.createElement('style'); s.id = 'coach-home-css'; s.textContent = CSS; document.head.appendChild(s); }

  function ensureView() {
    var v = el('home-view');
    if (v) return v;
    var main = document.querySelector('.dashboard-main');
    if (!main) return null;
    v = document.createElement('div'); v.id = 'home-view'; v.style.display = 'none';
    var toolbar = main.querySelector('.dashboard-toolbar') || main.querySelector('.dashboard-header');
    if (toolbar && toolbar.nextSibling) main.insertBefore(v, toolbar.nextSibling); else main.appendChild(v);
    return v;
  }

  function firstName() {
    var full = state.raw && state.raw.me && state.raw.me.full_name ? String(state.raw.me.full_name).trim() : '';
    if (full) return 'Coach ' + full.split(' ')[0];
    return 'Coach';
  }

  function greeting() { var h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; }

  function nextPractice() {
    var now = new Date();
    for (var i = 0; i < 8; i++) {
      var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      if (PRACTICE.days.indexOf(d.getDay()) === -1) continue;
      if (i === 0 && (now.getHours() > 20 || (now.getHours() === 20 && now.getMinutes() > 0))) continue;
      var label = i === 0 ? 'Tonight' : i === 1 ? 'Tomorrow' : d.toLocaleDateString(undefined, { weekday: 'long' });
      return { label: label, date: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), isToday: i === 0 };
    }
    return { label: 'Tuesday', date: '', isToday: false };
  }

  function fmtDate(iso) { if (!iso) return ''; var d = new Date(iso + (iso.length === 10 ? 'T12:00:00' : '')); return isNaN(d) ? iso : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
  function fmtTime(t) { if (!t) return ''; var m = /^(\d{1,2}):(\d{2})/.exec(t); if (!m) return t; var h = +m[1]; var ap = h >= 12 ? 'pm' : 'am'; h = h % 12 || 12; return h + ':' + m[2] + ' ' + ap; }
  function colorFor(name) { if (/red/i.test(name)) return '#ff3b30'; if (/blue/i.test(name)) return '#2563eb'; if (/black/i.test(name)) return '#1d1d1f'; if (/green/i.test(name)) return '#34c759'; if (/white/i.test(name)) return '#e5e5e5'; return '#1A3A8F'; }

  function render() {
    injectCss();
    var v = ensureView(); if (!v) return;
    var db = (typeof getDB === 'function') ? getDB() : { teams: [], roster: [] };
    var raw = state.raw;
    var h = '';

    var title = el('view-title'); if (title) title.textContent = greeting() + ', ' + firstName();
    var sub = document.querySelector('#coach-dashboard .dashboard-header .text-sub');
    if (sub) sub.textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) + '. ' + (state.loading ? 'Loading your teams.' : state.error ? 'Showing what was saved on this device.' : 'Brotherhood. Habits. Success.');

    var np = nextPractice();
    var teams = db.teams || [];
    var roster = db.roster || [];
    var distinct = {}; roster.forEach(function (r) { if (r.status !== 'inactive') distinct[r.athleteId] = 1; });
    var athleteCount = Object.keys(distinct).length;
    var weekAgo = Date.now() - 7 * 864e5;
    var gradedWeek = raw ? raw.attendance.filter(function (a) { return (a.effort_rating || (a.skill_ratings && Object.keys(a.skill_ratings).length)) && new Date(a.created_at).getTime() > weekAgo; }).length : null;
    var upcoming = [];
    if (raw) {
      var today = new Date().toISOString().slice(0, 10);
      raw.sessions.forEach(function (s) { if (s.session_date >= today) upcoming.push({ date: s.session_date, time: s.start_time, title: s.title || (s.session_type || 'Practice').replace(/_/g, ' '), where: s.location || '', team: s.team_id }); });
      raw.games.forEach(function (g) { if (g.game_date >= today) upcoming.push({ date: g.game_date, time: g.game_time, title: 'vs ' + (g.opponent_name || 'TBD'), where: g.location || '', team: g.team_id }); });
      upcoming.sort(function (a, b) { return (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')); });
    }

    h += '<div class="hm-tiles">';
    h += '<div class="hm-tile dark"><div class="k">Next practice</div><div class="v small"><b>' + esc(np.label) + '</b>' + (np.date ? ', ' + esc(np.date) : '') + '</div><div class="s">Doors ' + PRACTICE.doors + '. Practice ' + PRACTICE.start + ' to ' + PRACTICE.end + '.</div></div>';
    h += '<div class="hm-tile"><div class="k">Teams</div><div class="v">' + (state.loading && !teams.length ? '<div class="hm-skel" style="width:40px"></div>' : teams.length) + '</div><div class="s">' + (teams.length ? 'Pick one below to open the roster' : 'None assigned yet') + '</div></div>';
    h += '<div class="hm-tile"><div class="k">Athletes</div><div class="v">' + (state.loading && !roster.length ? '<div class="hm-skel" style="width:40px"></div>' : athleteCount) + '</div><div class="s">Active, across all teams</div></div>';
    h += '<div class="hm-tile"><div class="k">Graded this week</div><div class="v">' + (gradedWeek == null ? (state.loading ? '<div class="hm-skel" style="width:40px"></div>' : '0') : gradedWeek) + '</div><div class="s">Practice grades in the last 7 days</div></div>';
    h += '</div>';

    h += '<div class="hm-sec">Your teams</div>';
    if (!teams.length) {
      h += '<div class="hm-list"><div class="hm-empty">' + (state.loading ? 'Loading teams.' : state.error ? 'Could not reach the roster right now. ' + esc(state.error) : 'No teams are assigned to you yet. Ask Coach Scott to add you to a team.') + '</div></div>';
    } else {
      h += '<div class="hm-teams">';
      teams.forEach(function (t) {
        var n = roster.filter(function (r) { return r.teamId === t.id && r.status !== 'inactive'; }).length;
        h += '<button type="button" class="hm-team" data-team="' + esc(t.id) + '"><div class="n"><i style="background:' + colorFor(t.name) + ';' + (/white/i.test(t.name) ? 'border:1px solid #c7c7cc' : '') + '"></i>' + esc(t.name) + '</div>' +
          '<div class="m">' + n + ' athlete' + (n === 1 ? '' : 's') + (t.coach ? ' &middot; ' + esc(t.coach) : '') + '</div><div class="a">Open roster</div></button>';
      });
      h += '</div>';
    }

    h += '<div class="hm-two">';
    h += '<div><div class="hm-sec">Recent grades</div><div class="hm-list">';
    if (!raw) { h += '<div class="hm-empty">' + (state.loading ? 'Loading.' : 'Not available offline.') + '</div>'; }
    else {
      var byAth = {}; roster.forEach(function (r) { byAth[r.athleteId] = r; });
      var sessBy = {}; raw.sessions.forEach(function (s) { sessBy[s.id] = s; });
      var scoreOf = function (a) { var k = a.skill_ratings || {}; var v = ['focus', 'hustle', 'skill', 'iq'].map(function (x) { return +k[x] || 0; }).filter(Boolean); return v.length ? Math.round(v.reduce(function (x, y) { return x + y; }, 0) / v.length * 10) / 10 : (a.effort_rating || 0); };
      var rows = raw.attendance.filter(function (a) { return scoreOf(a) > 0; }).slice(0, 6);
      if (!rows.length) h += '<div class="hm-empty">No grades yet. Grade a practice from the Roster tab.</div>';
      rows.forEach(function (a) {
        var ath = byAth[a.athlete_id]; var s = sessBy[a.session_id];
        var sc = scoreOf(a);
        h += '<div class="hm-row"><span class="av">' + esc(ath ? ath.initials : '?') + '</span><div class="t"><b>' + esc(ath ? ath.name : 'Athlete') + '</b><small>' + esc(s ? ((s.title || (s.session_type || 'practice').replace(/_/g, ' '))) : 'Practice') + (a.coach_notes ? '. ' + esc(a.coach_notes) : '') + '</small></div><span class="d">' + esc(fmtDate(s ? s.session_date : (a.created_at || '').slice(0, 10))) + '</span><span class="sc' + (sc < 6 ? ' lo' : '') + '">' + sc + '</span></div>';
      });
    }
    h += '</div></div>';

    h += '<div><div class="hm-sec">Coming up</div><div class="hm-list">';
    if (!raw) h += '<div class="hm-empty">' + (state.loading ? 'Loading.' : 'Not available offline.') + '</div>';
    else if (!upcoming.length) h += '<div class="hm-empty">Nothing scheduled beyond team practice. Add sessions and games from the Schedule tab.</div>';
    else upcoming.slice(0, 5).forEach(function (u) {
      var t = teams.filter(function (x) { return x.id === u.team; })[0];
      h += '<div class="hm-row"><div class="t"><b>' + esc(u.title) + '</b><small>' + esc([t ? t.name : '', u.where].filter(Boolean).join(' \u00b7 ')) + '</small></div><span class="d">' + esc(fmtDate(u.date)) + (u.time ? ', ' + esc(fmtTime(u.time)) : '') + '</span></div>';
    });
    h += '</div></div></div>';

    if (state.loadedAt) h += '<div class="hm-note">Live from the roster database, ' + esc(state.loadedAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })) + '.</div>';
    v.innerHTML = h;
    v.querySelectorAll('.hm-team').forEach(function (b) { b.addEventListener('click', function () { openTeam(b.getAttribute('data-team')); }); });
  }

  function openTeam(teamId) {
    var nav = null;
    document.querySelectorAll('#team-list .team-nav-item').forEach(function (n) { if (n.__teamId === teamId) nav = n; });
    hideHome();
    if (typeof loadTeamRoster === 'function') loadTeamRoster(teamId, nav);
    if (window.CoachPortalShell) window.CoachPortalShell.closeDrawer();
  }

  function showHome() {
    var v = ensureView(); if (!v) return;
    var main = v.parentNode;
    main.querySelectorAll('div[id$="-view"]').forEach(function (x) { if (x !== v) x.style.display = 'none'; });
    document.querySelectorAll('.team-nav-item.active').forEach(function (n) { n.classList.remove('active'); });
    var item = el('home-nav-item'); if (item) item.classList.add('active');
    var tabs = el('view-tabs'); if (tabs) tabs.style.display = 'none';
    render();
    v.style.display = 'block';
  }
  function hideHome() { var v = el('home-view'); if (v) v.style.display = 'none'; var item = el('home-nav-item'); if (item) item.classList.remove('active'); var r = el('roster-view'); if (r) r.style.display = ''; var sub = document.querySelector('#coach-dashboard .dashboard-header .text-sub'); if (sub && /Brotherhood|Loading|saved on this device/.test(sub.textContent)) sub.textContent = 'Godspeed Coach Portal'; }

  // Sidebar: a Home item above My Teams. Tag each team nav item with its id so
  // the Home cards can highlight the right one.
  function mountNav() {
    var side = document.querySelector('#coach-dashboard .dashboard-sidebar');
    if (!side || el('home-nav-item')) return;
    var wrap = document.createElement('div');
    wrap.style.marginBottom = '18px';
    var a = document.createElement('div');
    a.className = 'team-nav-item active'; a.id = 'home-nav-item'; a.setAttribute('role', 'button'); a.tabIndex = 0;
    a.style.cssText = 'display:flex;align-items:center;gap:12px;';
    a.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:.7" aria-hidden="true"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg><span>Home</span>';
    a.onclick = showHome; a.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showHome(); } };
    wrap.appendChild(a);
    side.insertBefore(wrap, side.firstChild);
  }
  function tagTeamNav() {
    var db = (typeof getDB === 'function') ? getDB() : null; if (!db) return;
    var items = document.querySelectorAll('#team-list .team-nav-item');
    // initDashboard renders teams grouped by category in db.teams order; match by visible name suffix.
    items.forEach(function (n) {
      var label = (n.querySelector('span:nth-child(2)') || n).textContent.trim();
      var t = db.teams.filter(function (x) { return x.name === label || x.name.replace(x.category || '', '').trim() === label; })[0];
      if (t) n.__teamId = t.id;
      n.addEventListener('click', hideHome);
    });
  }

  // When any team view or the playbook opens, Home steps aside.
  function wrapSwitchers() {
    var orig = window.switchTeamView;
    if (typeof orig === 'function' && !orig.__hmWrapped) {
      var w = function () { hideHome(); return orig.apply(this, arguments); }; w.__hmWrapped = true; window.switchTeamView = w;
    }
    if (window.CoachPlaybook && window.CoachPlaybook.open && !window.CoachPlaybook.open.__hmWrapped) {
      var po = window.CoachPlaybook.open; var pw = function () { hideHome(); return po.apply(this, arguments); }; pw.__hmWrapped = true; window.CoachPlaybook.open = pw;
    }
    var oa = window.openAcademyView;
    if (typeof oa === 'function' && !oa.__hmWrapped) { var aw = function () { hideHome(); return oa.apply(this, arguments); }; aw.__hmWrapped = true; window.openAcademyView = aw; }
  }

  async function load() {
    if (state.loading) return;
    state.loading = true; state.error = null; render();
    try {
      var raw = await fetchAll();
      state.raw = raw; state.loaded = true; state.loadedAt = new Date();
      writeDb(buildDb(raw));
      if (typeof initDashboard === 'function') { try { initDashboard(); } catch (e) { console.warn('[coach-home] initDashboard:', e.message); } }
      tagTeamNav();
    } catch (e) {
      state.error = e.message === 'no_session' ? 'You are signed in with an access code, so live rosters are not available. Sign in with your email to see your teams.' : e.message === 'no_client' ? 'Sign-in service not loaded.' : e.message;
      console.warn('[coach-home] load failed:', e.message);
    }
    state.loading = false;
    if (el('home-view') && el('home-view').style.display !== 'none') render();
  }

  function onDashboardShown() {
    injectCss(); mountNav(); wrapSwitchers(); tagTeamNav();
    showHome();
    load();
  }

  document.addEventListener('DOMContentLoaded', function () {
    var dash = el('coach-dashboard'); if (!dash) return;
    var shown = function () { return dash.style.display && dash.style.display !== 'none'; };
    var was = shown(); if (was) onDashboardShown();
    new MutationObserver(function () { var now = shown(); if (now && !was) onDashboardShown(); was = now; }).observe(dash, { attributes: true, attributeFilter: ['style'] });
    window.CoachHome = { show: showHome, reload: load, state: state };
  });
})();
