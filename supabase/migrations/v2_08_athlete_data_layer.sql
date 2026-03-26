-- ============================================================
-- GODSPEED BASKETBALL — ATHLETE DATA LAYER
-- Complete Migration: Athletes, Training, Games, Stats
-- Parent-Athlete Linkage with AI Auto-Organize Support
-- ============================================================
-- Run this in Supabase SQL Editor as role: postgres
-- ============================================================

BEGIN;

-- ============================================================
-- 1. ATHLETES TABLE — The core entity that was missing
-- ============================================================
CREATE TABLE IF NOT EXISTS public.athletes (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    parent_account_id uuid REFERENCES public.parent_accounts(id) ON DELETE SET NULL,

    -- Identity
    first_name      text NOT NULL,
    last_name       text NOT NULL,
    display_name    text GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED,
    date_of_birth   date,

    -- Athletic Profile
    jersey_number   smallint,
    position        text CHECK (position IN ('PG','SG','SF','PF','C','G','F','UTIL')),
    height_inches   smallint,
    weight_lbs      smallint,
    dominant_hand   text CHECK (dominant_hand IN ('R','L','BOTH')) DEFAULT 'R',

    -- Program Info
    grade           text,
    team_name       text,
    season          text,
    enrollment_status text CHECK (enrollment_status IN ('active','inactive','trial','graduated')) DEFAULT 'active',

    -- Media
    photo_url       text,
    highlight_reel_url text,

    -- Metadata
    notes           text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid REFERENCES auth.users(id),

    -- Constraints
    CONSTRAINT athletes_jersey_range CHECK (jersey_number >= 0 AND jersey_number <= 99)
);

COMMENT ON TABLE public.athletes IS 'Core athlete entity linked to parent accounts and profiles';

-- Index for fast parent lookups (parent portal: "show me my kids")
CREATE INDEX idx_athletes_parent ON public.athletes(parent_account_id);
CREATE INDEX idx_athletes_team ON public.athletes(team_name, season);
CREATE INDEX idx_athletes_profile ON public.athletes(profile_id);
CREATE INDEX idx_athletes_enrollment ON public.athletes(enrollment_status);

-- ============================================================
-- 2. TEAMS TABLE — Structured team management
-- ============================================================
CREATE TABLE IF NOT EXISTS public.teams (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name            text NOT NULL,
    season          text NOT NULL,
    age_group       text,
    head_coach      text,
    assistant_coaches text[],
    max_roster      smallint DEFAULT 15,
    is_active       boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT teams_unique_name_season UNIQUE (name, season)
);

COMMENT ON TABLE public.teams IS 'Team definitions per season';

-- ============================================================
-- 3. TEAM ROSTERS — Many-to-many: athletes <-> teams
-- ============================================================
CREATE TABLE IF NOT EXISTS public.team_rosters (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id         uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    athlete_id      uuid NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
    role            text CHECK (role IN ('starter','rotation','bench','captain')) DEFAULT 'rotation',
    joined_at       timestamptz NOT NULL DEFAULT now(),
    left_at         timestamptz,

    CONSTRAINT team_rosters_unique UNIQUE (team_id, athlete_id)
);

CREATE INDEX idx_team_rosters_team ON public.team_rosters(team_id);
CREATE INDEX idx_team_rosters_athlete ON public.team_rosters(athlete_id);

-- ============================================================
-- 4. TRAINING SESSIONS — Practice/workout tracking
-- ============================================================
CREATE TABLE IF NOT EXISTS public.training_sessions (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Session Info
    session_date    date NOT NULL,
    session_type    text NOT NULL CHECK (session_type IN (
        'team_practice', 'individual_workout', 'skills_clinic',
        'open_gym', 'film_session', 'conditioning', 'scrimmage'
    )),
    title           text,

    -- Context
    team_id         uuid REFERENCES public.teams(id) ON DELETE SET NULL,
    season          text,
    location        text,

    -- Duration
    start_time      time,
    end_time        time,
    duration_minutes smallint,

    -- Content
    drill_plan      jsonb DEFAULT '[]'::jsonb,  -- Array of {drill_name, category, duration_min, notes}
    focus_areas     text[],                      -- e.g. {'shooting','ball_handling','defense'}
    session_notes   text,

    -- Coach
    coach_name      text,
    coach_id        uuid REFERENCES auth.users(id),

    -- Media
    video_urls      text[],

    -- AI Processing
    raw_input       text,           -- Original unstructured input (voice/text)
    ai_processed    boolean DEFAULT false,
    ai_processed_at timestamptz,

    -- Metadata
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid REFERENCES auth.users(id)
);

COMMENT ON TABLE public.training_sessions IS 'Every practice, workout, or training event';

CREATE INDEX idx_training_sessions_date ON public.training_sessions(session_date DESC);
CREATE INDEX idx_training_sessions_team ON public.training_sessions(team_id);
CREATE INDEX idx_training_sessions_type ON public.training_sessions(session_type);
CREATE INDEX idx_training_sessions_season ON public.training_sessions(season);

-- ============================================================
-- 5. TRAINING ATTENDANCE — Who showed up + per-player notes
-- ============================================================
CREATE TABLE IF NOT EXISTS public.training_attendance (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      uuid NOT NULL REFERENCES public.training_sessions(id) ON DELETE CASCADE,
    athlete_id      uuid NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,

    -- Attendance
    status          text NOT NULL CHECK (status IN ('present','absent','late','excused')) DEFAULT 'present',
    arrived_at      time,

    -- Performance Notes
    effort_rating   smallint CHECK (effort_rating >= 1 AND effort_rating <= 5),
    skill_ratings   jsonb DEFAULT '{}'::jsonb,  -- {shooting: 4, handles: 3, defense: 5}
    coach_notes     text,

    -- Drills Completed
    drills_completed jsonb DEFAULT '[]'::jsonb, -- [{drill_name, reps, made, attempted, notes}]

    -- Metadata
    created_at      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT training_attendance_unique UNIQUE (session_id, athlete_id)
);

CREATE INDEX idx_training_attendance_session ON public.training_attendance(session_id);
CREATE INDEX idx_training_attendance_athlete ON public.training_attendance(athlete_id);

-- ============================================================
-- 6. GAMES — Game event tracking
-- ============================================================
CREATE TABLE IF NOT EXISTS public.games (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Game Info
    game_date       date NOT NULL,
    game_time       time,
    game_type       text NOT NULL CHECK (game_type IN (
        'regular_season', 'tournament', 'playoff', 'scrimmage',
        'exhibition', 'championship'
    )),

    -- Teams
    team_id         uuid REFERENCES public.teams(id) ON DELETE SET NULL,
    opponent_name   text NOT NULL,
    is_home         boolean DEFAULT true,
    location        text,

    -- Score
    team_score      smallint,
    opponent_score  smallint,
    result          text GENERATED ALWAYS AS (
        CASE
            WHEN team_score IS NULL OR opponent_score IS NULL THEN NULL
            WHEN team_score > opponent_score THEN 'W'
            WHEN team_score < opponent_score THEN 'L'
            ELSE 'T'
        END
    ) STORED,

    -- Period Scores
    period_scores   jsonb DEFAULT '[]'::jsonb, -- [{period: 1, team: 12, opponent: 8}, ...]

    -- Context
    season          text,
    tournament_name text,

    -- Media
    video_urls      text[],
    game_notes      text,

    -- AI Processing
    raw_input       text,
    ai_processed    boolean DEFAULT false,
    ai_processed_at timestamptz,

    -- Metadata
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid REFERENCES auth.users(id)
);

COMMENT ON TABLE public.games IS 'Every game, scrimmage, or tournament matchup';

CREATE INDEX idx_games_date ON public.games(game_date DESC);
CREATE INDEX idx_games_team ON public.games(team_id);
CREATE INDEX idx_games_season ON public.games(season);
CREATE INDEX idx_games_type ON public.games(game_type);

-- ============================================================
-- 7. PLAYER GAME STATS — Individual box score per game
-- ============================================================
CREATE TABLE IF NOT EXISTS public.player_game_stats (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id         uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
    athlete_id      uuid NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,

    -- Minutes
    minutes_played  smallint,

    -- Scoring
    points          smallint DEFAULT 0,
    field_goals_made smallint DEFAULT 0,
    field_goals_attempted smallint DEFAULT 0,
    three_pointers_made smallint DEFAULT 0,
    three_pointers_attempted smallint DEFAULT 0,
    free_throws_made smallint DEFAULT 0,
    free_throws_attempted smallint DEFAULT 0,

    -- Rebounds
    offensive_rebounds smallint DEFAULT 0,
    defensive_rebounds smallint DEFAULT 0,
    total_rebounds  smallint GENERATED ALWAYS AS (
        COALESCE(offensive_rebounds, 0) + COALESCE(defensive_rebounds, 0)
    ) STORED,

    -- Playmaking
    assists         smallint DEFAULT 0,
    turnovers       smallint DEFAULT 0,

    -- Defense
    steals          smallint DEFAULT 0,
    blocks          smallint DEFAULT 0,
    fouls           smallint DEFAULT 0,

    -- Advanced (optional)
    plus_minus      smallint,
    charges_taken   smallint DEFAULT 0,
    deflections     smallint DEFAULT 0,

    -- Coach Assessment
    performance_rating smallint CHECK (performance_rating >= 1 AND performance_rating <= 5),
    coach_notes     text,

    -- Metadata
    created_at      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT player_game_stats_unique UNIQUE (game_id, athlete_id)
);

COMMENT ON TABLE public.player_game_stats IS 'Individual player box score for each game';

CREATE INDEX idx_player_game_stats_game ON public.player_game_stats(game_id);
CREATE INDEX idx_player_game_stats_athlete ON public.player_game_stats(athlete_id);

-- ============================================================
-- 8. TEAM GAME STATS — Aggregated view (auto-calculated)
-- ============================================================
CREATE OR REPLACE VIEW public.team_game_stats AS
SELECT
    g.id AS game_id,
    g.game_date,
    g.opponent_name,
    g.team_score,
    g.opponent_score,
    g.result,
    g.team_id,
    t.name AS team_name,
    COUNT(pgs.id) AS players_logged,
    SUM(pgs.points) AS total_points,
    SUM(pgs.total_rebounds) AS total_rebounds,
    SUM(pgs.assists) AS total_assists,
    SUM(pgs.steals) AS total_steals,
    SUM(pgs.blocks) AS total_blocks,
    SUM(pgs.turnovers) AS total_turnovers,
    SUM(pgs.field_goals_made) AS total_fgm,
    SUM(pgs.field_goals_attempted) AS total_fga,
    CASE WHEN SUM(pgs.field_goals_attempted) > 0
        THEN ROUND(SUM(pgs.field_goals_made)::numeric / SUM(pgs.field_goals_attempted) * 100, 1)
        ELSE 0 END AS fg_pct,
    SUM(pgs.three_pointers_made) AS total_3pm,
    SUM(pgs.three_pointers_attempted) AS total_3pa,
    CASE WHEN SUM(pgs.three_pointers_attempted) > 0
        THEN ROUND(SUM(pgs.three_pointers_made)::numeric / SUM(pgs.three_pointers_attempted) * 100, 1)
        ELSE 0 END AS three_pct,
    SUM(pgs.free_throws_made) AS total_ftm,
    SUM(pgs.free_throws_attempted) AS total_fta
FROM public.games g
LEFT JOIN public.player_game_stats pgs ON pgs.game_id = g.id
LEFT JOIN public.teams t ON t.id = g.team_id
GROUP BY g.id, g.game_date, g.opponent_name, g.team_score, g.opponent_score, g.result, g.team_id, t.name;

ALTER VIEW public.team_game_stats SET (security_invoker = on);

-- ============================================================
-- 9. PLAYER SEASON STATS — Aggregated view (auto-calculated)
-- ============================================================
CREATE OR REPLACE VIEW public.player_season_stats AS
SELECT
    a.id AS athlete_id,
    a.display_name,
    a.team_name,
    g.season,
    COUNT(pgs.id) AS games_played,
    -- Per Game Averages
    ROUND(AVG(pgs.points), 1) AS ppg,
    ROUND(AVG(pgs.total_rebounds), 1) AS rpg,
    ROUND(AVG(pgs.assists), 1) AS apg,
    ROUND(AVG(pgs.steals), 1) AS spg,
    ROUND(AVG(pgs.blocks), 1) AS bpg,
    ROUND(AVG(pgs.turnovers), 1) AS topg,
    ROUND(AVG(pgs.minutes_played), 1) AS mpg,
    -- Totals
    SUM(pgs.points) AS total_points,
    SUM(pgs.total_rebounds) AS total_rebounds,
    SUM(pgs.assists) AS total_assists,
    SUM(pgs.steals) AS total_steals,
    -- Shooting
    SUM(pgs.field_goals_made) AS total_fgm,
    SUM(pgs.field_goals_attempted) AS total_fga,
    CASE WHEN SUM(pgs.field_goals_attempted) > 0
        THEN ROUND(SUM(pgs.field_goals_made)::numeric / SUM(pgs.field_goals_attempted) * 100, 1)
        ELSE 0 END AS fg_pct,
    SUM(pgs.three_pointers_made) AS total_3pm,
    SUM(pgs.three_pointers_attempted) AS total_3pa,
    CASE WHEN SUM(pgs.three_pointers_attempted) > 0
        THEN ROUND(SUM(pgs.three_pointers_made)::numeric / SUM(pgs.three_pointers_attempted) * 100, 1)
        ELSE 0 END AS three_pct,
    SUM(pgs.free_throws_made) AS total_ftm,
    SUM(pgs.free_throws_attempted) AS total_fta,
    CASE WHEN SUM(pgs.free_throws_attempted) > 0
        THEN ROUND(SUM(pgs.free_throws_made)::numeric / SUM(pgs.free_throws_attempted) * 100, 1)
        ELSE 0 END AS ft_pct
FROM public.athletes a
JOIN public.player_game_stats pgs ON pgs.athlete_id = a.id
JOIN public.games g ON g.id = pgs.game_id
GROUP BY a.id, a.display_name, a.team_name, g.season;

ALTER VIEW public.player_season_stats SET (security_invoker = on);

-- ============================================================
-- 10. DATA UPLOADS — Intake pipeline for bulk data
-- ============================================================
CREATE TABLE IF NOT EXISTS public.data_uploads (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Upload Info
    upload_type     text NOT NULL CHECK (upload_type IN (
        'training_data', 'game_stats', 'roster_update',
        'bulk_import', 'video', 'evaluation'
    )),
    source          text CHECK (source IN ('mobile_app','web_portal','api','csv_import','manual')),

    -- Raw Content
    raw_content     text,           -- Raw text/voice transcription
    file_url        text,           -- Link to uploaded file in Supabase Storage
    file_type       text,           -- csv, xlsx, json, mp4, etc.

    -- AI Processing
    ai_status       text NOT NULL CHECK (ai_status IN (
        'pending', 'processing', 'completed', 'failed', 'needs_review'
    )) DEFAULT 'pending',
    ai_parsed_data  jsonb,          -- Structured output from AI parsing
    ai_confidence   numeric(3,2),   -- 0.00 to 1.00
    ai_errors       text[],
    ai_processed_at timestamptz,

    -- Routing
    target_athlete_id uuid REFERENCES public.athletes(id),
    target_team_id    uuid REFERENCES public.teams(id),
    target_game_id    uuid REFERENCES public.games(id),
    target_session_id uuid REFERENCES public.training_sessions(id),
    parent_account_id uuid REFERENCES public.parent_accounts(id),

    -- Metadata
    uploaded_by     uuid REFERENCES auth.users(id),
    created_at      timestamptz NOT NULL DEFAULT now(),
    processed_at    timestamptz
);

COMMENT ON TABLE public.data_uploads IS 'Intake pipeline for all data — AI processes and routes to correct tables';

CREATE INDEX idx_data_uploads_status ON public.data_uploads(ai_status);
CREATE INDEX idx_data_uploads_type ON public.data_uploads(upload_type);
CREATE INDEX idx_data_uploads_athlete ON public.data_uploads(target_athlete_id);
CREATE INDEX idx_data_uploads_parent ON public.data_uploads(parent_account_id);

-- ============================================================
-- 11. PLAYER EVALUATIONS — Periodic skill assessments
-- ============================================================
CREATE TABLE IF NOT EXISTS public.player_evaluations (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    athlete_id      uuid NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
    evaluator_id    uuid REFERENCES auth.users(id),
    evaluation_date date NOT NULL DEFAULT CURRENT_DATE,
    season          text,

    -- Skill Ratings (1-10 scale)
    ball_handling   smallint CHECK (ball_handling >= 1 AND ball_handling <= 10),
    shooting_form   smallint CHECK (shooting_form >= 1 AND shooting_form <= 10),
    mid_range       smallint CHECK (mid_range >= 1 AND mid_range <= 10),
    three_point     smallint CHECK (three_point >= 1 AND three_point <= 10),
    free_throw      smallint CHECK (free_throw >= 1 AND free_throw <= 10),
    finishing        smallint CHECK (finishing >= 1 AND finishing <= 10),
    passing         smallint CHECK (passing >= 1 AND passing <= 10),
    court_vision    smallint CHECK (court_vision >= 1 AND court_vision <= 10),
    defensive_stance smallint CHECK (defensive_stance >= 1 AND defensive_stance <= 10),
    lateral_quickness smallint CHECK (lateral_quickness >= 1 AND lateral_quickness <= 10),
    rebounding      smallint CHECK (rebounding >= 1 AND rebounding <= 10),
    basketball_iq   smallint CHECK (basketball_iq >= 1 AND basketball_iq <= 10),
    leadership      smallint CHECK (leadership >= 1 AND leadership <= 10),
    effort          smallint CHECK (effort >= 1 AND effort <= 10),
    coachability    smallint CHECK (coachability >= 1 AND coachability <= 10),

    -- Computed Overall
    overall_rating  numeric(3,1) GENERATED ALWAYS AS (
        (COALESCE(ball_handling,0) + COALESCE(shooting_form,0) + COALESCE(mid_range,0) +
         COALESCE(three_point,0) + COALESCE(free_throw,0) + COALESCE(finishing,0) +
         COALESCE(passing,0) + COALESCE(court_vision,0) + COALESCE(defensive_stance,0) +
         COALESCE(lateral_quickness,0) + COALESCE(rebounding,0) + COALESCE(basketball_iq,0) +
         COALESCE(leadership,0) + COALESCE(effort,0) + COALESCE(coachability,0)
        )::numeric / 15
    ) STORED,

    -- Narrative
    strengths       text,
    areas_to_improve text,
    coach_comments  text,

    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_player_evaluations_athlete ON public.player_evaluations(athlete_id);
CREATE INDEX idx_player_evaluations_date ON public.player_evaluations(evaluation_date DESC);

-- ============================================================
-- 12. ROW LEVEL SECURITY — All new tables
-- ============================================================

ALTER TABLE public.athletes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_rosters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_game_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_evaluations ENABLE ROW LEVEL SECURITY;

-- Coaches (role = 'coach' or 'admin') can read/write everything
CREATE POLICY "Coaches full access to athletes"
    ON public.athletes FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
            AND p.role IN ('coach', 'admin')
        )
    );

-- Parents can only see their own athletes
CREATE POLICY "Parents read own athletes"
    ON public.athletes FOR SELECT
    USING (
        parent_account_id IN (
            SELECT id FROM public.parent_accounts
            WHERE user_id = auth.uid()
        )
    );

-- Coach policies for all data tables
CREATE POLICY "Coaches full access to teams" ON public.teams FOR ALL
    USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('coach','admin')));

CREATE POLICY "Coaches full access to team_rosters" ON public.team_rosters FOR ALL
    USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('coach','admin')));

CREATE POLICY "Coaches full access to training_sessions" ON public.training_sessions FOR ALL
    USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('coach','admin')));

CREATE POLICY "Coaches full access to training_attendance" ON public.training_attendance FOR ALL
    USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('coach','admin')));

CREATE POLICY "Coaches full access to games" ON public.games FOR ALL
    USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('coach','admin')));

CREATE POLICY "Coaches full access to player_game_stats" ON public.player_game_stats FOR ALL
    USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('coach','admin')));

CREATE POLICY "Coaches full access to data_uploads" ON public.data_uploads FOR ALL
    USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('coach','admin')));

CREATE POLICY "Coaches full access to evaluations" ON public.player_evaluations FOR ALL
    USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('coach','admin')));

-- Parents can see their athletes' data
CREATE POLICY "Parents read own athlete game stats" ON public.player_game_stats FOR SELECT
    USING (athlete_id IN (
        SELECT a.id FROM public.athletes a
        JOIN public.parent_accounts pa ON pa.id = a.parent_account_id
        WHERE pa.user_id = auth.uid()
    ));

CREATE POLICY "Parents read own athlete training" ON public.training_attendance FOR SELECT
    USING (athlete_id IN (
        SELECT a.id FROM public.athletes a
        JOIN public.parent_accounts pa ON pa.id = a.parent_account_id
        WHERE pa.user_id = auth.uid()
    ));

CREATE POLICY "Parents read own athlete evaluations" ON public.player_evaluations FOR SELECT
    USING (athlete_id IN (
        SELECT a.id FROM public.athletes a
        JOIN public.parent_accounts pa ON pa.id = a.parent_account_id
        WHERE pa.user_id = auth.uid()
    ));

-- Parents can read games (public data)
CREATE POLICY "Parents read games" ON public.games FOR SELECT
    USING (auth.uid() IS NOT NULL);

CREATE POLICY "Parents read teams" ON public.teams FOR SELECT
    USING (auth.uid() IS NOT NULL);

-- Parents can upload data for their own athletes
CREATE POLICY "Parents upload own athlete data" ON public.data_uploads FOR INSERT
    WITH CHECK (
        parent_account_id IN (
            SELECT id FROM public.parent_accounts WHERE user_id = auth.uid()
        )
        OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('coach','admin'))
    );

CREATE POLICY "Parents read own uploads" ON public.data_uploads FOR SELECT
    USING (
        uploaded_by = auth.uid()
        OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('coach','admin'))
    );

-- ============================================================
-- 13. AUTO-UPDATED_AT TRIGGERS
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_athletes_updated_at
    BEFORE UPDATE ON public.athletes
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_teams_updated_at
    BEFORE UPDATE ON public.teams
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_training_sessions_updated_at
    BEFORE UPDATE ON public.training_sessions
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_games_updated_at
    BEFORE UPDATE ON public.games
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 14. STORAGE BUCKET — For video/file uploads
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('athlete-media', 'athlete-media', false)
ON CONFLICT (id) DO NOTHING;

COMMIT;
