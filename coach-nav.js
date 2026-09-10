/* coach-nav.js
 * One owner for the coach portal sidebar. Loaded last.
 *
 * Contract
 *   Waits for every module to mount its own item (Home, Player development, Development board,
 *   Training log, Playbook, Coaching IQ, Coach Academy), then regroups the sidebar by use:
 *     HOME
 *     MY TEAMS          (unchanged, rendered by the portal)
 *     EVERY PRACTICE    Players, Practice plan, Training log, Team needs, The Bank
 *     PLAYBOOK          5th Grade Playbook, Player development, Coaching IQ, Coach Academy (coming), Reading list (coming)
 *     DIRECTOR          Activity, Import CSV, Download Data   (coaches see TEAM ACTIONS with the last two)
 *   The board's own tab row is hidden; its five screens are sidebar items that call CoachDevBoard.openTab(tab).
 *   The old "Development board" item stays in the DOM, hidden, so every module that looks for it keeps working.
 *   Nothing here talks to the database.
 */
(function () {
  'use strict';
  var el = function (id) { return document.getElementById(id); };
  var ICON = function (paths) { return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:.7;flex:0 0 18px" aria-hidden="true">' + paths + '</svg>'; };
  var ICONS = {
    players: ICON('<circle cx="9" cy="8" r="4"/><path d="M2 21v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2"/><circle cx="17" cy="9" r="3"/><path d="M22 21v-2a4 4 0 0 0-3-3.9"/>'),
    plan: ICON('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 3v2h6V3"/><path d="M8 11h8M8 15h5"/>'),
    team: ICON('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
    bank: ICON('<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/>'),
    activity: ICON('<path d="M22 12h-4l-3 8-6-16-3 8H2"/>'),
    iq: ICON('<path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/>'),
    book: ICON('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>')
  };
  var CSS = '#devboard-view .db-tabs{display:none}\
#coach-dashboard .dashboard-sidebar .gs-nav-group{margin-bottom:22px}\
#coach-dashboard .dashboard-sidebar .gs-nav-group .team-nav-item{display:flex;align-items:center;gap:12px}\
#coach-dashboard .dashboard-sidebar .gs-nav-group .team-nav-item.is-sub{padding-left:12px;font-size:inherit}\
#coach-dashboard .dashboard-sidebar .gs-nav-group .team-nav-item .gs-dot{width:8px;height:8px;border-radius:50%;background:#d92d20;margin-left:auto;flex:0 0 8px}\
#coach-dashboard .dashboard-sidebar #devboard-nav-item{display:none!important}\
#coach-dashboard .dashboard-sidebar .gs-nav-group .nav-coming{margin-left:auto;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#6E6E73;background:#E9E9EB;border-radius:999px;padding:3px 8px;line-height:1}';

  function injectCss() { if (el('coach-nav-css')) return; var s = document.createElement('style'); s.id = 'coach-nav-css'; s.textContent = CSS; document.head.appendChild(s); }
  function group(title, id) {
    var g = document.createElement('div'); g.className = 'gs-nav-group'; g.id = id;
    var t = document.createElement('div'); t.className = 'sidebar-title'; t.textContent = title; g.appendChild(t);
    return g;
  }
  function item(id, label, icon, onOpen) {
    var a = document.createElement('div');
    a.className = 'team-nav-item'; a.id = id; a.setAttribute('role', 'button'); a.tabIndex = 0;
    a.innerHTML = icon + '<span>' + label + '</span>';
    var go = function () { onOpen(); setActive(a); };
    a.onclick = go; a.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } };
    return a;
  }
  function setActive(node) {
    document.querySelectorAll('#coach-dashboard .dashboard-sidebar .team-nav-item.active').forEach(function (n) { n.classList.remove('active'); });
    node.classList.add('active');
  }
  function boardItem(id, label, icon, tab) {
    return item(id, label, icon, function () { var b = window.CoachDevBoard; if (!b) return; if (b.openTab) b.openTab(tab); else b.open(tab); });
  }
  function isAdmin() { var b = window.CoachDevBoard; return !!(b && b.state && b.state.isAdmin); }

  // Every module's item must exist before we move it; poll until they do (they mount on their own timers).
  function ready() {
    return el('home-nav-item') && el('develop-nav-item') && el('devboard-nav-item') && el('trainlog-nav-item') && el('playbook-nav-item') && el('iq-nav-item') && el('academy-nav');
  }
  function build() {
    if (el('gs-nav-practice')) return;
    var side = document.querySelector('#coach-dashboard .dashboard-sidebar'); if (!side) return;
    var academy = el('academy-nav');
    // Titles the portal shipped with: keep "My Teams", replace the other two.
    var titles = [].slice.call(side.querySelectorAll(':scope > .sidebar-title'));
    var learning = titles.filter(function (t) { return /learning/i.test(t.textContent); })[0];
    var actions = titles.filter(function (t) { return /actions/i.test(t.textContent); })[0];
    var actionsBox = actions ? actions.nextElementSibling : null;

    var practice = group('Every practice', 'gs-nav-practice');
    practice.appendChild(boardItem('nav-board-players', 'Players', ICONS.players, 'players'));
    practice.appendChild(boardItem('nav-board-plan', 'Practice plan', ICONS.plan, 'plan'));
    practice.appendChild(el('trainlog-nav-item'));
    practice.appendChild(boardItem('nav-board-team', 'Team needs', ICONS.team, 'team'));
    practice.appendChild(boardItem('nav-board-bank', 'The Bank', ICONS.bank, 'bank'));

    var playbook = group('Playbook', 'gs-nav-playbook');
    playbook.appendChild(el('playbook-nav-item'));
    playbook.appendChild(el('develop-nav-item'));
    var iq = el('iq-nav-item'); if (!iq.querySelector('svg')) iq.insertAdjacentHTML('afterbegin', ICONS.iq); playbook.appendChild(iq);
    [].slice.call(academy.querySelectorAll('.team-nav-item.is-coming')).forEach(function (n) { n.classList.remove('is-sub'); n.style.opacity = '.55'; if (!n.querySelector('svg')) n.insertAdjacentHTML('afterbegin', ICONS.book); playbook.appendChild(n); });
    // Coach Academy lost its icon when it was tagged Coming; the Reading list never had one. Give the two a plain row.
    playbook.appendChild(el('devboard-nav-item')); // hidden by CSS, kept for the modules that look it up

    var admin = isAdmin();
    var director = group(admin ? 'Director' : 'Team actions', 'gs-nav-director');
    if (admin) director.appendChild(boardItem('nav-board-activity', 'Activity', ICONS.activity, 'activity'));
    if (actionsBox) [].slice.call(actionsBox.querySelectorAll('.team-nav-item')).forEach(function (n) { director.appendChild(n); });

    // Swap the old blocks for the new groups, in order, where My Learning used to sit.
    var anchor = learning || academy;
    side.insertBefore(practice, anchor); side.insertBefore(playbook, anchor); side.insertBefore(director, anchor);
    if (learning) learning.remove(); academy.style.display = 'none';
    if (actions) actions.remove(); if (actionsBox) actionsBox.remove();

    // The board's own tab clicks (kept for keyboard users of the old layout) and Home cards should light the right item.
    var b = window.CoachDevBoard;
    if (b && b.state) {
      var origOpen = b.open;
      var sync = function () { var map = { players: 'nav-board-players', plan: 'nav-board-plan', team: 'nav-board-team', bank: 'nav-board-bank', activity: 'nav-board-activity' }; var n = el(map[b.state.tab]); if (n && el('devboard-view') && el('devboard-view').style.display !== 'none') setActive(n); };
      b.open = function (tab) { var r = origOpen.apply(this, arguments); setTimeout(sync, 0); return r; };
      setInterval(function () {
        var n = el('nav-board-activity'); if (!n) return;
        var c = b.newActivityCount ? b.newActivityCount() : 0; var dot = n.querySelector('.gs-dot');
        if (c && !dot && b.state.tab !== 'activity') { dot = document.createElement('span'); dot.className = 'gs-dot'; dot.title = c + ' new'; n.appendChild(dot); }
        else if ((!c || b.state.tab === 'activity') && dot) dot.remove();
      }, 4000);
    }
    if (window.CoachPortalShell && window.CoachPortalShell.refresh) { try { window.CoachPortalShell.refresh(); } catch (e) { /* optional */ } }
  }

  document.addEventListener('DOMContentLoaded', function () {
    injectCss();
    var tries = 0;
    var timer = setInterval(function () {
      var d = el('coach-dashboard'); if (!d || !d.style.display || d.style.display === 'none') return;
      if (!ready()) { if (++tries > 40) clearInterval(timer); return; }
      // Admin flag needs the board config; ask once, then build.
      var b = window.CoachDevBoard;
      clearInterval(timer);
      (b && b.ensureConfig ? b.ensureConfig() : Promise.resolve()).then(build, build);
    }, 500);
    window.CoachNav = { build: build, setActive: setActive };
  });
})();
