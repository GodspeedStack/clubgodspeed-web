/**
 * performance-renderer.js  (V5)
 *
 * Comprehensive player performance dashboard matching Training Dashboard
 * design language: gradient hero card, stat tiles, rounded-xl cards with
 * shadow-md, Tailwind utility classes.
 *
 * Data sources:
 *   1. practice_grades — 7 weighted categories per practice
 *   2. player_game_stats — full box score per game (25 cols)
 *   3. player_evaluations — 15-skill periodic assessment
 *   4. team averages — computed from same-session grades
 *
 * No emojis. No decorative icons. Text/SVG/CSS only.
 */
(function () {
  'use strict';

  /* ── Constants ─────────────────────────────────────────────── */

  var CATEGORIES = [
    { key: 'effort_energy',            label: 'Effort & Energy',            weight: 0.20 },
    { key: 'competitiveness',          label: 'Competitiveness',            weight: 0.20 },
    { key: 'on_ball_defense',          label: 'On-Ball Defense',            weight: 0.15 },
    { key: 'help_side_rotations',      label: 'Help-Side & Rotations',     weight: 0.15 },
    { key: 'listening_coachability',   label: 'Listening & Coachability',   weight: 0.15 },
    { key: 'communication_leadership', label: 'Communication & Leadership', weight: 0.10 },
    { key: 'offense_shooting',         label: 'Offense & Shooting',         weight: 0.05 },
  ];

  var TIERS = [
    { min: 9.0, label: 'Elite / Starter',    short: 'ELITE',    color: '#059669', bg: '#ecfdf5', accent: '#059669' },
    { min: 8.0, label: 'Rotation / Starter',  short: 'ROTATION', color: '#2563eb', bg: '#eff6ff', accent: '#2563eb' },
    { min: 7.0, label: 'Development',          short: 'DEV',      color: '#d97706', bg: '#fffbeb', accent: '#d97706' },
    { min: 6.0, label: 'Limited Minutes',      short: 'LIMITED',  color: '#ea580c', bg: '#fff7ed', accent: '#ea580c' },
    { min: 0,   label: 'Below Standard',       short: 'BELOW',    color: '#dc2626', bg: '#fef2f2', accent: '#dc2626' },
  ];

  var TIER_DESCRIPTIONS = {
    'Elite / Starter':   'Consistently top performer. Earns significant minutes and is trusted in high-pressure game situations.',
    'Rotation / Starter': 'Reliable contributor who earns consistent playing time in the game rotation. On track for a starting role.',
    'Development':        'Building core skills. Gets game reps with a focus on growth areas identified by coaching staff.',
    'Limited Minutes':    'Developing fundamentals. Game time is earned through practice improvement and effort.',
    'Below Standard':     'Significant improvement needed across multiple areas. Extra attention from coaching staff.',
  };

  var TREND_DESCRIPTIONS = {
    'Improving': 'Recent practice grades are trending higher than earlier sessions.',
    'Steady':    'Practice grades have been consistent across sessions with no significant movement up or down.',
    'Declining': 'Recent practice grades are trending lower than earlier sessions.',
    'New':       'Not enough graded practices yet to calculate a trend.',
  };

  var EVAL_GROUPS = [
    { label: 'Offense',     keys: ['ball_handling','shooting_form','mid_range','three_point','free_throw','finishing'] },
    { label: 'Playmaking',  keys: ['passing','court_vision'] },
    { label: 'Defense',     keys: ['defensive_stance','lateral_quickness','rebounding'] },
    { label: 'Intangibles', keys: ['basketball_iq','leadership','effort','coachability'] },
  ];

  var EVAL_LABELS = {
    ball_handling: 'Ball Handling', shooting_form: 'Shooting Form', mid_range: 'Mid-Range',
    three_point: '3-Point', free_throw: 'Free Throw', finishing: 'Finishing',
    passing: 'Passing', court_vision: 'Court Vision',
    defensive_stance: 'Defensive Stance', lateral_quickness: 'Lateral Quickness', rebounding: 'Rebounding',
    basketball_iq: 'Basketball IQ', leadership: 'Leadership', effort: 'Effort', coachability: 'Coachability',
  };

  /* ── Utilities ─────────────────────────────────────────────── */

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
    var recent = s.slice(Math.max(0, n - Math.ceil(n/2)));
    var early  = s.slice(0, Math.ceil(n/2));
    var ar = recent.reduce(function(x,g){ return x + parseFloat(g.weighted_average); }, 0) / recent.length;
    var ae = early.reduce(function(x,g){ return x + parseFloat(g.weighted_average); }, 0) / early.length;
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

  function pct(made, att) {
    if (!att || att === 0) return null;
    return Math.round((made / att) * 100);
  }

  /* ── Ring gauge SVG ────────────────────────────────────────── */

  function ring(score, t, size) {
    var sz = size || 120;
    var r = (sz / 2) - 8, sw = 8;
    var c = 2 * Math.PI * r;
    var p = Math.min(100, (score / 10) * 100);
    var dash = (p / 100) * c, gap = c - dash;
    return '<svg width="'+sz+'" height="'+sz+'" viewBox="0 0 '+sz+' '+sz+'">' +
      '<circle cx="'+(sz/2)+'" cy="'+(sz/2)+'" r="'+r+'" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="'+sw+'"/>' +
      '<circle cx="'+(sz/2)+'" cy="'+(sz/2)+'" r="'+r+'" fill="none" stroke="white" stroke-width="'+sw+'" ' +
        'stroke-dasharray="'+dash.toFixed(1)+' '+gap.toFixed(1)+'" stroke-linecap="round" ' +
        'transform="rotate(-90 '+(sz/2)+' '+(sz/2)+')" style="transition:stroke-dasharray 0.8s ease;"/>' +
      '<text x="'+(sz/2)+'" y="'+((sz/2)+6)+'" text-anchor="middle" font-size="'+(sz*0.25)+'" font-weight="900" fill="white" font-family="\'Inter\',sans-serif">'+score.toFixed(1)+'</text>' +
    '</svg>';
  }

  /* ── Small ring for eval scores ────────────────────────────── */

  function miniRing(score, color) {
    var sz = 36, r = 13, sw = 3;
    var c = 2 * Math.PI * r;
    var p = Math.min(100, (score / 10) * 100);
    var dash = (p / 100) * c, gap = c - dash;
    return '<svg width="'+sz+'" height="'+sz+'" viewBox="0 0 '+sz+' '+sz+'" style="flex-shrink:0;">' +
      '<circle cx="'+(sz/2)+'" cy="'+(sz/2)+'" r="'+r+'" fill="none" stroke="#e5e7eb" stroke-width="'+sw+'"/>' +
      '<circle cx="'+(sz/2)+'" cy="'+(sz/2)+'" r="'+r+'" fill="none" stroke="'+color+'" stroke-width="'+sw+'" ' +
        'stroke-dasharray="'+dash.toFixed(1)+' '+gap.toFixed(1)+'" stroke-linecap="round" ' +
        'transform="rotate(-90 '+(sz/2)+' '+(sz/2)+')" />' +
      '<text x="'+(sz/2)+'" y="'+((sz/2)+4)+'" text-anchor="middle" font-size="10" font-weight="800" fill="'+color+'" font-family="\'Inter\',sans-serif">'+score+'</text>' +
    '</svg>';
  }

  /* ── Bar for category score ────────────────────────────────── */

  function scoreBar(value, teamAvg, maxVal) {
    var max = maxVal || 10;
    var pctVal = (value / max) * 100;
    var pctTeam = teamAvg ? (teamAvg / max) * 100 : 0;
    var color = sc(value);
    return '<div style="position:relative;height:6px;background:#f0f0f5;border-radius:3px;flex:1;min-width:60px;">' +
      (teamAvg ? '<div style="position:absolute;left:'+pctTeam.toFixed(1)+'%;top:-2px;width:2px;height:10px;background:#d1d5db;border-radius:1px;" title="Team Avg: '+teamAvg.toFixed(1)+'"></div>' : '') +
      '<div style="height:100%;width:'+pctVal.toFixed(1)+'%;background:'+color+';border-radius:3px;transition:width 0.6s ease;"></div>' +
    '</div>';
  }

  /* ── Pill helper ───────────────────────────────────────────── */

  function pill(label, color, bg) {
    return '<span style="display:inline-block;padding:3px 10px;border-radius:6px;font-size:0.65rem;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;background:'+bg+';color:'+color+';">'+label+'</span>';
  }

  /* ── Section header ────────────────────────────────────────── */

  function sectionHeader(text) {
    return '<h3 style="font-family:\'Inter\',sans-serif;font-weight:700;font-size:1.05rem;color:#111;margin:24px 0 12px 0;">'+text+'</h3>';
  }

  /* ── Client + Athlete Resolution ───────────────────────────── */

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

  async function resolveAthleteProfile(client, athleteId) {
    try {
      var r = await client.from('athletes').select('display_name, first_name, last_name, jersey_number, position, team_name, season').eq('id', athleteId).limit(1).single();
      if (!r.data) return { name: null };
      return {
        name: r.data.display_name || r.data.first_name || null,
        firstName: r.data.first_name || null,
        jersey: r.data.jersey_number,
        position: r.data.position,
        team: r.data.team_name,
        season: r.data.season,
      };
    } catch (_) { return { name: null }; }
  }

  // Backward compat
  async function resolveAthleteName(client, athleteId) {
    var p = await resolveAthleteProfile(client, athleteId);
    return p.name;
  }

  /* ── Data Fetching ─────────────────────────────────────────── */

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
      .select('effort_energy,competitiveness,on_ball_defense,help_side_rotations,listening_coachability,communication_leadership,offense_shooting,weighted_average')
      .in('session_id', ids);
    if (res.error || !res.data || res.data.length === 0) return null;
    var avgs = { weighted_average: 0 };
    CATEGORIES.forEach(function(cat) {
      var vals = res.data.map(function(d){ return parseFloat(d[cat.key]); }).filter(function(v){ return !isNaN(v); });
      avgs[cat.key] = vals.length > 0 ? vals.reduce(function(a,b){ return a+b; },0) / vals.length : 0;
    });
    var wa = res.data.map(function(d){ return parseFloat(d.weighted_average); }).filter(function(v){ return !isNaN(v); });
    avgs.weighted_average = wa.length > 0 ? wa.reduce(function(a,b){ return a+b; },0) / wa.length : 0;
    return avgs;
  }

  async function fetchGameData(client, athleteId) {
    var res = await client
      .from('player_game_stats')
      .select('*, games!inner(game_date, opponent_name, team_score, opponent_score, result)')
      .eq('athlete_id', athleteId)
      .order('created_at', { ascending: false })
      .limit(20);
    if (res.error) { console.error('[Perf] games error:', res.error.message); return []; }
    return (res.data || []).map(function(gs) {
      return {
        game_date: gs.games?.game_date,
        opponent: gs.games?.opponent_name || 'Opponent',
        team_score: gs.games?.team_score,
        opp_score: gs.games?.opponent_score,
        result: gs.games?.result,
        pts: gs.points || 0,
        ast: gs.assists || 0,
        reb: gs.total_rebounds || 0,
        oreb: gs.offensive_rebounds || 0,
        dreb: gs.defensive_rebounds || 0,
        stl: gs.steals || 0,
        blk: gs.blocks || 0,
        tov: gs.turnovers || 0,
        fgm: gs.field_goals_made || 0,
        fga: gs.field_goals_attempted || 0,
        tpm: gs.three_pointers_made || 0,
        tpa: gs.three_pointers_attempted || 0,
        ftm: gs.free_throws_made || 0,
        fta: gs.free_throws_attempted || 0,
        min: gs.minutes_played,
        pm: gs.plus_minus,
        defl: gs.deflections || 0,
        chrg: gs.charges_taken || 0,
        fouls: gs.fouls || 0,
        rating: gs.performance_rating,
        coach_notes: gs.coach_notes,
      };
    });
  }

  async function fetchEvaluations(client, athleteId) {
    var res = await client
      .from('player_evaluations')
      .select('*')
      .eq('athlete_id', athleteId)
      .order('evaluation_date', { ascending: false })
      .limit(5);
    if (res.error) { console.error('[Perf] evals error:', res.error.message); return []; }
    return res.data || [];
  }

  /* ── Rendering ─────────────────────────────────────────────── */

  function renderAll(athleteName, grades, teamAvgs, games, evals, profile) {
    var container = document.getElementById('perf-root');
    if (!container) return;
    var html = '';
    var prof = profile || {};

    /* ── SHIMMER KEYFRAMES (injected once) ─────────────────── */

    if (!document.getElementById('gs-perf-shimmer-style')) {
      var styleEl = document.createElement('style');
      styleEl.id = 'gs-perf-shimmer-style';
      styleEl.textContent =
        '@keyframes gs-shimmer{0%{background-position:-400px 0}100%{background-position:400px 0}}' +
        '@keyframes gs-pulse-ring{0%{opacity:0.3;transform:scale(0.95)}50%{opacity:0.6;transform:scale(1)}100%{opacity:0.3;transform:scale(0.95)}}' +
        '@keyframes gs-fade-in{0%{opacity:0;transform:translateY(12px)}100%{opacity:1;transform:translateY(0)}}';
      document.head.appendChild(styleEl);
    }

    /* ── 1. HERO CARD ────────────────────────────────────────── */

    if (grades.length === 0 && games.length === 0 && evals.length === 0) {
      var pName = prof.firstName || athleteName || 'Athlete';
      var pJersey = prof.jersey != null ? '#' + prof.jersey : '';
      var pPos = prof.position || '';
      var pTeam = prof.team || '';

      // ── Metallic Steel Card (no-data state) ──
      html += '<div style="' +
        'position:relative;overflow:hidden;border-radius:20px;padding:32px 28px 28px;color:#fff;' +
        'background:linear-gradient(135deg,#3a3f47 0%,#5a6270 30%,#8b95a5 55%,#5a6270 75%,#3a3f47 100%);' +
        'box-shadow:0 12px 40px rgba(0,0,0,0.25),inset 0 1px 0 rgba(255,255,255,0.15);' +
        'animation:gs-fade-in 0.5s ease-out;margin-bottom:20px;">' +

        // Shimmer overlay
        '<div style="position:absolute;top:0;left:0;right:0;bottom:0;pointer-events:none;' +
          'background:linear-gradient(90deg,transparent 0%,rgba(255,255,255,0.06) 40%,rgba(255,255,255,0.15) 50%,rgba(255,255,255,0.06) 60%,transparent 100%);' +
          'background-size:800px 100%;animation:gs-shimmer 3s ease-in-out infinite;"></div>' +

        // Subtle brushed-metal texture
        '<div style="position:absolute;top:0;left:0;right:0;bottom:0;pointer-events:none;opacity:0.04;' +
          'background:repeating-linear-gradient(90deg,#fff 0px,transparent 1px,transparent 3px);"></div>' +

        '<div style="position:relative;z-index:1;">' +

          // Top row: name + jersey/position
          '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;">' +
            '<div>' +
              '<div style="font-size:1.4rem;font-weight:800;letter-spacing:-0.02em;line-height:1.2;">' + pName + '</div>' +
              (pTeam ? '<div style="font-size:0.75rem;font-weight:600;color:rgba(255,255,255,0.6);margin-top:4px;text-transform:uppercase;letter-spacing:0.06em;">' + pTeam + '</div>' : '') +
            '</div>' +
            '<div style="display:flex;align-items:baseline;gap:8px;">' +
              (pJersey ? '<div style="font-size:2.2rem;font-weight:900;color:rgba(255,255,255,0.2);line-height:1;letter-spacing:-0.02em;">' + pJersey + '</div>' : '') +
              (pPos ? '<div style="padding:4px 10px;border-radius:6px;font-size:0.65rem;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;background:rgba(255,255,255,0.12);color:rgba(255,255,255,0.7);backdrop-filter:blur(4px);">' + pPos + '</div>' : '') +
            '</div>' +
          '</div>' +

          // Stat placeholders row (dashed boxes)
          '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:28px 0 24px;">' +
            ['PPG','APG','RPG','SPG'].map(function(label) {
              return '<div style="text-align:center;padding:14px 8px;border:1px dashed rgba(255,255,255,0.2);border-radius:12px;background:rgba(255,255,255,0.04);">' +
                '<div style="font-size:1.6rem;font-weight:800;color:rgba(255,255,255,0.2);line-height:1;">--</div>' +
                '<div style="font-size:0.6rem;font-weight:700;color:rgba(255,255,255,0.35);text-transform:uppercase;letter-spacing:0.06em;margin-top:4px;">'+label+'</div>' +
              '</div>';
            }).join('') +
          '</div>' +

          // Ring placeholder
          '<div style="display:flex;align-items:center;gap:20px;">' +
            '<div style="width:80px;height:80px;border-radius:50%;border:4px solid rgba(255,255,255,0.12);display:flex;align-items:center;justify-content:center;animation:gs-pulse-ring 3s ease-in-out infinite;">' +
              '<span style="font-size:0.75rem;font-weight:700;color:rgba(255,255,255,0.3);text-transform:uppercase;">Awaiting</span>' +
            '</div>' +
            '<div style="flex:1;">' +
              '<div style="font-size:0.85rem;font-weight:700;color:rgba(255,255,255,0.7);margin-bottom:4px;">Performance data is on the way</div>' +
              '<div style="font-size:0.75rem;color:rgba(255,255,255,0.45);line-height:1.5;">Practice grades, game box scores, and coach evaluations will populate this card as they are recorded throughout the season.</div>' +
            '</div>' +
          '</div>' +

        '</div>' + // z-index wrapper
      '</div>'; // card

      // ── Parent Stat Contribution CTA ──
      html += '<div style="' +
        'background:#fff;border-radius:16px;padding:24px;box-shadow:0 2px 12px rgba(0,0,0,0.06);' +
        'border:1px solid #e5e7eb;animation:gs-fade-in 0.5s ease-out 0.15s both;margin-bottom:20px;">' +

        '<div style="display:flex;align-items:flex-start;gap:16px;">' +

          // Clipboard icon (SVG)
          '<div style="flex-shrink:0;width:44px;height:44px;border-radius:12px;background:#f0f4ff;display:flex;align-items:center;justify-content:center;">' +
            '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
              '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>' +
              '<rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>' +
              '<line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/>' +
            '</svg>' +
          '</div>' +

          '<div style="flex:1;">' +
            '<div style="font-size:0.95rem;font-weight:700;color:#111;margin-bottom:6px;">Help Build Your Player\'s Stats</div>' +
            '<div style="font-size:0.82rem;color:#6b7280;line-height:1.6;">' +
              'You can help by keeping track of your player\'s stats during games. ' +
              'Write down points, rebounds, assists, steals, and turnovers, then share them with Coach Scott or Coach Gene after the game. ' +
              'The coaching staff will enter them into the system and they\'ll show up right here on your player\'s card.' +
            '</div>' +
            '<div style="margin-top:14px;padding:14px 16px;background:#f8fafc;border-radius:10px;border:1px solid #f0f0f5;">' +
              '<div style="font-size:0.7rem;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px;">What to Track</div>' +
              '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:6px;">' +
                ['Points','Rebounds','Assists','Steals','Blocks','Turnovers'].map(function(s) {
                  return '<div style="font-size:0.78rem;font-weight:600;color:#374151;padding:6px 10px;background:#fff;border-radius:8px;border:1px solid #e5e7eb;text-align:center;">'+s+'</div>';
                }).join('') +
              '</div>' +
            '</div>' +
          '</div>' +

        '</div>' +
      '</div>';

      container.innerHTML = html;
      return;
    }

    if (grades.length > 0) {
      var avg = grades.reduce(function(s,g){ return s + parseFloat(g.weighted_average); },0) / grades.length;
      var t = tier(avg);
      var tr = trendOf(grades);
      var name = athleteName || 'Athlete';
      var hJersey = prof.jersey != null ? '#' + prof.jersey : '';
      var hPos = prof.position || '';

      html += '<div style="' +
        'position:relative;overflow:hidden;border-radius:20px;padding:28px 28px 24px;color:white;' +
        'background:linear-gradient(135deg, #1e3a5f 0%, #2563eb 50%, #1e40af 100%);' +
        'box-shadow:0 12px 40px rgba(37,99,235,0.3);margin-bottom:20px;animation:gs-fade-in 0.5s ease-out;">' +

        // Subtle shimmer
        '<div style="position:absolute;top:0;left:0;right:0;bottom:0;pointer-events:none;' +
          'background:linear-gradient(90deg,transparent 0%,rgba(255,255,255,0.04) 40%,rgba(255,255,255,0.1) 50%,rgba(255,255,255,0.04) 60%,transparent 100%);' +
          'background-size:800px 100%;animation:gs-shimmer 4s ease-in-out infinite;"></div>' +

        '<div style="position:relative;z-index:1;display:flex;align-items:center;gap:24px;flex-wrap:wrap;">' +
          '<div style="flex-shrink:0;">' + ring(avg, t, 120) + '</div>' +
          '<div style="flex:1;min-width:200px;">' +
            '<div style="display:flex;align-items:baseline;gap:10px;margin-bottom:6px;">' +
              '<span style="font-size:1.4rem;font-weight:800;letter-spacing:-0.02em;">'+name+'</span>' +
              (hJersey ? '<span style="font-size:1.1rem;font-weight:800;color:rgba(255,255,255,0.3);">'+hJersey+'</span>' : '') +
              (hPos ? '<span style="padding:3px 8px;border-radius:5px;font-size:0.6rem;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;background:rgba(255,255,255,0.15);color:rgba(255,255,255,0.7);">'+hPos+'</span>' : '') +
            '</div>' +
            '<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">' +
              '<span style="display:inline-block;padding:4px 12px;border-radius:6px;font-size:0.7rem;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;background:rgba(255,255,255,0.2);color:white;">'+t.label+'</span>' +
              '<span style="font-size:0.75rem;font-weight:700;color:rgba(255,255,255,0.85);">'+tr.label+'</span>' +
            '</div>' +
            '<div style="font-size:0.75rem;color:rgba(255,255,255,0.7);line-height:1.5;max-width:400px;">'+TIER_DESCRIPTIONS[t.label]+'</div>' +
          '</div>' +
          '<div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end;">' +
            '<div style="text-align:right;">' +
              '<div style="font-size:0.65rem;font-weight:600;opacity:0.7;text-transform:uppercase;letter-spacing:0.06em;">Practices Graded</div>' +
              '<div style="font-size:1.5rem;font-weight:800;">'+grades.length+'</div>' +
            '</div>' +
            '<div style="text-align:right;">' +
              '<div style="font-size:0.65rem;font-weight:600;opacity:0.7;text-transform:uppercase;letter-spacing:0.06em;">Games Played</div>' +
              '<div style="font-size:1.5rem;font-weight:800;">'+games.length+'</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    }

    /* ── 2. QUICK STATS TILES ────────────────────────────────── */

    var statTiles = [];

    if (grades.length > 0) {
      var avg = grades.reduce(function(s,g){ return s + parseFloat(g.weighted_average); },0) / grades.length;
      var teamWa = teamAvgs ? teamAvgs.weighted_average : null;
      statTiles.push({
        value: avg.toFixed(1),
        label: 'Practice Grade',
        sub: teamWa ? 'Team Avg: ' + teamWa.toFixed(1) : null,
        color: '#2563eb',
      });
    }

    if (games.length > 0) {
      var ppg = games.reduce(function(s,g){ return s + g.pts; },0) / games.length;
      statTiles.push({ value: ppg.toFixed(1), label: 'Points Per Game', sub: games.length + ' game' + (games.length !== 1 ? 's' : ''), color: '#059669' });

      var rpg = games.reduce(function(s,g){ return s + g.reb; },0) / games.length;
      statTiles.push({ value: rpg.toFixed(1), label: 'Rebounds Per Game', sub: null, color: '#7c3aed' });

      var apg = games.reduce(function(s,g){ return s + g.ast; },0) / games.length;
      statTiles.push({ value: apg.toFixed(1), label: 'Assists Per Game', sub: null, color: '#d97706' });
    }

    if (statTiles.length > 0) {
      html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:20px;">';
      statTiles.forEach(function(st) {
        html += '<div class="bg-white rounded-xl shadow-md" style="padding:20px;transition:box-shadow 0.2s;">' +
          '<div style="font-size:1.8rem;font-weight:800;color:'+st.color+';margin-bottom:4px;">'+st.value+'</div>' +
          '<div style="font-size:0.75rem;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;">'+st.label+'</div>' +
          (st.sub ? '<div style="font-size:0.7rem;color:#9ca3af;margin-top:4px;">'+st.sub+'</div>' : '') +
        '</div>';
      });
      html += '</div>';
    }

    /* ── 3. SKILL BREAKDOWN with weights ─────────────────────── */

    if (grades.length > 0) {
      html += sectionHeader('Practice Skill Breakdown');
      html += '<div class="bg-white rounded-xl shadow-md" style="padding:20px;margin-bottom:20px;">';

      // Weight explanation
      html += '<div style="font-size:0.7rem;color:#9ca3af;margin-bottom:16px;line-height:1.5;">Each category is weighted in the overall grade. Heavier weights (shown as %) mean that category has more impact on the final score. The gray marker on each bar shows the team average.</div>';

      CATEGORIES.forEach(function(cat) {
        var pAvg = grades.reduce(function(s,g){ return s + (parseFloat(g[cat.key]) || 0); },0) / grades.length;
        var tAvg = teamAvgs ? teamAvgs[cat.key] : null;
        var color = sc(pAvg);
        var weightPct = Math.round(cat.weight * 100);

        html += '<div style="margin-bottom:14px;">' +
          '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px;">' +
            '<div style="display:flex;align-items:baseline;gap:6px;">' +
              '<span style="font-size:0.82rem;font-weight:600;color:#374151;">'+cat.label+'</span>' +
              '<span style="font-size:0.6rem;font-weight:600;color:#b0b8c4;">'+weightPct+'%</span>' +
            '</div>' +
            '<div style="display:flex;align-items:baseline;gap:6px;">' +
              '<span style="font-size:1rem;font-weight:900;color:'+color+';">'+pAvg.toFixed(1)+'</span>' +
              (tAvg != null ? '<span style="font-size:0.6rem;font-weight:600;color:#d1d5db;">/ '+tAvg.toFixed(1)+'</span>' : '') +
            '</div>' +
          '</div>' +
          scoreBar(pAvg, tAvg, 10) +
        '</div>';
      });

      html += '</div>';
    }

    /* ── 4. GAME LOG ─────────────────────────────────────────── */

    if (games.length > 0) {
      html += sectionHeader('Game Log');

      // Season averages summary
      var totals = { pts:0, ast:0, reb:0, stl:0, blk:0, tov:0, fgm:0, fga:0, tpm:0, tpa:0, ftm:0, fta:0, defl:0 };
      games.forEach(function(g) {
        totals.pts += g.pts; totals.ast += g.ast; totals.reb += g.reb;
        totals.stl += g.stl; totals.blk += g.blk; totals.tov += g.tov;
        totals.fgm += g.fgm; totals.fga += g.fga;
        totals.tpm += g.tpm; totals.tpa += g.tpa;
        totals.ftm += g.ftm; totals.fta += g.fta;
        totals.defl += g.defl;
      });
      var n = games.length;
      var fgPct = pct(totals.fgm, totals.fga);
      var tpPct = pct(totals.tpm, totals.tpa);
      var ftPct = pct(totals.ftm, totals.fta);

      html += '<div class="bg-white rounded-xl shadow-md" style="padding:16px 20px;margin-bottom:12px;">' +
        '<div style="font-size:0.7rem;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:10px;">Season Averages</div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(65px,1fr));gap:8px;text-align:center;">';

      var avgStats = [
        { v: (totals.pts/n).toFixed(1), l: 'PPG' },
        { v: (totals.ast/n).toFixed(1), l: 'APG' },
        { v: (totals.reb/n).toFixed(1), l: 'RPG' },
        { v: (totals.stl/n).toFixed(1), l: 'SPG' },
        { v: (totals.blk/n).toFixed(1), l: 'BPG' },
        { v: (totals.tov/n).toFixed(1), l: 'TOPG' },
      ];

      if (fgPct !== null) avgStats.push({ v: fgPct+'%', l: 'FG%' });
      if (tpPct !== null) avgStats.push({ v: tpPct+'%', l: '3P%' });
      if (ftPct !== null) avgStats.push({ v: ftPct+'%', l: 'FT%' });

      avgStats.forEach(function(st) {
        html += '<div>' +
          '<div style="font-size:1.1rem;font-weight:800;color:#111;">'+st.v+'</div>' +
          '<div style="font-size:0.6rem;font-weight:600;color:#9ca3af;text-transform:uppercase;">'+st.l+'</div>' +
        '</div>';
      });

      html += '</div></div>';

      // Individual game cards (expandable)
      games.forEach(function(g, idx) {
        var isW = g.result === 'W';
        var isL = g.result === 'L';
        var rc = isW ? '#059669' : isL ? '#dc2626' : '#6b7280';
        var rb = isW ? '#ecfdf5' : isL ? '#fef2f2' : '#f3f4f6';
        var rl = isW ? 'WIN' : isL ? 'LOSS' : 'TIE';
        var accent = isW ? '#059669' : isL ? '#dc2626' : '#d1d5db';
        var hasScore = g.team_score != null && g.opp_score != null;
        var gid = 'gm-' + idx;

        // Box score detail
        var boxRows = [
          { l: 'PTS', v: g.pts }, { l: 'AST', v: g.ast }, { l: 'REB', v: g.reb },
          { l: 'STL', v: g.stl }, { l: 'BLK', v: g.blk }, { l: 'TOV', v: g.tov },
          { l: 'DEFL', v: g.defl },
        ];
        if (g.fga > 0) boxRows.push({ l: 'FG', v: g.fgm+'/'+g.fga });
        if (g.tpa > 0) boxRows.push({ l: '3PT', v: g.tpm+'/'+g.tpa });
        if (g.fta > 0) boxRows.push({ l: 'FT', v: g.ftm+'/'+g.fta });
        if (g.min != null) boxRows.push({ l: 'MIN', v: g.min });
        if (g.pm != null) boxRows.push({ l: '+/-', v: (g.pm > 0 ? '+' : '') + g.pm });
        if (g.chrg > 0) boxRows.push({ l: 'CHG', v: g.chrg });
        if (g.fouls > 0) boxRows.push({ l: 'PF', v: g.fouls });

        html += '<div class="bg-white rounded-xl shadow-md" style="margin-bottom:8px;overflow:hidden;border-left:4px solid '+accent+';cursor:pointer;" onclick="(function(){var d=document.getElementById(\''+gid+'\');d.style.display=d.style.display===\'none\'?\'block\':\'none\';})()">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;padding:14px 20px;">' +
            '<div>' +
              '<div style="font-weight:700;font-size:0.9rem;color:#111;">'+g.opponent+'</div>' +
              '<div style="font-size:0.7rem;color:#9ca3af;margin-top:2px;">'+fd(g.game_date)+'</div>' +
            '</div>' +
            '<div style="display:flex;align-items:center;gap:12px;">' +
              '<span style="font-size:0.8rem;font-weight:700;color:#374151;">'+g.pts+' PTS / '+g.ast+' AST / '+g.reb+' REB</span>' +
              (hasScore ? '<span style="font-size:1rem;font-weight:900;color:#111;">'+g.team_score+'-'+g.opp_score+'</span>' : '') +
              pill(rl, rc, rb) +
            '</div>' +
          '</div>' +
          '<div id="'+gid+'" style="display:none;padding:0 20px 16px;border-top:1px solid #f3f4f6;">' +
            '<div style="font-size:0.65rem;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.04em;margin:12px 0 8px;">Full Box Score</div>' +
            '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(55px,1fr));gap:6px;text-align:center;">';

        boxRows.forEach(function(br) {
          html += '<div style="background:#f8fafc;border-radius:8px;padding:8px 4px;">' +
            '<div style="font-size:1rem;font-weight:800;color:#111;">'+br.v+'</div>' +
            '<div style="font-size:0.55rem;font-weight:700;color:#9ca3af;text-transform:uppercase;">'+br.l+'</div>' +
          '</div>';
        });

        html += '</div>';

        // Coach notes for this game
        if (g.coach_notes) {
          html += '<div style="margin:8px 0 0;padding:10px 14px;background:#f8fafc;border-radius:8px;font-size:0.8rem;color:#374151;line-height:1.5;border-left:3px solid '+accent+';">'+g.coach_notes+'</div>';
        }
        if (g.rating) {
          html += '<div style="margin:8px 0 0;font-size:0.7rem;color:#6b7280;">Coach Rating: <span style="font-weight:800;color:#111;">'+g.rating+'/5</span></div>';
        }

        html += '</div></div>';
      });
    }

    /* ── 5. SKILL EVALUATIONS ────────────────────────────────── */

    if (evals.length > 0) {
      var latest = evals[0];
      html += sectionHeader('Skill Evaluation');

      html += '<div class="bg-white rounded-xl shadow-md" style="padding:20px;margin-bottom:20px;">';

      // Header with date and overall
      html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">' +
        '<div>' +
          '<div style="font-size:0.65rem;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.04em;">Most Recent Evaluation</div>' +
          '<div style="font-size:0.85rem;font-weight:700;color:#111;margin-top:2px;">'+fd(latest.evaluation_date)+'</div>' +
        '</div>' +
        (latest.overall_rating ? '<div style="text-align:right;">' +
          '<div style="font-size:0.65rem;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.04em;">Overall</div>' +
          '<div style="font-size:1.5rem;font-weight:900;color:'+sc(parseFloat(latest.overall_rating))+';">'+parseFloat(latest.overall_rating).toFixed(1)+'</div>' +
        '</div>' : '') +
      '</div>';

      // Skill groups
      EVAL_GROUPS.forEach(function(group) {
        var hasAny = group.keys.some(function(k){ return latest[k] != null; });
        if (!hasAny) return;

        html += '<div style="margin-bottom:16px;">' +
          '<div style="font-size:0.7rem;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid #f3f4f6;">'+group.label+'</div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;">';

        group.keys.forEach(function(k) {
          if (latest[k] == null) return;
          var val = parseInt(latest[k]);
          var color = sc(val);
          html += '<div style="display:flex;align-items:center;gap:8px;padding:4px 0;">' +
            miniRing(val, color) +
            '<span style="font-size:0.8rem;font-weight:600;color:#374151;">'+EVAL_LABELS[k]+'</span>' +
          '</div>';
        });

        html += '</div></div>';
      });

      // Strengths / Areas to improve
      if (latest.strengths) {
        html += '<div style="margin-top:16px;padding:12px 14px;background:#ecfdf5;border-radius:8px;border-left:3px solid #059669;">' +
          '<div style="font-size:0.65rem;font-weight:700;color:#059669;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:4px;">Strengths</div>' +
          '<div style="font-size:0.82rem;color:#374151;line-height:1.5;">'+latest.strengths+'</div>' +
        '</div>';
      }
      if (latest.areas_to_improve) {
        html += '<div style="margin-top:8px;padding:12px 14px;background:#fffbeb;border-radius:8px;border-left:3px solid #d97706;">' +
          '<div style="font-size:0.65rem;font-weight:700;color:#d97706;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:4px;">Areas to Improve</div>' +
          '<div style="font-size:0.82rem;color:#374151;line-height:1.5;">'+latest.areas_to_improve+'</div>' +
        '</div>';
      }
      if (latest.coach_comments) {
        html += '<div style="margin-top:8px;padding:12px 14px;background:#f8fafc;border-radius:8px;border-left:3px solid #2563eb;">' +
          '<div style="font-size:0.65rem;font-weight:700;color:#2563eb;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:4px;">Coach Comments</div>' +
          '<div style="font-size:0.82rem;color:#374151;line-height:1.5;">'+latest.coach_comments+'</div>' +
        '</div>';
      }

      html += '</div>';
    }

    /* ── 6. PRACTICE HISTORY ─────────────────────────────────── */

    if (grades.length > 0) {
      html += sectionHeader('Practice History');

      var sorted = grades.slice().sort(function(a,b){ return new Date(b.session_date) - new Date(a.session_date); });
      sorted.forEach(function(g, idx) {
        var a = parseFloat(g.weighted_average);
        var t = tier(a);
        var dt = fd(g.session_date);
        var title = g.session_title || 'Practice';
        var cid = 'ph-' + idx;

        html += '<div class="bg-white rounded-xl shadow-md" style="margin-bottom:8px;overflow:hidden;border-left:4px solid '+t.accent+';cursor:pointer;" onclick="(function(){var d=document.getElementById(\''+cid+'\');d.style.display=d.style.display===\'none\'?\'block\':\'none\';})()">' +
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
          '<div id="'+cid+'" style="display:none;padding:0 20px 16px;border-top:1px solid #f3f4f6;">';

        // Category scores with bars
        CATEGORIES.forEach(function(cat) {
          var v = parseFloat(g[cat.key]) || 0;
          var tAvg = teamAvgs ? teamAvgs[cat.key] : null;
          var color = sc(v);
          html += '<div style="display:flex;align-items:center;gap:10px;padding:6px 0;">' +
            '<span style="font-size:0.75rem;font-weight:500;color:#6b7280;min-width:160px;">'+cat.label+'</span>' +
            scoreBar(v, tAvg, 10) +
            '<span style="font-size:0.85rem;font-weight:800;color:'+color+';min-width:32px;text-align:right;">'+v.toFixed(1)+'</span>' +
          '</div>';
        });

        if (g.coach_narrative) {
          html += '<div style="margin-top:12px;padding:12px 14px;background:#f8fafc;border-radius:8px;font-size:0.82rem;color:#374151;line-height:1.6;font-weight:500;border-left:3px solid #2563eb;">'+g.coach_narrative+'</div>';
        }

        html += '</div></div>';
      });
    }

    /* ── 7. COACH NOTES TIMELINE ─────────────────────────────── */

    var allNotes = [];
    grades.forEach(function(g) {
      if (g.coach_narrative) allNotes.push({ date: g.session_date, title: g.session_title || 'Practice', text: g.coach_narrative, type: 'practice' });
    });
    games.forEach(function(g) {
      if (g.coach_notes) allNotes.push({ date: g.game_date, title: 'vs ' + g.opponent, text: g.coach_notes, type: 'game' });
    });
    if (evals.length > 0 && evals[0].coach_comments) {
      allNotes.push({ date: evals[0].evaluation_date, title: 'Skill Evaluation', text: evals[0].coach_comments, type: 'eval' });
    }

    if (allNotes.length > 0) {
      allNotes.sort(function(a,b){ return new Date(b.date) - new Date(a.date); });
      html += sectionHeader('Coach Notes');

      allNotes.slice(0, 8).forEach(function(n) {
        var accentMap = { practice: '#2563eb', game: '#059669', eval: '#7c3aed' };
        var ac = accentMap[n.type] || '#2563eb';
        html += '<div class="bg-white rounded-xl shadow-md" style="margin-bottom:8px;padding:16px 20px;border-left:4px solid '+ac+';">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
            '<span style="font-weight:700;font-size:0.85rem;color:#111;">'+n.title+'</span>' +
            '<span style="font-size:0.7rem;color:#9ca3af;font-weight:600;">'+fd(n.date)+'</span>' +
          '</div>' +
          '<p style="font-size:0.85rem;color:#374151;line-height:1.6;margin:0;font-weight:500;">'+n.text+'</p>' +
        '</div>';
      });
    }

    /* ── 8. TREND EXPLANATION ────────────────────────────────── */

    if (grades.length > 0) {
      var tr = trendOf(grades);
      html += '<div style="margin-top:16px;padding:16px 20px;background:#f8fafc;border-radius:12px;border:1px solid #e5e7eb;">' +
        '<div style="font-size:0.65rem;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px;">How Trend is Calculated</div>' +
        '<div style="font-size:0.78rem;color:#6b7280;line-height:1.6;">'+TREND_DESCRIPTIONS[tr.label]+' Trend compares the average weighted score of the most recent half of graded practices against the earlier half. A difference greater than 0.3 in either direction triggers an Improving or Declining label.</div>' +
      '</div>';
    }

    /* ── PARENT STAT CONTRIBUTION CTA (always shown) ─────────── */

    html += '<div style="' +
      'background:#fff;border-radius:16px;padding:20px 24px;box-shadow:0 2px 12px rgba(0,0,0,0.06);' +
      'border:1px solid #e5e7eb;margin-top:20px;display:flex;align-items:center;gap:14px;">' +

      '<div style="flex-shrink:0;width:40px;height:40px;border-radius:10px;background:#f0f4ff;display:flex;align-items:center;justify-content:center;">' +
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>' +
          '<rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>' +
          '<line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/>' +
        '</svg>' +
      '</div>' +

      '<div style="flex:1;">' +
        '<div style="font-size:0.82rem;font-weight:700;color:#111;margin-bottom:2px;">Parents Can Help</div>' +
        '<div style="font-size:0.75rem;color:#6b7280;line-height:1.5;">' +
          'Track your player\'s game stats (points, rebounds, assists, steals) and share them with Coach Scott or Coach Gene. We\'ll add them to the system.' +
        '</div>' +
      '</div>' +

    '</div>';

    container.innerHTML = html;
  }

  /* ── Main ──────────────────────────────────────────────────── */

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
        fetchEvaluations(client, athleteId),
        resolveAthleteProfile(client, athleteId),
      ]);
      var grades = results[0];
      var games = results[1];
      var evals = results[2];
      var profile = results[3];
      var athleteName = profile.name;
      var teamAvgs = await fetchTeamAverages(client, grades);
      renderAll(athleteName, grades, teamAvgs, games, evals, profile);
      console.log('[Perf] Rendered ' + grades.length + ' grades, ' + games.length + ' games, ' + evals.length + ' evaluations.');
    } catch (err) {
      console.error('[Perf] Error:', err);
    }
  }

  /* ── Init ──────────────────────────────────────────────────── */

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
