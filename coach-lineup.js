/**
 * GODSPEED BASKETBALL. Lineup builder, inside the Coach Portal (Players section).
 *
 * Pick five, see what the unit is made of, and see exactly what the last player
 * you added changed. Every number on this screen is an average of coach ratings
 * that were actually entered on the development board. Nothing is modelled,
 * estimated, or filled in.
 *
 * The honesty rules, which are the whole point of the screen:
 *   1. A player with no rating for a skill is left OUT of that average and is
 *      named under it. He is never counted as a zero, because a missing rating
 *      is not a bad rating.
 *   2. A skill with n = 0 in player_development.skills is treated as unrated.
 *      This is why Strength never appears: nobody has been scored on it yet.
 *   3. Plus/minus and speed are not shown. plus_minus is null in all 38
 *      player_game_stats rows, minutes_played is null in all 38 (so plus/minus
 *      cannot be reconstructed either), and strength_bench holds no sprint or
 *      agility number for any of the 21 rated players. The panel at the bottom
 *      says what to log to make them real instead of showing a made up figure.
 *   4. The defense game sheet is shown with its sample size on it. One game is
 *      labelled as one game.
 *
 * Scale: the Godspeed tryout rubric, 1 Poor to 5 Excellent. Deltas are in the
 * same units.
 *
 * Contract:
 *   window.CoachLineup.open()   renders into #lineup-view and shows it
 *   Reads: nothing of its own. Roster and athletes come from
 *   window.CoachHome.state.raw, ratings and config from
 *   window.CoachDevBoard.state (dev, cfg), which are already loaded and
 *   RLS scoped to this coach's teams. Defense marks come from defense_games
 *   and defense_game_marks, the same read coach-defense.js makes.
 *   Writes: none. This screen never writes.
 *   Coach only. Never shown to parents. No emojis. No em dashes. Sentence case.
 */
(function () {
  'use strict';
  var el = function (id) { return document.getElementById(id); };
  function esc(s) { return (s == null ? '' : String(s)).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function client() { try { return window.auth && typeof window.auth.getSupabaseClient === 'function' ? window.auth.getSupabaseClient() : null; } catch (e) { return null; } }
  function board() { return window.CoachDevBoard; }
  function raw() { var b = board(); var live = window.CoachHome && window.CoachHome.state && window.CoachHome.state.raw; return live || (b && b.state && b.state.cachedRoster) || null; }
  function devAll() { var b = board(); return (b && b.state && b.state.dev) || {}; }
  function cfg() { var b = board(); return (b && b.state && b.state.cfg) || {}; }

  var FLOOR_MAX = 5;

  // The nine skills that have real ratings behind them. Strength is deliberately
  // absent: every player carries n = 0 on it, so an average would be fiction.
  var METRICS = [
    { key: 'defense', label: 'Defense', hint: 'On ball, stance, closeouts, box outs' },
    { key: 'defInstincts', label: 'Defensive instincts', hint: 'Help position, rotations, deflections, talk' },
    { key: 'stamina', label: 'Stamina', hint: 'Late effort, recovery, seventeens' },
    { key: 'handles', label: 'Handles', hint: 'Weak hand, pressure, change of pace' },
    { key: 'shooting', label: 'Shooting', hint: 'Catch and shoot, off dribble, selection' },
    { key: 'vision', label: 'Vision and passing', hint: 'Drive and kick, pass ahead, decisions' },
    { key: 'offInstincts', label: 'Offensive instincts', hint: 'Spacing, cutting, attacking an advantage' },
    { key: 'iq', label: 'IQ', hint: 'Rules, reads, situations, time and score' },
    { key: 'coachability', label: 'Coachability', hint: 'Listens, effort, leadership, brotherhood' }
  ];
  var RUBRIC = ['', 'Poor', 'Weak', 'Some good actions', 'Consistent', 'Excellent'];
  var POS_ORDER = ['Guard', 'Wing', 'Big', 'Utility'];

  var state = { teamId: null, floor: [], lastAdded: null, defMarks: {}, defGameCount: 0, defLoaded: false, defError: null };

  // ---------- model ----------
  function teams() { var rw = raw(); return rw ? rw.teams.slice().sort(function (a, b) { return a.name.localeCompare(b.name); }) : []; }
  function playersOf(teamId) {
    var rw = raw(); if (!rw) return [];
    var byId = {}; rw.athletes.forEach(function (a) { byId[a.id] = a; });
    var out = [];
    rw.rosters.forEach(function (m) { if (m.left_at || m.team_id !== teamId) return; var a = byId[m.athlete_id]; if (a && a.enrollment_status !== 'inactive') out.push(a); });
    out.sort(function (a, b) { return ((a.first_name || '') + (a.last_name || '')).localeCompare((b.first_name || '') + (b.last_name || '')); });
    return out;
  }
  function athlete(id) { var rw = raw(); if (!rw) return null; return rw.athletes.filter(function (a) { return a.id === id; })[0] || null; }
  function name(a) { if (!a) return 'Player'; var l = (a.last_name || '').trim(); return ((a.first_name || '').trim() + (l ? ' ' + l.charAt(0) + '.' : '')) || 'Player'; }
  function fullName(a) { if (!a) return 'Player'; return (((a.first_name || '') + ' ' + (a.last_name || '')).trim()) || 'Player'; }
  function dev(id) { return devAll()[id] || null; }
  function positionOf(id) { var d = dev(id); return (d && d.position) || null; }
  function conditioningOf(id) { var d = dev(id); return (d && d.conditioning) || null; }

  // A rating exists only when the coach actually scored sub-skills for it (n > 0).
  function rating(id, key) {
    var d = dev(id); if (!d || !d.skills) return null;
    var s = d.skills[key];
    if (!s || typeof s !== 'object') return null;
    if (!s.n) return null;
    return typeof s.a === 'number' ? s.a : null;
  }
  function ratedAtAll(id) {
    var d = dev(id); if (!d) return false;
    if (!d.skills || typeof d.skills !== 'object') return false;
    return METRICS.some(function (m) { return rating(id, m.key) != null; });
  }
  // Average over the players who HAVE the rating. The ones who do not are named.
  function unitStat(ids, key) {
    var have = [], missing = [];
    ids.forEach(function (id) { var v = rating(id, key); if (v == null) missing.push(id); else have.push(v); });
    var avg = have.length ? have.reduce(function (a, b) { return a + b; }, 0) / have.length : null;
    return { avg: avg, n: have.length, of: ids.length, missing: missing };
  }
  function compositeDefense(ids) {
    var vals = [], missing = [];
    ids.forEach(function (id) {
      var a = rating(id, 'defense'), b = rating(id, 'defInstincts');
      var pair = [a, b].filter(function (v) { return v != null; });
      if (pair.length) vals.push(pair.reduce(function (x, y) { return x + y; }, 0) / pair.length);
      else missing.push(id);
    });
    return { avg: vals.length ? vals.reduce(function (a, b) { return a + b; }, 0) / vals.length : null, n: vals.length, of: ids.length, missing: missing };
  }
  function bench() { return playersOf(state.teamId).filter(function (a) { return state.floor.indexOf(a.id) < 0; }); }
  function floorWithout(id) { return state.floor.filter(function (x) { return x !== id; }); }

  // What did the last player added change? Current unit against the same unit
  // without him. Null when there is nothing to compare against.
  function delta(key) {
    if (!state.lastAdded || state.floor.indexOf(state.lastAdded) < 0 || state.floor.length < 2) return null;
    var before = key === '_def' ? compositeDefense(floorWithout(state.lastAdded)) : unitStat(floorWithout(state.lastAdded), key);
    var after = key === '_def' ? compositeDefense(state.floor) : unitStat(state.floor, key);
    if (before.avg == null || after.avg == null) return null;
    return after.avg - before.avg;
  }
  // For each metric, which player on the bench would raise the unit average most.
  function bestLift(key) {
    var cur = key === '_def' ? compositeDefense(state.floor) : unitStat(state.floor, key);
    if (cur.avg == null) return null;
    var best = null;
    bench().forEach(function (a) {
      if (rating(a.id, key === '_def' ? 'defense' : key) == null && key !== '_def') return;
      var ids = state.floor.concat([a.id]);
      var next = key === '_def' ? compositeDefense(ids) : unitStat(ids, key);
      if (next.avg == null) return;
      var d = next.avg - cur.avg;
      if (!best || d > best.d) best = { a: a, d: d };
    });
    return best && best.d > 0.004 ? best : null;
  }
  function posMix(ids) {
    var m = { Guard: 0, Wing: 0, Big: 0, Utility: 0, unset: 0 };
    ids.forEach(function (id) { var p = positionOf(id); if (p && m[p] != null) m[p]++; else m.unset++; });
    return m;
  }
  function posFlags(ids) {
    var out = [], m = posMix(ids);
    if (!ids.length) return out;
    if (ids.length === FLOOR_MAX) {
      if (!m.Big) out.push('No Big on the floor. Nobody is listed to guard the post or rebound it.');
      if (m.Guard >= 4) out.push(m.Guard + ' guards on the floor. Small, and short on rebounding.');
      if (m.unset) out.push(m.unset + ' player' + (m.unset === 1 ? ' has' : 's have') + ' no position set on the development board.');
    }
    return out;
  }
  function fmt(v) { return v == null ? 'no data' : v.toFixed(2); }
  function fmtD(v) { if (v == null) return ''; var s = (v >= 0 ? '+' : '') + v.toFixed(2); return s; }
  function rubricWord(v) { if (v == null) return ''; var i = Math.round(v); return RUBRIC[Math.min(5, Math.max(1, i))] || ''; }

  var CSS = '\
#lineup-view{font-family:Inter,-apple-system,BlinkMacSystemFont,"Helvetica Neue",sans-serif;color:#1d1d1f;padding-bottom:56px}\
#lineup-view .lu-panel{background:#fff;border:1px solid #ececf0;border-radius:16px;padding:16px 18px;box-shadow:0 1px 2px rgba(15,23,42,.04),0 6px 16px rgba(15,23,42,.06)}\
#lineup-view .lu-lead{border-left:4px solid #1A3A8F;margin-bottom:14px}\
#lineup-view .lu-lead h4{margin:0 0 4px;font-size:17px;font-weight:800;letter-spacing:-.01em;text-transform:none}\
#lineup-view .lu-lead p{margin:0 0 6px;font-size:13.5px;color:#6e6e73;line-height:1.5}#lineup-view .lu-lead p:last-child{margin-bottom:0}\
#lineup-view .lu-sec{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#1A3A8F;margin:22px 0 8px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}\
#lineup-view .lu-sec small{font-weight:600;color:#a1a1a6;letter-spacing:0;text-transform:none;font-size:12px}\
#lineup-view .lu-teams{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}\
#lineup-view .lu-teams button{min-height:38px;padding:0 14px;border-radius:999px;border:1px solid #d9d9de;background:#fff;font:inherit;font-size:13.5px;font-weight:600;color:#1d1d1f;cursor:pointer}\
#lineup-view .lu-teams button.on{background:#1A3A8F;border-color:#1A3A8F;color:#fff}\
#lineup-view .lu-grid{display:grid;grid-template-columns:minmax(260px,340px) 1fr;gap:14px;align-items:start}\
#lineup-view .lu-slots{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:12px}\
#lineup-view .lu-slot{border:1px dashed #d9d9de;border-radius:12px;min-height:66px;padding:8px;display:flex;flex-direction:column;justify-content:center;gap:3px;background:#fafafa}\
#lineup-view .lu-slot.filled{border-style:solid;border-color:#1A3A8F;background:#fff;cursor:pointer}\
#lineup-view .lu-slot b{font-size:13px;font-weight:700;line-height:1.2}#lineup-view .lu-slot span{font-size:11.5px;color:#6e6e73}\
#lineup-view .lu-slot.filled.just{box-shadow:0 0 0 3px rgba(26,58,143,.14)}\
#lineup-view .lu-slot em{font-style:normal;font-size:11.5px;color:#a1a1a6}\
#lineup-view .lu-pool{display:flex;flex-direction:column;gap:6px;max-height:560px;overflow:auto}\
#lineup-view .lu-p{display:flex;align-items:center;gap:10px;width:100%;text-align:left;border:1px solid #ececf0;background:#fff;border-radius:12px;padding:9px 11px;font:inherit;cursor:pointer;min-height:48px}\
#lineup-view .lu-p:hover{border-color:#c7c7cc}#lineup-view .lu-p.on{border-color:#1A3A8F;background:#f4f6fd}\
#lineup-view .lu-p[disabled]{opacity:.45;cursor:default}\
#lineup-view .lu-p b{font-size:14px;font-weight:700;display:block;line-height:1.25}\
#lineup-view .lu-p small{font-size:11.5px;color:#6e6e73;display:block}\
#lineup-view .lu-p .nodata{color:#c2410c;font-weight:700}\
#lineup-view .lu-p .num{margin-left:auto;font-size:12.5px;color:#6e6e73;text-align:right;flex:0 0 auto}\
#lineup-view .lu-p .num b{font-size:15px;font-weight:800;color:#1d1d1f}\
#lineup-view .lu-head{display:grid;grid-template-columns:minmax(120px,1.4fr) 1fr 74px 84px;gap:12px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#a1a1a6;padding-bottom:6px;border-bottom:1px solid #ececf0}\
#lineup-view .lu-head span:nth-child(3),#lineup-view .lu-head span:nth-child(4){text-align:right}\
#lineup-view .lu-m{display:grid;grid-template-columns:minmax(120px,1.4fr) 1fr 74px 84px;gap:12px;align-items:center;padding:11px 0;border-bottom:1px solid #ececf0}\
#lineup-view .lu-m:last-child{border-bottom:0}\
#lineup-view .lu-m.big{background:#f4f6fd;margin:0 -18px;padding:13px 18px;border-bottom:1px solid #e3e7f5}\
#lineup-view .lu-m .nm b{display:block;font-size:14.5px;font-weight:700}#lineup-view .lu-m .nm small{display:block;font-size:11.5px;color:#6e6e73;margin-top:2px;line-height:1.35}\
#lineup-view .lu-track{height:10px;border-radius:999px;background:#ececf0;overflow:hidden;position:relative}\
#lineup-view .lu-fill{height:100%;background:#1A3A8F;border-radius:999px}\
#lineup-view .lu-track.nod{background:repeating-linear-gradient(45deg,#f0f0f3,#f0f0f3 5px,#e4e4e9 5px,#e4e4e9 10px)}\
#lineup-view .lu-val{text-align:right;font-size:17px;font-weight:800;letter-spacing:-.01em}\
#lineup-view .lu-val small{display:block;font-size:11px;font-weight:600;color:#a1a1a6;letter-spacing:0}\
#lineup-view .lu-val.nod{font-size:13px;font-weight:700;color:#a1a1a6}\
#lineup-view .lu-d{text-align:right;font-size:14.5px;font-weight:800}\
#lineup-view .lu-d.up{color:#159a52}#lineup-view .lu-d.down{color:#d92d20}#lineup-view .lu-d.flat{color:#a1a1a6;font-weight:600}\
#lineup-view .lu-d small{display:block;font-size:10.5px;font-weight:600;color:#a1a1a6}\
#lineup-view .lu-chips{display:flex;gap:8px;flex-wrap:wrap}\
#lineup-view .lu-chip{font-size:12.5px;font-weight:600;color:#1d1d1f;background:#f5f5f7;border-radius:999px;padding:6px 11px}\
#lineup-view .lu-chip b{font-weight:800}#lineup-view .lu-chip.warn{background:#fff0eb;color:#c2410c}\
#lineup-view .lu-flag{font-size:13px;color:#c2410c;background:#fff0eb;border-radius:10px;padding:9px 12px;margin-top:8px;line-height:1.45}\
#lineup-view .lu-miss{font-size:12px;color:#c2410c;margin-top:3px}\
#lineup-view .lu-empty{color:#6e6e73;font-size:14px;padding:6px 0}\
#lineup-view .lu-gap{border-left:4px solid #d97706}\
#lineup-view .lu-gap h4{margin:0 0 8px;font-size:15px;font-weight:800;text-transform:none}\
#lineup-view .lu-gap dl{margin:0;display:grid;grid-template-columns:minmax(110px,150px) 1fr;gap:6px 14px;font-size:13px;line-height:1.5}\
#lineup-view .lu-gap dt{font-weight:700;color:#1d1d1f;margin:0}#lineup-view .lu-gap dd{margin:0;color:#6e6e73}\
#lineup-view .lu-lift{display:flex;flex-direction:column;gap:7px}\
#lineup-view .lu-lift div{display:flex;align-items:baseline;gap:8px;font-size:13.5px}\
#lineup-view .lu-lift span.k{color:#6e6e73;min-width:150px}#lineup-view .lu-lift b{font-weight:700}#lineup-view .lu-lift em{font-style:normal;color:#159a52;font-weight:800;margin-left:auto}\
#lineup-view .lu-cond{font-size:13px;line-height:1.5;color:#3a3a3c}#lineup-view .lu-cond b{display:block;font-size:13.5px;color:#1d1d1f}#lineup-view .lu-cond div{padding:8px 0;border-bottom:1px solid #ececf0}#lineup-view .lu-cond div:last-child{border-bottom:0}\
#lineup-view .lu-foot{margin-top:18px;font-size:12.5px;color:#6e6e73;line-height:1.5}\
#lineup-view .lu-bar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}\
#lineup-view .lu-bar button{min-height:36px;padding:0 13px;border-radius:999px;border:1px solid #d9d9de;background:#fff;font:inherit;font-size:13px;font-weight:600;color:#1d1d1f;cursor:pointer}\
@media (max-width:900px){#lineup-view .lu-grid{grid-template-columns:1fr}#lineup-view .lu-slots{grid-template-columns:repeat(3,1fr)}\
#lineup-view .lu-head{display:none}#lineup-view .lu-m{grid-template-columns:1fr 78px 80px;gap:10px}#lineup-view .lu-m .lu-track{display:none}\
#lineup-view .lu-m.big{margin:0 -18px}#lineup-view .lu-gap dl{grid-template-columns:1fr}}';
  function injectCss() { if (el('lineup-css')) return; var s = document.createElement('style'); s.id = 'lineup-css'; s.textContent = CSS; document.head.appendChild(s); }

  // ---------- defense game sheet (real, and labelled with its sample size) ----------
  async function loadDefense() {
    if (state.defLoaded) return;
    var c = client(); if (!c) return;
    try {
      var g = await c.from('defense_games').select('id, team_id').limit(40);
      if (g.error) throw g.error;
      var games = g.data || [];
      state.defGameCount = games.length;
      if (games.length) {
        var m = await c.from('defense_game_marks').select('game_id, athlete_id, stars, tallies, xs, other_scored').in('game_id', games.map(function (x) { return x.id; }));
        if (m.error) throw m.error;
        var byA = {};
        (m.data || []).forEach(function (r) {
          var o = byA[r.athlete_id] = byA[r.athlete_id] || { games: 0, stars: 0, oop: 0, scored: 0 };
          o.games++; o.stars += r.stars || 0; o.oop += (r.tallies || 0) + (r.xs || 0); o.scored += (r.xs || 0) + (r.other_scored || 0);
        });
        state.defMarks = byA;
      }
    } catch (e) { state.defError = (e && e.message) || 'Error'; }
    state.defLoaded = true; paint();
  }

  // ---------- render ----------
  function seg() {
    var labels = ['Players', 'Team needs', 'Roster', 'Defense', 'Lineup'];
    return '<div class="gs-seg lu-seg">' + labels.map(function (l, i) { return '<button type="button" data-seg="' + i + '" class="' + (i === 4 ? 'active' : '') + '">' + l + '</button>'; }).join('') + '</div>';
  }
  var SEG_GO = [
    function () { if (window.CoachDevBoard) window.CoachDevBoard.openTab('players'); },
    function () { if (window.CoachDevBoard) window.CoachDevBoard.openTab('team'); },
    function () { if (window.CoachNav && window.CoachNav.openRoster) window.CoachNav.openRoster(); },
    function () { if (window.CoachDefense) window.CoachDefense.open(); },
    null
  ];

  function slotHtml() {
    var h = '<div class="lu-slots">';
    for (var i = 0; i < FLOOR_MAX; i++) {
      var id = state.floor[i];
      if (!id) { h += '<div class="lu-slot"><em>Empty</em></div>'; continue; }
      var a = athlete(id); var p = positionOf(id);
      h += '<div class="lu-slot filled' + (id === state.lastAdded ? ' just' : '') + '" data-drop="' + esc(id) + '" role="button" tabindex="0" title="Take him off the floor">';
      h += '<b>' + esc(name(a)) + '</b><span>' + esc(p || 'No position set') + '</span></div>';
    }
    return h + '</div>';
  }

  function poolHtml() {
    var list = playersOf(state.teamId);
    if (!list.length) return '<div class="lu-panel lu-empty">No players on this team yet.</div>';
    var full = state.floor.length >= FLOOR_MAX;
    var h = '<div class="lu-panel"><div class="lu-pool">';
    list.forEach(function (a) {
      var on = state.floor.indexOf(a.id) >= 0;
      var rated = ratedAtAll(a.id);
      var d = compositeDefense([a.id]);
      var bits = [];
      var p = positionOf(a.id); if (p) bits.push(p);
      if (a.jersey_number != null) bits.push('#' + a.jersey_number);
      h += '<button type="button" class="lu-p' + (on ? ' on' : '') + '" data-pick="' + esc(a.id) + '"' + (!on && full ? ' disabled' : '') + '>';
      h += '<span><b>' + esc(fullName(a)) + '</b><small>' + (bits.length ? esc(bits.join(', ')) : 'No position set');
      if (!rated) h += (bits.length ? ', ' : '') + '<span class="nodata">not rated yet</span>';
      h += '</small></span>';
      h += '<span class="num">' + (d.avg == null ? '<b style="font-size:12.5px;color:#a1a1a6">no data</b>' : '<b>' + d.avg.toFixed(2) + '</b>Defense') + '</span>';
      h += '</button>';
    });
    h += '</div></div>';
    if (full) h += '<div class="lu-foot">Five on the floor. Tap a player in a slot above to take him off.</div>';
    return h;
  }

  function metricRow(key, label, hint, isBig) {
    var st = key === '_def' ? compositeDefense(state.floor) : unitStat(state.floor, key);
    var d = delta(key);
    var pct = st.avg == null ? 0 : Math.max(0, Math.min(100, ((st.avg - 1) / 4) * 100));
    var h = '<div class="lu-m' + (isBig ? ' big' : '') + '">';
    h += '<div class="nm"><b>' + esc(label) + '</b><small>' + esc(hint) + '</small>';
    if (st.missing && st.missing.length) {
      h += '<div class="lu-miss">Not counted, no rating: ' + st.missing.map(function (id) { return esc(name(athlete(id))); }).join(', ') + '</div>';
    } else if (st.avg != null && st.n < st.of) {
      h += '<div class="lu-miss">' + (st.of - st.n) + ' of ' + st.of + ' not counted, no rating</div>';
    }
    h += '</div>';
    h += '<div><div class="lu-track' + (st.avg == null ? ' nod' : '') + '">' + (st.avg == null ? '' : '<div class="lu-fill" style="width:' + pct.toFixed(1) + '%"></div>') + '</div></div>';
    if (st.avg == null) h += '<div class="lu-val nod">no data</div>';
    else h += '<div class="lu-val">' + st.avg.toFixed(2) + '<small>' + esc(rubricWord(st.avg)) + ', ' + st.n + ' of ' + st.of + '</small></div>';
    var cls = d == null ? 'flat' : d > 0.004 ? 'up' : d < -0.004 ? 'down' : 'flat';
    h += '<div class="lu-d ' + cls + '">' + (d == null ? '<span style="color:#d9d9de">-</span>' : esc(fmtD(d))) + (d != null ? '<small>last add</small>' : '') + '</div>';
    return h + '</div>';
  }

  function unitHtml() {
    if (!state.floor.length) {
      return '<div class="lu-panel lu-empty">Pick a player to start a unit. Each number below is the average of the coach ratings for the players on the floor, and the right hand column shows what the last player you added changed.</div>';
    }
    var h = '<div class="lu-panel">';
    h += '<div class="lu-head"><span>Metric</span><span>Unit on the 1 to 5 rubric</span><span>Average</span><span>Change</span></div>';
    h += metricRow('_def', 'Defense, combined', 'Defense and defensive instincts together, per player', true);
    METRICS.forEach(function (m) { h += metricRow(m.key, m.label, m.hint, false); });
    h += '</div>';

    var m = posMix(state.floor);
    h += '<div class="lu-sec">On the floor<small>' + state.floor.length + ' of ' + FLOOR_MAX + '</small></div><div class="lu-panel">';
    h += '<div class="lu-chips">';
    POS_ORDER.forEach(function (p) { if (m[p]) h += '<span class="lu-chip"><b>' + m[p] + '</b> ' + esc(p) + (m[p] === 1 ? '' : 's') + '</span>'; });
    if (m.unset) h += '<span class="lu-chip warn"><b>' + m.unset + '</b> no position set</span>';
    var unrated = state.floor.filter(function (id) { return !ratedAtAll(id); });
    if (unrated.length) h += '<span class="lu-chip warn"><b>' + unrated.length + '</b> not rated: ' + unrated.map(function (id) { return esc(name(athlete(id))); }).join(', ') + '</span>';
    h += '</div>';
    posFlags(state.floor).forEach(function (f) { h += '<div class="lu-flag">' + esc(f) + '</div>'; });
    h += '</div>';

    if (state.floor.length < FLOOR_MAX) {
      var lifts = [];
      var bd = bestLift('_def'); if (bd) lifts.push({ label: 'Defense, combined', b: bd });
      METRICS.forEach(function (mm) { var b = bestLift(mm.key); if (b) lifts.push({ label: mm.label, b: b }); });
      if (lifts.length) {
        h += '<div class="lu-sec">Biggest lift still on the bench<small>who would raise each average most, from the ratings already entered</small></div>';
        h += '<div class="lu-panel lu-lift">';
        lifts.forEach(function (x) { h += '<div><span class="k">' + esc(x.label) + '</span><b>' + esc(fullName(x.b.a)) + '</b><em>' + esc(fmtD(x.b.d)) + '</em></div>'; });
        h += '</div>';
      }
    }

    // The defense game sheet, with its sample size stated.
    var sheet = state.floor.map(function (id) { return { id: id, m: state.defMarks[id] }; }).filter(function (x) { return x.m; });
    if (state.defLoaded && state.defGameCount) {
      h += '<div class="lu-sec">Scored defense from the game sheet<small>' + state.defGameCount + ' game' + (state.defGameCount === 1 ? '' : 's') + ' logged, so read it as ' + (state.defGameCount === 1 ? 'one game' : state.defGameCount + ' games') + ', not a season</small></div><div class="lu-panel">';
      if (!sheet.length) h += '<div class="lu-empty">None of these five was marked in the logged game' + (state.defGameCount === 1 ? '' : 's') + '.</div>';
      else {
        h += '<div class="lu-cond">';
        sheet.forEach(function (x) {
          h += '<div><b>' + esc(fullName(athlete(x.id))) + '</b>' + x.m.oop + ' time' + (x.m.oop === 1 ? '' : 's') + ' out of position, ' + x.m.stars + ' good defensive play' + (x.m.stars === 1 ? '' : 's') + ', ' + (x.m.scored * 2) + ' points given, across ' + x.m.games + ' game' + (x.m.games === 1 ? '' : 's') + '.</div>';
        });
        h += '</div>';
        if (sheet.length < state.floor.length) h += '<div class="lu-miss">Not in the sheet: ' + state.floor.filter(function (id) { return !state.defMarks[id]; }).map(function (id) { return esc(name(athlete(id))); }).join(', ') + '</div>';
      }
      h += '</div>';
    }

    // Conditioning in the coach's own words. The closest honest thing to speed.
    var conds = state.floor.map(function (id) { return { id: id, c: conditioningOf(id) }; }).filter(function (x) { return x.c; });
    if (conds.length) {
      h += '<div class="lu-sec">Conditioning notes<small>your own words from the development board, not a score</small></div><div class="lu-panel lu-cond">';
      conds.forEach(function (x) { h += '<div><b>' + esc(fullName(athlete(x.id))) + '</b>' + esc(x.c) + '</div>'; });
      h += '</div>';
    }
    return h;
  }

  function gapHtml() {
    var h = '<div class="lu-sec">Not on this screen, and why<small>these would have to be invented, so they are left off</small></div>';
    h += '<div class="lu-panel lu-gap"><h4>Plus/minus and speed are not shown</h4><dl>';
    h += '<dt>Plus/minus</dt><dd>The plus_minus column exists on player_game_stats and is empty in all 38 rows logged so far. minutes_played is empty in all 38 as well, so it cannot be worked back out of what is there either, because plus/minus needs to know who was on the floor and when. To make it real, log each substitution with a clock time, or score each stint, and the number falls out of that by itself.</dd>';
    h += '<dt>Speed</dt><dd>No sprint or agility number has ever been entered for any player. The development board already has the fields (sprint, agility, vertical, seventeens) and the age norms to score them against. One timed session fills them, and then speed can sit on this screen with the rest.</dd>';
    h += '<dt>Strength</dt><dd>Left off the averages above for the same reason: every player carries a count of zero on it, so there is nothing to average.</dd>';
    h += '</dl></div>';
    return h;
  }

  function html() {
    var h = seg();
    h += '<div class="lu-panel lu-lead"><h4>Lineup builder</h4>';
    h += '<p>Pick five. Every average is built only from coach ratings that were actually entered, on the Godspeed rubric, 1 Poor to 5 Excellent. A player with no rating for a skill is left out of that average and named under it, never counted as a zero.</p>';
    h += '<p>The change column shows what the last player you added did to each average, so you can see the unit move as you build it.</p></div>';

    var rw = raw();
    if (!rw) return h + '<div class="lu-panel lu-empty">Roster is still loading. Open Home once, then come back.</div>';
    var ts = teams().filter(function (t) { return playersOf(t.id).length; });
    if (!ts.length) return h + '<div class="lu-panel lu-empty">No teams with players on them.</div>';
    if (!state.teamId || !ts.some(function (t) { return t.id === state.teamId; })) {
      var b = board(); var mine = b && b.state && b.state.myTeams ? ts.filter(function (t) { return b.state.myTeams.indexOf(t.id) >= 0; }) : [];
      state.teamId = (mine[0] || ts[0]).id; state.floor = []; state.lastAdded = null;
    }
    if (ts.length > 1) h += '<div class="lu-teams">' + ts.map(function (t) { return '<button type="button" data-team="' + esc(t.id) + '" class="' + (t.id === state.teamId ? 'on' : '') + '">' + esc(t.name) + '</button>'; }).join('') + '</div>';

    h += '<div class="lu-bar"><button type="button" data-act="clear">Clear the floor</button><button type="button" data-act="bestdef">Best five on defense</button></div>';
    h += slotHtml();
    h += '<div class="lu-grid"><div>' + poolHtml() + '</div><div>' + unitHtml() + '</div></div>';
    h += gapHtml();
    h += '<div class="lu-foot">Read only. Nothing on this screen is saved, and nothing here is shown to parents. Ratings come from the development board, so a lineup gets sharper every time a player is scored.</div>';
    return h;
  }

  function bestFiveOnDefense() {
    var scored = playersOf(state.teamId).map(function (a) { return { id: a.id, v: compositeDefense([a.id]).avg }; }).filter(function (x) { return x.v != null; });
    scored.sort(function (a, b) { return b.v - a.v; });
    state.floor = scored.slice(0, FLOOR_MAX).map(function (x) { return x.id; });
    state.lastAdded = null;
  }

  function paint() {
    var v = el('lineup-view'); if (!v) return;
    v.innerHTML = html();
    v.querySelectorAll('[data-seg]').forEach(function (b) { var go = SEG_GO[+b.getAttribute('data-seg')]; if (go) b.onclick = go; });
    v.querySelectorAll('[data-team]').forEach(function (b) { b.onclick = function () { state.teamId = b.getAttribute('data-team'); state.floor = []; state.lastAdded = null; paint(); }; });
    v.querySelectorAll('[data-pick]').forEach(function (b) {
      b.onclick = function () {
        var id = b.getAttribute('data-pick'); var i = state.floor.indexOf(id);
        if (i >= 0) { state.floor.splice(i, 1); if (state.lastAdded === id) state.lastAdded = null; }
        else { if (state.floor.length >= FLOOR_MAX) return; state.floor.push(id); state.lastAdded = id; }
        paint();
      };
    });
    v.querySelectorAll('[data-drop]').forEach(function (b) {
      var go = function () { var id = b.getAttribute('data-drop'); state.floor = state.floor.filter(function (x) { return x !== id; }); if (state.lastAdded === id) state.lastAdded = null; paint(); };
      b.onclick = go; b.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } };
    });
    v.querySelectorAll('[data-act]').forEach(function (b) {
      b.onclick = function () {
        var a = b.getAttribute('data-act');
        if (a === 'clear') { state.floor = []; state.lastAdded = null; }
        if (a === 'bestdef') bestFiveOnDefense();
        paint();
      };
    });
  }

  function ensureView() {
    var v = el('lineup-view'); if (v) return v;
    var main = document.querySelector('.dashboard-main'); if (!main) return null;
    v = document.createElement('div'); v.id = 'lineup-view'; v.style.display = 'none';
    var after = main.querySelector('.dashboard-toolbar') || main.querySelector('.dashboard-header');
    if (after && after.nextSibling) main.insertBefore(v, after.nextSibling); else main.appendChild(v);
    return v;
  }

  function open(teamId) {
    injectCss(); var v = ensureView(); if (!v) return;
    v.parentNode.querySelectorAll('div[id$="-view"]').forEach(function (x) { if (x !== v) x.style.display = 'none'; });
    var tabs = el('view-tabs'); if (tabs) tabs.style.display = 'none';
    var t = el('view-title'); if (t) t.textContent = 'Lineup';
    var s = document.querySelector('#coach-dashboard .dashboard-header .text-sub'); if (s) s.textContent = 'Build a five and see what it is made of.';
    if (window.CoachNav && window.CoachNav.setActive) window.CoachNav.setActive(el('nav-players'));
    if (teamId) { state.teamId = teamId; state.floor = []; state.lastAdded = null; }
    v.style.display = 'block'; paint();
    // Ratings and config may not be loaded yet if the coach came straight here.
    var b = board();
    if (b && b.ensureConfig) { b.ensureConfig().then(paint).catch(function () { paint(); }); }
    loadDefense();
    if (window.CoachPortalShell && window.CoachPortalShell.closeDrawer) { try { window.CoachPortalShell.closeDrawer(); } catch (e) { /* optional */ } }
  }

  document.addEventListener('DOMContentLoaded', function () { injectCss(); });
  window.CoachLineup = { open: open, state: state, _unitStat: unitStat, _compositeDefense: compositeDefense };
})();
