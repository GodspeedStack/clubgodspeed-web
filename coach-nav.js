/* coach-nav.js v2
 * One owner for the coach portal sidebar. Loaded last.
 *
 * Contract
 *   Five items, nothing else in the sidebar:
 *     HOME       (coach-home)
 *     PLAYERS    development board, players screen; a small in-screen row: Players | Team needs | Roster (the old team page)
 *     PRACTICE   development board, plan screen; row: Practice plan | The Bank | Training log
 *     PLAYBOOK   5th Grade Playbook; row: Playbook | Player development | Coaching IQ | Coach Academy (coming) | Reading list (coming)
 *     DIRECTOR   (Scott only) activity; row: Activity | Import CSV | Download Data
 *   Every module keeps mounting its own sidebar item; those items are moved into a hidden holder so the code
 *   that looks them up keeps working (#team-list, #devboard-nav-item, #trainlog-nav-item, ...). The team is picked on Home
 *   or on the team bar inside Players and Practice, not in the sidebar.
 *   The board's own tab row is reused as the in-screen row: the buttons for the current section stay, the rest hide,
 *   and extra chips (Roster, Training log, Import CSV, Download Data) are appended. Nothing here talks to the database.
 */
(function () {
  'use strict';
  var el = function (id) { return document.getElementById(id); };
  var ICON = function (paths) { return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:.7;flex:0 0 18px" aria-hidden="true">' + paths + '</svg>'; };
  var ICONS = {
    players: ICON('<circle cx="9" cy="8" r="4"/><path d="M2 21v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2"/><circle cx="17" cy="9" r="3"/><path d="M22 21v-2a4 4 0 0 0-3-3.9"/>'),
    practice: ICON('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 3v2h6V3"/><path d="M8 11h8M8 15h5"/>'),
    playbook: ICON('<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/>'),
    director: ICON('<path d="M22 12h-4l-3 8-6-16-3 8H2"/>')
  };
  var SECTIONS = {
    players: { tabs: ['players', 'team'], chips: [{ id: 'gs-chip-roster', label: 'Roster', go: openRoster }] },
    practice: { tabs: ['plan', 'bank'], chips: [{ id: 'gs-chip-trainlog', label: 'Training log', go: function () { if (window.CoachTrainingLog) window.CoachTrainingLog.open(); } }] },
    director: { tabs: ['activity'], chips: [{ id: 'gs-chip-import', label: 'Import CSV', go: function () { if (typeof showBulkUpload === 'function') showBulkUpload(); } }, { id: 'gs-chip-export', label: 'Download Data', go: function () { if (typeof exportData === 'function') exportData(); } }] }
  };
  var TAB_TO_SECTION = { players: 'players', team: 'players', plan: 'practice', bank: 'practice', activity: 'director' };
  var section = null;

  var CSS = '#coach-dashboard .dashboard-sidebar #gs-nav-hidden{display:none!important}\
#coach-dashboard .dashboard-sidebar > .sidebar-title{display:none}\
#coach-dashboard .dashboard-sidebar .gs-nav-main{margin-bottom:22px}\
#coach-dashboard .dashboard-sidebar .gs-nav-main .team-nav-item{display:flex;align-items:center;gap:12px;font-size:15px;padding:11px 12px}\
#coach-dashboard .dashboard-sidebar .gs-nav-main .team-nav-item .gs-dot{width:8px;height:8px;border-radius:50%;background:#d92d20;margin-left:auto;flex:0 0 8px}\
#devboard-view .db-tabs button{display:none}#devboard-view .db-tabs button.gs-show{display:inline-flex}\
#devboard-view .db-tabs button.gs-chip{display:inline-flex}\
.gs-seg{display:inline-flex;gap:2px;padding:3px;background:rgba(118,118,128,.12);border-radius:12px;margin:0 0 16px;flex-wrap:wrap}\
.gs-seg button{font:inherit;font-size:13.5px;font-weight:600;padding:8px 14px;border-radius:9px;border:0;background:transparent;color:#6e6e73;cursor:pointer;min-height:0;min-width:0;text-transform:none;display:inline-flex;align-items:center;gap:6px}\
.gs-seg button.active{background:#fff;color:#1d1d1f;box-shadow:0 1px 3px rgba(0,0,0,.12)}.gs-seg button.coming{opacity:.5;cursor:default}\
.gs-seg button .nav-coming{font-size:9.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#6E6E73;background:#E9E9EB;border-radius:999px;padding:2px 6px;line-height:1}';

  function injectCss() { if (el('coach-nav-css')) return; var s = document.createElement('style'); s.id = 'coach-nav-css'; s.textContent = CSS; document.head.appendChild(s); }
  function item(id, label, icon, onOpen) {
    var a = document.createElement('div');
    a.className = 'team-nav-item'; a.id = id; a.setAttribute('role', 'button'); a.tabIndex = 0;
    a.innerHTML = icon + '<span>' + label + '</span>';
    var go = function () { onOpen(); setActive(a); if (window.CoachPortalShell && window.CoachPortalShell.closeDrawer) { try { window.CoachPortalShell.closeDrawer(); } catch (e) { /* optional */ } } };
    a.onclick = go; a.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } };
    return a;
  }
  function setActive(node) {
    document.querySelectorAll('#coach-dashboard .dashboard-sidebar .team-nav-item.active').forEach(function (n) { n.classList.remove('active'); });
    if (node) node.classList.add('active');
  }
  function setActiveById(id) { setActive(el(id)); }
  function board() { return window.CoachDevBoard; }
  function isAdmin() { var b = board(); return !!(b && b.state && b.state.isAdmin); }
  function openBoard(tab) { var b = board(); if (!b) return; if (b.openTab) b.openTab(tab); else b.open(tab); }

  // The old team page (roster, War Room, schedule, logistics, post-game, parent tracking) for the team picked on the board.
  function openRoster() {
    var b = board(); var teamId = b && b.state ? b.state.teamId : null; var nav = null;
    document.querySelectorAll('#team-list .team-nav-item').forEach(function (n) { if (n.__teamId === teamId) nav = n; });
    if (!nav) nav = document.querySelector('#team-list .team-nav-item');
    if (window.CoachHome && window.CoachHome.state) { var hv = el('home-view'); if (hv) hv.style.display = 'none'; }
    var dv = el('devboard-view'); if (dv) dv.style.display = 'none';
    var rv = el('roster-view'); if (rv) rv.style.display = '';
    if (nav && typeof loadTeamRoster === 'function') loadTeamRoster(nav.__teamId || teamId, nav);
    var t = el('view-tabs'); if (t) t.style.display = '';
    setActiveById('nav-players');
  }

  // The old team page: a subtitle that says something (players and practice days) and the coach focus from the board on each row.
  function fixTeamPage() {
    var b = board(); var st = b && b.state ? b.state : null;
    var sub = document.querySelector('#coach-dashboard .dashboard-header .text-sub');
    var rows = document.querySelectorAll('#roster-table-container [onclick^="viewPlayerReport("]');
    if (sub && rows.length) sub.textContent = rows.length + ' active player' + (rows.length === 1 ? '' : 's') + (st && (st.shapeTitle || (st.shape && st.shape.title)) ? '. Practice ' + (st.shapeTitle || st.shape.title) + '.' : '.');
    rows.forEach(function (row) {
      var m = (row.getAttribute('onclick') || '').match(/viewPlayerReport\('([^']+)'\)/); if (!m) return;
      var p = row.querySelector('p'); if (!p || p.getAttribute('data-gs-focus')) return;
      var d = st && st.dev ? st.dev[m[1]] : null; var focus = d && d.focus;
      var dot = p.querySelector('span');
      p.setAttribute('data-gs-focus', '1');
      if (focus) { if (dot) dot.style.background = '#159a52'; p.lastChild.textContent = ' ' + focus; }
      else { if (dot) dot.style.background = '#c7c7cc'; p.lastChild.textContent = ' No coach focus yet. Set it on Players.'; }
    });
  }
  // In-screen row for the board: keep the section's tabs, hide the rest, add the chips.
  function shapeBoardTabs() {
    var row = document.querySelector('#devboard-view .db-tabs'); if (!row) return;
    var b = board(); var tab = b && b.state ? b.state.tab : 'players'; var sec = TAB_TO_SECTION[tab] || 'players'; section = sec;
    var def = SECTIONS[sec];
    row.querySelectorAll('button[data-tab]').forEach(function (btn) { btn.classList.toggle('gs-show', def.tabs.indexOf(btn.getAttribute('data-tab')) >= 0); });
    row.querySelectorAll('.gs-chip').forEach(function (c) { c.remove(); });
    def.chips.forEach(function (c) { var btn = document.createElement('button'); btn.type = 'button'; btn.className = 'gs-chip'; btn.id = c.id; btn.textContent = c.label; btn.onclick = function () { c.go(); }; row.appendChild(btn); });
    var map = { players: 'nav-players', practice: 'nav-practice', director: 'nav-director' }; setActiveById(map[sec]);
  }

  // Playbook chapters row, injected at the top of whichever chapter view is open.
  var CHAPTERS = [
    { key: 'playbook', label: 'Playbook', view: 'playbook-view', go: function () { if (window.CoachPlaybook) window.CoachPlaybook.open(); } },
    { key: 'develop', label: 'Player development', view: 'develop-view', go: function () { if (window.CoachDevelop) window.CoachDevelop.open(); } },
    { key: 'iq', label: 'Coaching IQ', view: 'iq-view', go: function () { if (window.CoachIQ) window.CoachIQ.open(); } },
    { key: 'academy', label: 'Coach Academy', coming: true },
    { key: 'reading', label: 'Reading list', coming: true }
  ];
  function chapterRow(activeKey) {
    var seg = document.createElement('div'); seg.className = 'gs-seg gs-chapters';
    CHAPTERS.forEach(function (c) {
      var btn = document.createElement('button'); btn.type = 'button'; btn.innerHTML = c.label + (c.coming ? ' <span class="nav-coming">Coming</span>' : '');
      btn.className = (c.key === activeKey ? 'active' : '') + (c.coming ? ' coming' : '');
      if (!c.coming) btn.onclick = function () { c.go(); setTimeout(function () { placeChapterRow(c.key); }, 60); };
      seg.appendChild(btn);
    });
    return seg;
  }
  function placeChapterRow(activeKey) {
    var ch = CHAPTERS.filter(function (c) { return c.key === activeKey; })[0]; var v = ch && el(ch.view); if (!v) return;
    document.querySelectorAll('.gs-chapters').forEach(function (n) { n.remove(); });
    v.insertBefore(chapterRow(activeKey), v.firstChild);
    setActiveById('nav-playbook');
  }
  function watchChapters() {
    CHAPTERS.forEach(function (c) {
      if (!c.view) return;
      var tries = 0; var t = setInterval(function () {
        var v = el(c.view); if (!v) { if (++tries > 120) clearInterval(t); return; } clearInterval(t);
        new MutationObserver(function () { if (v.style.display !== 'none' && !v.querySelector('.gs-chapters')) placeChapterRow(c.key); }).observe(v, { attributes: true, attributeFilter: ['style'] });
      }, 500);
    });
  }

  function ready() {
    return el('home-nav-item') && el('develop-nav-item') && el('devboard-nav-item') && el('trainlog-nav-item') && el('playbook-nav-item') && el('iq-nav-item') && el('academy-nav') && el('team-list');
  }
  function build() {
    if (el('gs-nav-main')) return;
    var side = document.querySelector('#coach-dashboard .dashboard-sidebar'); if (!side) return;
    var main = document.createElement('div'); main.className = 'gs-nav-main'; main.id = 'gs-nav-main';
    var home = el('home-nav-item'); var homeWrap = home.parentNode;
    main.appendChild(home);
    main.appendChild(item('nav-players', 'Players', ICONS.players, function () { openBoard('players'); }));
    main.appendChild(item('nav-practice', 'Practice', ICONS.practice, function () { openBoard('plan'); }));
    main.appendChild(item('nav-playbook', 'Playbook', ICONS.playbook, function () { if (window.CoachPlaybook) window.CoachPlaybook.open(); setTimeout(function () { placeChapterRow('playbook'); }, 60); }));
    if (isAdmin()) main.appendChild(item('nav-director', 'Director', ICONS.director, function () { openBoard('activity'); }));
    // Everything the modules mounted goes into a hidden holder; they keep working, the coach never sees them.
    var hidden = document.createElement('div'); hidden.id = 'gs-nav-hidden';
    [].slice.call(side.children).forEach(function (n) { if (n !== main) hidden.appendChild(n); });
    if (homeWrap && homeWrap.parentNode === hidden && !homeWrap.children.length) homeWrap.remove();
    side.insertBefore(main, side.firstChild); side.appendChild(hidden);

    var b = board();
    if (b && b.state) {
      var origOpen = b.open;
      b.open = function () { var r = origOpen.apply(this, arguments); setTimeout(shapeBoardTabs, 0); return r; };
      var dv = el('devboard-view');
      var hook = function () { if (dv) new MutationObserver(function () { if (dv.style.display !== 'none') shapeBoardTabs(); }).observe(dv, { childList: true, attributes: true, attributeFilter: ['style'] }); };
      if (dv) hook(); else { var tries = 0; var t = setInterval(function () { dv = el('devboard-view'); if (dv) { clearInterval(t); hook(); } else if (++tries > 120) clearInterval(t); }, 500); }
      setInterval(function () { var d2 = el('devboard-view'); if (d2 && d2.style.display !== 'none' && d2.querySelector('.db-tabs') && !d2.querySelector('.db-tabs .gs-show')) shapeBoardTabs(); }, 700);
      setInterval(function () {
        var n = el('nav-director'); if (!n) return;
        var c = b.newActivityCount ? b.newActivityCount() : 0; var dot = n.querySelector('.gs-dot');
        if (c && !dot && b.state.tab !== 'activity') { dot = document.createElement('span'); dot.className = 'gs-dot'; dot.title = c + ' new'; n.appendChild(dot); }
        else if ((!c || b.state.tab === 'activity') && dot) dot.remove();
      }, 4000);
    }
    // Team page and Home: light the right item when they are opened by other code.
    var origSwitch = window.switchTeamView;
    if (typeof origSwitch === 'function' && !origSwitch.__gsNav) { var w = function () { setActiveById('nav-players'); var r = origSwitch.apply(this, arguments); setTimeout(fixTeamPage, 50); return r; }; w.__gsNav = true; window.switchTeamView = w; }
    if (typeof window.loadTeamRoster === 'function' && !window.loadTeamRoster.__gsNav) { var lr = window.loadTeamRoster; var w2 = function () { var r = lr.apply(this, arguments); setActiveById('nav-players'); setTimeout(fixTeamPage, 50); return r; }; w2.__gsNav = true; window.loadTeamRoster = w2; }
    if (window.CoachTrainingLog && window.CoachTrainingLog.open && !window.CoachTrainingLog.open.__gsNav) { var to = window.CoachTrainingLog.open; var w3 = function () { var r = to.apply(this, arguments); setActiveById('nav-practice'); return r; }; w3.__gsNav = true; window.CoachTrainingLog.open = w3; }
    watchChapters();
    if (window.CoachPortalShell && window.CoachPortalShell.refresh) { try { window.CoachPortalShell.refresh(); } catch (e) { /* optional */ } }
  }

  document.addEventListener('DOMContentLoaded', function () {
    injectCss();
    var tries = 0;
    var timer = setInterval(function () {
      var d = el('coach-dashboard'); if (!d || !d.style.display || d.style.display === 'none') return;
      if (!ready()) { if (++tries > 40) clearInterval(timer); return; }
      var b = board(); clearInterval(timer);
      (b && b.ensureConfig ? b.ensureConfig() : Promise.resolve()).then(build, build);
    }, 500);
    window.CoachNav = { build: build, setActive: setActive, openRoster: openRoster, section: function () { return section; } };
  });
})();
