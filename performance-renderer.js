/**
 * performance-renderer.js  (V4)
 *
 * Matches the parent portal design language:
 *   - Full-width cards with left colored accent border
 *   - Uppercase bold section headers outside cards
 *   - Flat status pills, clean label:value rows
 *   - Inter font, #F2F2F7 background
 *   - No emojis, no decorative icons
 */
(function () {
  'use strict';

  var CATEGORIES = [
    { key: 'effort_energy',              label: 'Effort & Energy' },
    { key: 'competitiveness',            label: 'Competitiveness' },
    { key: 'on_ball_defense',            label: 'On-Ball Defense' },
    { key: 'help_side_rotations',        label: 'Help-Side & Rotations' },
    { key: 'listening_coachability',     label: 'Listening & Coachability' },
    { key: 'communication_leadership',   label: 'Communication & Leadership' },
    { key: 'offense_shooting',           label: 'Offense & Shooting' },
  ];

  var TIERS = [
    { min: 9.0, label: 'Elite',       color: '#059669', bg: '#ecfdf5', accent: '#059669' },
    { min: 8.0, label: 'Rotation',    color: '#2563eb', bg: '#eff6ff', accent: '#2563eb' },
    { min: 7.0, label: 'Development', color: '#d97706', bg: '#fffbeb', accent: '#d97706' },
    { min: 6.0, label: 'Limited',     color: '#ea580c', bg: '#fff7ed', accent: '#ea580c' },
    { min: 0,   label: 'Needs Work',  color: '#dc2626', bg: '#fef2f2', accent: '#dc2626' },
  ];

  function tier(avg) {
    if (avg == null) return TIERS[4];
    for (var i = 0; i < TIERS.length; i++) { if (avg >= TIERS[i].min) return TIERS[i]; }
    return TIERS[4];
  }

  function sc(v) {
    if (v >= 9.0) return '#059669';
    if (v >= 8.0) return '#2563eb';
    if (v >= 7.0) return '#d97706';
    if (v >= 6.0) return '#ea580c';
    return '#dc2626';
  }

  function trendOf(grades) {
    if (!grades || grades.length < 2) return { label: 'New', color: '#6b7280' };
    var s = grades.slice().sort(function(a,b){ return new Date(a.session_date) - new Date(b.session_date); });
    var n = s.length;
    var r = s.slice(Math.max(0,n-2));
    var e = s.slice(0, Math.min(2,n));
    var ar = r.reduce(function(x,g){ return x+parseFloat(g.weighted_average); },0)/r.length;
    var ae = e.reduce(function(x,g){ return x+parseFloat(g.weighted_average); },0)/e.length;
    var d = ar - ae;
    if (d > 0.3) return { label: 'Improving', color: '#059669' };
    if (d < -0.3) return { label: 'Declining', color: '#dc2626' };
    return { label: 'Steady', color: '#d97706' };
  }

  function fd(s) {
    if (!s) return '';
    var d = new Date(s + 'T12:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  // Ring gauge SVG
  function ring(score, t) {
    var pct = Math.min(100, (score / 10) * 100);
    var r = 52, sw = 8, c = 2 * Math.PI * r;
    var dash = (pct / 100) * c, gap = c - dash;
    var sz = (r + sw) * 2;
    return '<svg width="'+sz+'" height="'+sz+'" viewBox="0 0 '+sz+' '+sz+'">' +
      '<circle cx="'+(sz/2)+'" cy="'+(sz/2)+'" r="'+r+'" fill="none" stroke="#e5e7eb" stroke-width="'+sw+'"/>' +
      '<circle cx="'+(sz/2)+'" cy="'+(sz/2)+'" r="'+r+'" fill="none" stroke="'+t.accent+'" stroke-width="'+sw+'" ' +
        'stroke-dasharray="'+dash.toFixed(1)+' '+gap.toFixed(1)+'" stroke-linecap="round" ' +
        'transform="rotate(-90 '+(sz/2)+' '+(sz/2)+')" style="transition:stroke-dasharray 0.6s ease;"/>' +
      '<text x="'+(sz/2)+'" y="'+((sz/2)+4)+'" text-anchor="middle" font-size="28" font-weight="900" fill="'+t.color+'" font-family="\'Inter\',\'Helvetica Neue\',sans-serif">'+score.toFixed(1)+'</text>' +
    '</svg>';
  }

  // Card wrapper matching portal: white bg, left accent border
  function card(accentColor, inner) {
    return '<div style="background:white;border-radius:12px;padding:20px 24px;border-left:4px solid '+accentColor+';box-shadow:0 1px 3px rgba(0,0,0,0.04);margin-bottom:12px;">' + inner + '</div>';
  }

  // Flat pill
  function pill(label, color, bg) {
    return '<span style="display:inline-block;padding:3px 10px;border-radius:6px;font-size:0.65rem;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;background:'+bg+';color:'+color+';">'+label+'</span>';
  }

  // ── Client + Athlete Resolution ────────────────────────────────

  function getClient() {
    try {
      return window.auth && typeof window.auth.getSupabaseClient === 'function'
        ? window.auth.getSupabaseClient()
        : (window.supabaseClient || null);
    } catch (_) { return null; }
  }

  async function resolveAthleteId(client) {
    var stored = localStorage.getItem('gba_current_athlete');
    if (stored) return stored;
    var email = localStorage.getItem('gba_user_email');
    var db = (typeof getDB === 'function' ? getDB() : null) || window.GODSPEED_DATA || null;
    if (db && db.roster && email) {
      var m = db.roster.find(function(a){ return a.parentId === email; });
      if (m && m.athleteId) return m.athleteId;
    }
    if (client && email) {
      try {
        var r1 = await client.from('parent_accounts').select('id, athletes(id)').eq('email', email).limit(1).single();
        if (r1.data && r1.data.athletes && r1.data.athletes.length > 0) return r1.data.athletes[0].id;
      } catch (_) {}
    }
    if (client) {
      try {
        var sess = await client.auth.getSession();
        var uid = sess?.data?.session?.user?.id;
        if (uid) {
          var r2 = await client.from('parent_accounts').select('id, athletes:athletes(id)').eq('user_id', uid).limit(1).single();
          if (r2.data && r2.data.athletes && r2.data.athletes.length > 0) return r2.data.athletes[0].id;
        }
      } catch (_) {}
    }
    return null;
  }

  // ── Data Fetching ──────────────────────────────────────────────

  async function fetchPracticeGrades(client, athleteId) {
    var res = await client
      .from('practice_grades')
      .select('*, training_sessions!inner(session_date, title, team_id)')
      .eq('athlete_id', athleteId)
      .order('created_at', { ascending: false });
    if (res.error) { console.error('[Perf] grades error:', res.error.message); return []; }
    return (res.data || []).map(function(row) {
      return Object.assign({}, row, {
        session_date: row.training_sessions?.session_date,
        session_title: row.training_sessions?.title,
        team_id: row.training_sessions?.team_id,
      });
    });
  }

  async function fetchTeamAverages(client, grades) {
    if (!grades || grades.length === 0) return null;
    var ids = [];
    grades.forEach(function(g){ if (ids.indexOf(g.session_id) === -1) ids.push(g.session_id); });
    if (ids.length === 0) return null;
    var res = await client
      .from('practice_grades')
      .select('effort_energy,competitiveness,on_ball_defense,help_side_rotations,listening_coachability,communication_leadership,offense_shooting')
      .in('session_id', ids);
    if (res.error || !res.data || res.data.length === 0) return null;
    var avgs = {};
    CATEGORIES.forEach(function(cat) {
      var vals = res.data.map(function(d){ return parseFloat(d[cat.key]); }).filter(function(v){ return !isNaN(v); });
      avgs[cat.key] = vals.length > 0 ? vals.reduce(function(a,b){ return a+b; },0) / vals.length : 0;
    });
    return avgs;
  }

  async function fetchGameData(client, athleteId) {
    var gamesRes = await client
      .from('player_game_stats')
      .select('*, games!inner(game_date, opponent_name, team_score, opponent_score, result)')
      .eq('athlete_id', athleteId)
      .order('created_at', { ascending: false })
      .limit(10);
    return (gamesRes.data || []).map(function(gs) {
      return {
        game_date: gs.games?.game_date,
        opponent_name: gs.games?.opponent_name,
        team_score: gs.games?.team_score,
        opponent_score: gs.games?.opponent_score,
        result: gs.games?.result,
        points: gs.points, assists: gs.assists,
        rebounds: gs.total_rebounds, steals: gs.steals,
      };
    });
  }

  // ── Rendering ──────────────────────────────────────────────────

  function renderAll(grades, teamAvgs, gameLog) {
    var container = document.getElementById('perf-root');
    if (!container) return;

    var html = '';

    // ── Overall Grade Card ───────────────────────────────────────
    if (grades.length === 0) {
      html += card('#d1d5db',
        '<div style="text-align:center;padding:20px 0;">' +
          '<div style="font-size:1rem;font-weight:700;color:#111;margin-bottom:4px;">No Grades Yet</div>' +
          '<div style="font-size:0.85rem;color:#9ca3af;">Practice grades will appear here after the first graded session.</div>' +
        '</div>'
      );
    } else {
      var avg = grades.reduce(function(s,g){ return s + parseFloat(g.weighted_average); },0) / grades.length;
      var t = tier(avg);
      var tr = trendOf(grades);

      html += '<div style="background:white;border-radius:12px;border-left:4px solid '+t.accent+';box-shadow:0 1px 3px rgba(0,0,0,0.04);margin-bottom:16px;padding:24px;">' +
        '<div style="display:flex;align-items:center;gap:24px;flex-wrap:wrap;">' +
          // Ring
          '<div style="flex-shrink:0;">' + ring(avg, t) + '</div>' +
          // Stats
          '<div style="flex:1;min-width:200px;">' +
            '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">' +
              pill(t.label, t.color, t.bg) +
              '<span style="font-size:0.75rem;font-weight:700;color:'+tr.color+';">'+tr.label+'</span>' +
            '</div>' +
            '<div style="display:flex;gap:24px;">' +
              '<div>' +
                '<div style="font-size:0.6rem;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;">Overall</div>' +
                '<div style="font-size:1.5rem;font-weight:900;color:'+t.color+';">'+avg.toFixed(1)+'</div>' +
              '</div>' +
              '<div>' +
                '<div style="font-size:0.6rem;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;">Practices</div>' +
                '<div style="font-size:1.5rem;font-weight:900;color:#111;">'+grades.length+'</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

      // ── Skill Breakdown ──────────────────────────────────────────
      html += '<h3 style="font-family:\'Inter\',sans-serif;font-weight:800;font-size:0.85rem;color:#111;letter-spacing:0.04em;text-transform:uppercase;margin:0 0 10px 0;">Skill Breakdown</h3>';

      html += '<div style="background:white;border-radius:12px;border-left:4px solid #2563eb;box-shadow:0 1px 3px rgba(0,0,0,0.04);margin-bottom:16px;padding:16px 20px;">';

      // Grid of score tiles: 2 columns on mobile, fills width
      html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 0;">';
      CATEGORIES.forEach(function(cat) {
        var pAvg = grades.reduce(function(s,g){ return s + (parseFloat(g[cat.key]) || 0); },0) / grades.length;
        var tAvg = teamAvgs ? teamAvgs[cat.key] : null;
        var color = sc(pAvg);

        html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-bottom:1px solid #f5f5f5;">' +
          '<div style="font-size:0.8rem;font-weight:600;color:#374151;">' + cat.label + '</div>' +
          '<div style="display:flex;align-items:baseline;gap:8px;">' +
            '<span style="font-size:1rem;font-weight:900;color:'+color+';">'+pAvg.toFixed(1)+'</span>' +
            (tAvg != null ? '<span style="font-size:0.6rem;font-weight:600;color:#b0b8c4;">'+tAvg.toFixed(1)+'</span>' : '') +
          '</div>' +
        '</div>';
      });
      html += '</div></div>';
    }

    // ── Practice History ──────────────────────────────────────────
    if (grades.length > 0) {
      html += '<h3 style="font-family:\'Inter\',sans-serif;font-weight:800;font-size:0.85rem;color:#111;letter-spacing:0.04em;text-transform:uppercase;margin:0 0 10px 0;">Practice History</h3>';

      var sorted = grades.slice().sort(function(a,b){ return new Date(b.session_date) - new Date(a.session_date); });
      sorted.forEach(function(g, idx) {
        var a = parseFloat(g.weighted_average);
        var t = tier(a);
        var dt = fd(g.session_date);
        var title = g.session_title || 'Practice';
        var cid = 'ph-' + idx;

        html += '<div style="background:white;border-radius:12px;border-left:4px solid '+t.accent+';box-shadow:0 1px 3px rgba(0,0,0,0.04);margin-bottom:8px;overflow:hidden;cursor:pointer;" onclick="(function(){var d=document.getElementById(\''+cid+'\');d.style.display=d.style.display===\'none\'?\'block\':\'none\';})()">' +
          // Summary row
          '<div style="display:flex;justify-content:space-between;align-items:center;padding:14px 20px;">' +
            '<div>' +
              '<div style="font-weight:700;font-size:0.9rem;color:#111;">'+title+'</div>' +
              '<div style="font-size:0.7rem;color:#9ca3af;font-weight:500;margin-top:2px;">'+dt+'</div>' +
            '</div>' +
            '<div style="display:flex;align-items:center;gap:12px;">' +
              '<span style="font-size:1.15rem;font-weight:900;color:'+t.color+';">'+a.toFixed(1)+'</span>' +
              pill(t.label, t.color, t.bg) +
            '</div>' +
          '</div>' +
          // Detail (hidden)
          '<div id="'+cid+'" style="display:none;padding:0 20px 16px;border-top:1px solid #f3f4f6;">' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0;">' +
              CATEGORIES.map(function(cat) {
                var v = parseFloat(g[cat.key]) || 0;
                return '<div style="display:flex;justify-content:space-between;padding:8px 8px;border-bottom:1px solid #fafafa;">' +
                  '<span style="font-size:0.78rem;color:#6b7280;font-weight:500;">'+cat.label+'</span>' +
                  '<span style="font-size:0.85rem;font-weight:800;color:'+sc(v)+';">'+v.toFixed(1)+'</span>' +
                '</div>';
              }).join('') +
            '</div>' +
            (g.coach_narrative ? '<div style="margin-top:12px;padding:12px 14px;background:#f8fafc;border-radius:8px;font-size:0.82rem;color:#374151;line-height:1.6;font-weight:500;border-left:3px solid #2563eb;">'+g.coach_narrative+'</div>' : '') +
          '</div>' +
        '</div>';
      });
    }

    // ── Game Results ──────────────────────────────────────────────
    if (gameLog && gameLog.length > 0) {
      html += '<h3 style="font-family:\'Inter\',sans-serif;font-weight:800;font-size:0.85rem;color:#111;letter-spacing:0.04em;text-transform:uppercase;margin:16px 0 10px 0;">Game Results</h3>';

      gameLog.forEach(function(g) {
        var isW = g.result === 'W';
        var isL = g.result === 'L';
        var rc = isW ? '#059669' : isL ? '#dc2626' : '#6b7280';
        var rb = isW ? '#ecfdf5' : isL ? '#fef2f2' : '#f3f4f6';
        var rl = isW ? 'WIN' : isL ? 'LOSS' : 'TIE';
        var accent = isW ? '#059669' : isL ? '#dc2626' : '#d1d5db';
        var hasScore = g.team_score != null && g.opponent_score != null;

        html += '<div style="background:white;border-radius:12px;border-left:4px solid '+accent+';box-shadow:0 1px 3px rgba(0,0,0,0.04);margin-bottom:8px;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;">' +
          '<div>' +
            '<div style="font-weight:700;font-size:0.9rem;color:#111;">'+(g.opponent_name || 'Opponent')+'</div>' +
            '<div style="font-size:0.7rem;color:#9ca3af;font-weight:500;margin-top:2px;">'+fd(g.game_date)+'</div>' +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:14px;">' +
            (hasScore ? '<span style="font-size:1.15rem;font-weight:900;color:#111;letter-spacing:-0.01em;">'+g.team_score+'<span style="color:#d1d5db;font-weight:400;margin:0 2px;">-</span>'+g.opponent_score+'</span>' : '') +
            pill(rl, rc, rb) +
          '</div>' +
        '</div>';
      });
    }

    // ── Coach Notes ───────────────────────────────────────────────
    var withNotes = grades.filter(function(g){ return g.coach_narrative; }).sort(function(a,b){ return new Date(b.session_date) - new Date(a.session_date); });
    if (withNotes.length > 0) {
      html += '<h3 style="font-family:\'Inter\',sans-serif;font-weight:800;font-size:0.85rem;color:#111;letter-spacing:0.04em;text-transform:uppercase;margin:16px 0 10px 0;">Coach Notes</h3>';

      withNotes.slice(0, 5).forEach(function(g) {
        html += '<div style="background:white;border-radius:12px;border-left:4px solid #2563eb;box-shadow:0 1px 3px rgba(0,0,0,0.04);margin-bottom:8px;padding:16px 20px;">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
            '<span style="font-weight:700;font-size:0.85rem;color:#111;">'+(g.session_title || 'Practice')+'</span>' +
            '<span style="font-size:0.7rem;color:#9ca3af;font-weight:600;">'+fd(g.session_date)+'</span>' +
          '</div>' +
          '<p style="font-size:0.85rem;color:#374151;line-height:1.6;margin:0;font-weight:500;">'+g.coach_narrative+'</p>' +
        '</div>';
      });
    }

    container.innerHTML = html;
  }

  // ── Main ───────────────────────────────────────────────────────

  async function loadPerformanceV2() {
    var client = getClient();
    if (!client) { console.log('[Perf] No Supabase client.'); return; }
    var athleteId = await resolveAthleteId(client);
    if (!athleteId) { console.log('[Perf] Could not resolve athlete ID.'); return; }
    console.log('[Perf] Resolved athlete:', athleteId);

    try {
      var results = await Promise.all([
        fetchPracticeGrades(client, athleteId),
        fetchGameData(client, athleteId),
      ]);
      var grades = results[0];
      var gameLog = results[1];
      var teamAvgs = await fetchTeamAverages(client, grades);
      renderAll(grades, teamAvgs, gameLog);
      console.log('[Perf] Rendered ' + grades.length + ' grades, ' + gameLog.length + ' games.');
    } catch (err) {
      console.error('[Perf] Error:', err);
    }
  }

  // ── Init ───────────────────────────────────────────────────────

  window.loadPerformanceV2 = loadPerformanceV2;

  var origSwitch = window.switchPortalView;
  if (origSwitch) {
    window.switchPortalView = function (viewName, linkElement) {
      origSwitch.call(this, viewName, linkElement);
      if (viewName === 'performance') loadPerformanceV2();
    };
  }

  document.addEventListener('liveDataReady', function () {
    var v = document.getElementById('view-performance');
    if (v && v.style.display !== 'none') loadPerformanceV2();
  });

  document.addEventListener('DOMContentLoaded', function () {
    setTimeout(function () {
      var v = document.getElementById('view-performance');
      if (v && v.style.display !== 'none') loadPerformanceV2();
    }, 800);
  });

})();
