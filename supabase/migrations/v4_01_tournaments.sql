-- =====================================================
-- V4.01 TOURNAMENTS CATALOG MIGRATION
-- =====================================================
-- 1. Tournament Organizers (lookup table)
-- 2. Tournaments (main catalog)
-- 3. Tournament Rankings (competition, exposure, circuit)
-- 4. RLS Policies
-- 5. Indexes + Triggers
-- =====================================================
-- Deployed: 2026-03-31
-- =====================================================

-- =====================================================
-- 1. TOURNAMENT ORGANIZERS
-- =====================================================
-- Normalized lookup so organizer metadata lives once.
-- Tournaments reference organizer_id.

CREATE TABLE IF NOT EXISTS public.tournament_organizers (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name         text NOT NULL UNIQUE,
    slug         text NOT NULL UNIQUE,
    website      text,
    logo_url     text,
    circuit      text,          -- e.g. 'Nike EYBL', 'Jr NBA', 'Prep Hoops', 'Independent'
    notes        text,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tournament_organizers_slug ON public.tournament_organizers(slug);
CREATE INDEX IF NOT EXISTS idx_tournament_organizers_circuit ON public.tournament_organizers(circuit);

-- =====================================================
-- 2. TOURNAMENTS
-- =====================================================
-- Core catalog table. One row per tournament event.
-- Source page tracks which state listing it was scraped from.
-- exposure_event_id enables dedup on re-scrape.

CREATE TABLE IF NOT EXISTS public.tournaments (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizer_id        uuid REFERENCES public.tournament_organizers(id) ON DELETE SET NULL,

    -- Identity
    name                text NOT NULL,
    slug                text NOT NULL,
    exposure_event_id   text UNIQUE,        -- external ID from Exposure Events

    -- Schedule
    start_date          date NOT NULL,
    end_date            date NOT NULL,
    CHECK (end_date >= start_date),

    -- Location
    city                text NOT NULL,
    state               text NOT NULL,
    venue               text,
    region              text,               -- West, Midwest, South, East, Mountain West

    -- Classification
    event_type          text NOT NULL DEFAULT 'tournament'
        CHECK (event_type IN ('tournament', '1-day', '3v3', 'showcase', 'league', 'camp')),
    gender              text NOT NULL DEFAULT 'coed'
        CHECK (gender IN ('boys', 'girls', 'coed')),
    age_groups          text,               -- raw text e.g. '17U-10U', '12th-3rd'
    min_age_group       text,               -- normalized e.g. '10U'
    max_age_group       text,               -- normalized e.g. '17U'

    -- Cost + logistics
    cost_min            numeric(10,2),
    cost_max            numeric(10,2),
    game_guarantee      smallint,
    CHECK (cost_max IS NULL OR cost_min IS NULL OR cost_max >= cost_min),

    -- Quality signals
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

    -- Rankings (1-10 scale, NULL = unrated)
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

    -- Source tracking
    source_url          text,
    source_page         text,               -- 'colorado', 'texas', etc.

    -- Admin
    notes               text,
    is_active           boolean NOT NULL DEFAULT true,

    -- Timestamps
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Prevent duplicate tournament names on same dates
CREATE UNIQUE INDEX IF NOT EXISTS idx_tournaments_name_dates
    ON public.tournaments(name, start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_tournaments_state ON public.tournaments(state);
CREATE INDEX IF NOT EXISTS idx_tournaments_start_date ON public.tournaments(start_date);
CREATE INDEX IF NOT EXISTS idx_tournaments_organizer ON public.tournaments(organizer_id);
CREATE INDEX IF NOT EXISTS idx_tournaments_region ON public.tournaments(region);
CREATE INDEX IF NOT EXISTS idx_tournaments_event_type ON public.tournaments(event_type);
CREATE INDEX IF NOT EXISTS idx_tournaments_rank_composite ON public.tournaments(rank_composite DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_tournaments_rank_tier ON public.tournaments(rank_tier);
CREATE INDEX IF NOT EXISTS idx_tournaments_source_page ON public.tournaments(source_page);
CREATE INDEX IF NOT EXISTS idx_tournaments_is_active ON public.tournaments(is_active) WHERE is_active = true;

-- Full text search on name + organizer
CREATE INDEX IF NOT EXISTS idx_tournaments_search
    ON public.tournaments USING gin(to_tsvector('english', name));

-- =====================================================
-- 3. AUTO-UPDATE TIMESTAMPS
-- =====================================================

CREATE OR REPLACE FUNCTION update_tournaments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tournaments_updated_at
    BEFORE UPDATE ON public.tournaments
    FOR EACH ROW
    EXECUTE FUNCTION update_tournaments_updated_at();

CREATE TRIGGER trg_tournament_organizers_updated_at
    BEFORE UPDATE ON public.tournament_organizers
    FOR EACH ROW
    EXECUTE FUNCTION update_tournaments_updated_at();

-- =====================================================
-- 4. ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_organizers ENABLE ROW LEVEL SECURITY;

-- Tournaments: directors/coaches = full CRUD, everyone else = read active only

CREATE POLICY "Directors manage tournaments"
    ON public.tournaments FOR ALL
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role IN ('director', 'coach')
    ));

CREATE POLICY "Public read active tournaments"
    ON public.tournaments FOR SELECT
    USING (is_active = true);

CREATE POLICY "Service role full tournaments"
    ON public.tournaments FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');

-- Organizers: directors/coaches = full CRUD, everyone else = read

CREATE POLICY "Directors manage organizers"
    ON public.tournament_organizers FOR ALL
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role IN ('director', 'coach')
    ));

CREATE POLICY "Public read organizers"
    ON public.tournament_organizers FOR SELECT
    USING (true);

CREATE POLICY "Service role full organizers"
    ON public.tournament_organizers FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');

-- =====================================================
-- 5. RANKING HELPER VIEW
-- =====================================================
-- Flattened view for the admin dashboard with organizer name joined.

CREATE OR REPLACE VIEW public.tournament_catalog AS
SELECT
    t.id,
    t.name,
    t.slug,
    t.exposure_event_id,
    o.name AS organizer_name,
    o.circuit AS organizer_circuit,
    t.start_date,
    t.end_date,
    t.city,
    t.state,
    t.region,
    t.event_type,
    t.gender,
    t.age_groups,
    t.min_age_group,
    t.max_age_group,
    t.cost_min,
    t.cost_max,
    t.game_guarantee,
    t.ability_level,
    t.is_certified,
    t.is_ncaa_certified,
    t.is_jr_nba_member,
    t.is_aau_licensed,
    t.rank_competition,
    t.rank_exposure,
    t.rank_circuit,
    t.rank_composite,
    t.rank_tier,
    t.source_url,
    t.source_page,
    t.notes,
    t.is_active,
    t.created_at,
    t.updated_at
FROM public.tournaments t
LEFT JOIN public.tournament_organizers o ON o.id = t.organizer_id
WHERE t.is_active = true;

-- =====================================================
-- 6. AUTO-RANK FUNCTION
-- =====================================================
-- Computes initial rank scores based on objective signals.
-- Called manually or via cron after data import.
-- Weights:
--   Competition (40%): ability_level, cost, game_guarantee, NCAA
--   Exposure (35%): circuit reputation, NCAA, certified, Jr NBA
--   Circuit (25%): organizer circuit, event history, brand strength

CREATE OR REPLACE FUNCTION compute_tournament_ranks()
RETURNS void AS $$
BEGIN
    UPDATE tournaments SET
        rank_competition = LEAST(10, GREATEST(1,
            -- Base from ability level
            CASE ability_level
                WHEN 'Elite' THEN 9
                WHEN 'Elite/Competitive' THEN 8
                WHEN 'Elite/Competitive/Developmental' THEN 7
                WHEN 'Competitive' THEN 6
                WHEN 'Competitive/Developmental' THEN 5
                WHEN 'Developmental' THEN 3
                ELSE 5
            END
            -- Cost premium (+1 if >$400, +2 if >$500)
            + CASE WHEN cost_max > 500 THEN 2 WHEN cost_max > 400 THEN 1 ELSE 0 END
            -- NCAA bump
            + CASE WHEN is_ncaa_certified THEN 1 ELSE 0 END
            -- Game guarantee quality
            + CASE WHEN game_guarantee >= 4 THEN 1 ELSE 0 END
            -- Multi-day events score higher
            + CASE WHEN (end_date - start_date) >= 2 THEN 1 ELSE 0 END
            -- 1-day events penalty
            - CASE WHEN event_type = '1-day' THEN 2 ELSE 0 END
        )),

        rank_exposure = LEAST(10, GREATEST(1,
            -- Base from certifications
            CASE WHEN is_ncaa_certified THEN 8
                 WHEN is_jr_nba_member THEN 7
                 WHEN is_certified THEN 5
                 ELSE 3
            END
            -- Cost signals more exposure
            + CASE WHEN cost_max > 500 THEN 2 WHEN cost_max > 300 THEN 1 ELSE 0 END
            -- Multi-day national events
            + CASE WHEN (end_date - start_date) >= 3 THEN 2
                   WHEN (end_date - start_date) >= 2 THEN 1
                   ELSE 0
            END
            -- 1-day penalty
            - CASE WHEN event_type = '1-day' THEN 3 ELSE 0 END
        )),

        rank_circuit = LEAST(10, GREATEST(1,
            -- Circuit reputation from organizer
            CASE
                WHEN EXISTS (SELECT 1 FROM tournament_organizers o
                    WHERE o.id = tournaments.organizer_id
                    AND o.circuit IN ('Nike EYBL', 'Under Armour', 'Adidas'))
                THEN 10
                WHEN EXISTS (SELECT 1 FROM tournament_organizers o
                    WHERE o.id = tournaments.organizer_id
                    AND o.circuit IN ('Prep Hoops', 'Jr EYBL', 'HoopSource'))
                THEN 8
                WHEN EXISTS (SELECT 1 FROM tournament_organizers o
                    WHERE o.id = tournaments.organizer_id
                    AND o.circuit IN ('Bigfoot Hoops', 'Game Time Events', 'Reebok'))
                THEN 7
                WHEN is_jr_nba_member THEN 6
                WHEN is_certified THEN 5
                ELSE 4
            END
        )),

        -- rank_tier set in second pass (PG evaluates SET from OLD row values)
        rank_tier = NULL
    WHERE rank_competition IS NULL;  -- Only auto-rank unranked tournaments

    -- Second pass: set tier from now-populated rank columns
    UPDATE tournaments SET
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
    WHERE rank_tier IS NULL AND rank_competition IS NOT NULL;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 7. STATE LOOKUP FOR EXPANSION
-- =====================================================
-- Tracks which states have been scraped and when.

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
