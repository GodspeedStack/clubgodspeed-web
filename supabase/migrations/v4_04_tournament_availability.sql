-- v4_04: Tournament Availability
-- Parents can toggle availability per tournament from the parent portal.
-- One row per parent per tournament. Upsert on (parent_id, tournament_identifier).

CREATE TABLE IF NOT EXISTS tournament_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tournament_identifier TEXT NOT NULL,       -- schedule_id or calendar_events id
  tournament_name TEXT NOT NULL,             -- denormalized for admin readability
  status TEXT NOT NULL CHECK (status IN ('available', 'unavailable')) DEFAULT 'available',
  note TEXT,                                 -- optional parent note ("out of town", etc.)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (parent_id, tournament_identifier)
);

-- Index for admin queries: "who is available for tournament X?"
CREATE INDEX idx_tournament_availability_tournament
  ON tournament_availability(tournament_identifier, status);

-- Index for parent queries: "my availability across all tournaments"
CREATE INDEX idx_tournament_availability_parent
  ON tournament_availability(parent_id);

-- RLS
ALTER TABLE tournament_availability ENABLE ROW LEVEL SECURITY;

-- Parents can read/write only their own rows
CREATE POLICY "Parents manage own availability"
  ON tournament_availability
  FOR ALL
  TO authenticated
  USING (parent_id = auth.uid())
  WITH CHECK (parent_id = auth.uid());

-- Coaches/directors can read all rows
CREATE POLICY "Coaches read all availability"
  ON tournament_availability
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('coach', 'director', 'admin')
    )
  );

-- Service role (edge functions) bypass RLS automatically

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_tournament_availability_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tournament_availability_updated
  BEFORE UPDATE ON tournament_availability
  FOR EACH ROW
  EXECUTE FUNCTION update_tournament_availability_timestamp();
