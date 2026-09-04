/**
 * GODSPEED BASKETBALL. Coach Portal shell.
 *
 * Owns the app chrome once a coach is inside: toggles body.gs-portal-app when
 * #coach-dashboard is shown (so the marketing navbar and store bottom nav go
 * away), mounts a slim top bar (brand, signed-in user, back to site, sign out),
 * and turns the sidebar into a drawer on small screens.
 *
 * Contract:
 *   No network. Reads only localStorage keys coach-portal.js already writes
 *   (gba_user_email, gba_user_role). Sign out calls the existing logoutCoach().
 *   Idempotent: mounting twice is a no-op. No emojis. No em dashes in copy.
 */
(function () {
  'use strict';

  function el(id) { return document.getElementById(id); }

  function initials(email) {
    if (!email) return 'GS';
    var name = String(email).split('@')[0].replace(/[._-]+/g, ' ').trim();
    var parts = name.split(' ').filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).slice(0, 2);
    return name.slice(0, 2) || 'GS';
  }

  function roleLabel(role) {
    if (role === 'director') return 'Director';
    if (role === 'coach') return 'Coach';
    return '';
  }

  function mountBar(dash) {
    if (el('gs-portal-bar')) return;
    var bar = document.createElement('header');
    bar.className = 'gs-portal-bar';
    bar.id = 'gs-portal-bar';
    bar.setAttribute('role', 'banner');

    var menu = document.createElement('button');
    menu.type = 'button';
    menu.className = 'gs-menu-btn';
    menu.setAttribute('aria-label', 'Open menu');
    menu.setAttribute('aria-expanded', 'false');
    menu.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg>';
    menu.addEventListener('click', toggleDrawer);

    var brand = document.createElement('a');
    brand.className = 'gs-brand';
    brand.href = 'coach-portal.html';
    brand.innerHTML = 'GODSPEED<b>BASKETBALL</b><span class="gs-brand-sep" aria-hidden="true"></span><span class="gs-brand-app">Coach Portal</span>';

    var spacer = document.createElement('div');
    spacer.className = 'gs-spacer';

    var user = document.createElement('div');
    user.className = 'gs-user';
    var email = '';
    var role = '';
    try { email = localStorage.getItem('gba_user_email') || ''; role = localStorage.getItem('gba_user_role') || ''; } catch (e) { /* optional */ }
    var av = document.createElement('i');
    av.className = 'gs-avatar';
    av.textContent = initials(email);
    user.appendChild(av);
    if (email) { var s = document.createElement('span'); s.textContent = email; s.title = email; user.appendChild(s); }
    var rl = roleLabel(role);
    if (rl) { var r = document.createElement('em'); r.className = 'gs-role'; r.style.fontStyle = 'normal'; r.textContent = rl; user.appendChild(r); }

    var site = document.createElement('a');
    site.className = 'gs-link';
    site.href = 'index.html';
    site.textContent = 'Back to site';

    var out = document.createElement('button');
    out.type = 'button';
    out.className = 'gs-signout';
    out.textContent = 'Sign out';
    out.addEventListener('click', function () {
      closeDrawer();
      if (typeof window.logoutCoach === 'function') window.logoutCoach();
    });

    bar.appendChild(menu); bar.appendChild(brand); bar.appendChild(spacer);
    bar.appendChild(user); bar.appendChild(site); bar.appendChild(out);
    dash.insertBefore(bar, dash.firstChild);

    var overlay = document.createElement('div');
    overlay.className = 'gs-drawer-overlay';
    overlay.addEventListener('click', closeDrawer);
    dash.appendChild(overlay);

    // Picking anything in the sidebar closes the drawer on small screens.
    var side = dash.querySelector('.dashboard-sidebar');
    if (side) side.addEventListener('click', function (e) {
      if (window.innerWidth <= 960 && e.target.closest('.team-nav-item, button')) closeDrawer();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDrawer(); });
  }

  function toggleDrawer() {
    var open = document.body.classList.toggle('gs-drawer-open');
    var b = document.querySelector('.gs-menu-btn');
    if (b) { b.setAttribute('aria-expanded', open ? 'true' : 'false'); b.setAttribute('aria-label', open ? 'Close menu' : 'Open menu'); }
  }
  function closeDrawer() {
    document.body.classList.remove('gs-drawer-open');
    var b = document.querySelector('.gs-menu-btn');
    if (b) { b.setAttribute('aria-expanded', 'false'); b.setAttribute('aria-label', 'Open menu'); }
  }

  // Replace the plain "Select a team" text with a designed empty state, once.
  function dressEmptyState() {
    var box = el('roster-table-container');
    if (!box || box.querySelector('table') || box.querySelector('.gs-empty')) return;
    if (!/select a team/i.test(box.textContent || '')) return;
    box.innerHTML = '<div class="gs-empty">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>' +
      '<div class="gs-empty-title">Pick a team</div>' +
      '<div class="gs-empty-sub">Choose a team in the sidebar to see its roster, War Room, schedule and parent tracking.</div>' +
      '</div>';
  }

  // Sidebar: say so when no team is assigned, instead of an empty heading.
  function dressTeamList() {
    var list = el('team-list');
    if (!list) return;
    var hasTeams = list.querySelector('.team-nav-item');
    var ph = list.querySelector('.gs-team-empty');
    if (!hasTeams && !ph) { ph = document.createElement('div'); ph.className = 'gs-team-empty'; ph.textContent = 'No teams assigned yet'; list.appendChild(ph); }
    if (hasTeams && ph) ph.remove();
  }

  function isShown(dash) {
    return dash && dash.style.display && dash.style.display !== 'none';
  }

  function sync() {
    var dash = el('coach-dashboard');
    var on = isShown(dash);
    document.body.classList.toggle('gs-portal-app', !!on);
    if (on) { mountBar(dash); dressEmptyState(); dressTeamList(); } else { closeDrawer(); }
  }

  document.addEventListener('DOMContentLoaded', function () {
    var dash = el('coach-dashboard');
    if (!dash) return;
    sync();
    // enterPortal / logoutCoach flip the inline display; watch that attribute only.
    var mo = new MutationObserver(sync);
    mo.observe(dash, { attributes: true, attributeFilter: ['style'] });
    var list = el('team-list');
    if (list) new MutationObserver(dressTeamList).observe(list, { childList: true });
    window.addEventListener('resize', function () { if (window.innerWidth > 960) closeDrawer(); });
    window.CoachPortalShell = { sync: sync, closeDrawer: closeDrawer };
  });
})();
