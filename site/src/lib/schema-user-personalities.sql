-- User Personalities — Stores personality specs generated via fork flow or CLI
-- Apply via Supabase dashboard (SQL Editor)

create table if not exists user_personalities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  name text not null default 'Default',
  spec jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes
create index if not exists idx_user_personalities_user on user_personalities(user_id);

-- RLS
alter table user_personalities enable row level security;

-- Users can read their own personalities
create policy "Users read own personalities"
  on user_personalities for select
  using (auth.uid() = user_id);

-- Service role handles insert/update (via API endpoint)
-- No additional policies needed — service role bypasses RLS
