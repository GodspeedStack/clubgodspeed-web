/**
 * gear-price-sheet.js — the parent portal's "Team Gear & Uniforms" price sheet.
 *
 * WHY THIS FILE EXISTS
 * The gear card used to be a hand-written HTML form: hardcoded prices, size
 * dropdowns, quantity boxes and a "Confirm Order Request" button. None of the
 * inputs were ever read — submitGearOrder() just redirects to order-uniform.html,
 * which is the real checkout. So the card's only actual function was quoting a
 * price, and because the price was typed into the HTML it drifted away from
 * uniform_config, the row the checkout charges from. A family could be billed
 * one number and shown another.
 *
 * So this card is now a READ-ONLY price sheet rendered from uniform_config.
 * There are no prices in the markup and none in this file. If a figure here is
 * wrong, the row is wrong, and fixing the row fixes the portal, the checkout
 * and the invoice at the same time. That is the whole point.
 *
 * Dependencies: window.auth (auth-supabase.js). Degrades to a plain link to the
 * checkout if the client, the config row or the network is unavailable — it never
 * invents a number and never shows a stale one.
 */
(function () {
'use strict';

var SELECTED_ATHLETE_KEY = 'gba_selected_athlete_id';
var MOUNT_ID = 'gear-price-sheet';
var rendered = false;

function client() {
  var sb = null;
  try {
    if (window.auth && typeof window.auth.getSupabaseClient === 'function') {
      sb = window.auth.getSupabaseClient();
    }
  } catch (e) { sb = null; }
  if (!sb) sb = window.supabaseClient || null;
  return (sb && typeof sb.from === 'function') ? sb : null;
}

function waitForClient(tries) {
  var sb = client();
  if (sb) return Promise.resolve(sb);
  if (tries <= 0) return Promise.resolve(null);
  return new Promise(function (r) { setTimeout(r, 300); })
    .then(function () { return waitForClient(tries - 1); });
}

function money(n) {
  var v = Number(n);
  if (!isFinite(v)) return null;
  return '$' + v.toFixed(2);
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
  });
}

/** The athlete whose gear this is. Mirrors billing-view.js so the two tabs agree. */
function selectedAthleteId(sb, userId) {
  return sb.from('parent_player_links')
    .select('athlete_id, created_at')
    .eq('profile_id', userId)
    .order('created_at', { ascending: true })
    .then(function (res) {
      var rows = (res && res.data) || [];
      var ids = rows.map(function (r) { return r && r.athlete_id; }).filter(Boolean);
      if (!ids.length) return null;
      var saved = null;
      try { saved = localStorage.getItem(SELECTED_ATHLETE_KEY); } catch (e) { saved = null; }
      return ids.indexOf(saved) >= 0 ? saved : ids[0];
    })
    .catch(function () { return null; });
}

/**
 * The billed kit, in the order a parent reads it. Quantities are explicit because
 * "2 jerseys" is the single thing the old banner got wrong -- it said one jersey
 * and two shorts, which was backwards.
 *
 * No home/away labels. uniform_config does not record which colour is worn at
 * home, and team_gear's own usage column disagrees with basketball convention
 * (it has Black as home, White as away). A price sheet does not need the answer,
 * so it does not guess at one.
 */
function kitLines(cfg) {
  return [
    { label: 'Game Jerseys (White + Black)', detail: 'Stitched, with your player’s number', qty: 2, unit: cfg.jersey_price,   required: true },
    { label: 'Game Shorts (Blue)',           detail: 'Performance knit',                        qty: 1, unit: cfg.shorts_price,   required: true },
    { label: 'Practice Penny',               detail: 'Worn at every practice',                  qty: 1, unit: cfg.penny_price,    required: true },
    { label: 'Team Backpack',                detail: 'Embroidered name, ball compartment',      qty: 1, unit: cfg.backpack_price, required: false }
  ];
}

function lineRow(item, isLast) {
  var unit = money(item.unit);
  var badge = item.required
    ? '<span style="font-size:0.68rem;background:#1A3A8F;padding:3px 7px;border-radius:4px;color:#fff;font-weight:700;letter-spacing:0.04em;margin-left:8px;vertical-align:1px;">REQUIRED</span>'
    : '<span style="font-size:0.68rem;background:#f0f0f2;padding:3px 7px;border-radius:4px;color:#6e6e73;font-weight:600;letter-spacing:0.04em;margin-left:8px;vertical-align:1px;">OPTIONAL</span>';

  // A missing price is shown as a missing price. Never as a zero, never as a guess.
  var right = unit
    ? (item.qty > 1
        ? '<div style="font-weight:700;color:#1d1d1f;">' + money(item.unit * item.qty) + '</div>'
          + '<div style="font-size:0.78rem;color:#86868b;margin-top:2px;">' + item.qty + ' × ' + unit + '</div>'
        : '<div style="font-weight:700;color:#1d1d1f;">' + unit + '</div>')
    : '<div style="font-size:0.82rem;color:#86868b;">See your invoice</div>';

  return ''
    + '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:14px 0;'
    + (isLast ? '' : 'border-bottom:1px solid #f0f0f2;') + '">'
    +   '<div style="min-width:0;">'
    +     '<div style="font-weight:600;color:#1d1d1f;">' + esc(item.label) + badge + '</div>'
    +     '<div style="font-size:0.82rem;color:#86868b;margin-top:3px;">' + esc(item.detail) + '</div>'
    +   '</div>'
    +   '<div style="text-align:right;flex-shrink:0;font-size:0.95rem;">' + right + '</div>'
    + '</div>';
}

function ctaBlock(headline, sub) {
  return ''
    + '<a href="order-uniform.html" style="display:flex;align-items:center;justify-content:space-between;gap:16px;text-decoration:none;'
    + 'background:linear-gradient(135deg,#1A3A8F,#14306f);border-radius:14px;padding:22px 24px;margin-bottom:24px;'
    + 'box-shadow:0 4px 16px rgba(26,58,143,.18);">'
    +   '<div>'
    +     '<div style="color:#fff;font-family:\'Inter\',sans-serif;font-weight:800;font-size:1.05rem;letter-spacing:-0.01em;">' + esc(headline) + '</div>'
    +     '<div style="color:#c7d3f2;font-size:0.85rem;margin-top:4px;line-height:1.45;">' + esc(sub) + '</div>'
    +   '</div>'
    +   '<span style="flex-shrink:0;background:#FF5722;color:#fff;font-family:\'Inter\',sans-serif;font-weight:800;font-size:0.82rem;'
    + 'text-transform:uppercase;letter-spacing:0.06em;padding:12px 22px;border-radius:10px;">Start order</span>'
    + '</a>';
}

/** Checkout-only fallback. Shown whenever a real price cannot be read. */
function fallbackHTML() {
  return ctaBlock(
    'Order your player’s uniform',
    'Pick an available number and sizes, then check out. Current pricing is shown at checkout.'
  );
}

function render(cfg, needsUniform) {
  var lines = kitLines(cfg);
  var required = lines.filter(function (l) { return l.required; });

  var haveAll = required.every(function (l) { return isFinite(Number(l.unit)); });
  var requiredTotal = haveAll
    ? required.reduce(function (s, l) { return s + Number(l.unit) * l.qty; }, 0)
    : null;

  var html = '';

  if (needsUniform === false) {
    html += '<div style="background:#fff;border-radius:12px;padding:20px 24px;margin-bottom:24px;'
          + 'box-shadow:0 2px 10px rgba(0,0,0,0.05);border-left:4px solid #34c759;">'
          + '<div style="font-weight:700;color:#1d1d1f;">Your player already has a uniform</div>'
          + '<div style="font-size:0.86rem;color:#6e6e73;margin-top:4px;line-height:1.45;">'
          + 'Returning players keep their current set, so there is nothing to order and nothing to pay here. '
          + 'The prices below are for reference only.</div></div>';
  } else {
    html += ctaBlock(
      'Order your player’s uniform',
      requiredTotal
        ? 'New players: the required set is ' + money(requiredTotal) + ', billed once. Pick an available number and sizes, then check out.'
        : 'New players: pick an available number and sizes, then check out.'
    );
  }

  html += '<div style="background:#fff;border-radius:12px;padding:24px;box-shadow:0 2px 10px rgba(0,0,0,0.05);margin-bottom:24px;">'
       +    '<h3 style="margin:0 0 6px;font-size:1.05rem;font-weight:800;color:#1d1d1f;letter-spacing:-0.01em;">What the uniform fee covers</h3>'
       +    '<p style="color:#6e6e73;font-size:0.86rem;margin:0 0 18px;line-height:1.5;">'
       +      'Billed one time to new players only. Season dues are separate and are shown on the Season Dues tab.'
       +    '</p>';

  lines.forEach(function (l, i) { html += lineRow(l, i === lines.length - 1); });

  if (requiredTotal) {
    html += '<div style="display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:18px;padding-top:16px;border-top:2px solid #1d1d1f;">'
         +    '<div style="font-weight:800;color:#1d1d1f;">Required total</div>'
         +    '<div style="font-weight:800;font-size:1.15rem;color:#1A3A8F;">' + money(requiredTotal) + '</div>'
         +  '</div>'
         +  '<div style="font-size:0.78rem;color:#86868b;margin-top:8px;line-height:1.45;">'
         +    'The backpack is optional and is not included in this total.'
         +  '</div>';
  }

  html += '</div>';

  html += '<div style="font-size:0.8rem;color:#86868b;line-height:1.5;">'
       +    'Sizes and jersey number are chosen at checkout. Questions about a charge on your account? '
       +    'Use the Season Dues tab to ask us to review it.'
       +  '</div>';

  return html;
}

function mount(html) {
  var host = document.getElementById(MOUNT_ID);
  if (!host) return;
  host.innerHTML = html;
  rendered = true;
}

async function load() {
  if (rendered) return;
  var host = document.getElementById(MOUNT_ID);
  if (!host) return;

  var sb = await waitForClient(20);
  if (!sb) { mount(fallbackHTML()); return; }

  var cfg = null;
  try {
    // uniform_config is world-readable by policy (uniform_config_read) and holds
    // no personal data -- it is the program's published price list.
    var res = await sb.from('uniform_config')
      .select('jersey_price, shorts_price, penny_price, backpack_price, active')
      .eq('id', 1)
      .maybeSingle();
    if (res && res.error) throw res.error;
    cfg = res && res.data;
  } catch (e) {
    console.warn('[gear] uniform_config read failed; showing checkout link only:', e);
    mount(fallbackHTML());
    return;
  }
  if (!cfg) { mount(fallbackHTML()); return; }

  // needs_uniform is per-athlete and best-effort: if we cannot establish it we
  // show the ordering state, which is the safe default for a new family.
  var needsUniform = null;
  try {
    var user = null;
    try { user = (await sb.auth.getUser()).data.user; } catch (e) { user = null; }
    if (user && user.id) {
      var athleteId = await selectedAthleteId(sb, user.id);
      if (athleteId) {
        var av = await sb.rpc('get_uniform_availability', { p_athlete_id: athleteId });
        if (av && !av.error && av.data && typeof av.data.needs_uniform === 'boolean') {
          needsUniform = av.data.needs_uniform;
        }
      }
    }
  } catch (e) { /* non-blocking */ }

  mount(render(cfg, needsUniform));
}

window.loadGearPriceSheet = load;

// Render when the gear tab is first opened, and once on load in case the portal
// restores that tab from a cached session.
document.addEventListener('DOMContentLoaded', function () {
  var nav = document.getElementById('nav-gear') || document.querySelector('[onclick*="gear"]');
  if (nav) nav.addEventListener('click', function () { setTimeout(load, 0); });
  var view = document.getElementById('view-gear');
  if (view && view.style.display !== 'none') load();
  setTimeout(function () {
    var v = document.getElementById('view-gear');
    if (v && v.style.display !== 'none') load();
  }, 1200);
});
})();
