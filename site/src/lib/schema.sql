-- holomime License Infrastructure
-- Apply via Supabase dashboard (SQL Editor)

-- Licenses table
create table if not exists licenses (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  customer_email text not null,
  polar_customer_id text,
  polar_subscription_id text,
  tier text not null default 'pro',
  status text not null default 'active',
  created_at timestamptz default now(),
  expires_at timestamptz,
  metadata jsonb default '{}'
);

-- API usage tracking
create table if not exists api_usage (
  id uuid primary key default gen_random_uuid(),
  license_id uuid references licenses(id),
  endpoint text not null,
  created_at timestamptz default now(),
  metadata jsonb default '{}'
);

-- Indexes
create index if not exists idx_licenses_key on licenses(key);
create index if not exists idx_licenses_email on licenses(customer_email);
create index if not exists idx_licenses_polar_sub on licenses(polar_subscription_id);
create index if not exists idx_api_usage_license on api_usage(license_id);
create index if not exists idx_api_usage_created on api_usage(created_at);

-- RLS policies (enable RLS on both tables)
alter table licenses enable row level security;
alter table api_usage enable row level security;

-- Anon/authenticated users can only read their own licenses (by email match)
create policy "Users can read own licenses"
  on licenses for select
  using (auth.jwt() ->> 'email' = customer_email);

-- No direct insert/update/delete from client — only service role (API routes)
-- Service role bypasses RLS automatically, so no permissive policy needed.

-- API usage: no direct client access at all
-- Service role bypasses RLS for inserts/reads in API routes.

-- Behavioral results (full diagnosis/assess/audit data for dashboard)
create table if not exists behavioral_results (
  id uuid primary key default gen_random_uuid(),
  license_id uuid references licenses(id) not null,
  endpoint text not null,
  created_at timestamptz default now(),
  messages_analyzed integer,
  patterns_count integer,
  patterns jsonb,
  score integer,
  grade text,
  traits jsonb,
  risk_level text,
  flags_count integer,
  flags jsonb
);

create index if not exists idx_behavioral_license on behavioral_results(license_id);
create index if not exists idx_behavioral_created on behavioral_results(created_at);
create index if not exists idx_behavioral_endpoint on behavioral_results(endpoint);

alter table behavioral_results enable row level security;
-- No client-side read policy — service role only (same as api_usage)

-- ─── Enterprise: Organizations ──────────────────────────────
create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  owner_license_id uuid references licenses(id) not null,
  created_at timestamptz default now(),
  settings jsonb default '{}'
);

-- Org members (many-to-many: licenses ↔ orgs)
create table if not exists org_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade not null,
  license_id uuid references licenses(id) on delete cascade not null,
  role text not null default 'member',
  invited_by uuid references licenses(id),
  joined_at timestamptz default now(),
  unique(org_id, license_id)
);

-- ─── Enterprise: Audit Logs ─────────────────────────────────
create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) not null,
  actor_license_id uuid references licenses(id),
  action text not null,
  resource_type text,
  resource_id text,
  metadata jsonb default '{}',
  ip_address text,
  created_at timestamptz default now()
);

-- ─── Enterprise: Fleet Agents ───────────────────────────────
create table if not exists fleet_agents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade not null,
  name text not null,
  agent_key text unique not null,
  spec jsonb,
  status text default 'active',
  last_seen_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists fleet_snapshots (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references fleet_agents(id) on delete cascade not null,
  drift_events integer default 0,
  patterns jsonb,
  risk_level text,
  messages_processed integer default 0,
  created_at timestamptz default now()
);

-- ─── Enterprise: Custom Detectors ───────────────────────────
create table if not exists custom_detectors (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade not null,
  name text not null,
  description text,
  detection_type text not null,
  config jsonb not null,
  severity text default 'warning',
  enabled boolean default true,
  created_by uuid references licenses(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ─── Enterprise: SSO Configuration ──────────────────────────
create table if not exists sso_configs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade not null unique,
  provider text not null,
  idp_metadata_url text,
  idp_entity_id text,
  idp_sso_url text,
  idp_certificate text,
  attribute_mapping jsonb default '{"email": "email", "name": "name"}',
  enabled boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enterprise indexes
create index if not exists idx_org_members_org on org_members(org_id);
create index if not exists idx_org_members_license on org_members(license_id);
create index if not exists idx_audit_logs_org on audit_logs(org_id);
create index if not exists idx_audit_logs_created on audit_logs(created_at);
create index if not exists idx_audit_logs_action on audit_logs(action);
create index if not exists idx_fleet_agents_org on fleet_agents(org_id);
create index if not exists idx_fleet_snapshots_agent on fleet_snapshots(agent_id);
create index if not exists idx_fleet_snapshots_created on fleet_snapshots(created_at);
create index if not exists idx_custom_detectors_org on custom_detectors(org_id);

-- Enterprise RLS (service role only)
alter table organizations enable row level security;
alter table org_members enable row level security;
alter table audit_logs enable row level security;
alter table fleet_agents enable row level security;
alter table fleet_snapshots enable row level security;
alter table custom_detectors enable row level security;
alter table sso_configs enable row level security;

-- ─── Outbound Webhooks (Developer+) ──────────────────────────
create table if not exists webhooks (
  id uuid primary key default gen_random_uuid(),
  license_id uuid references licenses(id) on delete cascade not null,
  url text not null,
  events text[] not null default '{}', -- 'diagnose.complete', 'assess.complete', 'self-audit.complete', 'drift.detected'
  secret text,                          -- optional HMAC signing secret
  enabled boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_webhooks_license on webhooks(license_id);
alter table webhooks enable row level security;

-- ─── Voice Integrations (Enterprise) ─────────────────────────
create table if not exists voice_integrations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade not null,
  provider text not null,               -- 'livekit', 'vapi', 'retell'
  config jsonb not null default '{}',   -- provider-specific config (api keys, etc.)
  enabled boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(org_id, provider)
);

create index if not exists idx_voice_integrations_org on voice_integrations(org_id);
alter table voice_integrations enable row level security;

-- ─── Custom Voice Clones (Enterprise) ────────────────────────
create table if not exists voice_clones (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade not null,
  name text not null,
  elevenlabs_voice_id text,             -- ElevenLabs voice ID after creation
  status text default 'pending',        -- 'pending', 'processing', 'ready', 'failed'
  config jsonb default '{}',            -- voice settings, description, labels
  created_by uuid references licenses(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_voice_clones_org on voice_clones(org_id);
alter table voice_clones enable row level security;

-- API Keys (sub-keys for enterprise users)
create table if not exists api_keys (
  id uuid primary key default gen_random_uuid(),
  license_id uuid references licenses(id) on delete cascade not null,
  key text unique not null,
  name text,
  status text default 'active',
  created_at timestamptz default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index if not exists idx_api_keys_key on api_keys(key);
create index if not exists idx_api_keys_license on api_keys(license_id);
alter table api_keys enable row level security;

-- Contact leads (enterprise inquiry form)
create table if not exists contact_leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  company text,
  agents text,
  message text not null,
  source text default 'web',
  created_at timestamptz default now()
);
create index if not exists idx_contact_leads_email on contact_leads(email);
alter table contact_leads enable row level security;

-- Email signups (waitlist / early access)
create table if not exists email_signups (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  source text default 'waitlist',
  created_at timestamptz default now()
);
create index if not exists idx_email_signups_email on email_signups(email);
alter table email_signups enable row level security;
