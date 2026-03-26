/**
 * GODSPEED BASKETBALL — Training Report PDF Generator
 *
 * Self-contained module that generates branded athlete training
 * reports as downloadable PDFs. Fetches LIVE data from Supabase.
 *
 * USAGE:
 *   1. Include jsPDF + autoTable from CDN in your HTML:
 *      <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.2/jspdf.umd.min.js"></script>
 *      <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js"></script>
 *      <script src="training-report-pdf.js"></script>
 *
 *   2. Call from any page:
 *      GS_TrainingReport.generate('a1000000-0000-0000-0000-000000000006');
 *      GS_TrainingReport.generate('a1000000-...', { download: true });
 *      GS_TrainingReport.generate('a1000000-...', { returnBlob: true });
 *
 * REQUIRES:
 *   - Supabase client: window.auth?.getSupabaseClient() or window.supabaseClient
 *   - jsPDF 2.5+ loaded globally (window.jspdf)
 *   - jsPDF-AutoTable 3.8+ loaded globally
 *
 * DATA SOURCES:
 *   - athletes (profile info)
 *   - training_sessions + training_attendance (session log)
 *   - games + player_game_stats (game performance)
 *   - player_evaluations (skill assessment)
 *   - team_rosters (role)
 *   - training_hours_summary (purchased vs used hours)
 */

window.GS_TrainingReport = (function () {
  'use strict';

  // ── Brand Constants ─────────────────────────────────────
  const BRAND = {
    black:    '#0a0a0a',
    blue:     '#2563eb',
    red:      '#dc2626',
    green:    '#16a34a',
    gray500:  '#6b7280',
    gray200:  '#e5e7eb',
    gray50:   '#f9fafb',
    tagline:  'BROTHERHOOD. HABITS. SUCCESS.',
    program:  'GODSPEED BASKETBALL',
    font:     'helvetica', // jsPDF built-in; closest to Helvetica Neue
  };

  // ── Supabase Client Accessor ────────────────────────────
  function getClient() {
    try {
      if (window.auth && typeof window.auth.getSupabaseClient === 'function') {
        return window.auth.getSupabaseClient();
      }
      if (window.supabaseClient) return window.supabaseClient;
      // Fallback: check for globally initialized client
      if (window._supabase) return window._supabase;
      return null;
    } catch (_) {
      return null;
    }
  }

  // ── Data Fetcher ────────────────────────────────────────
  async function fetchAthleteData(athleteId) {
    const client = getClient();
    if (!client) throw new Error('No Supabase client available. Ensure auth is initialized.');

    const [
      athleteRes,
      rosterRes,
      sessionsRes,
      attendanceRes,
      gamesRes,
      statsRes,
      evalRes,
      hoursRes,
    ] = await Promise.all([
      client.from('athletes').select('*').eq('id', athleteId).single(),
      client.from('team_rosters').select('*, teams(name, age_group, head_coach, season)').eq('athlete_id', athleteId),
      // Get all sessions for the athlete — includes session date, start_time, duration
      client.from('training_attendance').select('*, training_sessions(*)').eq('athlete_id', athleteId).order('created_at', { ascending: false }),
      // Total sessions for attendance % (team-wide)
      client.from('training_sessions').select('id, session_date, session_type, title, start_time, end_time, duration_minutes').order('session_date', { ascending: false }).limit(100),
      client.from('games').select('*').order('game_date', { ascending: false }).limit(50),
      client.from('player_game_stats').select('*').eq('athlete_id', athleteId),
      client.from('player_evaluations').select('*').eq('athlete_id', athleteId).order('evaluation_date', { ascending: false }).limit(1),
      // Training hours package (purchased vs used)
      client.from('training_hours_summary').select('*').eq('athlete_id', athleteId).maybeSingle(),
    ]);

    if (athleteRes.error) throw new Error('Failed to fetch athlete: ' + athleteRes.error.message);

    const athlete = athleteRes.data;
    const roster = rosterRes.data || [];
    const myAttendance = sessionsRes.data || [];
    const allSessions = attendanceRes.data || [];
    const games = gamesRes.data || [];
    const myGameStats = statsRes.data || [];
    const evaluation = evalRes.data?.[0] || null;
    const hoursData = hoursRes.data || null; // { hours_purchased, hours_used, hours_remaining }

    // Build game lookup
    const gameMap = {};
    games.forEach(g => { gameMap[g.id] = g; });

    // Enrich game stats with game info
    const enrichedStats = myGameStats.map(s => ({
      ...s,
      game: gameMap[s.game_id] || null,
    })).filter(s => s.game).sort((a, b) => {
      return new Date(b.game.game_date) - new Date(a.game.game_date);
    });

    // Compute attendance stats
    // Count distinct team sessions from allSessions that match the athlete's team
    const teamId = roster[0]?.team_id;
    const teamSessions = teamId
      ? allSessions.filter(s => s.team_id === teamId || !s.team_id)
      : allSessions;

    const attended = myAttendance.filter(a => a.status === 'present' || a.status === 'late');

    // Compute hours used from attendance durations when view is unavailable
    let hoursUsedCalc = 0;
    attended.forEach(a => {
      const s = a.training_sessions;
      if (s && s.duration_minutes) {
        hoursUsedCalc += s.duration_minutes / 60;
      }
    });

    return {
      athlete,
      roster,
      attendance: myAttendance,
      totalTeamSessions: Math.max(teamSessions.length, myAttendance.length),
      sessionsAttended: attended.length,
      enrichedStats,
      evaluation,
      hoursData,
      hoursUsedCalc,
    };
  }

  // ── PDF Builder ─────────────────────────────────────────
  function buildPDF(data) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });

    const PAGE_W = doc.internal.pageSize.getWidth();   // 612
    const PAGE_H = doc.internal.pageSize.getHeight();   // 792
    const MARGIN = 40;
    const CONTENT_W = PAGE_W - MARGIN * 2;

    let curY = 0;

    const { athlete, roster, attendance, totalTeamSessions, sessionsAttended, enrichedStats, evaluation, hoursData, hoursUsedCalc } = data;
    const teamInfo = roster[0]?.teams || {};
    const role = roster[0]?.role || 'rotation';
    const reportDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    // ── Helper: Check page break ──────────────────────────
    function checkPageBreak(needed) {
      if (curY + needed > PAGE_H - 60) {
        doc.addPage();
        curY = MARGIN;
        return true;
      }
      return false;
    }

    // ── Helper: Section header ────────────────────────────
    function sectionHeader(title) {
      checkPageBreak(40);
      curY += 16;
      doc.setFillColor(245, 247, 250);
      doc.rect(MARGIN, curY - 2, CONTENT_W, 22, 'F');
      doc.setFont(BRAND.font, 'bold');
      doc.setFontSize(10);
      doc.setTextColor(BRAND.black);
      doc.text(title.toUpperCase(), MARGIN + 8, curY + 13);
      curY += 30;
    }

    // ── Header Bar ────────────────────────────────────────
    doc.setFillColor(10, 10, 10);
    doc.rect(0, 0, PAGE_W, 56, 'F');
    doc.setFont(BRAND.font, 'bold');
    doc.setFontSize(16);
    doc.setTextColor(255, 255, 255);
    doc.text('GODSPEED', MARGIN, 36);
    doc.setTextColor(37, 99, 235); // blue
    doc.text('BASKETBALL', MARGIN + doc.getTextWidth('GODSPEED') + 4, 36);
    doc.setFont(BRAND.font, 'normal');
    doc.setFontSize(10);
    doc.setTextColor(156, 163, 175);
    doc.text('TRAINING REPORT', PAGE_W - MARGIN, 28, { align: 'right' });
    doc.setFontSize(8);
    doc.text(reportDate, PAGE_W - MARGIN, 42, { align: 'right' });
    curY = 76;

    // ── Athlete Info Block ─────────────────────────────────
    doc.setFillColor(249, 250, 251);
    doc.roundedRect(MARGIN, curY, CONTENT_W, 64, 4, 4, 'F');
    doc.setDrawColor(229, 231, 235);
    doc.roundedRect(MARGIN, curY, CONTENT_W, 64, 4, 4, 'S');

    // Name
    doc.setFont(BRAND.font, 'bold');
    doc.setFontSize(18);
    doc.setTextColor(BRAND.black);
    const displayName = athlete.first_name + ' ' + athlete.last_name;
    doc.text(displayName, MARGIN + 14, curY + 26);

    // Details row
    doc.setFont(BRAND.font, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(107, 114, 128);
    const details = [
      athlete.jersey_number != null ? '#' + athlete.jersey_number : '',
      athlete.position || '',
      role.charAt(0).toUpperCase() + role.slice(1),
      teamInfo.name || athlete.team_name || '',
      athlete.season || teamInfo.season || '',
    ].filter(Boolean).join('   |   ');
    doc.text(details, MARGIN + 14, curY + 46);

    curY += 80;

    // ── Training Hours Summary ─────────────────────────────
    sectionHeader('Training Hours');

    const hoursPurchased = hoursData && hoursData.hours_purchased != null
      ? parseFloat(hoursData.hours_purchased).toFixed(1)
      : 'N/A';
    const hoursUsed = hoursData && hoursData.hours_used != null
      ? parseFloat(hoursData.hours_used).toFixed(1)
      : hoursUsedCalc > 0 ? hoursUsedCalc.toFixed(1) : 'N/A';
    const hoursRemaining = hoursData && hoursData.hours_remaining != null
      ? parseFloat(hoursData.hours_remaining).toFixed(1)
      : 'N/A';

    const hoursItems = [
      { label: 'Hours Purchased', value: hoursPurchased },
      { label: 'Hours Used', value: hoursUsed },
      { label: 'Hours Remaining', value: hoursRemaining },
    ];

    const hoursCardW = (CONTENT_W - 16) / 3;
    hoursItems.forEach((item, i) => {
      const x = MARGIN + i * (hoursCardW + 8);
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(229, 231, 235);
      doc.roundedRect(x, curY, hoursCardW, 48, 3, 3, 'FD');
      doc.setFont(BRAND.font, 'normal');
      doc.setFontSize(8);
      doc.setTextColor(107, 114, 128);
      doc.text(item.label.toUpperCase(), x + 8, curY + 16);
      doc.setFont(BRAND.font, 'bold');
      doc.setFontSize(16);
      doc.setTextColor(BRAND.black);
      doc.text(item.value, x + 8, curY + 38);
    });
    curY += 62;

    // ── Attendance Summary ─────────────────────────────────
    sectionHeader('Attendance Summary');

    const attendPct = totalTeamSessions > 0
      ? Math.round((sessionsAttended / totalTeamSessions) * 100)
      : 0;
    const avgEffort = attendance.length > 0
      ? (attendance.reduce((s, a) => s + (a.effort_rating || 0), 0) / attendance.length).toFixed(1)
      : 'N/A';

    const summaryItems = [
      { label: 'Sessions Attended', value: String(sessionsAttended) },
      { label: 'Total Team Sessions', value: String(totalTeamSessions) },
      { label: 'Attendance Rate', value: attendPct + '%' },
      { label: 'Avg Effort Rating', value: avgEffort + ' / 5' },
    ];

    const cardW = (CONTENT_W - 24) / 4;
    summaryItems.forEach((item, i) => {
      const x = MARGIN + i * (cardW + 8);
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(229, 231, 235);
      doc.roundedRect(x, curY, cardW, 48, 3, 3, 'FD');
      doc.setFont(BRAND.font, 'normal');
      doc.setFontSize(8);
      doc.setTextColor(107, 114, 128);
      doc.text(item.label.toUpperCase(), x + 8, curY + 16);
      doc.setFont(BRAND.font, 'bold');
      doc.setFontSize(16);
      doc.setTextColor(BRAND.black);
      doc.text(item.value, x + 8, curY + 38);
    });
    curY += 62;

    // ── Training Session Log ──────────────────────────────
    if (attendance.length > 0) {
      sectionHeader('Training Session Log');

      // Helper: format time from HH:MM:SS or null -> "3:00 PM" or "N/A"
      function fmtTime(timeStr) {
        if (!timeStr) return 'N/A';
        try {
          const [h, m] = timeStr.split(':').map(Number);
          const ampm = h >= 12 ? 'PM' : 'AM';
          const h12 = h % 12 || 12;
          return h12 + ':' + String(m).padStart(2, '0') + ' ' + ampm;
        } catch (_) { return 'N/A'; }
      }

      // Helper: format duration
      function fmtDuration(minutes) {
        if (!minutes) return 'N/A';
        const hrs = Math.floor(minutes / 60);
        const mins = minutes % 60;
        if (hrs > 0 && mins > 0) return hrs + 'h ' + mins + 'm';
        if (hrs > 0) return hrs + 'h';
        return mins + 'm';
      }

      const sessionRows = attendance
        .filter(a => a.training_sessions)
        .sort((a, b) => new Date(b.training_sessions.session_date) - new Date(a.training_sessions.session_date))
        .map(a => {
          const s = a.training_sessions;
          const sr = a.skill_ratings || {};
          const sessionDate = s.session_date
            ? new Date(s.session_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : 'N/A';
          const sessionTime = fmtTime(s.start_time);
          const duration = fmtDuration(s.duration_minutes);
          const sessionType = (s.session_type || '').replace(/_/g, ' ');
          return [
            sessionDate,
            sessionTime,
            s.title || sessionType,
            duration,
            a.effort_rating ? a.effort_rating + '/5' : '--',
            sr.focus ? sr.focus + '/10' : '--',
            sr.hustle ? sr.hustle + '/10' : '--',
            sr.iq ? sr.iq + '/10' : '--',
          ];
        });

      if (sessionRows.length > 0) {
        doc.autoTable({
          startY: curY,
          margin: { left: MARGIN, right: MARGIN },
          head: [['Date', 'Time', 'Session', 'Duration', 'Effort', 'Focus', 'Hustle', 'IQ']],
          body: sessionRows,
          styles: {
            font: BRAND.font,
            fontSize: 8,
            cellPadding: 5,
            lineColor: [229, 231, 235],
            lineWidth: 0.5,
          },
          headStyles: {
            fillColor: [10, 10, 10],
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 7,
          },
          alternateRowStyles: {
            fillColor: [249, 250, 251],
          },
          columnStyles: {
            0: { cellWidth: 70 },
            1: { cellWidth: 52 },
            2: { cellWidth: 'auto' },
            3: { cellWidth: 46, halign: 'center' },
            4: { cellWidth: 38, halign: 'center' },
            5: { cellWidth: 38, halign: 'center' },
            6: { cellWidth: 40, halign: 'center' },
            7: { cellWidth: 36, halign: 'center' },
          },
        });
        curY = doc.lastAutoTable.finalY + 8;
      }
    }

    // ── Coach Notes Per Session ────────────────────────────
    const notedSessions = attendance
      .filter(a => a.coach_notes && a.training_sessions)
      .sort((a, b) => new Date(b.training_sessions.session_date) - new Date(a.training_sessions.session_date));

    if (notedSessions.length > 0) {
      sectionHeader('Coach Notes (Training)');

      notedSessions.forEach(a => {
        checkPageBreak(36);
        const s = a.training_sessions;
        const d = new Date(s.session_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        doc.setFont(BRAND.font, 'bold');
        doc.setFontSize(8);
        doc.setTextColor(BRAND.black);
        doc.text(d + ' - ' + (s.title || s.session_type.replace(/_/g, ' ')), MARGIN, curY);
        curY += 12;
        doc.setFont(BRAND.font, 'normal');
        doc.setFontSize(8);
        doc.setTextColor(75, 85, 99);
        const lines = doc.splitTextToSize(a.coach_notes, CONTENT_W - 8);
        doc.text(lines, MARGIN + 4, curY);
        curY += lines.length * 11 + 6;
      });
    }

    // ── Skill Evaluation ──────────────────────────────────
    if (evaluation) {
      checkPageBreak(200);
      sectionHeader('Skill Evaluation (' + new Date(evaluation.evaluation_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) + ')');

      const skills = [
        ['Ball Handling', evaluation.ball_handling],
        ['Shooting Form', evaluation.shooting_form],
        ['Mid-Range', evaluation.mid_range],
        ['Three-Point', evaluation.three_point],
        ['Free Throw', evaluation.free_throw],
        ['Finishing', evaluation.finishing],
        ['Passing', evaluation.passing],
        ['Court Vision', evaluation.court_vision],
        ['Defensive Stance', evaluation.defensive_stance],
        ['Lateral Quickness', evaluation.lateral_quickness],
        ['Rebounding', evaluation.rebounding],
        ['Basketball IQ', evaluation.basketball_iq],
        ['Leadership', evaluation.leadership],
        ['Effort', evaluation.effort],
        ['Coachability', evaluation.coachability],
      ].filter(([, v]) => v != null);

      // Draw skill bars
      const barW = 180;
      const barH = 12;
      const colW = CONTENT_W / 2;
      const leftCol = skills.slice(0, 8);
      const rightCol = skills.slice(8);

      [leftCol, rightCol].forEach((col, colIdx) => {
        col.forEach(([label, value], rowIdx) => {
          const x = MARGIN + colIdx * colW;
          const y = curY + rowIdx * 22;
          checkPageBreak(26);

          // Label
          doc.setFont(BRAND.font, 'normal');
          doc.setFontSize(8);
          doc.setTextColor(75, 85, 99);
          doc.text(label, x, y + 9);

          // Bar background
          const barX = x + 100;
          doc.setFillColor(229, 231, 235);
          doc.roundedRect(barX, y, barW, barH, 2, 2, 'F');

          // Bar fill
          const fillW = (value / 10) * barW;
          const color = value >= 7 ? [22, 163, 74] : value >= 5 ? [37, 99, 235] : [234, 88, 12];
          doc.setFillColor(...color);
          doc.roundedRect(barX, y, Math.max(fillW, 4), barH, 2, 2, 'F');

          // Score
          doc.setFont(BRAND.font, 'bold');
          doc.setFontSize(8);
          doc.setTextColor(255, 255, 255);
          if (fillW > 20) {
            doc.text(String(value), barX + fillW - 14, y + 9);
          } else {
            doc.setTextColor(BRAND.black);
            doc.text(String(value), barX + fillW + 4, y + 9);
          }
        });
      });

      curY += Math.max(leftCol.length, rightCol.length) * 22 + 10;

      // Overall Rating
      if (evaluation.overall_rating) {
        checkPageBreak(36);
        doc.setFillColor(10, 10, 10);
        doc.roundedRect(MARGIN, curY, CONTENT_W, 32, 4, 4, 'F');
        doc.setFont(BRAND.font, 'bold');
        doc.setFontSize(10);
        doc.setTextColor(255, 255, 255);
        doc.text('OVERALL RATING', MARGIN + 12, curY + 20);
        doc.setFontSize(16);
        doc.text(parseFloat(evaluation.overall_rating).toFixed(1) + ' / 10', PAGE_W - MARGIN - 12, curY + 22, { align: 'right' });
        curY += 44;
      }

      // Strengths
      if (evaluation.strengths) {
        checkPageBreak(60);
        curY += 8;
        doc.setFont(BRAND.font, 'bold');
        doc.setFontSize(9);
        doc.setTextColor(22, 163, 74);
        doc.text('STRENGTHS', MARGIN, curY);
        curY += 14;
        doc.setFont(BRAND.font, 'normal');
        doc.setFontSize(8);
        doc.setTextColor(55, 65, 81);
        const sLines = doc.splitTextToSize(evaluation.strengths, CONTENT_W - 8);
        doc.text(sLines, MARGIN + 4, curY);
        curY += sLines.length * 11 + 8;
      }

      // Areas to Improve
      if (evaluation.areas_to_improve) {
        checkPageBreak(60);
        doc.setFont(BRAND.font, 'bold');
        doc.setFontSize(9);
        doc.setTextColor(234, 88, 12);
        doc.text('AREAS FOR DEVELOPMENT', MARGIN, curY);
        curY += 14;
        doc.setFont(BRAND.font, 'normal');
        doc.setFontSize(8);
        doc.setTextColor(55, 65, 81);
        const aLines = doc.splitTextToSize(evaluation.areas_to_improve, CONTENT_W - 8);
        doc.text(aLines, MARGIN + 4, curY);
        curY += aLines.length * 11 + 8;
      }

      // Coach Comments
      if (evaluation.coach_comments) {
        checkPageBreak(60);
        doc.setFont(BRAND.font, 'bold');
        doc.setFontSize(9);
        doc.setTextColor(37, 99, 235);
        doc.text('COACH ASSESSMENT', MARGIN, curY);
        curY += 14;
        doc.setFont(BRAND.font, 'italic');
        doc.setFontSize(8);
        doc.setTextColor(55, 65, 81);
        const cLines = doc.splitTextToSize('"' + evaluation.coach_comments + '"', CONTENT_W - 8);
        doc.text(cLines, MARGIN + 4, curY);
        curY += cLines.length * 11 + 8;
      }
    }

    // ── Footer (every page) ───────────────────────────────
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      // Divider
      doc.setDrawColor(229, 231, 235);
      doc.line(MARGIN, PAGE_H - 40, PAGE_W - MARGIN, PAGE_H - 40);
      // Tagline
      doc.setFont(BRAND.font, 'normal');
      doc.setFontSize(7);
      doc.setTextColor(156, 163, 175);
      doc.text(BRAND.tagline, MARGIN, PAGE_H - 26);
      // Page number
      doc.text('Page ' + i + ' of ' + totalPages, PAGE_W - MARGIN, PAGE_H - 26, { align: 'right' });
      // Generated timestamp
      doc.setFontSize(6);
      doc.text('Generated ' + new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC', MARGIN, PAGE_H - 16);
    }

    return doc;
  }

  // ── Public API ──────────────────────────────────────────

  /**
   * Generate and optionally download a training report PDF.
   *
   * @param {string} athleteId - UUID of the athlete
   * @param {Object} [opts]
   * @param {boolean} [opts.download=true]    - Auto-download the PDF
   * @param {boolean} [opts.returnBlob=false] - Return a Blob (for email attachment)
   * @param {function} [opts.onProgress]      - Progress callback('fetching'|'building'|'done')
   * @returns {Promise<{blob?: Blob, filename: string}>}
   */
  async function generate(athleteId, opts) {
    opts = opts || {};
    const download = opts.download !== false;
    const returnBlob = opts.returnBlob === true;
    const onProgress = opts.onProgress || function () {};

    if (!window.jspdf || !window.jspdf.jsPDF) {
      throw new Error('jsPDF not loaded. Include the CDN script before calling generate().');
    }

    // Fetch data
    onProgress('fetching');
    const data = await fetchAthleteData(athleteId);

    // Build PDF
    onProgress('building');
    const doc = buildPDF(data);

    const filename = (data.athlete.first_name + '_' + data.athlete.last_name + '_Training_Report_' +
      new Date().toISOString().slice(0, 10) + '.pdf').replace(/\s+/g, '_');

    const result = { filename };

    if (download) {
      doc.save(filename);
    }

    if (returnBlob) {
      result.blob = doc.output('blob');
    }

    onProgress('done');
    return result;
  }

  /**
   * Get all athletes visible to the current user (for dropdowns).
   * Coaches see all; parents see their own.
   */
  async function getAthletes() {
    const client = getClient();
    if (!client) return [];

    const { data, error } = await client
      .from('athletes')
      .select('id, first_name, last_name, jersey_number, position, team_name, enrollment_status')
      .eq('enrollment_status', 'active')
      .order('first_name');

    if (error) {
      console.error('[TrainingReport] Failed to fetch athletes:', error.message);
      return [];
    }
    return data || [];
  }

  return {
    generate,
    getAthletes,
    fetchAthleteData,
    buildPDF,
  };
})();
