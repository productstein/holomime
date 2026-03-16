-- RLS Policies for user-owned tables
-- Run this in Supabase SQL Editor to enable Row Level Security

-- ═══ agents ═══
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own agents"
  ON agents FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own agents"
  ON agents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own agents"
  ON agents FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own agents"
  ON agents FOR DELETE
  USING (auth.uid() = user_id);

-- ═══ personality_vectors ═══
ALTER TABLE personality_vectors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view vectors for own agents"
  ON personality_vectors FOR SELECT
  USING (agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert vectors for own agents"
  ON personality_vectors FOR INSERT
  WITH CHECK (agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid()));

CREATE POLICY "Users can update vectors for own agents"
  ON personality_vectors FOR UPDATE
  USING (agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid()));

-- ═══ teams ═══
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own teams"
  ON teams FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own teams"
  ON teams FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own teams"
  ON teams FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own teams"
  ON teams FOR DELETE
  USING (auth.uid() = user_id);

-- ═══ team_members ═══
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view members of own teams"
  ON team_members FOR SELECT
  USING (team_id IN (SELECT id FROM teams WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert members to own teams"
  ON team_members FOR INSERT
  WITH CHECK (team_id IN (SELECT id FROM teams WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete members from own teams"
  ON team_members FOR DELETE
  USING (team_id IN (SELECT id FROM teams WHERE user_id = auth.uid()));

-- ═══ user_personalities ═══
ALTER TABLE user_personalities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own personalities"
  ON user_personalities FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own personalities"
  ON user_personalities FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own personalities"
  ON user_personalities FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own personalities"
  ON user_personalities FOR DELETE
  USING (auth.uid() = user_id);
