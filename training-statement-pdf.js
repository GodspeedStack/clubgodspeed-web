/* ============================================================================
 * Godspeed Basketball -- Training Statement PDF
 * ----------------------------------------------------------------------------
 * Renders the parent-facing TRAINING STATEMENT: hours remaining, one block per
 * purchased package, and the full session log. This is the money document. The
 * sibling file training-report-pdf.js renders the TRAINING REPORT, which is the
 * development document. They are not interchangeable.
 *
 * Layout is fixed by feedback_pdf_design_standard: black header bar, blue hero
 * card with a green progress bar, white package metric cards, black-header
 * session table, tagline footer. Do not invent a new design.
 *
 * Usage:
 *   1. Load jsPDF + autoTable before this file:
 *      <script src=".../jspdf.umd.min.js"></script>
 *      <script src=".../jspdf.plugin.autotable.min.js"></script>
 *      <script src="training-statement-pdf.js"></script>
 *   2. await GS_TrainingStatement.generate(athleteId);
 *
 * Requires an authenticated Supabase client on window (same accessor as
 * training-report-pdf.js). training_hours_summary is not readable by anon.
 * ==========================================================================*/
window.GS_TrainingStatement = (function () {
  'use strict';

  var BRAND = {
    black:    [10, 10, 10],
    blue:     [37, 99, 235],     // #2563eb
    blueDark: [29, 78, 216],     // #1d4ed8
    blueTint: [91, 141, 239],    // progress track
    green:    [22, 163, 74],     // COMPLETED
    greenBar: [74, 222, 128],    // progress fill
    orange:   [234, 88, 12],     // IN PROGRESS
    gray500:  [107, 114, 128],
    gray400:  [156, 163, 175],
    gray200:  [229, 231, 235],
    gray50:   [249, 250, 251],
    white:    [255, 255, 255],
    heroLabel:[219, 230, 255],
    heroMuted:[199, 216, 251],
    font:     'helvetica',
    tagline:  'BROTHERHOOD. HABITS. SUCCESS.',
    site:     'clubgodspeed.com'
  };

  var PAGE_W = 612, PAGE_H = 792, MARGIN = 40;
  var CONTENT_W = PAGE_W - MARGIN * 2;

  // ── Supabase client (same accessor the report generator uses) ────────────
  function getClient() {
    try {
      if (window.auth && typeof window.auth.getSupabaseClient === 'function') return window.auth.getSupabaseClient();
      if (window.supabaseClient) return window.supabaseClient;
      if (window._supabase) return window._supabase;
      return null;
    } catch (_) { return null; }
  }

  function money(v) {
    if (v == null || v === '') return '';
    var n = parseFloat(v);
    if (isNaN(n)) return '';
    return '$' + (n % 1 === 0 ? n.toFixed(0) : n.toFixed(2));
  }
  function hrs(n) { return (Math.round(n * 10) / 10).toFixed(1); }
  function isoDate(d) { return String(d || '').slice(0, 10); }

  // ── Data ─────────────────────────────────────────────────────────────────
  /**
   * Pulls everything the statement needs and assigns each session to a package
   * using the same strictly-sequential FIFO rule as the training_hours_summary
   * view: a session belongs to the package its running total lands inside.
   * Never bucket sessions by purchase-date windows.
   */
  async function fetchStatementData(athleteId) {
    var client = getClient();
    if (!client) throw new Error('No Supabase client available. Ensure auth is initialized.');

    var res = await Promise.all([
      client.from('athletes').select('*').eq('id', athleteId).single(),
      client.from('training_hour_packages').select('*').eq('athlete_id', athleteId).order('purchase_date', { ascending: true }),
      client.from('training_hours_summary').select('*').eq('athlete_id', athleteId),
      client.from('training_attendance').select('*, training_sessions(*)').eq('athlete_id', athleteId)
    ]);
    var athleteRes = res[0], pkgRes = res[1], sumRes = res[2], attRes = res[3];

    if (athleteRes.error) throw new Error('Failed to fetch athlete: ' + athleteRes.error.message);
    if (pkgRes.error)     throw new Error('Failed to fetch packages: ' + pkgRes.error.message);

    var athlete  = athleteRes.data;
    var packages = (pkgRes.data || []).slice();
    var summary  = sumRes.error ? [] : (sumRes.data || []);

    // Billable sessions only: individual workouts actually attended.
    var billable = (attRes.data || [])
      .filter(function (a) {
        var s = a.training_sessions;
        return s && s.session_type === 'individual_workout' &&
               (a.status === 'present' || a.status === 'late') && s.duration_minutes;
      })
      .sort(function (a, b) {
        var da = a.training_sessions.session_date, db = b.training_sessions.session_date;
        if (da !== db) return da < db ? -1 : 1;
        return String(a.created_at) < String(b.created_at) ? -1 : 1;
      });

    packages.sort(function (a, b) {
      if (a.purchase_date !== b.purchase_date) return a.purchase_date < b.purchase_date ? -1 : 1;
      return String(a.id) < String(b.id) ? -1 : 1;
    });

    // prior_purchased per package, matching the view
    var prior = 0;
    packages.forEach(function (p) {
      p._prior = prior;
      p._purchased = parseFloat(p.hours_purchased) || 0;
      prior += p._purchased;
    });
    var totalPurchased = prior;

    // FIFO walk
    var cum = 0, sessions = [];
    billable.forEach(function (a) {
      var s = a.training_sessions;
      var h = s.duration_minutes / 60;
      cum += h;
      var owner = null;
      for (var i = 0; i < packages.length; i++) {
        var p = packages[i];
        if (cum > p._prior + 1e-9 && cum <= p._prior + p._purchased + 1e-9) { owner = p; break; }
      }
      sessions.push({
        date: isoDate(s.session_date),
        packageLabel: owner ? (owner.package_label || 'Package') : 'Unallocated',
        hours: h,
        note: (s.session_notes || a.coach_notes || '').trim()
      });
    });

    var totalUsed = Math.round(cum * 10) / 10;

    // Per-package used/remaining: prefer the view, fall back to the same math.
    var byId = {};
    summary.forEach(function (r) { byId[r.package_id] = r; });
    var pkgRows = packages.map(function (p) {
      var row = byId[p.id];
      var used = row && row.hours_used != null
        ? parseFloat(row.hours_used)
        : Math.max(0, Math.min(p._purchased, totalUsed - p._prior));
      var remaining = row && row.hours_remaining != null
        ? parseFloat(row.hours_remaining)
        : Math.max(0, p._purchased - used);
      return {
        label: p.package_label || 'Package',
        price: money(p.price),
        purchased: p._purchased,
        used: used,
        remaining: remaining,
        complete: remaining <= 0.0001
      };
    });

    return {
      athlete: athlete,
      packages: pkgRows,
      sessions: sessions,
      totals: {
        purchased: totalPurchased,
        used: totalUsed,
        remaining: Math.max(0, Math.round((totalPurchased - totalUsed) * 10) / 10)
      }
    };
  }

  // ── PDF ──────────────────────────────────────────────────────────────────
  function buildPDF(data) {
    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });

    var athlete = data.athlete || {};
    var totals  = data.totals || { purchased: 0, used: 0, remaining: 0 };
    var reportDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    function setFill(c)   { doc.setFillColor(c[0], c[1], c[2]); }
    function setDraw(c)   { doc.setDrawColor(c[0], c[1], c[2]); }
    function setText(c)   { doc.setTextColor(c[0], c[1], c[2]); }

    // ── Header bar ─────────────────────────────────────────
    setFill(BRAND.black);
    doc.rect(0, 0, PAGE_W, 56, 'F');
    doc.setFont(BRAND.font, 'bold'); doc.setFontSize(16);
    setText(BRAND.white);
    doc.text('GODSPEED', MARGIN, 35);
    setText(BRAND.blue);
    doc.text('BASKETBALL', MARGIN + doc.getTextWidth('GODSPEED') + 5, 35);
    doc.setFont(BRAND.font, 'normal'); doc.setFontSize(10);
    setText(BRAND.gray400);
    doc.text('TRAINING STATEMENT', PAGE_W - MARGIN, 27, { align: 'right' });
    doc.setFontSize(8);
    doc.text(reportDate, PAGE_W - MARGIN, 41, { align: 'right' });

    var y = 80;

    // ── Athlete card ───────────────────────────────────────
    setFill(BRAND.gray50); setDraw(BRAND.gray200);
    doc.roundedRect(MARGIN, y, CONTENT_W, 54, 6, 6, 'FD');
    doc.setFont(BRAND.font, 'bold'); doc.setFontSize(17);
    setText(BRAND.black);
    doc.text(athlete.first_name || 'Athlete', MARGIN + 16, y + 25);
    doc.setFont(BRAND.font, 'normal'); doc.setFontSize(9.5);
    setText(BRAND.gray500);
    doc.text(athlete.team_name || '', MARGIN + 16, y + 42);
    y += 72;

    // ── Hero ───────────────────────────────────────────────
    var heroH = 104, split = MARGIN + CONTENT_W * 0.58;
    setFill(BRAND.blue);
    doc.roundedRect(MARGIN, y, CONTENT_W, heroH, 6, 6, 'F');
    setFill(BRAND.blueDark);
    doc.roundedRect(split, y, MARGIN + CONTENT_W - split, heroH, 6, 6, 'F');
    doc.rect(split, y, 10, heroH, 'F');   // square off the darker panel's left edge

    doc.setFont(BRAND.font, 'normal'); doc.setFontSize(10.5);
    setText(BRAND.heroLabel);
    doc.text('Training Hours Remaining', MARGIN + 22, y + 24);
    doc.setFont(BRAND.font, 'bold'); doc.setFontSize(38);
    setText(BRAND.white);
    doc.text(hrs(totals.remaining), MARGIN + 22, y + 63);
    doc.setFont(BRAND.font, 'normal'); doc.setFontSize(10.5);
    setText(BRAND.heroLabel);
    doc.text('hours', MARGIN + 22, y + 79);

    var rightX = PAGE_W - MARGIN - 18;
    doc.setFontSize(8.5); setText(BRAND.heroMuted);
    doc.text('Active Purchased', rightX, y + 22, { align: 'right' });
    doc.setFont(BRAND.font, 'bold'); doc.setFontSize(16); setText(BRAND.white);
    doc.text(hrs(totals.purchased), rightX, y + 40, { align: 'right' });
    doc.setFont(BRAND.font, 'normal'); doc.setFontSize(8.5); setText(BRAND.heroMuted);
    doc.text('Active Used', rightX, y + 58, { align: 'right' });
    doc.setFont(BRAND.font, 'bold'); doc.setFontSize(16); setText(BRAND.white);
    doc.text(hrs(totals.used), rightX, y + 76, { align: 'right' });

    var barX = MARGIN + 22, barW = CONTENT_W - 44, barY = y + heroH - 18;
    setFill(BRAND.blueTint);
    doc.roundedRect(barX, barY, barW, 7, 3.5, 3.5, 'F');
    var pct = totals.purchased > 0 ? Math.max(0, Math.min(1, totals.used / totals.purchased)) : 0;
    if (pct > 0) { setFill(BRAND.greenBar); doc.roundedRect(barX, barY, barW * pct, 7, 3.5, 3.5, 'F'); }
    y += heroH + 24;

    // ── Package blocks ─────────────────────────────────────
    (data.packages || []).forEach(function (p) {
      if (y + 92 > PAGE_H - 70) { doc.addPage(); y = MARGIN + 20; }
      doc.setFont(BRAND.font, 'bold'); doc.setFontSize(12);
      setText(BRAND.black);
      var head = p.label + (p.price ? '  --  ' + p.price : '');
      doc.text(head, MARGIN, y);
      var headW = doc.getTextWidth(head);   // measure at the heading size, before shrinking
      doc.setFontSize(9.5);
      setText(p.complete ? BRAND.green : BRAND.orange);
      doc.text(p.complete ? 'COMPLETED' : 'IN PROGRESS', MARGIN + headW + 14, y);
      y += 10;

      var cw = (CONTENT_W - 20) / 3;
      [['Hours Purchased', p.purchased], ['Hours Used', p.used], ['Hours Remaining', p.remaining]]
        .forEach(function (item, i) {
          var x = MARGIN + i * (cw + 10);
          setFill(BRAND.white); setDraw(BRAND.gray200);
          doc.roundedRect(x, y, cw, 58, 4, 4, 'FD');
          doc.setFont(BRAND.font, 'normal'); doc.setFontSize(7.5);
          setText(BRAND.gray500);
          doc.text(item[0].toUpperCase(), x + 12, y + 18);
          doc.setFont(BRAND.font, 'bold'); doc.setFontSize(22);
          setText(BRAND.black);
          doc.text(hrs(item[1]), x + 12, y + 46);
        });
      y += 76;
    });

    // ── Session log ────────────────────────────────────────
    if (y + 80 > PAGE_H - 70) { doc.addPage(); y = MARGIN + 20; }
    doc.setFont(BRAND.font, 'bold'); doc.setFontSize(13);
    setText(BRAND.black);
    doc.text('SESSION LOG', MARGIN, y);
    y += 12;

    doc.autoTable({
      startY: y,
      margin: { left: MARGIN, right: MARGIN, bottom: 60 },
      head: [['DATE', 'PACKAGE', 'DURATION', 'NOTES']],
      body: (data.sessions || []).map(function (s) {
        return [s.date, s.packageLabel, hrs(s.hours) + ' hrs', s.note || '--'];
      }),
      theme: 'plain',
      styles: { font: BRAND.font, fontSize: 8, cellPadding: { top: 8, bottom: 8, left: 10, right: 10 }, textColor: [63, 68, 80], lineWidth: 0 },
      headStyles: { fillColor: BRAND.black, textColor: BRAND.white, fontStyle: 'bold', fontSize: 7.5, cellPadding: { top: 9, bottom: 9, left: 10, right: 10 } },
      alternateRowStyles: { fillColor: BRAND.gray50 },
      columnStyles: {
        0: { cellWidth: 68, textColor: BRAND.black },
        1: { cellWidth: 72, textColor: BRAND.black },
        2: { cellWidth: 60, fontStyle: 'bold', textColor: BRAND.black },
        3: { cellWidth: 'auto' }
      }
    });

    // ── Footer on every page ───────────────────────────────
    var pages = doc.internal.getNumberOfPages();
    for (var i = 1; i <= pages; i++) {
      doc.setPage(i);
      setDraw(BRAND.gray200); doc.setLineWidth(0.5);
      doc.line(MARGIN, PAGE_H - 46, PAGE_W - MARGIN, PAGE_H - 46);
      doc.setFont(BRAND.font, 'normal'); doc.setFontSize(7.5);
      setText(BRAND.gray400);
      doc.text(BRAND.tagline, MARGIN, PAGE_H - 32);
      doc.text(BRAND.site, PAGE_W - MARGIN, PAGE_H - 32, { align: 'right' });
    }

    return doc;
  }

  /** Filename per reference_pdf_naming_convention. */
  function filenameFor(athlete) {
    var subject = ((athlete.first_name || '') + (athlete.last_name || '')).replace(/[^A-Za-z0-9]/g, '');
    return 'Godspeed_TrainingStatement_' + (subject || 'Athlete') + '_' +
           new Date().toISOString().slice(0, 10) + '_v1.pdf';
  }

  async function generate(athleteId, opts) {
    opts = opts || {};
    if (!window.jspdf || !window.jspdf.jsPDF) throw new Error('jsPDF not loaded. Include the CDN script before calling generate().');
    var data = await fetchStatementData(athleteId);
    var doc = buildPDF(data);
    var filename = filenameFor(data.athlete);
    if (opts.download !== false) doc.save(filename);
    var out = { filename: filename, data: data };
    if (opts.returnBlob === true) out.blob = doc.output('blob');
    return out;
  }

  return { generate: generate, fetchStatementData: fetchStatementData, buildPDF: buildPDF, filenameFor: filenameFor };
})();
