-- =====================================================
-- V4.02 TEAM TOURNAMENT SCHEDULE
-- =====================================================
-- Lets coaches build a spring/summer tournament schedule
-- by selecting events from the catalog. Enforces no
-- overlapping dates for the same team.
-- =====================================================
-- Depends on: v4_01_tournaments.sql
-- =====================================================

-- =====================================================
-- 1. TEAM TOURNAMENT SCHEDULE
-- =====================================================
-- One row per tournament a team commits to attend.
-- Status tracks the lifecycle: interested -> registered -> completed/cancelled.

CREATE TABLE IF NOT EXISTS public.team_tournament_schedule (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id   uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
    team_id         uuid REFERENCES public.teams(id) ON DELETE SET NULL,

    -- Schedule status (forward-only state machine)
    status          text NOT NULL DEFAULT 'planned'
        CHECK (status IN ('planned', 'registered', 'paid', 'completed', 'cancelled')),

    -- Denormalized dates from tournament for constraint checks
    -- Populated via trigger on INSERT/UPDATE
    start_date      date NOT NULL,
    end_date        date NOT NULL,

    -- Registration details
    division        text,              -- e.g. '10U', '12U'
    registration_cost numeric(10,2),
    payment_status  text DEFAULT 'unpaid'
        CHECK (payment_status IN ('unpaid', 'deposit', 'paid', 'refunded')),
    confirmation_code text,

    -- Travel
    travel_required boolean NOT NULL DEFAULT false,
    hotel_name      text,
    hotel_cost      numeric(10,2),

    -- Notes
    notes           text,

    -- Audit
    added_by        uuid REFERENCES auth.users(id),
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Prevent same tournament being added twice for same team
CREATE UNIQUE INDEX IF NOT EXISTS idx_schedule_team_tournament
    ON public.team_tournament_schedule(team_id, tournament_id)
    WHERE status != 'cancelled';

-- Prevent duplicates when team_id is NULL (single-team mode)
CREATE UNIQUE INDEX IF NOT EXISTS idx_schedule_null_team_tournament
    ON public.team_tournament_schedule(tournament_id)
    WHERE team_id IS NULL AND status != 'cancelled';

-- Fast lookups by date range for overlap checks
CREATE INDEX IF NOT EXISTS idx_schedule_dates
    ON public.team_tournament_schedule(team_id, start_date, end_date)
    WHERE status != 'cancelled';

CREATE INDEX IF NOT EXISTS idx_schedule_status
    ON public.team_tournament_schedule(status);

CREATE INDEX IF NOT EXISTS idx_schedule_tournament
    ON public.team_tournament_schedule(tournament_id);

-- =====================================================
-- 2. OVERLAP PREVENTION
-- =====================================================
-- Constraint function: rejects INSERT/UPDATE if the new
-- entry overlaps an existing non-cancelled schedule entry
-- for the same team.

CREATE OR REPLACE FUNCTION check_schedule_overlap()
RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.team_tournament_schedule
        WHERE team_id = NEW.team_id
          AND id != NEW.id
          AND status != 'cancelled'
          AND daterange(start_date, end_date, '[]') &&
              daterange(NEW.start_date, NEW.end_date, '[]')
    ) THEN
        RAISE EXCEPTION 'Schedule conflict: dates % to % overlap with an existing tournament for this team',
            NEW.start_date, NEW.end_date;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_schedule_overlap
    BEFORE INSERT OR UPDATE ON public.team_tournament_schedule
    FOR EACH ROW
    WHEN (NEW.status != 'cancelled')
    EXECUTE FUNCTION check_schedule_overlap();

-- =====================================================
-- 3. AUTO-POPULATE DATES FROM TOURNAMENT
-- =====================================================
-- Syncs start_date/end_date from the tournament record
-- so the overlap check always uses canonical dates.

CREATE OR REPLACE FUNCTION sync_schedule_dates()
RETURNS TRIGGER AS $$
DECLARE
    t_start date;
    t_end date;
BEGIN
    SELECT start_date, end_date INTO t_start, t_end
    FROM public.tournaments WHERE id = NEW.tournament_id;

    IF t_start IS NULL THEN
        RAISE EXCEPTION 'Tournament not found: %', NEW.tournament_id;
    END IF;

    NEW.start_date := t_start;
    NEW.end_date := t_end;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_schedule_dates
    BEFORE INSERT OR UPDATE OF tournament_id ON public.team_tournament_schedule
    FOR EACH ROW
    EXECUTE FUNCTION sync_schedule_dates();

-- =====================================================
-- 4. AUTO-UPDATE TIMESTAMP
-- =====================================================

CREATE TRIGGER trg_schedule_updated_at
    BEFORE UPDATE ON public.team_tournament_schedule
    FOR EACH ROW
    EXECUTE FUNCTION update_tournaments_updated_at();

-- =====================================================
-- 5. SCHEDULE VIEW
-- =====================================================
-- Joins schedule with tournament + organizer for display.

CREATE OR REPLACE VIEW public.team_schedule_view AS
SELECT
    s.id AS schedule_id,
    s.tournament_id,
    s.team_id,
    s.status,
    s.division,
    s.registration_cost,
    s.payment_status,
    s.confirmation_code,
    s.travel_required,
    s.hotel_name,
    s.hotel_cost,
    s.notes AS schedule_notes,
    s.created_at AS added_at,
    t.name AS tournament_name,
    t.slug AS tournament_slug,
    t.start_date,
    t.end_date,
    t.city,
    t.state,
    t.region,
    t.event_type,
    t.gender,
    t.age_groups,
    t.cost_min,
    t.cost_max,
    t.game_guarantee,
    t.rank_competition,
    t.rank_exposure,
    t.rank_circuit,
    t.rank_composite,
    t.rank_tier,
    o.name AS organizer_name,
    o.circuit AS organizer_circuit,
    -- Computed fields
    CASE WHEN s.hotel_cost IS NOT NULL
         THEN COALESCE(s.registration_cost, 0) + s.hotel_cost
         ELSE s.registration_cost
    END AS total_cost,
    (t.end_date - t.start_date + 1) AS duration_days
FROM public.team_tournament_schedule s
JOIN public.tournaments t ON t.id = s.tournament_id
LEFT JOIN public.tournament_organizers o ON o.id = t.organizer_id
WHERE s.status != 'cancelled';

-- =====================================================
-- 6. ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE public.team_tournament_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Directors manage schedule"
    ON public.team_tournament_schedule FOR ALL
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role IN ('director', 'coach')
    ));

CREATE POLICY "Parents read own team schedule"
    ON public.team_tournament_schedule FOR SELECT
    USING (
        team_id IN (
            SELECT tr.team_id FROM team_rosters tr
            JOIN parent_player_links ppl ON ppl.athlete_id = tr.athlete_id
            WHERE ppl.profile_id = auth.uid()
        )
    );

CREATE POLICY "Service role full schedule"
    ON public.team_tournament_schedule FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');
