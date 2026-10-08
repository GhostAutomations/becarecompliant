-- 0437: copies of documents in the company's own cloud drive (Phil, 2026-10-08). OneDrive or a
-- SharePoint site first, Google Drive later on the same tables. See
-- claude/integrations/cloud-drive-plan.md.
--
-- All three tables are SERVER ONLY: RLS is on with no policies, so nobody can read or write them
-- from a browser. The app reads and writes them with the service role, after checking the caller
-- is an Admin of that company. The Microsoft refresh token is stored encrypted (AES-256-GCM, key
-- in the CLOUD_TOKEN_KEY env var), never in plain text, and never sent to the browser.

-- One connection per company.
create table if not exists public.cloud_connections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.companies(id) on delete cascade,
  provider text not null check (provider in ('microsoft', 'google')),
  status text not null default 'connected' check (status in ('connected', 'needs_reconnect', 'disconnected')),
  account_email text,
  account_name text,
  -- Where the Be Care Compliant folder lives.
  location_kind text check (location_kind in ('sharepoint', 'onedrive')),
  site_id text,
  site_name text,
  drive_id text,
  root_folder_id text,
  root_folder_url text,
  refresh_token_enc text,
  access_token_enc text,
  access_token_expires_at timestamptz,
  last_error text,
  last_error_at timestamptz,
  last_copied_at timestamptz,
  connected_by uuid references public.profiles(id) on delete set null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Which drive folder belongs to which section or record, so a folder is never made twice and a
-- rename (new name or branch) can follow it.
--   folder_key: 'root' | 'section:people' | 'section:service_users' | 'section:complaints' |
--               'section:incidents' | 'section:policies' | 'section:briefings' |
--               'person:<uuid>' | 'service_user:<uuid>'
create table if not exists public.cloud_folders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  connection_id uuid not null references public.cloud_connections(id) on delete cascade,
  folder_key text not null,
  drive_item_id text not null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, folder_key)
);

-- One row per document to copy. The unique key makes queueing the same document twice harmless.
create table if not exists public.cloud_sync_queue (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  source_kind text not null,
  source_id text not null,
  dedupe_key text not null,
  status text not null default 'pending' check (status in ('pending', 'working', 'done', 'failed')),
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  claimed_at timestamptz,
  last_error text,
  drive_item_id text,
  file_name text,
  created_at timestamptz not null default now(),
  done_at timestamptz,
  unique (company_id, dedupe_key)
);

create index if not exists cloud_sync_queue_due_idx on public.cloud_sync_queue (status, next_attempt_at);
create index if not exists cloud_sync_queue_company_idx on public.cloud_sync_queue (company_id, status);
create index if not exists cloud_folders_company_idx on public.cloud_folders (company_id);
create index if not exists cloud_connections_connected_by_idx on public.cloud_connections (connected_by);

alter table public.cloud_connections enable row level security;
alter table public.cloud_folders enable row level security;
alter table public.cloud_sync_queue enable row level security;

revoke all on public.cloud_connections from anon, authenticated;
revoke all on public.cloud_folders from anon, authenticated;
revoke all on public.cloud_sync_queue from anon, authenticated;
