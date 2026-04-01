/**
 * performance-renderer.js  (V3 — visual-first redesign)
 *
 * Renders practice grading + game data into the parent portal.
 * Designed so a 6th-grader can glance at it and immediately know
 * "am I doing great or do I need to lock in?"
 *
 * Visual system:
 *   - Large SVG ring gauge for overall score
 *   - Color-coded rounded bars (green/blue/amber/red)
 *   - Expandable practice cards (tap to reveal detail)
 *   - Game result cards with big scores
 */
(function () {
  'use strict';

  // ── Constants ──────────────────────────────────────────────────

  const CATEGORIES = [
    { key: 'effort_energy',              label: 'Effort & Energy',           short: 'Effort',     icon: '🔥', weight: 0.20 },
    { key: 'competitiveness',            label: 'Competitiveness',           short: 'Compete',    icon: '⚔️', weight: 0.20 },
    { key: 'on_ball_defense',            label: 'On-Ball Defense',           short: 'Defense',    icon: '🛡️', weight: 0.15 },
    { key: 'help_side_rotations',        label: 'Help-Side & Rotations',    short: 'Rotations',  icon: '🔄', weight: 0.15 },
    { key: 'listening_coachability',     label: 'Listening & Coachability',  short: 'Coachable',  icon: '👂', weight: 0.15 },
    { key: 'communication_leadership',   label: 'Communication & Leadership',short: 'Leadership', icon: '📣', weight: 0.10 },
    { key: 'offense_shooting',           label: 'Offense & Shooting',        short: 'Offense',    icon: '🏀', weight: 0.05 },
  ];

  const TIER_MAP = [
    { min: 9.0, label: 'Elite',        color: '#059669', bg: '#ecfdf5', ring: '#059669' },
    { min: 8.0, label: 'Rotation',     color: '#2563eb', bg: '#eff6ff', ring: '#2563eb' },
    { min: 7.0, label: 'Development',  color: '#d97706', bg: '#fffbeb', ring: '#d97706' },
    { min: 6.0, label: 'Limited',      color: '#ea580c', bg: '#fff7ed', ring: '#ea580c' },
    { min: 0,   label: 'Needs Work',   color: '#dc2626', bg: '#fef2f2', ring: '#dc2626' },
  ];

  function tierInfo(avg) {
    if (avg == null) return TIER_MAP[4];
    for (const t of TIER_MAP) { if (avg >= t.min) return t; }
    return TIER_MAP[4];
  }

  function scoreColor(v) {
    if (v >= 9.0) return '#059669';
    if (v >= 8.0) return '#2563eb';
    if (v >= 7.0) return '#d97706';
    if (v >= 6.0) return '#ea580c';
    return '#dc2626';
  }

  function trendInfo(grades) {
    if (!grades || grades.length < 2) return { label: 'New', icon: '✦', color: '#6b7280' };
    var sorted = grades.slice().sort(function(a,b){ return new Date(a.session_date) - new Date(b.session_date); });
    var len = sorted.length;
    var recent = sorted.slice(Math.max(0, len - 2));
    var earlier = sorted.slice(0, Math.min(2, len));
    var avgR = recent.reduce(function(s,g){ return s + parseFloat(g.weighted_average); }, 0) / recent.length;
    var avgE = earlier.reduce(function(s,g){ return s + parseFloat(g.weighted_average); }, 0) / earlier.length;
    var diff = avgR - avgE;
    if (diff > 0.3) return { label: 'Going Up', icon: '↑', color: '#059669' };
    if (diff < -0.3) return { label: 'Dipping', icon: '↓', color: '#dc2626' };
    return { label: 'Steady', icon: '→', color: '#d97706' };
  }

  function fmtDate(s) {
    if (!s) return '';
    var d = new Date(s + 'T12:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  // ── SVG Ring Gauge ─────────────────────────────────────────────

  function ringGaugeSVG(score, tier) {
    var pct = Math.min(100, (score / 10) * 100);
    var radius = 58;
    var stroke = 10;
    var circ = 2 * Math.PI * radius;
    var dash = (pct / 100) * circ;
    var gap = circ - dash;
    var size = (radius + stroke) * 2;

    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" style="display:block;margin:0 auto;">' +
      '<circle cx="' + (size/2) + '" cy="' + (size/2) + '" r="' + radius + '" fill="none" stroke="#f3f4f6" stroke-width="' + stroke + '"/>' +
      '<circle cx="' + (size/2) + '" cy="' + (size/2) + '" r="' + radius + '" fill="none" stroke="' + tier.ring + '" stroke-width="' + stroke + '" ' +
        'stroke-dasharray="' + dash.toFixed(1) + ' ' + gap.toFixed(1) + '" stroke-linecap="round" ' +
        'transform="rotate(-90 ' + (size/2) + ' ' + (size/2) + ')" style="transition:stroke-dasharray 0.8s ease;"/>' +
      '<text x="' + (size/2) + '" y="' + (size/2 - 6) + '" text-anchor="middle" font-size="32" font-weight="900" fill="' + tier.color + '" font-family="Inter,Helvetica Neue,sans-serif">' + score.toFixed(1) + '</text>' +
      '<text x="' + (size/2) + '" y="' + (size/2 + 16) + '" text-anchor="middle" font-size="12" font-weight="700" fill="#9ca3af" font-family="Inter,Helvetica Neue,sans-serif" letter-spacing="0.08em">OUT OF 10</text>' +
    '</svg>';
  }

  // ── Supabase Client ────────────────────────────────────────────

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
      var match = db.roster.find(function(a){ return a.parentId === email; });
      if (match && match.athleteId) return match.athleteId;
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
      avgs[cat.key] = vals.length > 0 ? vals.reduce(function(a,b){ return a+b; }, 0) / vals.length : 0;
    });
    return avgs;
  }

  async function fetchGameData(client, athleteId) {
    var statsRes = await client.from('player_season_stats').select('*').eq('athlete_id', athleteId).maybeSingle();
    var gamesRes = await client
      .from('player_game_stats')
      .select('*, games!inner(game_date, opponent_name, team_score, opponent_score, result)')
      .eq('athlete_id', athleteId)
      .order('created_at', { ascending: false })
      .limit(10);

    var gameLog = (gamesRes.data || []).map(function(gs) {
      return {
        game_date: gs.games?.game_date,
        opponent_name: gs.games?.opponent_name,
        team_score: gs.games?.team_score,
        opponent_score: gs.games?.opponent_score,
        result: gs.games?.result,
        points: gs.points,
        assists: gs.assists,
        rebounds: gs.total_rebounds,
        steals: gs.steals,
      };
    });
    return { seasonStats: statsRes.data, gameLog: gameLog };
  }

  // ── Rendering ──────────────────────────────────────────────────

  function renderHero(grades) {
    var container = document.getElementById('perf-hero');
    if (!container) return;

    if (grades.length === 0) {
      container.innerHTML =
        '<div style="text-align:center;padding:40px 20px;">' +
          '<div style="font-size:48px;margin-bottom:12px;">📋</div>' +
          '<div style="font-size:1.1rem;font-weight:700;color:#111;margin-bottom:4px;">No Grades Yet</div>' +
          '<div style="font-size:0.85rem;color:#9ca3af;">Practice grades will show up here after the first graded session.</div>' +
        '</div>';
      return;
    }

    var avg = grades.reduce(function(s,g){ return s + parseFloat(g.weighted_average); }, 0) / grades.length;
    var tier = tierInfo(avg);
    var trend = trendInfo(grades);

    container.innerHTML =
      // Ring gauge
      '<div style="padding:28px 0 20px;">' + ringGaugeSVG(avg, tier) + '</div>' +

      // Tier pill
      '<div style="text-align:center;margin-bottom:16px;">' +
        '<span style="display:inline-block;padding:5px 16px;border-radius:20px;font-size:0.75rem;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;' +
        'background:' + tier.bg + ';color:' + tier.color + ';">' + tier.label + '</span>' +
      '</div>' +

      // Trend + count row
      '<div style="display:flex;justify-content:center;gap:24px;padding-bottom:4px;">' +
        '<div style="text-align:center;">' +
          '<div style="font-size:1.1rem;font-weight:800;color:' + trend.color + ';">' + trend.icon + ' ' + trend.label + '</div>' +
          '<div style="font-size:0.65rem;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;margin-top:2px;">Trend</div>' +
        '</div>' +
        '<div style="width:1px;background:#e5e7eb;"></div>' +
        '<div style="text-align:center;">' +
          '<div style="font-size:1.1rem;font-weight:800;color:#111;">' + grades.length + '</div>' +
          '<div style="font-size:0.65rem;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;margin-top:2px;">Practices</div>' +
        '</div>' +
      '</div>';
  }

  function renderSkillBars(grades, teamAvgs) {
    var container = document.getElementById('perf-skills');
    if (!container) return;

    if (grades.length === 0) {
      container.innerHTML = '';
      return;
    }

    var html = '';
    CATEGORIES.forEach(function(cat) {
      var playerAvg = grades.reduce(function(s,g){ return s + (parseFloat(g[cat.key]) || 0); }, 0) / grades.length;
      var teamAvg = teamAvgs ? (teamAvgs[cat.key] || 0) : null;
      var pct = Math.min(100, (playerAvg / 10) * 100);
      var teamPct = teamAvg ? Math.min(100, (teamAvg / 10) * 100) : 0;
      var color = scoreColor(playerAvg);

      html +=
        '<div style="display:flex;align-items:center;gap:10px;padding:6px 0;">' +
          // Icon
          '<div style="flex-shrink:0;width:28px;text-align:center;font-size:16px;" title="' + cat.label + '">' + cat.icon + '</div>' +
          // Label + bar
          '<div style="flex:1;min-width:0;">' +
            '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px;">' +
              '<span style="font-size:0.8rem;font-weight:700;color:#374151;">' + cat.label + '</span>' +
              '<div style="display:flex;align-items:center;gap:8px;">' +
                '<span style="font-size:0.95rem;font-weight:900;color:' + color + ';">' + playerAvg.toFixed(1) + '</span>' +
                (teamAvg != null ? '<span style="font-size:0.65rem;font-weight:600;color:#b0b8c4;">Team ' + teamAvg.toFixed(1) + '</span>' : '') +
              '</div>' +
            '</div>' +
            // Bar track
            '<div style="position:relative;width:100%;height:6px;background:#f0f1f3;border-radius:3px;overflow:visible;">' +
              '<div style="height:100%;width:' + pct + '%;background:' + color + ';border-radius:3px;transition:width 0.6s ease;"></div>' +
              (teamAvg != null ? '<div style="position:absolute;top:-3px;left:' + teamPct + '%;width:2px;height:12px;background:#cbd5e1;border-radius:1px;" title="Team avg"></div>' : '') +
            '</div>' +
          '</div>' +
        '</div>';
    });

    container.innerHTML = html;
  }

  function renderPracticeCards(grades) {
    var container = document.getElementById('perf-practices');
    if (!container) return;

    var sorted = grades.slice().sort(function(a,b){ return new Date(b.session_date) - new Date(a.session_date); });

    if (sorted.length === 0) {
      container.innerHTML = '<div style="font-size:0.85rem;color:#9ca3af;text-align:center;padding:20px 0;">No practice sessions recorded yet.</div>';
      return;
    }

    var html = '';
    sorted.forEach(function(g, idx) {
      var avg = parseFloat(g.weighted_average);
      var tier = tierInfo(avg);
      var date = fmtDate(g.session_date);
      var title = g.session_title || 'Practice';
      var cardId = 'pcard-' + idx;

      // Summary row (always visible)
      html +=
        '<div style="border-radius:12px;background:white;border:1px solid #f0f1f3;overflow:hidden;cursor:pointer;" onclick="(function(){ var d=document.getElementById(\'' + cardId + '\'); d.style.display = d.style.display===\'none\'?\'block\':\'none\'; })()">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px;">' +
            '<div style="display:flex;align-items:center;gap:10px;">' +
              '<div style="width:36px;height:36px;border-radius:10px;background:' + tier.bg + ';color:' + tier.color + ';display:flex;align-items:center;justify-content:center;font-weight:900;font-size:0.85rem;">' + avg.toFixed(1) + '</div>' +
              '<div>' +
                '<div style="font-weight:700;font-size:0.85rem;color:#111;">' + title + '</div>' +
                '<div style="font-size:0.7rem;color:#9ca3af;font-weight:500;">' + date + '</div>' +
              '</div>' +
            '</div>' +
            '<div style="display:flex;align-items:center;gap:8px;">' +
              '<span style="font-size:0.6rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:' + tier.color + ';">' + tier.label + '</span>' +
              '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>' +
            '</div>' +
          '</div>' +

          // Expandable detail (hidden by default)
          '<div id="' + cardId + '" style="display:none;padding:0 16px 14px;border-top:1px solid #f3f4f6;">' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 16px;padding-top:12px;">' +
              CATEGORIES.map(function(cat) {
                var val = parseFloat(g[cat.key]) || 0;
                return '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;">' +
                  '<span style="font-size:0.75rem;color:#6b7280;font-weight:500;display:flex;align-items:center;gap:4px;">' + cat.icon + ' ' + cat.short + '</span>' +
                  '<span style="font-size:0.8rem;font-weight:800;color:' + scoreColor(val) + ';">' + val.toFixed(1) + '</span>' +
                '</div>';
              }).join('') +
            '</div>' +
            (g.coach_narrative ? '<div style="margin-top:10px;padding:10px 12px;background:#f8fafc;border-radius:8px;font-size:0.8rem;color:#374151;line-height:1.5;font-weight:500;">' + g.coach_narrative + '</div>' : '') +
          '</div>' +
        '</div>';
    });

    container.innerHTML = html;
  }

  function renderGameCards(seasonStats, gameLog) {
    var container = document.getElementById('perf-games');
    if (!container) return;

    if ((!gameLog || gameLog.length === 0) && !seasonStats) {
      container.innerHTML = '<div style="font-size:0.85rem;color:#9ca3af;text-align:center;padding:20px 0;">No game data available yet.</div>';
      return;
    }

    var html = '';

    // Game cards
    if (gameLog && gameLog.length > 0) {
      gameLog.forEach(function(g) {
        var isWin = g.result === 'W';
        var isLoss = g.result === 'L';
        var resultColor = isWin ? '#059669' : isLoss ? '#dc2626' : '#6b7280';
        var resultBg = isWin ? '#ecfdf5' : isLoss ? '#fef2f2' : '#f9fafb';
        var resultLabel = isWin ? 'WIN' : isLoss ? 'LOSS' : 'TIE';
        var hasScore = g.team_score != null && g.opponent_score != null;

        html +=
          '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:white;border:1px solid #f0f1f3;border-radius:12px;">' +
            '<div style="display:flex;align-items:center;gap:12px;">' +
              // Result badge
              '<div style="width:40px;height:40px;border-radius:10px;background:' + resultBg + ';color:' + resultColor + ';display:flex;align-items:center;justify-content:center;font-weight:900;font-size:0.65rem;letter-spacing:0.06em;">' + resultLabel + '</div>' +
              '<div>' +
                '<div style="font-weight:700;font-size:0.85rem;color:#111;">' + (g.opponent_name || 'Opponent') + '</div>' +
                '<div style="font-size:0.7rem;color:#9ca3af;font-weight:500;">' + fmtDate(g.game_date) + '</div>' +
              '</div>' +
            '</div>' +
            (hasScore ? '<div style="font-size:1.15rem;font-weight:900;color:#111;letter-spacing:-0.02em;">' + g.team_score + '<span style="color:#cbd5e1;font-weight:400;"> - </span>' + g.opponent_score + '</div>' : '') +
          '</div>';
      });
    }

    container.innerHTML = html;
  }

  function renderCoachNotes(grades) {
    var container = document.getElementById('perf-notes');
    if (!container) return;

    var withNotes = grades.filter(function(g){ return g.coach_narrative; }).sort(function(a,b){ return new Date(b.session_date) - new Date(a.session_date); });

    if (withNotes.length === 0) {
      container.innerHTML = '<div style="font-size:0.85rem;color:#9ca3af;text-align:center;padding:16px 0;">No coach notes yet.</div>';
      return;
    }

    container.innerHTML = withNotes.slice(0, 5).map(function(g, idx) {
      return '<div style="padding:12px 16px;background:white;border:1px solid #f0f1f3;border-radius:12px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
          '<div style="font-weight:700;font-size:0.85rem;color:#111;">' + (g.session_title || 'Practice') + '</div>' +
          '<div style="font-size:0.7rem;color:#9ca3af;font-weight:600;">' + fmtDate(g.session_date) + '</div>' +
        '</div>' +
        '<p style="font-size:0.85rem;color:#374151;line-height:1.6;margin:0;font-weight:500;">' + g.coach_narrative + '</p>' +
      '</div>';
    }).join('');
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
      var gameData = results[1];

      var teamAvgs = await fetchTeamAverages(client, grades);

      renderHero(grades);
      renderSkillBars(grades, teamAvgs);
      renderPracticeCards(grades);
      renderGameCards(gameData.seasonStats, gameData.gameLog);
      renderCoachNotes(grades);

      console.log('[Perf] Rendered ' + grades.length + ' practice grades, ' + gameData.gameLog.length + ' games.');
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
