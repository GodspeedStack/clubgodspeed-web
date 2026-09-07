/**
 * GODSPEED BASKETBALL. Training report, inside the Parent Portal.
 *
 * On the Training Dashboard: what the coaches worked on with him in each
 * session, what they are working on now and how it shows up in his game, and a
 * Download training report button that builds a PDF on the spot with the hours
 * left, the package, where he is skill by skill, and the work in progress.
 *
 * Data comes from one call, training_report(athlete_id), which only answers
 * for the player's own family or his coaches. No emojis. No em dashes.
 */
(function () {
  'use strict';
  var el = function (id) { return document.getElementById(id); };
  function esc(s) { return (s == null ? '' : String(s)).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function client() { try { return window.auth && typeof window.auth.getSupabaseClient === 'function' ? window.auth.getSupabaseClient() : (window.supabaseClient || null); } catch (e) { return null; } }
  var JSPDF_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
  var report = null, loading = false;

  var CSS = '\
#pt-root{margin:0 0 24px;font-family:Inter,-apple-system,BlinkMacSystemFont,"Helvetica Neue",sans-serif;color:#1d1d1f}\
#pt-root .pt-card{background:#fff;border:1px solid #ececf0;border-radius:16px;box-shadow:0 1px 2px rgba(15,23,42,.04),0 6px 16px rgba(15,23,42,.06);overflow:hidden}\
#pt-root .pt-hd{padding:18px 20px 14px;display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap;border-bottom:1px solid #ececf0;background:linear-gradient(180deg,#eaf3ff,#fff)}\
#pt-root .pt-hd h3{margin:6px 0 4px;font-size:20px;font-weight:800;letter-spacing:-.02em;text-transform:none;color:#1d1d1f}#pt-root .pt-hd p{margin:0;font-size:13.5px;color:#6e6e73;line-height:1.45}\
#pt-root .pt-tag{display:inline-block;font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#0071e3;background:#eaf3ff;border-radius:999px;padding:4px 10px}\
#pt-root .pt-dl{margin-left:auto;align-self:center;height:44px;padding:0 18px;border-radius:12px;border:0;background:#0071e3;color:#fff;font-size:14px;font-weight:700;cursor:pointer;white-space:nowrap}#pt-root .pt-dl:disabled{opacity:.5;cursor:default}\
#pt-root .pt-bd{padding:6px 20px 20px}\
#pt-root .pt-sec{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#0071e3;margin:16px 0 8px}\
#pt-root .pt-work{padding:10px 0;border-bottom:1px solid #ececf0}#pt-root .pt-work:last-child{border-bottom:0}\
#pt-root .pt-work b{font-size:14.5px;font-weight:700}#pt-root .pt-work b small{font-weight:600;color:#6e6e73;margin-left:6px;font-size:12px}#pt-root .pt-work p{margin:3px 0 0;font-size:13.5px;color:#48484a;line-height:1.5}\
#pt-root .pt-sess{display:grid;grid-template-columns:auto 1fr auto;gap:2px 12px;align-items:start;padding:12px 0;border-bottom:1px solid #ececf0}#pt-root .pt-sess:last-child{border-bottom:0}\
#pt-root .pt-sess .d{font-size:12.5px;font-weight:700;color:#6e6e73;white-space:nowrap;padding-top:2px}#pt-root .pt-sess .m{font-size:12.5px;font-weight:600;color:#a1a1a6;white-space:nowrap}\
#pt-root .pt-sess .chips{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px}#pt-root .pt-sess .chips span{font-size:11.5px;font-weight:600;background:#f5f5f7;border-radius:999px;padding:3px 9px}#pt-root .pt-sess .chips span.dr{background:#eaf3ff;color:#0071e3}\
#pt-root .pt-sess p{margin:6px 0 0;font-size:13.5px;color:#48484a;line-height:1.5}#pt-root .pt-sess .c{font-size:12px;color:#a1a1a6;margin-top:2px}\
#pt-root .pt-more{background:none;border:0;color:#0071e3;font-weight:600;font-size:13.5px;cursor:pointer;padding:8px 0 0}\
#pt-root .pt-empty{padding:14px 0;color:#6e6e73;font-size:13.5px}\
#pt-root .pt-foot{font-size:12px;color:#a1a1a6;margin-top:14px;line-height:1.5}';
  function injectCss() { if (el('parent-training-css')) return; var s = document.createElement('style'); s.id = 'parent-training-css'; s.textContent = CSS; document.head.appendChild(s); }

  async function resolveAthleteId(c) {
    var stored = localStorage.getItem('gba_current_athlete'); if (stored) return stored;
    try { var p = window.auth && window.auth.getProfile ? await window.auth.getProfile() : null; if (p && p.athlete_id) return p.athlete_id; } catch (e) { /* next */ }
    try { var sess = await c.auth.getSession(); var uid = sess && sess.data && sess.data.session && sess.data.session.user.id; if (uid) { var r = await c.from('parent_player_links').select('athlete_id').eq('profile_id', uid).order('is_primary', { ascending: false }).limit(1).maybeSingle(); if (r.data && r.data.athlete_id) return r.data.athlete_id; } } catch (e) { /* none */ }
    return null;
  }
  function fmt(iso) { var d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso); return isNaN(d) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
  function num(n) { return Math.round((+n || 0) * 10) / 10; }
  function ensureRoot() {
    var view = el('view-training'); if (!view) return null;
    var root = el('pt-root'); if (root) return root;
    root = document.createElement('div'); root.id = 'pt-root';
    var hours = el('training-hours-card');
    if (hours && hours.parentNode === view) view.insertBefore(root, hours.nextSibling); else view.insertBefore(root, view.firstChild);
    return root;
  }
  var showAll = false;
  function render(root) {
    if (!report) { root.innerHTML = ''; return; }
    var r = report; var first = r.athlete.first_name || 'He';
    var cur = r.current; var h = '<div class="pt-card"><div class="pt-hd"><div><span class="pt-tag">Training report</span><h3>What we are working on with ' + esc(first) + '</h3><p>' + (cur ? num(cur.used) + ' of ' + num(cur.purchased) + ' hours used on ' + esc(cur.label) + ', ' + num(cur.remaining) + ' left. ' : '')  + r.sessions.length + ' session' + (r.sessions.length === 1 ? '' : 's') + ' logged. Trained by the coaches who run his team, so every rep points at what his team needs from him.</p></div><button type="button" class="pt-dl" id="pt-download">Download training report</button></div><div class="pt-bd">';
    if (r.working_on.length) {
      h += '<div class="pt-sec">Working on now, and how it shows up in his game</div>';
      r.working_on.forEach(function (w) { h += '<div class="pt-work"><b>' + esc(w.label) + '<small>' + esc(w.skill || '') + (w.times > 1 ? ', ' + w.times + ' sessions' : '') + (w.score ? ', ' + esc((r.rubric || [])[w.score - 1] || '') + ' today' : '') + '</small></b>' + (w.transfer ? '<p>' + esc(w.transfer) + '</p>' : '') + '</div>'; });
    }
    h += '<div class="pt-sec">Sessions</div>';
    if (!r.sessions.length) h += '<div class="pt-empty">Nothing logged yet. After each session the coach records what ' + esc(first) + ' worked on, and it shows here.</div>';
    var list = showAll ? r.sessions : r.sessions.slice(0, 5);
    list.forEach(function (s) {
      h += '<div class="pt-sess"><span class="d">' + esc(fmt(s.date)) + '</span><div><b>' + esc((s.skills || []).map(function (k) { return k.label; }).join(', ') || s.title || 'Training') + '</b>' + (s.coach ? '<div class="c">with ' + esc(s.coach) + '</div>' : '') + ((s.drills || []).length ? '<div class="chips">' + s.drills.map(function (d) { return '<span class="dr">' + esc(d) + '</span>'; }).join('') + '</div>' : '') + (s.notes ? '<p>' + esc(s.notes) + '</p>' : '') + '</div><span class="m">' + esc(s.minutes || '') + ' min</span></div>';
    });
    if (r.sessions.length > 5 && !showAll) h += '<button type="button" class="pt-more" id="pt-more">Show all ' + r.sessions.length + ' sessions</button>';
    h += '<div class="pt-foot">The PDF has the hours, the package, where ' + esc(first) + ' is in every skill against the target for his age, and what each skill means on the floor for his team.</div></div></div>';
    root.innerHTML = h;
    var dl = el('pt-download'); if (dl) dl.onclick = function () { download(dl); };
    var more = el('pt-more'); if (more) more.onclick = function () { showAll = true; render(root); };
  }
  async function load(force) {
    if (loading) return; loading = true;
    try {
      injectCss(); var root = ensureRoot(); if (!root) return;
      var c = client(); if (!c) return;
      var id = await resolveAthleteId(c); if (!id) return;
      if (!report || force || report.athlete.id !== id) { var r = await c.rpc('training_report', { p_athlete_id: id }); if (r.error) throw r.error; report = r.data; }
      render(root);
    } catch (e) { console.warn('[parent-training]', e.message); }
    loading = false;
  }

  // ---------- the PDF ----------
  function loadJsPdf() {
    if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
    return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = JSPDF_URL; s.onload = function () { window.jspdf && window.jspdf.jsPDF ? res(window.jspdf.jsPDF) : rej(new Error('PDF library did not load')); }; s.onerror = function () { rej(new Error('PDF library did not load')); }; document.head.appendChild(s); });
  }
  async function download(btn) {
    if (!report) return; btn.disabled = true; var old = btn.textContent; btn.textContent = 'Building...';
    try { var JsPDF = await loadJsPdf(); buildPdf(JsPDF, report); } catch (e) { alert('Could not build the PDF: ' + e.message); }
    btn.disabled = false; btn.textContent = old;
  }
  function buildPdf(JsPDF, r) {
    var doc = new JsPDF({ unit: 'pt', format: 'letter' }); var W = 612, M = 48, y = 0; var first = r.athlete.first_name || 'He';
    var blue = [0, 113, 227], ink = [29, 29, 31], grey = [110, 110, 115], light = [236, 236, 240], green = [21, 154, 82], red = [217, 45, 32];
    function page() { doc.addPage(); y = M; }
    function need(h) { if (y + h > 792 - M) page(); }
    function text(s, x, size, color, style, maxW) { doc.setFont('helvetica', style || 'normal'); doc.setFontSize(size); doc.setTextColor(color[0], color[1], color[2]); var lines = doc.splitTextToSize(String(s), maxW || (W - M - x)); doc.text(lines, x, y); return lines.length * size * 1.28; }
    function sec(title) { need(40); y += 18; doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(blue[0], blue[1], blue[2]); doc.text(title.toUpperCase(), M, y); y += 6; doc.setDrawColor(light[0], light[1], light[2]); doc.line(M, y, W - M, y); y += 16; }
    // header band
    doc.setFillColor(10, 10, 10); doc.rect(0, 0, W, 92, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(24); doc.setTextColor(255, 255, 255); doc.text('GODSPEED', M, 56);
    var gw = doc.getTextWidth('GODSPEED'); doc.setTextColor(59, 111, 255); doc.text('BASKETBALL', M + gw, 56);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(13); doc.setTextColor(210, 210, 214); doc.text('TRAINING REPORT', W - M, 46, { align: 'right' });
    doc.setFontSize(10); doc.setTextColor(170, 170, 176); doc.text(r.athlete.name + '  ·  ' + new Date(r.generated_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }), W - M, 64, { align: 'right' });
    y = 124;
    y += text(r.athlete.name, M, 22, ink, 'bold');
    var meta = [r.team, r.athlete.grade ? (String(r.athlete.grade).replace(/\D/g, '') + 'th grade').replace(/^1th/, '1st').replace(/^2th/, '2nd').replace(/^3th/, '3rd') : null, r.athlete.age ? 'Age ' + r.athlete.age : null, r.athlete.position || null, r.season ? 'Season ' + r.season : null].filter(Boolean).join('  ·  ');
    y += text(meta, M, 10.5, grey) + 6;
    // hours boxes
    var cur = r.current || { label: 'Training package', purchased: r.hours_purchased, used: r.hours_used, remaining: r.hours_remaining, sessions: r.sessions.length };
    need(84); doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(grey[0], grey[1], grey[2]); doc.text(('Training hours remaining  ·  ' + cur.label + (cur.price ? '  ·  $' + Math.round(cur.price) : '') + (cur.completed ? '  ·  completed' : '  ·  in progress')).toUpperCase(), M, y); y += 10;
    var boxes = [[num(cur.remaining) + ' h', 'Remaining', blue], [num(cur.used) + ' h', 'Used of ' + num(cur.purchased), ink], [num(cur.purchased) + ' h', 'Purchased', ink], [cur.sessions || 0, 'Sessions', ink]];
    var bw = (W - 2 * M - 3 * 10) / 4;
    boxes.forEach(function (b, i) { var x = M + i * (bw + 10); doc.setFillColor(245, 245, 247); doc.roundedRect(x, y, bw, 58, 8, 8, 'F'); doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(b[2][0], b[2][1], b[2][2]); doc.text(String(b[0]), x + 12, y + 30); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(grey[0], grey[1], grey[2]); doc.text(b[1].toUpperCase(), x + 12, y + 46); });
    y += 66;
    // progress bar for the current package
    var pct = cur.purchased ? Math.max(0, Math.min(1, cur.used / cur.purchased)) : 0;
    doc.setFillColor(light[0], light[1], light[2]); doc.roundedRect(M, y, W - 2 * M, 6, 3, 3, 'F'); if (pct > 0) { doc.setFillColor(green[0], green[1], green[2]); doc.roundedRect(M, y, (W - 2 * M) * pct, 6, 3, 3, 'F'); } y += 6;
    // packages
    if (r.packages.length) {
      sec('Skill packages');
      r.packages.forEach(function (p) { need(20); var line = p.label + (p.price ? '  ·  $' + Math.round(p.price) : '') + ': ' + num(p.purchased) + ' h purchased ' + fmt(p.purchase_date) + ', ' + num(p.used) + ' h used, ' + num(p.remaining) + ' h left' + (p.completed ? '  ·  completed' : p.current ? '  ·  current' : ''); y += text(line, M, 10.5, p.current ? ink : grey, p.current ? 'bold' : 'normal'); });
    }
    // where he is
    if (r.phases.length) {
      sec('Where ' + first + ' is, skill by skill');
      y += text('Phase comes from the coaches\' 1 to 5 scores in practice. Target is where a player his age should be in our program.', M, 9.5, grey) + 4;
      var colW = [200, 110, 110, 96]; need(20);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(grey[0], grey[1], grey[2]);
      doc.text('SKILL', M, y); doc.text('PHASE', M + colW[0], y); doc.text('TARGET', M + colW[0] + colW[1], y); doc.text('STATUS', M + colW[0] + colW[1] + colW[2], y); y += 6; doc.setDrawColor(light[0], light[1], light[2]); doc.line(M, y, W - M, y); y += 14;
      r.phases.slice().sort(function (a, b) { return a.label.localeCompare(b.label); }).forEach(function (p) {
        need(18); doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(ink[0], ink[1], ink[2]); doc.text(p.label, M, y);
        doc.setFont('helvetica', 'normal'); doc.setTextColor(ink[0], ink[1], ink[2]); doc.text(p.phase ? p.phase_name : 'Not scored yet', M + colW[0], y);
        doc.setTextColor(grey[0], grey[1], grey[2]); doc.text(p.target ? p.target_name : '', M + colW[0] + colW[1], y);
        var st = p.track === 'ahead' ? ['Ahead', blue] : p.track === 'on' ? ['On track', green] : p.track === 'behind' ? ['Working toward it', red] : ['', grey];
        doc.setFont('helvetica', 'bold'); doc.setTextColor(st[1][0], st[1][1], st[1][2]); doc.text(st[0], M + colW[0] + colW[1] + colW[2], y); y += 16;
      });
    }
    // working on
    if (r.working_on.length) {
      sec('What we are working on, and how it transfers to his game');
      y += text('Hiring an outside trainer does not guarantee game minutes, because most trainers do not know what his coach and his team\'s system ask of him. These are the coaches who run that system. Every skill below is tied to what it does for ' + first + ' on the floor.', M, 9.5, grey) + 6;
      r.working_on.forEach(function (w) { need(44); y += text(w.label + (w.skill ? '  ·  ' + w.skill : '') + (w.times > 1 ? '  ·  ' + w.times + ' sessions' : ''), M, 11, ink, 'bold'); if (w.transfer) y += text(w.transfer, M, 10, ink) ; y += 6; });
    }
    if (r.focus) { sec('Coach focus this month'); y += text(r.focus, M, 11, ink, 'bold'); }
    // sessions
    sec('Sessions');
    if (!r.sessions.length) y += text('No sessions logged yet.', M, 10.5, grey);
    r.sessions.forEach(function (s) {
      need(40);
      y += text(fmt(s.date) + '  ·  ' + (s.minutes || '') + ' min' + (s.coach ? '  ·  ' + s.coach : ''), M, 9.5, grey);
      y += text((s.skills || []).map(function (k) { return k.label; }).join(', ') || s.title || 'Training', M, 11, ink, 'bold');
      if ((s.drills || []).length) y += text('Drills: ' + s.drills.join(', '), M, 9.5, grey);
      if (s.notes) y += text(s.notes, M, 10, ink);
      y += 8;
    });
    // footer on every page
    var n = doc.getNumberOfPages();
    for (var i = 1; i <= n; i++) { doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(grey[0], grey[1], grey[2]); doc.text('Godspeed Basketball  ·  clubgodspeed.com  ·  Training report for ' + r.athlete.name + '  ·  page ' + i + ' of ' + n, M, 792 - 24); }
    doc.save('Godspeed training report ' + (r.athlete.first_name || 'player') + ' ' + new Date(r.generated_at).toISOString().slice(0, 10) + '.pdf');
  }

  function visible() { var v = el('view-training'); return v && v.style.display !== 'none' && !v.classList.contains('hidden'); }
  document.addEventListener('DOMContentLoaded', function () {
    injectCss();
    var orig = window.switchPortalView;
    if (typeof orig === 'function' && !orig.__ptWrapped) { var w = function (name) { var r = orig.apply(this, arguments); if (name === 'training') load(); return r; }; w.__ptWrapped = true; window.switchPortalView = w; }
    setTimeout(function () { if (visible()) load(); }, 1500);
    var v = el('view-training');
    if (v) new MutationObserver(function () { if (visible() && !el('pt-root')) load(); }).observe(v, { attributes: true, attributeFilter: ['style', 'class'] });
    window.ParentTraining = { load: function () { return load(true); }, buildPdf: buildPdf, get report() { return report; } };
  });
})();
