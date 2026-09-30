/**
 * GODSPEED BASKETBALL. "Training notes from coach" notice, Parent Portal.
 *
 * When the coach shares a development read, the parent should know on login
 * rather than having to go looking. This puts a dot on the Performance nav item
 * and a one line banner on the landing view. Both clear once the parent opens
 * Performance, remembered per athlete on that device.
 *
 * Contract: read-only against player_development_shares (RLS already limits a
 * parent to his own athlete). Renders nothing when there is no share, or when
 * the newest share has already been seen. No emojis. No em dashes.
 */
(function () {
  'use strict';

  var BANNER_ID = 'dev-note-banner';
  var DOT_ID = 'dev-note-dot';
  var KEY_PREFIX = 'gba_dev_share_seen_';

  function el(id) { return document.getElementById(id); }

  function client() {
    try {
      return window.auth && typeof window.auth.getSupabaseClient === 'function'
        ? window.auth.getSupabaseClient()
        : (window.supabaseClient || null);
    } catch (e) { return null; }
  }

  // localStorage can throw in private mode or with site data blocked.
  function readSeen(athleteId) {
    try { return window.localStorage.getItem(KEY_PREFIX + athleteId) || ''; }
    catch (e) { return ''; }
  }
  function writeSeen(athleteId, iso) {
    try { window.localStorage.setItem(KEY_PREFIX + athleteId, iso); }
    catch (e) { /* the notice simply reappears next visit */ }
  }

  async function resolveAthleteId(c) {
    try {
      var stored = window.localStorage.getItem('gba_current_athlete');
      if (stored) return stored;
    } catch (e) { /* fall through to the link lookup */ }
    try {
      var sess = await c.auth.getSession();
      var uid = sess && sess.data && sess.data.session && sess.data.session.user.id;
      if (!uid) return null;
      var r = await c.from('parent_player_links')
        .select('athlete_id')
        .eq('profile_id', uid)
        .order('is_primary', { ascending: false })
        .limit(1)
        .maybeSingle();
      return (r.data && r.data.athlete_id) || null;
    } catch (e) { return null; }
  }

  function performanceNavItem() {
    var items = document.querySelectorAll('.nav-item');
    for (var i = 0; i < items.length; i++) {
      var on = items[i].getAttribute('onclick') || '';
      if (on.indexOf("'performance'") !== -1) return items[i];
    }
    return null;
  }

  function showDot() {
    var nav = performanceNavItem();
    if (!nav || el(DOT_ID)) return;
    var dot = document.createElement('span');
    dot.id = DOT_ID;
    dot.setAttribute('aria-label', 'New training notes');
    dot.style.cssText = 'display:inline-block;width:8px;height:8px;border-radius:50%;' +
      'background:#FF5722;margin-left:auto;flex-shrink:0;';
    nav.appendChild(dot);
  }

  function showBanner(sharedAtIso) {
    var host = el('view-documents');
    if (!host || el(BANNER_ID)) return;
    var when = '';
    try {
      var d = new Date(sharedAtIso);
      if (!isNaN(d)) when = d.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
    } catch (e) { /* the date is optional */ }

    var wrap = document.createElement('div');
    wrap.id = BANNER_ID;
    wrap.style.cssText = 'background:#1A3A8F;border-radius:14px;padding:16px 18px;margin-bottom:16px;' +
      "font-family:'Inter',-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;" +
      'display:flex;align-items:center;gap:14px;flex-wrap:wrap;';

    var text = document.createElement('div');
    text.style.cssText = 'flex:1 1 220px;min-width:0;';
    var label = document.createElement('div');
    label.textContent = 'TRAINING NOTES FROM COACH';
    label.style.cssText = 'font-size:11px;font-weight:700;letter-spacing:.12em;color:#FF5722;margin-bottom:5px;';
    var body = document.createElement('div');
    body.textContent = when
      ? 'Your coach shared a development read on ' + when + '.'
      : 'Your coach shared a development read.';
    body.style.cssText = 'font-size:14.5px;line-height:1.45;color:#ffffff;';
    text.appendChild(label);
    text.appendChild(body);

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Read the notes';
    btn.style.cssText = 'background:#ffffff;color:#1A3A8F;border:none;border-radius:99px;' +
      'padding:10px 20px;font-size:13.5px;font-weight:700;cursor:pointer;font-family:inherit;flex:0 0 auto;';
    btn.onclick = function () {
      var nav = performanceNavItem();
      if (typeof window.switchPortalView === 'function') window.switchPortalView('performance', nav);
      else if (nav) nav.click();
    };

    wrap.appendChild(text);
    wrap.appendChild(btn);
    host.insertBefore(wrap, host.firstChild);
  }

  function clearNotice() {
    var b = el(BANNER_ID); if (b && b.parentNode) b.parentNode.removeChild(b);
    var d = el(DOT_ID); if (d && d.parentNode) d.parentNode.removeChild(d);
  }

  var state = { athleteId: null, sharedAt: null, armed: false };

  function markSeen() {
    if (!state.armed || !state.athleteId || !state.sharedAt) return;
    writeSeen(state.athleteId, state.sharedAt);
    state.armed = false;
    clearNotice();
  }

  async function check() {
    var c = client();
    if (!c) return;
    var athleteId = await resolveAthleteId(c);
    if (!athleteId) return;

    var r;
    try {
      r = await c.from('player_development_shares')
        .select('shared_at')
        .eq('athlete_id', athleteId)
        .order('shared_at', { ascending: false })
        .limit(1);
    } catch (e) { return; }
    if (!r || r.error || !r.data || !r.data.length) return;

    var sharedAt = r.data[0].shared_at;
    if (readSeen(athleteId) === sharedAt) return;

    state.athleteId = athleteId;
    state.sharedAt = sharedAt;
    state.armed = true;
    showDot();
    showBanner(sharedAt);
  }

  function performanceVisible() {
    var v = el('view-performance');
    return !!v && v.style.display !== 'none';
  }

  document.addEventListener('DOMContentLoaded', function () {
    // Clear the notice the moment the parent actually opens Performance.
    var orig = window.switchPortalView;
    if (typeof orig === 'function' && !orig.__dnWrapped) {
      var wrapped = function (name) {
        var out = orig.apply(this, arguments);
        if (name === 'performance') markSeen();
        return out;
      };
      wrapped.__dnWrapped = true;
      window.switchPortalView = wrapped;
    }
    var v = el('view-performance');
    if (v && window.MutationObserver) {
      new MutationObserver(function () { if (performanceVisible()) markSeen(); })
        .observe(v, { attributes: true, attributeFilter: ['style'] });
    }
    setTimeout(function () { check().catch(function () { /* the notice is best effort */ }); }, 1500);
  });
})();
