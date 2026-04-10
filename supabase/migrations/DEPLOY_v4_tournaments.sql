-- =====================================================
-- CONSOLIDATED DEPLOYMENT: Tournament Catalog + Schedule
-- =====================================================
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)
-- Combines v4_01 + v4_02 + seed data in one script.
-- Safe to re-run (IF NOT EXISTS / ON CONFLICT DO NOTHING).
-- =====================================================

BEGIN;

-- =====================================================
-- PART 1: TOURNAMENT ORGANIZERS (v4_01)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.tournament_organizers (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name         text NOT NULL UNIQUE,
    slug         text NOT NULL UNIQUE,
    website      text,
    logo_url     text,
    circuit      text,
    notes        text,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tournament_organizers_slug ON public.tournament_organizers(slug);
CREATE INDEX IF NOT EXISTS idx_tournament_organizers_circuit ON public.tournament_organizers(circuit);

-- =====================================================
-- PART 2: TOURNAMENTS (v4_01)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.tournaments (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizer_id        uuid REFERENCES public.tournament_organizers(id) ON DELETE SET NULL,
    name                text NOT NULL,
    slug                text NOT NULL,
    exposure_event_id   text UNIQUE,
    start_date          date NOT NULL,
    end_date            date NOT NULL,
    CHECK (end_date >= start_date),
    city                text NOT NULL,
    state               text NOT NULL,
    venue               text,
    region              text,
    event_type          text NOT NULL DEFAULT 'tournament'
        CHECK (event_type IN ('tournament', '1-day', '3v3', 'showcase', 'league', 'camp')),
    gender              text NOT NULL DEFAULT 'coed'
        CHECK (gender IN ('boys', 'girls', 'coed')),
    age_groups          text,
    min_age_group       text,
    max_age_group       text,
    cost_min            numeric(10,2),
    cost_max            numeric(10,2),
    game_guarantee      smallint,
    CHECK (cost_max IS NULL OR cost_min IS NULL OR cost_max >= cost_min),
    ability_level       text
        CHECK (ability_level IS NULL OR ability_level IN (
            'Elite', 'Competitive', 'Developmental',
            'Elite/Competitive', 'Competitive/Developmental',
            'Elite/Competitive/Developmental'
        )),
    is_certified        boolean NOT NULL DEFAULT false,
    is_ncaa_certified   boolean NOT NULL DEFAULT false,
    is_jr_nba_member    boolean NOT NULL DEFAULT false,
    is_aau_licensed     boolean NOT NULL DEFAULT false,
    rank_competition    smallint CHECK (rank_competition IS NULL OR rank_competition BETWEEN 1 AND 10),
    rank_exposure       smallint CHECK (rank_exposure IS NULL OR rank_exposure BETWEEN 1 AND 10),
    rank_circuit        smallint CHECK (rank_circuit IS NULL OR rank_circuit BETWEEN 1 AND 10),
    rank_composite      numeric(3,1) GENERATED ALWAYS AS (
        CASE WHEN rank_competition IS NOT NULL
                  AND rank_exposure IS NOT NULL
                  AND rank_circuit IS NOT NULL
             THEN ROUND((rank_competition * 0.40 + rank_exposure * 0.35 + rank_circuit * 0.25)::numeric, 1)
             ELSE NULL
        END
    ) STORED,
    rank_tier           text CHECK (rank_tier IS NULL OR rank_tier IN ('Elite', 'Premier', 'Select', 'Open')),
    source_url          text,
    source_page         text,
    notes               text,
    is_active           boolean NOT NULL DEFAULT true,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tournaments_name_dates ON public.tournaments(name, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_tournaments_state ON public.tournaments(state);
CREATE INDEX IF NOT EXISTS idx_tournaments_start_date ON public.tournaments(start_date);
CREATE INDEX IF NOT EXISTS idx_tournaments_organizer ON public.tournaments(organizer_id);
CREATE INDEX IF NOT EXISTS idx_tournaments_region ON public.tournaments(region);
CREATE INDEX IF NOT EXISTS idx_tournaments_event_type ON public.tournaments(event_type);
CREATE INDEX IF NOT EXISTS idx_tournaments_rank_composite ON public.tournaments(rank_composite DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_tournaments_rank_tier ON public.tournaments(rank_tier);
CREATE INDEX IF NOT EXISTS idx_tournaments_source_page ON public.tournaments(source_page);
CREATE INDEX IF NOT EXISTS idx_tournaments_is_active ON public.tournaments(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_tournaments_search ON public.tournaments USING gin(to_tsvector('english', name));

-- =====================================================
-- PART 3: TRIGGERS (v4_01)
-- =====================================================

CREATE OR REPLACE FUNCTION update_tournaments_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tournaments_updated_at ON public.tournaments;
CREATE TRIGGER trg_tournaments_updated_at
    BEFORE UPDATE ON public.tournaments FOR EACH ROW
    EXECUTE FUNCTION update_tournaments_updated_at();

DROP TRIGGER IF EXISTS trg_tournament_organizers_updated_at ON public.tournament_organizers;
CREATE TRIGGER trg_tournament_organizers_updated_at
    BEFORE UPDATE ON public.tournament_organizers FOR EACH ROW
    EXECUTE FUNCTION update_tournaments_updated_at();

-- =====================================================
-- PART 4: RLS (v4_01)
-- =====================================================

ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_organizers ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Directors manage tournaments" ON public.tournaments;
  DROP POLICY IF EXISTS "Public read active tournaments" ON public.tournaments;
  DROP POLICY IF EXISTS "Service role full tournaments" ON public.tournaments;
  DROP POLICY IF EXISTS "Directors manage organizers" ON public.tournament_organizers;
  DROP POLICY IF EXISTS "Public read organizers" ON public.tournament_organizers;
  DROP POLICY IF EXISTS "Service role full organizers" ON public.tournament_organizers;
END $$;

CREATE POLICY "Directors manage tournaments" ON public.tournaments FOR ALL
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('director', 'coach')));
CREATE POLICY "Public read active tournaments" ON public.tournaments FOR SELECT
    USING (is_active = true);
CREATE POLICY "Service role full tournaments" ON public.tournaments FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Directors manage organizers" ON public.tournament_organizers FOR ALL
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('director', 'coach')));
CREATE POLICY "Public read organizers" ON public.tournament_organizers FOR SELECT
    USING (true);
CREATE POLICY "Service role full organizers" ON public.tournament_organizers FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');

-- =====================================================
-- PART 5: CATALOG VIEW (v4_01)
-- =====================================================

CREATE OR REPLACE VIEW public.tournament_catalog AS
SELECT
    t.id, t.name, t.slug, t.exposure_event_id,
    o.name AS organizer_name, o.circuit AS organizer_circuit,
    t.start_date, t.end_date, t.city, t.state, t.region,
    t.event_type, t.gender, t.age_groups, t.min_age_group, t.max_age_group,
    t.cost_min, t.cost_max, t.game_guarantee,
    t.ability_level, t.is_certified, t.is_ncaa_certified, t.is_jr_nba_member, t.is_aau_licensed,
    t.rank_competition, t.rank_exposure, t.rank_circuit, t.rank_composite, t.rank_tier,
    t.source_url, t.source_page, t.notes, t.is_active, t.created_at, t.updated_at
FROM public.tournaments t
LEFT JOIN public.tournament_organizers o ON o.id = t.organizer_id
WHERE t.is_active = true;

-- =====================================================
-- PART 6: AUTO-RANK FUNCTION (v4_01)
-- =====================================================

CREATE OR REPLACE FUNCTION compute_tournament_ranks()
RETURNS void AS $$
BEGIN
    UPDATE tournaments SET
        rank_competition = LEAST(10, GREATEST(1,
            CASE ability_level
                WHEN 'Elite' THEN 9 WHEN 'Elite/Competitive' THEN 8
                WHEN 'Elite/Competitive/Developmental' THEN 7 WHEN 'Competitive' THEN 6
                WHEN 'Competitive/Developmental' THEN 5 WHEN 'Developmental' THEN 3 ELSE 5
            END
            + CASE WHEN cost_max > 500 THEN 2 WHEN cost_max > 400 THEN 1 ELSE 0 END
            + CASE WHEN is_ncaa_certified THEN 1 ELSE 0 END
            + CASE WHEN game_guarantee >= 4 THEN 1 ELSE 0 END
            + CASE WHEN (end_date - start_date) >= 2 THEN 1 ELSE 0 END
            - CASE WHEN event_type = '1-day' THEN 2 ELSE 0 END
        )),
        rank_exposure = LEAST(10, GREATEST(1,
            CASE WHEN is_ncaa_certified THEN 8 WHEN is_jr_nba_member THEN 7
                 WHEN is_certified THEN 5 ELSE 3 END
            + CASE WHEN cost_max > 500 THEN 2 WHEN cost_max > 300 THEN 1 ELSE 0 END
            + CASE WHEN (end_date - start_date) >= 3 THEN 2
                   WHEN (end_date - start_date) >= 2 THEN 1 ELSE 0 END
            - CASE WHEN event_type = '1-day' THEN 3 ELSE 0 END
        )),
        rank_circuit = LEAST(10, GREATEST(1,
            CASE
                WHEN EXISTS (SELECT 1 FROM tournament_organizers o WHERE o.id = tournaments.organizer_id AND o.circuit IN ('Nike EYBL','Under Armour','Adidas')) THEN 10
                WHEN EXISTS (SELECT 1 FROM tournament_organizers o WHERE o.id = tournaments.organizer_id AND o.circuit IN ('Prep Hoops','Jr EYBL','HoopSource')) THEN 8
                WHEN EXISTS (SELECT 1 FROM tournament_organizers o WHERE o.id = tournaments.organizer_id AND o.circuit IN ('Bigfoot Hoops','Game Time Events','Reebok')) THEN 7
                WHEN is_jr_nba_member THEN 6 WHEN is_certified THEN 5 ELSE 4
            END
        )),
        rank_tier = CASE
            WHEN rank_competition IS NOT NULL AND rank_exposure IS NOT NULL AND rank_circuit IS NOT NULL THEN
                CASE
                    WHEN (rank_competition * 0.40 + rank_exposure * 0.35 + rank_circuit * 0.25) >= 8.0 THEN 'Elite'
                    WHEN (rank_competition * 0.40 + rank_exposure * 0.35 + rank_circuit * 0.25) >= 6.0 THEN 'Premier'
                    WHEN (rank_competition * 0.40 + rank_exposure * 0.35 + rank_circuit * 0.25) >= 4.0 THEN 'Select'
                    ELSE 'Open'
                END
            ELSE NULL
        END
    WHERE rank_competition IS NULL;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- PART 7: SCRAPE LOG (v4_01)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.tournament_scrape_log (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source       text NOT NULL DEFAULT 'exposure_events',
    state        text NOT NULL,
    page_count   smallint,
    record_count smallint,
    scraped_at   timestamptz NOT NULL DEFAULT now(),
    scraped_by   text DEFAULT 'system'
);
CREATE INDEX IF NOT EXISTS idx_scrape_log_state ON public.tournament_scrape_log(state);
CREATE INDEX IF NOT EXISTS idx_scrape_log_scraped_at ON public.tournament_scrape_log(scraped_at DESC);

-- =====================================================
-- PART 8: TEAM TOURNAMENT SCHEDULE (v4_02)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.team_tournament_schedule (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id   uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
    team_id         uuid REFERENCES public.teams(id) ON DELETE SET NULL,
    status          text NOT NULL DEFAULT 'planned'
        CHECK (status IN ('planned', 'registered', 'paid', 'completed', 'cancelled')),
    start_date      date NOT NULL,
    end_date        date NOT NULL,
    division        text,
    registration_cost numeric(10,2),
    payment_status  text DEFAULT 'unpaid'
        CHECK (payment_status IN ('unpaid', 'deposit', 'paid', 'refunded')),
    confirmation_code text,
    travel_required boolean NOT NULL DEFAULT false,
    hotel_name      text,
    hotel_cost      numeric(10,2),
    notes           text,
    added_by        uuid REFERENCES auth.users(id),
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_schedule_team_tournament
    ON public.team_tournament_schedule(team_id, tournament_id) WHERE status != 'cancelled';
CREATE INDEX IF NOT EXISTS idx_schedule_dates
    ON public.team_tournament_schedule(team_id, start_date, end_date) WHERE status != 'cancelled';
CREATE INDEX IF NOT EXISTS idx_schedule_status ON public.team_tournament_schedule(status);
CREATE INDEX IF NOT EXISTS idx_schedule_tournament ON public.team_tournament_schedule(tournament_id);

-- =====================================================
-- PART 9: SCHEDULE TRIGGERS (v4_02)
-- =====================================================

CREATE OR REPLACE FUNCTION check_schedule_overlap()
RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.team_tournament_schedule
        WHERE team_id = NEW.team_id AND id != NEW.id AND status != 'cancelled'
          AND daterange(start_date, end_date, '[]') && daterange(NEW.start_date, NEW.end_date, '[]')
    ) THEN
        RAISE EXCEPTION 'Schedule conflict: dates % to % overlap with an existing tournament for this team',
            NEW.start_date, NEW.end_date;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_schedule_overlap ON public.team_tournament_schedule;
CREATE TRIGGER trg_check_schedule_overlap
    BEFORE INSERT OR UPDATE ON public.team_tournament_schedule
    FOR EACH ROW WHEN (NEW.status != 'cancelled')
    EXECUTE FUNCTION check_schedule_overlap();

CREATE OR REPLACE FUNCTION sync_schedule_dates()
RETURNS TRIGGER AS $$
DECLARE t_start date; t_end date;
BEGIN
    SELECT start_date, end_date INTO t_start, t_end FROM public.tournaments WHERE id = NEW.tournament_id;
    IF t_start IS NULL THEN RAISE EXCEPTION 'Tournament not found: %', NEW.tournament_id; END IF;
    NEW.start_date := t_start; NEW.end_date := t_end;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_schedule_dates ON public.team_tournament_schedule;
CREATE TRIGGER trg_sync_schedule_dates
    BEFORE INSERT OR UPDATE OF tournament_id ON public.team_tournament_schedule
    FOR EACH ROW EXECUTE FUNCTION sync_schedule_dates();

DROP TRIGGER IF EXISTS trg_schedule_updated_at ON public.team_tournament_schedule;
CREATE TRIGGER trg_schedule_updated_at
    BEFORE UPDATE ON public.team_tournament_schedule FOR EACH ROW
    EXECUTE FUNCTION update_tournaments_updated_at();

-- =====================================================
-- PART 10: SCHEDULE VIEW (v4_02)
-- =====================================================

CREATE OR REPLACE VIEW public.team_schedule_view AS
SELECT
    s.id AS schedule_id, s.tournament_id, s.team_id, s.status, s.division,
    s.registration_cost, s.payment_status, s.confirmation_code,
    s.travel_required, s.hotel_name, s.hotel_cost,
    s.notes AS schedule_notes, s.created_at AS added_at,
    t.name AS tournament_name, t.slug AS tournament_slug,
    t.start_date, t.end_date, t.city, t.state, t.region,
    t.event_type, t.gender, t.age_groups,
    t.cost_min, t.cost_max, t.game_guarantee,
    t.rank_competition, t.rank_exposure, t.rank_circuit, t.rank_composite, t.rank_tier,
    o.name AS organizer_name, o.circuit AS organizer_circuit,
    CASE WHEN s.hotel_cost IS NOT NULL
         THEN COALESCE(s.registration_cost, 0) + s.hotel_cost
         ELSE s.registration_cost END AS total_cost,
    (t.end_date - t.start_date + 1) AS duration_days
FROM public.team_tournament_schedule s
JOIN public.tournaments t ON t.id = s.tournament_id
LEFT JOIN public.tournament_organizers o ON o.id = t.organizer_id
WHERE s.status != 'cancelled';

-- =====================================================
-- PART 11: SCHEDULE RLS (v4_02)
-- =====================================================

ALTER TABLE public.team_tournament_schedule ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Directors manage schedule" ON public.team_tournament_schedule;
  DROP POLICY IF EXISTS "Parents read own team schedule" ON public.team_tournament_schedule;
  DROP POLICY IF EXISTS "Service role full schedule" ON public.team_tournament_schedule;
END $$;

CREATE POLICY "Directors manage schedule" ON public.team_tournament_schedule FOR ALL
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('director', 'coach')));
CREATE POLICY "Parents read own team schedule" ON public.team_tournament_schedule FOR SELECT
    USING (team_id IN (
        SELECT tr.team_id FROM team_rosters tr
        JOIN parent_player_links ppl ON ppl.athlete_id = tr.athlete_id
        WHERE ppl.profile_id = auth.uid()
    ));
CREATE POLICY "Service role full schedule" ON public.team_tournament_schedule FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');

COMMIT;
