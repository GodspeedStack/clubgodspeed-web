/**
 * season-header.js — every season name in the portal comes from one place.
 *
 * "AAU Season Dues" was hardcoded in five spots. Parents saw the right amount
 * under a heading that named no season, and it would have kept saying AAU
 * straight through the Winter turnover on December 1.
 *
 * Now any element carrying .js-season-label is filled from get_current_season(),
 * which resolves the season from today's date against season_dues_config. Add
 * data-season-format="short" for tight spots like the sidebar.
 *
 * Fails safe: if the call errors, whatever is already in the markup is left
 * alone. A stale heading beats an empty one.
 */
(function () {
'use strict';

var CACHE = null;

function client() {
  var sb = null;
  try {
    if (window.auth && typeof window.auth.getSupabaseClient === 'function') {
      sb = window.auth.getSupabaseClient();
    }
  } catch (e) { sb = null; }
  if (!sb) sb = window.supabaseClient || null;
  return (sb && typeof sb.rpc === 'function') ? sb : null;
}

function waitForClient(tries) {
  var sb = client();
  if (sb) return Promise.resolve(sb);
  if (tries <= 0) return Promise.resolve(null);
  return new Promise(function (r) { setTimeout(r, 300); })
    .then(function () { return waitForClient(tries - 1); });
}

/** "Fall 2026 Season Dues" -> "Fall 2026 Dues" for narrow furniture. */
function shortLabel(info) {
  if (info.season) return info.season + ' Dues';
  return (info.display_label || '').replace(/\s*Season\s+Dues\s*$/i, ' Dues').trim();
}

function paint(info) {
  var nodes = document.querySelectorAll('.js-season-label');
  for (var i = 0; i < nodes.length; i++) {
    var el = nodes[i];
    var txt = el.getAttribute('data-season-format') === 'short'
      ? shortLabel(info)
      : (info.display_label || '');
    if (txt) el.textContent = txt;
  }
}

async function load() {
  if (CACHE) { paint(CACHE); return CACHE; }

  var sb = await waitForClient(20);
  if (!sb) return null;

  var info = null;
  try {
    var res = await sb.rpc('get_current_season');
    if (res && res.error) throw res.error;
    info = res && res.data;
  } catch (e) {
    // Leave the markup as-is. Never blank a heading because a call failed.
    console.warn('[season] could not resolve the current season:', e);
    return null;
  }

  if (!info || info.ok === false) {
    console.warn('[season] no season resolved:', info && info.attention);
    return null;
  }

  // These are for whoever is reading the console, not for parents.
  if (info.needs_attention) console.warn('[season] ' + info.attention);
  if (info.league_status_unreliable) {
    console.warn('[season] every team_tournament_schedule row reads cancelled; '
      + 'league data is not corroborating the season.');
  }

  CACHE = info;
  // Non-DOM consumers (the Venmo checkout label) read this.
  window.__seasonLabel = info.display_label || null;
  paint(info);
  return info;
}

window.getCurrentSeason = load;

document.addEventListener('DOMContentLoaded', function () { load(); });
// Panels render late in this portal; repaint once things have settled.
setTimeout(function () { if (CACHE) paint(CACHE); }, 1500);
})();
