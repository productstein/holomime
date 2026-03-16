-- Brain Snapshots — Stores shared brain visualization snapshots
-- Apply via Supabase dashboard (SQL Editor)

create table if not exists brain_snapshots (
  id text primary key,
  data text not null,
  agent text not null default 'unknown',
  health integer not null default 0,
  grade text not null default '?',
  patterns jsonb default '[]',
  views integer not null default 0,
  created_at timestamptz default now()
);

-- Indexes
create index if not exists idx_brain_snapshots_created on brain_snapshots(created_at);
create index if not exists idx_brain_snapshots_data on brain_snapshots(data);
create index if not exists idx_brain_snapshots_agent on brain_snapshots(agent);

-- RLS
alter table brain_snapshots enable row level security;

-- Public read access (anyone can view a snapshot)
create policy "Public read access"
  on brain_snapshots for select
  using (true);

-- Service role only for insert/update (handled by API endpoint)
-- No additional policies needed — service role bypasses RLS

-- Migration: Add user_id column for authenticated snapshot ownership
-- Run this if table already exists:
-- alter table brain_snapshots add column if not exists user_id uuid references auth.users;
-- create index if not exists idx_brain_snapshots_user on brain_snapshots(user_id);
