/**
 * GODSPEED BASKETBALL. Development read, inside the Parent Portal.
 *
 * When the director (or a coach the director has enabled) shares a player's
 * development from the Coach Portal, it shows here under Performance: where he
 * is in each skill, the three things he is working on next in plain words, the
 * drills to work at home with the rep to start with, and the coach's note.
 *
 * Contract: read-only. Reads player_development_shares under RLS (a parent sees
 * only his own athlete). Resolves the athlete the same way performance-renderer
 * does (gba_current_athlete, then parent_player_links). No emojis. No em dashes.
 */
(function () {
  'use strict';
  var el = function (id) { return document.getElementById(id); };
  function esc(s) { return (s == null ? '' : String(s)).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function client() { try { return window.auth && typeof window.auth.getSupabaseClient === 'function' ? window.auth.getSupabaseClient() : (window.supabaseClient || null); } catch (e) { return null; } }
  var TAGS = { 'Culture': '#0071e3', 'Toughness': '#d92d20', 'Bigs': '#7c3aed', 'Guards': '#0d9488', 'Passing/Reads': '#4f46e5', 'Individual': '#64748b', 'Conditioning': '#d97706', 'Strength': '#57534e' };

  var CSS = '\
#dev-share-root{margin:0 0 20px;font-family:Inter,-apple-system,BlinkMacSystemFont,"Helvetica Neue",sans-serif;color:#1d1d1f}\
#dev-share-root .ds-card{background:#fff;border:1px solid #ececf0;border-radius:16px;box-shadow:0 1px 2px rgba(15,23,42,.04),0 6px 16px rgba(15,23,42,.06);overflow:hidden}\
#dev-share-root .ds-hd{padding:18px 20px 14px;background:linear-gradient(180deg,#eaf3ff,#fff);border-bottom:1px solid #ececf0}\
#dev-share-root .ds-tag{display:inline-block;font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#0071e3;background:#eaf3ff;border-radius:999px;padding:4px 10px}\
#dev-share-root .ds-hd h3{margin:8px 0 4px;font-size:20px;font-weight:800;letter-spacing:-.02em;text-transform:none;color:#1d1d1f}\
#dev-share-root .ds-hd p{margin:0;font-size:13.5px;color:#6e6e73;line-height:1.45}\
#dev-share-root .ds-bd{padding:6px 20px 20px}\
#dev-share-root .ds-sec{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#0071e3;margin:16px 0 8px}\
#dev-share-root .ds-note{background:#f5f5f7;border:1px solid #ececf0;border-radius:12px;padding:14px 16px;font-size:14.5px;line-height:1.5;margin-top:14px}\
#dev-share-root .ds-note b{display:block;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#0071e3;margin-bottom:4px}\
#dev-share-root .ds-phases{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}\
#dev-share-root .ds-ph{background:#fafafc;border:1px solid #ececf0;border-radius:10px;padding:10px 12px}\
#dev-share-root .ds-ph b{display:block;font-size:12.5px;font-weight:600}\
#dev-share-root .ds-ph span{display:block;font-size:12px;color:#6e6e73;margin-top:2px}\
#dev-share-root .ds-ph i{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;background:#c7c7cc;vertical-align:0}\
#dev-share-root .ds-ph.on i{background:#159a52}#dev-share-root .ds-ph.ahead i{background:#0071e3}#dev-share-root .ds-ph.behind i{background:#d9660a}\
#dev-share-root .ds-need{display:grid;grid-template-columns:1fr auto;gap:4px 12px;align-items:center;padding:9px 0;border-bottom:1px solid #ececf0}\
#dev-share-root .ds-need b{font-size:14.5px;font-weight:600}\
#dev-share-root .ds-need small{display:block;font-size:12.5px;color:#6e6e73;margin-top:1px}\
#dev-share-root .ds-need .w{font-size:12px;font-weight:700;color:#6e6e73;white-space:nowrap}\
#dev-share-root .ds-need .w.lo{color:#d9660a}\
#dev-share-root .ds-drill{padding:12px 0;border-bottom:1px solid #ececf0}\
#dev-share-root .ds-drill .t{display:flex;align-items:center;gap:8px;font-size:15px;font-weight:700}\
#dev-share-root .ds-drill .t small{margin-left:auto;font-size:12px;font-weight:600;color:#6e6e73;white-space:nowrap}\
#dev-share-root .ds-drill .c{font-size:13.5px;color:#6e6e73;margin-top:3px;line-height:1.45}\
#dev-share-root .ds-drill .rep{font-size:13px;background:#f5f5f7;border-radius:8px;padding:8px 10px;margin-top:8px;line-height:1.45}\
#dev-share-root .ds-drill .rep b{color:#0071e3;font-size:10.5px;letter-spacing:.05em;text-transform:uppercase;margin-right:6px}\
#dev-share-root .ds-drill .std{font-size:12px;color:#a1a1a6;margin-top:6px}\
#dev-share-root .ds-drill .tg{display:inline-block;font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--tc);background:color-mix(in srgb,var(--tc) 12%,#fff);border-radius:999px;padding:2px 7px}\
#dev-share-root .ds-foot{font-size:12px;color:#a1a1a6;margin-top:14px}\
#dev-share-root .ds-empty{background:#fff;border:1px dashed #d9d9de;border-radius:16px;padding:22px;text-align:center;color:#6e6e73;font-size:13.5px}';
  function injectCss() { if (el('parent-development-css')) return; var s = document.createElement('style'); s.id = 'parent-development-css'; s.textContent = CSS; document.head.appendChild(s); }

  async function resolveAthleteId(c) {
    var stored = localStorage.getItem('gba_current_athlete'); if (stored) return stored;
    try { var sess = await c.auth.getSession(); var uid = sess && sess.data && sess.data.session && sess.data.session.user.id; if (uid) { var r = await c.from('parent_player_links').select('athlete_id').eq('profile_id', uid).order('is_primary', { ascending: false }).limit(1).maybeSingle(); if (r.data && r.data.athlete_id) return r.data.athlete_id; } } catch (e) { /* fall through */ }
    return null;
  }
  function fmt(iso) { var d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }); }
  function ensureRoot() {
    var view = el('view-performance'); if (!view) return null;
    var root = el('dev-share-root');
    if (!root) { root = document.createElement('div'); root.id = 'dev-share-root'; var perf = el('perf-root'); if (perf) view.insertBefore(root, perf); else view.appendChild(root); }
    return root;
  }
  function render(root, share, coachName) {
    if (!share) { root.innerHTML = ''; return; }
    var sm = share.summary || {};
    var h = '<div class="ds-card"><div class="ds-hd"><span class="ds-tag">Development read</span><h3>Where he is and what is next</h3><p>Shared by ' + esc(coachName || 'his coach') + ' on ' + esc(fmt(share.shared_at)) + '. ' + (sm.rated ? sm.rated + ' of ' + sm.total + ' skills scored so far.' : '') + (sm.position ? ' Position: ' + esc(sm.position) + '.' : '') + '</p></div><div class="ds-bd">';
    var phases = (sm.phases || []).filter(function (p) { return p.phase; });
    if (phases.length) { h += '<div class="ds-sec">Where he is</div><div class="ds-phases">' + phases.map(function (p) { return '<div class="ds-ph ' + esc(p.track || '') + '"><b><i></i>' + esc(p.label) + '</b><span>' + esc(p.phaseName) + (p.target && p.track === 'behind' ? ', working toward ' + esc(p.targetName) : p.track === 'ahead' ? ', ahead of his age' : '') + '</span></div>'; }).join('') + '</div>'; }
    if (sm.needs && sm.needs.length) { h += '<div class="ds-sec">Working on next</div>' + sm.needs.map(function (n) { return '<div class="ds-need"><div><b>' + esc(n.label) + '</b><small>' + esc(n.skillLabel) + (n.hint ? '. ' + esc(n.hint) : '') + '</small></div><span class="w' + (n.score <= 2 ? ' lo' : '') + '">' + esc(n.word) + '</span></div>'; }).join(''); }
    if (sm.drills && sm.drills.length) { h += '<div class="ds-sec">Work at home</div>' + sm.drills.map(function (d) { return '<div class="ds-drill"><div class="t">' + esc(d.name) + '<span class="tg" style="--tc:' + (TAGS[d.tag] || '#64748b') + '">' + esc(d.tag || 'Drill') + '</span><small>' + esc(d.min) + ' min, for ' + esc((d.forLabel || '').toLowerCase()) + '</small></div><div class="c">' + esc(d.cue) + '</div>' + (d.rep ? '<div class="rep"><b>Start here</b>' + esc(d.rep) + '</div>' : '') + (d.standard ? '<div class="std">Standard: ' + esc(d.standard) + '</div>' : '') + '</div>'; }).join(''); }
    if (share.note) h += '<div class="ds-note"><b>From the coach</b>' + esc(share.note) + '</div>';
    else if (sm.focus) h += '<div class="ds-note"><b>Focus this month</b>' + esc(sm.focus) + '</div>';
    h += '<div class="ds-foot">Godspeed scores what the coaches see in practice, 1 to 5, and picks the drill that fits. Ask his coach how the home work is going.</div></div></div>';
    root.innerHTML = h;
  }
  var loading = false;
  async function load() {
    if (loading) return; loading = true;
    try {
      injectCss(); var root = ensureRoot(); if (!root) return;
      var c = client(); if (!c) return;
      var athleteId = await resolveAthleteId(c); if (!athleteId) return;
      var r = await c.from('player_development_shares').select('id,athlete_id,shared_by,shared_at,note,summary').eq('athlete_id', athleteId).order('shared_at', { ascending: false }).limit(1);
      if (r.error || !r.data || !r.data.length) { render(root, null); return; }
      var share = r.data[0]; var coachName = '';
      try { var p = await c.from('profiles').select('full_name').eq('id', share.shared_by).maybeSingle(); if (p.data && p.data.full_name) coachName = 'Coach ' + p.data.full_name.split(' ')[0]; } catch (e) { /* name is optional */ }
      render(root, share, coachName);
    } catch (e) { console.warn('[parent-development]', e.message); }
    loading = false;
  }
  function visible() { var v = el('view-performance'); return v && v.style.display !== 'none'; }
  document.addEventListener('DOMContentLoaded', function () {
    injectCss();
    var orig = window.switchPortalView;
    if (typeof orig === 'function' && !orig.__pdWrapped) { var w = function (name, link) { var r = orig.apply(this, arguments); if (name === 'performance') load(); return r; }; w.__pdWrapped = true; window.switchPortalView = w; }
    setTimeout(function () { if (visible()) load(); }, 1200);
    var v = el('view-performance');
    if (v) new MutationObserver(function () { if (visible() && !el('dev-share-root')) load(); }).observe(v, { attributes: true, attributeFilter: ['style'] });
    window.ParentDevelopment = { load: load };
  });
})();
