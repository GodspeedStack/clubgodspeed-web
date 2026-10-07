/**
 * GODSPEED BASKETBALL. Defense scorecard, inside the Coach Portal (Players section).
 *
 * Reads Scott's game sheet from defense_games + defense_game_marks and shows it so anyone
 * can read it in ten seconds: what our mistakes cost, who was in the right spot, who was not.
 *
 * Marks: star = good defense; tally = out of position (they scored or got the board);
 * X = badly out of position and they scored; other = turnover or no-hustle play they scored on.
 * Ranking (Scott, 2026-10-06): being in the right spot first, then making plays.
 *   mistakes = tallies + X + other (fewest first); ties: fewer plays they scored on, then more stars.
 * Every play they scored on counts as 2 points.
 *
 * Coach only. RLS: coach_can_see('defense', team). Never shown to parents.
 * Read only. No emojis. No em dashes. Sentence case.
 */
(function () {
  'use strict';
  var el = function (id) { return document.getElementById(id); };
  function esc(s) { return (s == null ? '' : String(s)).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function client() { try { return window.auth && typeof window.auth.getSupabaseClient === 'function' ? window.auth.getSupabaseClient() : null; } catch (e) { return null; } }

  var state = { games: [], gameId: null, marks: {}, loading: false, error: null };

  function name(a) { if (!a) return 'Player'; var l = (a.last_name || '').trim(); return a.first_name + (l ? ' ' + l.charAt(0) + '.' : ''); }
  function scoredOn(m) { return (m.xs || 0) + (m.other_scored || 0); }
  function mistakes(m) { return (m.tallies || 0) + scoredOn(m); }
  function ranked(rows) {
    return rows.slice().sort(function (a, b) { return mistakes(a) - mistakes(b) || scoredOn(a) - scoredOn(b) || (b.stars || 0) - (a.stars || 0) || name(a.athletes).localeCompare(name(b.athletes)); });
  }
  function game() { return state.games.filter(function (g) { return g.id === state.gameId; })[0] || null; }
  function fmtDay(iso) { if (!iso) return ''; var d = new Date(iso + 'T12:00:00'); return isNaN(d) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
  function gameLabel(g) { var bits = []; if (g.game_date) bits.push(fmtDay(g.game_date)); bits.push(g.opponent ? 'vs ' + g.opponent : 'Game'); if (g.our_score != null && g.their_score != null) bits.push(g.our_score + '-' + g.their_score); return bits.join(', '); }

  var CSS = '\
#defense-view{font-family:Inter,-apple-system,BlinkMacSystemFont,"Helvetica Neue",sans-serif;color:#1d1d1f;padding-bottom:48px}\
#defense-view .df-panel{background:#fff;border:1px solid #ececf0;border-radius:16px;padding:16px 18px;box-shadow:0 1px 2px rgba(15,23,42,.04),0 6px 16px rgba(15,23,42,.06)}\
#defense-view .df-lead{border-left:4px solid #1A3A8F;margin-bottom:14px}\
#defense-view .df-lead h4{margin:0 0 4px;font-size:17px;font-weight:800;letter-spacing:-.01em;text-transform:none}#defense-view .df-lead p{margin:0;font-size:13.5px;color:#6e6e73;line-height:1.5}\
#defense-view .df-key{display:flex;flex-wrap:wrap;gap:8px 18px;margin-top:10px;font-size:13px;color:#3a3a3c}\
#defense-view .df-key span{display:inline-flex;align-items:center;gap:6px}\
#defense-view .sw{width:12px;height:12px;border-radius:3px;display:inline-block;flex:0 0 12px}\
#defense-view .sw.t{background:#c7c7cc}#defense-view .sw.x{background:#d92d20}#defense-view .sw.o{background:#d97706}#defense-view .sw.s{background:#159a52;border-radius:50%}\
#defense-view .df-sec{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#1A3A8F;margin:20px 0 8px;display:flex;align-items:center;gap:10px}#defense-view .df-sec small{font-weight:600;color:#a1a1a6;letter-spacing:0;text-transform:none;font-size:12px}\
#defense-view .df-games{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px}\
#defense-view .df-games button{min-height:38px;padding:0 14px;border-radius:999px;border:1px solid #d9d9de;background:#fff;font:inherit;font-size:13.5px;font-weight:600;color:#1d1d1f;cursor:pointer}#defense-view .df-games button.on{background:#1A3A8F;border-color:#1A3A8F;color:#fff}\
#defense-view .df-tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}\
#defense-view .df-tile{background:#fff;border:1px solid #ececf0;border-radius:14px;padding:14px 16px}\
#defense-view .df-tile b{display:block;font-size:30px;font-weight:800;letter-spacing:-.02em;line-height:1.05}#defense-view .df-tile span{display:block;font-size:12.5px;color:#6e6e73;margin-top:6px;line-height:1.35}\
#defense-view .df-tile.bad b{color:#d92d20}#defense-view .df-tile.good b{color:#159a52}\
#defense-view .df-what{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}\
#defense-view .df-w{border-radius:14px;padding:12px 14px;background:#f5f5f7}#defense-view .df-w b{display:block;font-size:20px;font-weight:800}#defense-view .df-w span{font-size:12.5px;color:#6e6e73}\
#defense-view .df-w.lose{background:#fff0eb}#defense-view .df-w.lose b{color:#c2410c}#defense-view .df-w.win b{color:#1A3A8F}\
#defense-view .df-row{display:grid;grid-template-columns:28px minmax(110px,170px) 1fr 92px;gap:12px;align-items:center;padding:12px 0;border-bottom:1px solid #ececf0}#defense-view .df-row:last-child{border-bottom:0}\
#defense-view .df-row .rk{font-size:15px;font-weight:800;color:#a1a1a6;text-align:center}\
#defense-view .df-row .nm b{display:block;font-size:15px;font-weight:700}#defense-view .df-row .nm small{display:block;font-size:12px;color:#6e6e73;margin-top:2px}\
#defense-view .df-bar{display:flex;align-items:center;gap:3px;flex-wrap:wrap;min-height:18px}\
#defense-view .df-bar i{width:14px;height:14px;border-radius:3px;display:inline-block}#defense-view .df-bar i.t{background:#c7c7cc}#defense-view .df-bar i.x{background:#d92d20}#defense-view .df-bar i.o{background:#d97706}\
#defense-view .df-bar .gap{width:10px}#defense-view .df-bar i.s{background:#159a52;border-radius:50%}\
#defense-view .df-bar em{font-style:normal;font-size:12.5px;color:#159a52;font-weight:700;margin-left:4px}\
#defense-view .df-note{font-size:12px;color:#6e6e73;margin-top:4px}\
#defense-view .df-row .pts{text-align:right;font-size:13px;color:#6e6e73}#defense-view .df-row .pts b{display:block;font-size:18px;font-weight:800;color:#1d1d1f}#defense-view .df-row .pts b.z{color:#159a52}\
#defense-view .df-head{display:grid;grid-template-columns:28px minmax(110px,170px) 1fr 92px;gap:12px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#a1a1a6;padding-bottom:6px;border-bottom:1px solid #ececf0}#defense-view .df-head span:last-child{text-align:right}\
#defense-view .df-foot{margin-top:16px;font-size:12.5px;color:#6e6e73;display:flex;align-items:center;gap:8px}\
#defense-view .df-empty{color:#6e6e73;font-size:14px;padding:6px 0}\
@media (max-width:760px){#defense-view .df-tiles,#defense-view .df-what{grid-template-columns:repeat(2,1fr)}#defense-view .df-row,#defense-view .df-head{grid-template-columns:24px 1fr 70px}#defense-view .df-row .rk{grid-row:1}#defense-view .df-row .nm{grid-column:2;grid-row:1}#defense-view .df-row .pts{grid-column:3;grid-row:1}#defense-view .df-row .df-cell{grid-column:2 / 4;grid-row:2}#defense-view .df-head .hb{display:none}}';
  function injectCss() { if (el('defense-css')) return; var s = document.createElement('style'); s.id = 'defense-css'; s.textContent = CSS; document.head.appendChild(s); }

  function seg() {
    var labels = ['Players', 'Team needs', 'Roster', 'Defense'];
    return '<div class="gs-seg df-seg">' + labels.map(function (l, i) { return '<button type="button" data-seg="' + i + '" class="' + (i === 3 ? 'active' : '') + '">' + l + '</button>'; }).join('') + '</div>';
  }
  var SEG_GO = [
    function () { if (window.CoachDevBoard) window.CoachDevBoard.openTab('players'); },
    function () { if (window.CoachDevBoard) window.CoachDevBoard.openTab('team'); },
    function () { if (window.CoachNav && window.CoachNav.openRoster) window.CoachNav.openRoster(); },
    null
  ];

  function html() {
    var h = seg();
    h += '<div class="df-panel df-lead"><h4>Defense scorecard</h4><p>From the coach\'s game sheet. Being in the right spot comes first, making plays second. Every play they scored on is 2 points for them.</p>';
    h += '<div class="df-key"><span><i class="sw t"></i>Out of position</span><span><i class="sw x"></i>Out of position and they scored (X)</span><span><i class="sw o"></i>Turnover or no hustle, they scored</span><span><i class="sw s"></i>Good defense (star)</span></div></div>';
    if (state.loading) return h + '<div class="df-panel df-empty">Loading the game sheet...</div>';
    if (state.error) return h + '<div class="df-panel df-empty">Could not load the scorecard. ' + esc(state.error) + '</div>';
    if (!state.games.length) return h + '<div class="df-panel df-empty">No games scored yet.</div>';
    if (state.games.length > 1) h += '<div class="df-games">' + state.games.map(function (g) { return '<button type="button" data-game="' + esc(g.id) + '" class="' + (g.id === state.gameId ? 'on' : '') + '">' + esc(gameLabel(g)) + '</button>'; }).join('') + '</div>';
    var g = game(); var rows = ranked(state.marks[state.gameId] || []);
    var tot = rows.reduce(function (a, m) { a.s += m.stars || 0; a.t += m.tallies || 0; a.x += m.xs || 0; a.o += m.other_scored || 0; return a; }, { s: 0, t: 0, x: 0, o: 0 });
    var scored = tot.x + tot.o; var given = scored * 2;
    h += '<div class="df-sec">' + esc(gameLabel(g)) + (g.our_score != null && g.their_score != null ? '<small>' + (g.our_score > g.their_score ? 'Won' : g.our_score < g.their_score ? 'Lost' : 'Tied') + ' by ' + Math.abs(g.our_score - g.their_score) + '</small>' : '') + '</div>';
    h += '<div class="df-tiles">';
    h += '<div class="df-tile bad"><b>' + scored + '</b><span>plays they scored on because of us</span></div>';
    h += '<div class="df-tile bad"><b>' + given + (g.their_score != null ? '<small style="font-size:15px;color:#6e6e73;font-weight:700"> of ' + g.their_score + '</small>' : '') + '</b><span>points we gave them</span></div>';
    h += '<div class="df-tile"><b>' + (tot.t + tot.x) + '</b><span>times out of position</span></div>';
    h += '<div class="df-tile good"><b>' + tot.s + '</b><span>good defensive plays</span></div>';
    h += '</div>';
    if (g.our_score != null && g.their_score != null && g.their_score >= g.our_score && scored) {
      h += '<div class="df-sec">What those plays cost<small>each stop takes 2 points off their score</small></div><div class="df-what">';
      h += '<div class="df-w lose"><b>' + g.our_score + ' - ' + g.their_score + '</b><span>The real game</span></div>';
      var need = Math.floor((g.their_score - g.our_score) / 2) + 1; var steps = [need, need + 3, need + 5].filter(function (n, i, a) { return n <= scored && a.indexOf(n) === i; });
      steps.forEach(function (n) { var them = g.their_score - 2 * n; h += '<div class="df-w win"><b>' + g.our_score + ' - ' + them + '</b><span>' + n + ' more stops, win by ' + (g.our_score - them) + '</span></div>'; });
      h += '</div>';
    }
    h += '<div class="df-sec">Players, best first<small>fewest times out of position</small></div><div class="df-panel">';
    h += '<div class="df-head"><span>#</span><span>Player</span><span class="hb">Every mark from the game</span><span>Points given</span></div>';
    var prev = null, rank = 0;
    rows.forEach(function (m, i) {
      var key = mistakes(m) + '|' + scoredOn(m) + '|' + (m.stars || 0); if (key !== prev) rank = i + 1; prev = key;
      var a = m.athletes || {}; var pts = scoredOn(m) * 2;
      var bar = '';
      for (var k = 0; k < (m.tallies || 0); k++) bar += '<i class="t" title="Out of position"></i>';
      for (k = 0; k < (m.xs || 0); k++) bar += '<i class="x" title="Out of position and they scored"></i>';
      for (k = 0; k < (m.other_scored || 0); k++) bar += '<i class="o" title="' + esc(m.other_note || 'They scored') + '"></i>';
      if (m.stars) { bar += '<span class="gap"></span>'; for (k = 0; k < m.stars; k++) bar += '<i class="s" title="Good defense"></i>'; }
      if (!bar) bar = '<em>Clean</em>';
      var oop = (m.tallies || 0) + (m.xs || 0);
      var sub = oop ? oop + ' time' + (oop === 1 ? '' : 's') + ' out of position' : 'Never out of position';
      if (m.other_scored) sub += ', ' + m.other_scored + ' other';
      if (m.stars) sub += ', ' + m.stars + ' star' + (m.stars === 1 ? '' : 's');
      h += '<div class="df-row"><span class="rk">' + rank + '</span><div class="nm"><b>' + esc(name(a)) + (a.jersey_number != null ? ' <span style="color:#a1a1a6;font-weight:600">#' + esc(a.jersey_number) + '</span>' : '') + '</b><small>' + esc(sub) + '</small></div>';
      h += '<div class="df-cell"><div class="df-bar">' + bar + '</div>' + (m.other_note ? '<div class="df-note">' + esc(m.other_note) + '</div>' : '') + '</div>';
      h += '<div class="pts"><b class="' + (pts ? '' : 'z') + '">' + pts + '</b>points</div></div>';
    });
    h += '</div><div class="df-foot">Coach only. This page is never shown to parents.</div>';
    return h;
  }

  function paint() {
    var v = el('defense-view'); if (!v) return;
    v.innerHTML = html();
    v.querySelectorAll('[data-seg]').forEach(function (b) { var go = SEG_GO[+b.getAttribute('data-seg')]; if (go) b.onclick = go; });
    v.querySelectorAll('[data-game]').forEach(function (b) { b.onclick = function () { state.gameId = b.getAttribute('data-game'); paint(); }; });
  }

  async function load() {
    var c = client(); if (!c) { state.error = 'Sign in again.'; paint(); return; }
    state.loading = true; state.error = null; paint();
    try {
      var r = await c.from('defense_games').select('id, team_id, game_date, opponent, our_score, their_score, created_at').order('game_date', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }).limit(40);
      if (r.error) throw r.error;
      state.games = r.data || [];
      if (!state.games.some(function (g) { return g.id === state.gameId; })) state.gameId = state.games.length ? state.games[0].id : null;
      if (state.games.length) {
        var m = await c.from('defense_game_marks').select('game_id, athlete_id, stars, tallies, xs, other_scored, other_note, turnovers, rebounds, quarters_played, athletes(first_name, last_name, jersey_number)').in('game_id', state.games.map(function (g) { return g.id; }));
        if (m.error) throw m.error;
        state.marks = {}; (m.data || []).forEach(function (row) { (state.marks[row.game_id] = state.marks[row.game_id] || []).push(row); });
      }
    } catch (e) { state.error = (e && e.message) || 'Error'; }
    state.loading = false; paint();
  }

  function ensureView() {
    var v = el('defense-view'); if (v) return v;
    var main = document.querySelector('.dashboard-main'); if (!main) return null;
    v = document.createElement('div'); v.id = 'defense-view'; v.style.display = 'none';
    var after = main.querySelector('.dashboard-toolbar') || main.querySelector('.dashboard-header');
    if (after && after.nextSibling) main.insertBefore(v, after.nextSibling); else main.appendChild(v);
    return v;
  }
  function open() {
    injectCss(); var v = ensureView(); if (!v) return;
    v.parentNode.querySelectorAll('div[id$="-view"]').forEach(function (x) { if (x !== v) x.style.display = 'none'; });
    var tabs = el('view-tabs'); if (tabs) tabs.style.display = 'none';
    var t = el('view-title'); if (t) t.textContent = 'Defense';
    var s = document.querySelector('#coach-dashboard .dashboard-header .text-sub'); if (s) s.textContent = 'Who was in the right spot, and what it cost.';
    if (window.CoachNav && window.CoachNav.setActive) window.CoachNav.setActive(el('nav-players'));
    v.style.display = 'block'; paint(); load();
    if (window.CoachPortalShell && window.CoachPortalShell.closeDrawer) { try { window.CoachPortalShell.closeDrawer(); } catch (e) { /* optional */ } }
  }

  document.addEventListener('DOMContentLoaded', function () { injectCss(); });
  window.CoachDefense = { open: open, reload: load, state: state, _rank: ranked };
})();
