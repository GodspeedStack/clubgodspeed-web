/**
 * supabase-data-bridge.js
 *
 * Drop-in bridge between the Supabase athlete data layer and the existing
 * portal-data.js mock-data contract.
 *
 * HOW IT WORKS
 * ────────────
 * 1. Loads AFTER portal-data.js (which seeds the localStorage cache with mock data).
 * 2. On DOMContentLoaded, checks for an authenticated Supabase session.
 * 3. If authenticated, fetches live data from the new Supabase tables.
 * 4. Transforms the relational data into the flat GODSPEED_DATA shape
 *    that parent-portal.js already consumes via getDB().
 * 5. Merges live data into the cache (preserving fields that don't yet
 *    have a Supabase source -- e.g. training hours/packages).
 * 6. Calls saveDB() to persist, then dispatches a 'liveDataReady' event
 *    so any component can re-render.
 *
 * ZERO changes to parent-portal.js required.
 *
 * PREREQUISITES
 * ─────────────
 * - env-injector.js loaded (provides window.SUPABASE_CONFIG)
 * - auth-supabase.js loaded (provides window.auth.getSupabaseClient())
 * - portal-data.js loaded (provides getDB(), saveDB(), GODSPEED_DATA)
 */

(function () {
  'use strict';

  // -- Feature flag (debug only) ----
  // Set window.GS_USE_MOCK = true in browser console to force mock data.
  // Production default: live Supabase data.
  if (window.GS_USE_MOCK === true) {
    console.warn('[DataBridge] Mock mode enabled via GS_USE_MOCK flag -- skipping live fetch.');
    return;
  }

  // -- Helpers ----

  /**
   * Safe Supabase client accessor.
   * Returns null if auth layer isn't loaded yet.
   */
  function getClient() {
    try {
      return window.auth && typeof window.auth.getSupabaseClient === 'function'
        ? window.auth.getSupabaseClient()
        : null;
    } catch (_) {
      return null;
    }
  }

  /**
   * Map enrollment_status -> tier label used by the portal UI.
   */
  function statusToTier(status, role) {
    if (role === 'starter' || role === 'captain') return 'Elite/Starter';
    if (role === 'rotation') return 'Rotation/Starter';
    if (status === 'active') return 'Development';
    if (status === 'trial') return 'Trial';
    return 'Limited';
  }

  /**
   * Compute trend from recent evaluations or attendance ratings.
   * Returns 'Up', 'Steady', 'Declining', or 'New'.
   */
  function computeTrend(ratings) {
    if (!ratings || ratings.length < 2) return 'New';
    const recent = ratings.slice(-3);
    const first = recent[0];
    const last = recent[recent.length - 1];
    const diff = last - first;
    if (diff > 0.3) return 'Up';
    if (diff < -0.3) return 'Declining';
    return 'Steady';
  }

  /**
   * Generate initials from a name string.
   */
  function initials(firstName, lastName) {
    const f = (firstName || '').charAt(0).toUpperCase();
    const l = (lastName || '').charAt(0).toUpperCase();
    return f + l || f || '?';
  }

  // -- Main fetch & transform ----

  async function fetchLiveData() {
    const client = getClient();
    if (!client) {
      console.warn('[DataBridge] No Supabase client available.');
      return null;
    }

    // Check for authenticated session
    const { data: sessionData } = await client.auth.getSession();
    if (!sessionData?.session) {
      console.log('[DataBridge] No active session -- using cached data.');
      return null;
    }

    const userId = sessionData.session.user.id;
    const userEmail = sessionData.session.user.email;

    // -- Parallel fetches ----
    const [
      athletesRes,
      teamsRes,
      rostersRes,
      trainSessionsRes,
      attendanceRes,
      gamesRes,
      gameStatsRes,
      evaluationsRes,
      uploadsRes,
      parentAccountRes,
    ] = await Promise.all([
      client.from('athletes').select('*'),
      client.from('teams').select('*'),
      client.from('team_rosters').select('*'),
      client.from('training_sessions').select('*').order('session_date', { ascending: false }).limit(50),
      client.from('training_attendance').select('*'),
      client.from('games').select('*').order('game_date', { ascending: false }).limit(50),
      client.from('player_game_stats').select('*'),
      client.from('player_evaluations').select('*').order('evaluation_date', { ascending: false }),
      client.from('data_uploads').select('*').order('created_at', { ascending: false }).limit(20),
      client.from('parent_accounts').select('*').eq('user_id', userId).maybeSingle(),
    ]);

    // Abort on critical failure
    if (athletesRes.error) {
      console.error('[DataBridge] athletes fetch failed:', athletesRes.error.message);
      return null;
    }

    const athletes = athletesRes.data || [];
    const teams = teamsRes.data || [];
    const rosters = rostersRes.data || [];
    const trainSessions = trainSessionsRes.data || [];
    const attendance = attendanceRes.data || [];
    const games = gamesRes.data || [];
    const gameStats = gameStatsRes.data || [];
    const evaluations = evaluationsRes.data || [];
    const parentAccount = parentAccountRes.data;

    // -- Build roster lookup ----
    const rosterRoleMap = {};
    for (const r of rosters) {
      rosterRoleMap[r.athlete_id] = r.role;
    }

    // -- Build attendance-by-athlete for trend calculation ----
    const attendanceByAthlete = {};
    for (const a of attendance) {
      if (!attendanceByAthlete[a.athlete_id]) attendanceByAthlete[a.athlete_id] = [];
      attendanceByAthlete[a.athlete_id].push(a.effort_rating || 0);
    }

    // -- Build evaluation averages by athlete ----
    const evalsByAthlete = {};
    for (const e of evaluations) {
      if (!evalsByAthlete[e.athlete_id]) evalsByAthlete[e.athlete_id] = [];
      evalsByAthlete[e.athlete_id].push(e);
    }

    // -- Transform: athletes -> roster[] ----
    const rosterData = athletes.map((a) => {
      const role = rosterRoleMap[a.id] || 'rotation';
      const evals = evalsByAthlete[a.id] || [];
      const latestEval = evals[0]; // already sorted desc
      const avgGrade = latestEval ? parseFloat(latestEval.overall_rating) || 0 : 0;
      const effortRatings = attendanceByAthlete[a.id] || [];
      const trend = evals.length > 0
        ? computeTrend(evals.map((e) => parseFloat(e.overall_rating) || 0))
        : computeTrend(effortRatings);

      const entry = {
        athleteId: a.id,
        teamId: a.team_name || 'TEAM-UNASSIGNED',
        name: a.first_name,
        initials: initials(a.first_name, a.last_name),
        tier: statusToTier(a.enrollment_status, role),
        avg_grade: avgGrade,
        trend: trend,
        notes: a.notes || '',
        parentId: userEmail, // RLS ensures we only see our own
      };

      // Attach coach assessment from latest evaluation
      if (latestEval) {
        entry.coachAssessment = {
          updatedDate: latestEval.evaluation_date,
          developmentGoal: '',
          coachNote: latestEval.coach_comments || '',
          strengths: latestEval.strengths
            ? [{ label: 'Strengths', detail: latestEval.strengths }]
            : [],
          areasForDevelopment: latestEval.areas_to_improve
            ? [{ label: 'Areas to Improve', detail: latestEval.areas_to_improve }]
            : [],
          outlook: '',
        };
      }

      return entry;
    });

    // -- Transform: teams -> teams[] ----
    const teamsData = teams.map((t) => ({
      id: t.id,
      name: t.name,
      category: t.age_group || '',
      coach: t.head_coach || 'TBD',
    }));

    // -- Transform: training_attendance -> grades[] ----
    const gradesData = [];
    for (const a of attendance) {
      const session = trainSessions.find((s) => s.id === a.session_id);
      const skillRatings = a.skill_ratings || {};
      const scores = {
        focus: skillRatings.focus || a.effort_rating || 0,
        hustle: skillRatings.hustle || a.effort_rating || 0,
        skill: skillRatings.skill || 0,
        iq: skillRatings.iq || 0,
        avg: a.effort_rating || 0,
      };
      gradesData.push({
        gradeId: a.id,
        athleteId: a.athlete_id,
        date: session ? session.session_date : null,
        type: session ? session.session_type.replace(/_/g, ' ') : 'Practice',
        scores: scores,
        notes: a.coach_notes || '',
      });
    }

    // -- Transform: games + player_game_stats -> gameAnalysis ----
    const recentGames = games.slice(0, 10).map((g) => ({
      date: g.game_date,
      opponent: g.opponent_name,
      result: g.result === 'W' ? 'Win' : g.result === 'L' ? 'Loss' : 'Tie',
      score: (g.team_score || 0) + '-' + (g.opponent_score || 0),
    }));

    // Build standouts from the most recent game
    const latestGame = games[0];
    const standouts = [];
    if (latestGame) {
      const latestStats = gameStats.filter((s) => s.game_id === latestGame.id);
      for (const stat of latestStats) {
        const athlete = athletes.find((a) => a.id === stat.athlete_id);
        if (!athlete) continue;
        standouts.push({
          playerId: stat.athlete_id,
          stats: {
            points: stat.points || 0,
            rebounds: stat.total_rebounds || 0,
            assists: stat.assists || 0,
            steals: stat.steals || 0,
            blocks: stat.blocks || 0,
          },
          notes: stat.coach_notes || '',
        });
      }
    }

    const gameAnalysis = {
      meta: latestGame
        ? {
            opponent: latestGame.opponent_name,
            date: latestGame.game_date,
            result: latestGame.result === 'W' ? 'Win' : latestGame.result === 'L' ? 'Loss' : 'Tie',
          }
        : { opponent: 'N/A', date: 'N/A', result: 'N/A' },
      recentGames: recentGames,
      standouts: standouts,
      fourFactors: null,
      invisibleBoxScore: null,
      trends: null,
      patterns: null,
      prescription: null,
    };

    // -- Transform: games -> gameLog[] ----
    const gameLog = games.map((g) => ({
      id: g.id,
      date: g.game_date,
      opponent: g.opponent_name || 'Unknown',
      scoreUs: g.team_score || 0,
      scoreThem: g.opponent_score || 0,
      result: g.result === 'W' ? 'W' : g.result === 'L' ? 'L' : 'N/A',
    }));

    // -- Transform: games -> seasonStats ----
    const gamesWithResult = games.filter((g) => g.result === 'W' || g.result === 'L');
    const wins = gamesWithResult.filter((g) => g.result === 'W').length;
    const losses = gamesWithResult.filter((g) => g.result === 'L').length;
    const gp = gamesWithResult.length;
    const pf = gamesWithResult.reduce((sum, g) => sum + (g.team_score || 0), 0);
    const pa = gamesWithResult.reduce((sum, g) => sum + (g.opponent_score || 0), 0);
    const seasonStats = {
      gp: gp,
      wins: wins,
      losses: losses,
      pf: pf,
      pa: pa,
      avgPf: gp > 0 ? Math.round((pf / gp) * 10) / 10 : 0,
      avgPa: gp > 0 ? Math.round((pa / gp) * 10) / 10 : 0,
      margin: gp > 0 ? Math.round(((pf - pa) / gp) * 10) / 10 : 0,
    };

    // -- Transform: player_game_stats -> playerPerformance[] ----
    const statsByAthlete = {};
    for (const s of gameStats) {
      if (!statsByAthlete[s.athlete_id]) statsByAthlete[s.athlete_id] = [];
      statsByAthlete[s.athlete_id].push(s);
    }

    const playerPerformance = athletes.map((a) => {
      const pStats = statsByAthlete[a.id] || [];
      const totalGames = pStats.length;
      if (totalGames === 0) {
        return {
          name: a.first_name + ' ' + (a.last_name || '').charAt(0) + '.',
          highlight: 'No game data yet',
          notes: '',
        };
      }
      const totals = pStats.reduce(
        (acc, s) => ({
          pts: acc.pts + (s.points || 0),
          reb: acc.reb + (s.total_rebounds || 0),
          ast: acc.ast + (s.assists || 0),
          stl: acc.stl + (s.steals || 0),
          blk: acc.blk + (s.blocks || 0),
        }),
        { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0 }
      );
      const avg = (v) => (totalGames > 0 ? (v / totalGames).toFixed(1) : '0');
      return {
        name: a.first_name + ' ' + (a.last_name || '').charAt(0) + '.',
        highlight:
          avg(totals.pts) + ' PPG | ' +
          avg(totals.reb) + ' RPG | ' +
          avg(totals.ast) + ' APG',
        notes: pStats[0].coach_notes || '',
      };
    });

    // -- Transform: reports (derived from roster) ----
    const reports = {};
    for (const r of rosterData) {
      reports[r.athleteId] = {
        tier: r.tier,
        avg: r.avg_grade,
        trend: r.trend,
        focus: 'General Development',
        content: '<h4>Performance Snapshot</h4><p>' + (r.notes || 'No notes') + '</p>',
      };
    }

    // -- Assemble GODSPEED_DATA shape ----
    return {
      teams: teamsData,
      roster: rosterData,
      reports: reports,
      grades: gradesData,
      gameAnalysis: gameAnalysis,
      gameLog: gameLog,
      seasonStats: seasonStats,
      playerPerformance: playerPerformance,
      // Fields below don't have Supabase sources yet --
      // they'll be merged with existing mock/cached values.
      _liveLoaded: true,
      _loadedAt: new Date().toISOString(),
      _userId: userId,
    };
  }

  // -- Merge & persist ----

  async function hydrateLiveData() {
    try {
      const liveData = await fetchLiveData();
      if (!liveData) return; // No session or fetch failed -- keep mock

      // Get current cached data (mock baseline)
      const cached = typeof getDB === 'function' ? getDB() : {};

      // Merge: live data wins, but preserve fields without a live source
      const merged = Object.assign({}, cached, {
        teams: liveData.teams.length > 0 ? liveData.teams : cached.teams,
        roster: liveData.roster.length > 0 ? liveData.roster : cached.roster,
        reports: Object.keys(liveData.reports).length > 0 ? liveData.reports : cached.reports,
        grades: liveData.grades.length > 0 ? liveData.grades : cached.grades,
        gameAnalysis: liveData.gameAnalysis.recentGames.length > 0
          ? liveData.gameAnalysis
          : cached.gameAnalysis,
        gameLog: liveData.gameLog.length > 0 ? liveData.gameLog : cached.gameLog,
        seasonStats: liveData.seasonStats.gp > 0 ? liveData.seasonStats : cached.seasonStats,
        playerPerformance: liveData.playerPerformance.length > 0
          ? liveData.playerPerformance
          : cached.playerPerformance,
        // Preserve these from cache until they have Supabase sources:
        coaches: cached.coaches,
        warRoomInsights: cached.warRoomInsights,
        training: cached.training,
        accounts: cached.accounts,
        trainingRecords: cached.trainingRecords,
        // Metadata
        _liveLoaded: true,
        _loadedAt: liveData._loadedAt,
      });

      // Persist via the existing saveDB contract
      if (typeof saveDB === 'function') {
        saveDB(merged);
      } else {
        localStorage.setItem('gba_db', JSON.stringify(merged));
      }

      // Invalidate in-memory cache so next getDB() picks up live data
      if (typeof GBA_DB_CACHE !== 'undefined') {
        window.GBA_DB_CACHE = null;
      }

      console.log(
        '[DataBridge] Live data loaded. Athletes:', liveData.roster.length,
        '| Grades:', liveData.grades.length,
        '| Games:', liveData.gameAnalysis.recentGames.length
      );

      // Dispatch event for any components that want to re-render
      window.dispatchEvent(new CustomEvent('liveDataReady', { detail: merged }));

      // If loadPerformance exists, trigger a re-render
      if (typeof loadPerformance === 'function') {
        try { loadPerformance(); } catch (_) { /* non-critical */ }
      }
      if (typeof renderTrainingDashboard === 'function') {
        try { renderTrainingDashboard(); } catch (_) { /* non-critical */ }
      }

    } catch (err) {
      console.error('[DataBridge] Hydration failed:', err);
      // Graceful degradation -- mock data stays in place
    }
  }

  // -- Bootstrap ----

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', hydrateLiveData);
  } else {
    // DOM already loaded (script deferred or loaded late)
    hydrateLiveData();
  }
})();
