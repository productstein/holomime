-- Leaderboard table for behavioral alignment benchmark submissions
CREATE TABLE IF NOT EXISTS leaderboard (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id UUID NOT NULL REFERENCES licenses(id),
  agent_name TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT,
  score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
  grade TEXT NOT NULL CHECK (grade IN ('A+', 'A', 'B+', 'B', 'C+', 'C', 'D', 'F')),
  scenarios JSONB,
  spec_hash TEXT,
  holomime_version TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast leaderboard queries
CREATE INDEX idx_leaderboard_score ON leaderboard (score DESC);
CREATE INDEX idx_leaderboard_provider ON leaderboard (provider);
CREATE INDEX idx_leaderboard_submitted_at ON leaderboard (submitted_at DESC);

-- RLS: public read, authenticated write
ALTER TABLE leaderboard ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access" ON leaderboard
  FOR SELECT USING (true);

CREATE POLICY "Authenticated insert" ON leaderboard
  FOR INSERT WITH CHECK (true);
