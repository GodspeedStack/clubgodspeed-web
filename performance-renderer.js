/**
 * performance-renderer.js
 *
 * Renders the V2 Practice Grading System data into the parent portal
 * performance view. Fetches from Supabase practice_grades table and
 * player_game_stats, then renders category bars, practice history,
 * game analytics, and coach notes.
 *
 * Requires: auth-supabase.js, supabase client available
 * Mounts into: #view-performance DOM nodes
 */
(function () {
  'use strict';

  // -- Constants --
  const CATEGORIES = [
    { key: 'effort_energy', label: 'Effort / Energy', weight: 0.20 },
    { key: 'competitiveness', label: 'Competitiveness', weight: 0.20 },
    { key: 'on_ball_defense', label: 'On-Ball Defense', weight: 0.15 },
    { key: 'help_side_rotations', label: 'Help-Side / Rotations', weight: 0.15 },
    { key: 'listening_coachability', label: 'Listening / Coachability', weight: 0.15 },
    { key: 'communication_leadership', label: 'Communication / Leadership', weight: 0.10 },
    { key: 'offense_shooting', label: 'Offense / Shooting', weight: 0.05 },
  ];

  const TIER_COLORS = {
    'Elite/Starter': { bg: '#dcfce7', text: '#166534' },
    'Rotation/Starter': { bg: '#dbeafe', text: '#1e40af' },
    'Development': { bg: '#fef3c7', text: '#92400e' },
    'Limited': { bg: '#fed7aa', text: '#9a3412' },
    'Below Standard': { bg: '#fecaca', text: '#991b1b' },
  };

  // -- Helpers --

  function getClient() {
    try {
      return window.auth && typeof window.auth.getSupabaseClient === 'function'
        ? window.auth.getSupabaseClient()
        : (window.supabaseClient || null);
    } catch (_) {
      return null;
    }
  }

  /**
   * Resolve the athlete ID for the logged-in parent.
   * Priority: localStorage > GODSPEED_DATA roster > Supabase query
   */
  async function resolveAthleteId(client) {
    // 1. Check localStorage (may be set by other modules)
    const stored = localStorage.getItem('gba_current_athlete');
    if (stored) return stored;

    // 2. Check data bridge roster
    const email = localStorage.getItem('gba_user_email');
    const db = (typeof getDB === 'function' ? getDB() : null) || window.GODSPEED_DATA || null;
    if (db && db.roster && email) {
      const match = db.roster.find(function (a) { return a.parentId === email; });
      if (match && match.athleteId) return match.athleteId;
    }

    // 3. Query Supabase: profiles -> parent_accounts -> athletes
    if (client && email) {
      try {
        var _a = await client
          .from('parent_accounts')
          .select('id, athletes(id)')
          .eq('email', email)
          .limit(1)
          .single();
        var pa = _a.data;
        if (pa && pa.athletes && pa.athletes.length > 0) {
          return pa.athletes[0].id;
        }
      } catch (_) { /* fall through */ }
    }

    // 4. Query via user_id from auth session
    if (client) {
      try {
        var session = await client.auth.getSession();
        var userId = session?.data?.session?.user?.id;
        if (userId) {
          var _b = await client
            .from('parent_accounts')
            .select('id, athletes:athletes(id)')
            .eq('user_id', userId)
            .limit(1)
            .single();
          var pa2 = _b.data;
          if (pa2 && pa2.athletes && pa2.athletes.length > 0) {
            return pa2.athletes[0].id;
          }
        }
      } catch (_) { /* fall through */ }
    }

    return null;
  }

  function tierFromAvg(avg) {
    if (avg == null) return null;
    if (avg >= 9.0) return 'Elite/Starter';
    if (avg >= 8.0) return 'Rotation/Starter';
    if (avg >= 7.0) return 'Development';
    if (avg >= 6.0) return 'Limited';
    return 'Below Standard';
  }

  function computeTrendLabel(grades) {
    if (!grades || grades.length < 2) return { label: 'New', color: '#6b7280' };
    const sorted = [...grades].sort((a, b) => new Date(a.session_date) - new Date(b.session_date));
    const len = sorted.length;
    const recent = sorted.slice(Math.max(0, len - 2));
    const earlier = sorted.slice(0, Math.min(2, len));
    const avgRecent = recent.reduce((s, g) => s + parseFloat(g.weighted_average), 0) / recent.length;
    const avgEarlier = earlier.reduce((s, g) => s + parseFloat(g.weighted_average), 0) / earlier.length;
    const diff = avgRecent - avgEarlier;
    if (diff > 0.3) return { label: 'Improving', color: '#059669' };
    if (diff < -0.3) return { label: 'Declining', color: '#dc2626' };
    return { label: 'Steady', color: '#d97706' };
  }

  function barColor(score) {
    if (score >= 9.0) return '#059669';
    if (score >= 8.0) return '#2563eb';
    if (score >= 7.0) return '#d97706';
    if (score >= 6.0) return '#ea580c';
    return '#dc2626';
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  // -- Rendering --

  function renderTierBadge(tier) {
    const el = document.getElementById('perf-tier-badge');
    if (!el) return;
    if (!tier) { el.style.display = 'none'; return; }
    const colors = TIER_COLORS[tier] || { bg: '#f3f4f6', text: '#374151' };
    el.style.display = 'inline-block';
    el.style.background = colors.bg;
    el.style.color = colors.text;
    el.textContent = tier;
  }

  function renderKPIs(grades) {
    const avgEl = document.getElementById('perf-overall-avg');
    const trendEl = document.getElementById('perf-trend');
    const countEl = document.getElementById('perf-practices-count');

    if (grades.length === 0) {
      if (avgEl) avgEl.textContent = '--';
      if (trendEl) trendEl.textContent = '--';
      if (countEl) countEl.textContent = '0';
      renderTierBadge(null);
      return;
    }

    const overallAvg = (grades.reduce((s, g) => s + parseFloat(g.weighted_average), 0) / grades.length).toFixed(2);
    const trend = computeTrendLabel(grades);
    const latestGrade = [...grades].sort((a, b) => new Date(b.session_date) - new Date(a.session_date))[0];
    const currentTier = latestGrade ? tierFromAvg(parseFloat(latestGrade.weighted_average)) : tierFromAvg(parseFloat(overallAvg));

    if (avgEl) {
      avgEl.textContent = overallAvg;
      avgEl.style.color = barColor(parseFloat(overallAvg));
    }
    if (trendEl) {
      trendEl.textContent = trend.label;
      trendEl.style.color = trend.color;
    }
    if (countEl) countEl.textContent = String(grades.length);
    renderTierBadge(currentTier);
  }

  function renderCategoryBars(grades, teamAvgs) {
    const container = document.getElementById('perf-category-bars');
    if (!container) return;
    if (grades.length === 0) {
      container.innerHTML = '<div style="font-size:0.85rem;color:#9ca3af;font-weight:500;">No practice grade data available yet.</div>';
      return;
    }

    let html = '';
    for (const cat of CATEGORIES) {
      const playerAvg = grades.reduce((s, g) => s + (parseFloat(g[cat.key]) || 0), 0) / grades.length;
      const teamAvg = teamAvgs ? (teamAvgs[cat.key] || 0) : null;
      const pct = Math.min(100, (playerAvg / 10) * 100);
      const teamPct = teamAvg ? Math.min(100, (teamAvg / 10) * 100) : 0;
      const weightLabel = Math.round(cat.weight * 100) + '%';

      html += `
        <div>
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:3px;">
            <span style="font-size:0.8rem;font-weight:700;color:#111;">${cat.label}</span>
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="font-size:0.7rem;color:#9ca3af;font-weight:500;">${weightLabel}</span>
              <span style="font-size:0.85rem;font-weight:800;color:${barColor(playerAvg)};">${playerAvg.toFixed(1)}</span>
              ${teamAvg != null ? `<span style="font-size:0.7rem;color:#9ca3af;font-weight:500;" title="Team average">Team: ${teamAvg.toFixed(1)}</span>` : ''}
            </div>
          </div>
          <div style="position:relative;width:100%;height:8px;background:#e5e7eb;border-radius:4px;overflow:visible;">
            <div style="position:absolute;top:0;left:0;height:100%;width:${pct}%;background:${barColor(playerAvg)};border-radius:4px;transition:width 0.4s ease;"></div>
            ${teamAvg != null ? `<div style="position:absolute;top:-2px;left:${teamPct}%;width:2px;height:12px;background:#9ca3af;border-radius:1px;" title="Team avg: ${teamAvg.toFixed(1)}"></div>` : ''}
          </div>
        </div>`;
    }
    container.innerHTML = html;
  }

  function renderPracticeHistory(grades) {
    const container = document.getElementById('perf-practice-history');
    if (!container) return;

    // Sort newest first
    const sorted = [...grades].sort((a, b) => new Date(b.session_date) - new Date(a.session_date));

    if (sorted.length === 0) {
      container.innerHTML = '<div style="font-size:0.85rem;color:#9ca3af;font-weight:500;">No practice sessions recorded yet.</div>';
      return;
    }

    let html = '';
    for (const g of sorted) {
      const avg = parseFloat(g.weighted_average);
      const tier = g.tier || tierFromAvg(avg);
      const colors = TIER_COLORS[tier] || { bg: '#f3f4f6', text: '#374151' };
      const dateLabel = formatDate(g.session_date);
      const sessionTitle = g.session_title || 'Practice';

      html += `
        <div style="border:1px solid #f3f4f6;border-radius:12px;padding:14px 16px;background:#fafafa;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <div>
              <span style="font-weight:700;font-size:0.9rem;color:#111;">${sessionTitle}</span>
              <span style="font-size:0.75rem;color:#6b7280;font-weight:500;margin-left:8px;">${dateLabel}</span>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="font-size:1.1rem;font-weight:900;color:${barColor(avg)};">${avg.toFixed(2)}</span>
              <span style="padding:2px 8px;border-radius:12px;font-size:0.65rem;font-weight:700;text-transform:uppercase;background:${colors.bg};color:${colors.text};">${tier}</span>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:4px 12px;">
            ${CATEGORIES.map(cat => {
              const val = parseFloat(g[cat.key]) || 0;
              return `<div style="display:flex;justify-content:space-between;font-size:0.75rem;padding:2px 0;">
                <span style="color:#6b7280;font-weight:500;">${cat.label}</span>
                <span style="font-weight:700;color:${barColor(val)};">${val.toFixed(1)}</span>
              </div>`;
            }).join('')}
          </div>
          ${g.coach_narrative ? `<div style="margin-top:8px;padding-top:8px;border-top:1px solid #e5e7eb;font-size:0.8rem;color:#374151;line-height:1.5;font-weight:500;">${g.coach_narrative}</div>` : ''}
        </div>`;
    }
    container.innerHTML = html;
  }

  function renderGameAnalytics(seasonStats, gameLog) {
    const elPpg = document.getElementById('stat-ppg');
    const elApg = document.getElementById('stat-apg');
    const elRpg = document.getElementById('stat-rpg');
    const elSpg = document.getElementById('stat-spg');

    if (seasonStats) {
      const disp = (v) => (v != null && v !== '') ? v : 'N/A';
      if (elPpg) elPpg.textContent = disp(seasonStats.ppg);
      if (elApg) elApg.textContent = disp(seasonStats.apg);
      if (elRpg) elRpg.textContent = disp(seasonStats.rpg);
      if (elSpg) elSpg.textContent = disp(seasonStats.spg);
    }

    const logContainer = document.getElementById('perf-game-log');
    if (!logContainer || !gameLog || gameLog.length === 0) return;

    let html = '';
    for (const entry of gameLog) {
      const resultColor = entry.result === 'W' ? '#059669' : entry.result === 'L' ? '#dc2626' : '#6b7280';
      const resultLabel = entry.result === 'W' ? 'Win' : entry.result === 'L' ? 'Loss' : 'Tie';
      html += `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #f3f4f6;">
          <div>
            <span style="font-weight:700;font-size:0.85rem;color:#111;">${entry.opponent_name || 'Opponent'}</span>
            <span style="font-size:0.75rem;color:#6b7280;margin-left:8px;">${formatDate(entry.game_date)}</span>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            ${entry.team_score != null ? `<span style="font-size:0.85rem;font-weight:700;color:#111;">${entry.team_score}-${entry.opponent_score}</span>` : ''}
            <span style="font-size:0.7rem;font-weight:700;color:${resultColor};text-transform:uppercase;">${resultLabel}</span>
          </div>
        </div>`;
    }
    logContainer.innerHTML = html;
  }

  function renderCoachNotes(grades) {
    const container = document.getElementById('coach-notes-container');
    if (!container) return;

    const withNotes = grades.filter(g => g.coach_narrative).sort((a, b) => new Date(b.session_date) - new Date(a.session_date));
    if (withNotes.length === 0) {
      container.innerHTML = '<div style="font-size:0.85rem;color:#9ca3af;font-weight:500;">No coach notes available yet.</div>';
      return;
    }

    container.innerHTML = withNotes.slice(0, 5).map((g, idx) => `
      <div style="border-left:3px solid ${idx === 0 ? '#2563eb' : '#d1d5db'};padding-left:1rem;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
          <div style="font-weight:700;font-size:0.85rem;color:#111;">${g.session_title || 'Practice'}</div>
          <div style="font-size:0.7rem;color:#6b7280;font-weight:600;">${formatDate(g.session_date)}</div>
        </div>
        <p style="font-size:0.85rem;color:#374151;line-height:1.5;margin:0;font-weight:500;">${g.coach_narrative}</p>
      </div>
    `).join('');
  }

  // -- Data Fetching --

  async function fetchPracticeGrades(client, athleteId) {
    const { data, error } = await client
      .from('practice_grades')
      .select('*, training_sessions!inner(session_date, title, team_id)')
      .eq('athlete_id', athleteId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[PerfRenderer] practice_grades fetch error:', error.message);
      return [];
    }

    // Flatten the joined session data
    return (data || []).map(row => ({
      ...row,
      session_date: row.training_sessions?.session_date,
      session_title: row.training_sessions?.title,
      team_id: row.training_sessions?.team_id,
    }));
  }

  async function fetchTeamAverages(client, grades) {
    if (!grades || grades.length === 0) return null;
    // Get unique session IDs
    const sessionIds = [...new Set(grades.map(g => g.session_id))];
    if (sessionIds.length === 0) return null;

    // Fetch all grades for those sessions (team-wide)
    const { data, error } = await client
      .from('practice_grades')
      .select('effort_energy,competitiveness,on_ball_defense,help_side_rotations,listening_coachability,communication_leadership,offense_shooting')
      .in('session_id', sessionIds);

    if (error || !data || data.length === 0) return null;

    const avgs = {};
    for (const cat of CATEGORIES) {
      const vals = data.map(d => parseFloat(d[cat.key])).filter(v => !isNaN(v));
      avgs[cat.key] = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    }
    return avgs;
  }

  async function fetchGameData(client, athleteId) {
    // Season stats view
    const { data: seasonStats } = await client
      .from('player_season_stats')
      .select('*')
      .eq('athlete_id', athleteId)
      .maybeSingle();

    // Recent games with this athlete's stats
    const { data: gameStats } = await client
      .from('player_game_stats')
      .select('*, games!inner(game_date, opponent_name, team_score, opponent_score, result)')
      .eq('athlete_id', athleteId)
      .order('created_at', { ascending: false })
      .limit(10);

    const gameLog = (gameStats || []).map(gs => ({
      game_date: gs.games?.game_date,
      opponent_name: gs.games?.opponent_name,
      team_score: gs.games?.team_score,
      opponent_score: gs.games?.opponent_score,
      result: gs.games?.result,
      points: gs.points,
      assists: gs.assists,
      rebounds: gs.total_rebounds,
      steals: gs.steals,
    }));

    return { seasonStats, gameLog };
  }

  // -- Main Entry --

  async function loadPerformanceV2() {
    const client = getClient();
    if (!client) {
      console.log('[PerfRenderer] No Supabase client. Waiting for auth.');
      return;
    }

    const athleteId = await resolveAthleteId(client);
    if (!athleteId) {
      console.log('[PerfRenderer] Could not resolve athlete ID for logged-in parent.');
      return;
    }
    console.log('[PerfRenderer] Resolved athlete:', athleteId);

    try {
      // Parallel fetches
      const [grades, gameData] = await Promise.all([
        fetchPracticeGrades(client, athleteId),
        fetchGameData(client, athleteId),
      ]);

      // Team averages depend on grades result
      const teamAvgs = await fetchTeamAverages(client, grades);

      // Render all sections
      renderKPIs(grades);
      renderCategoryBars(grades, teamAvgs);
      renderPracticeHistory(grades);
      renderGameAnalytics(gameData.seasonStats, gameData.gameLog);
      renderCoachNotes(grades);

      console.log(`[PerfRenderer] Rendered ${grades.length} practice grades, ${gameData.gameLog.length} game entries.`);
    } catch (err) {
      console.error('[PerfRenderer] Error loading performance data:', err);
    }
  }

  // -- Initialization --

  // Expose for external callers (view switcher, data bridge)
  window.loadPerformanceV2 = loadPerformanceV2;

  // Hook into view switching
  const origSwitch = window.switchPortalView;
  if (origSwitch) {
    window.switchPortalView = function (viewName, linkElement) {
      origSwitch.call(this, viewName, linkElement);
      if (viewName === 'performance') {
        loadPerformanceV2();
      }
    };
  }

  // Also listen for liveDataReady event from data bridge
  document.addEventListener('liveDataReady', function () {
    const perfView = document.getElementById('view-performance');
    if (perfView && perfView.style.display !== 'none') {
      loadPerformanceV2();
    }
  });

  // Auto-load if performance view is already visible on page load
  document.addEventListener('DOMContentLoaded', function () {
    setTimeout(function () {
      const perfView = document.getElementById('view-performance');
      if (perfView && perfView.style.display !== 'none') {
        loadPerformanceV2();
      }
    }, 800);
  });

})();
