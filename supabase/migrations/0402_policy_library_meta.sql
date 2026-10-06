-- 0402: which version of the founder library was last written (Phil, 2026-10-06).
-- A tab left open from an older deployment ran that deployment's "Load and check" and put back
-- the old links and policy list. The sync records SEED_VERSION here and refuses to write an
-- older one. One row; service role only (no policies, RLS on).
create table if not exists public.policy_library_meta (
  id smallint primary key default 1 check (id = 1),
  seed_version integer not null default 0,
  synced_at timestamptz
);
alter table public.policy_library_meta enable row level security;
insert into public.policy_library_meta (id, seed_version) values (1, 0) on conflict (id) do nothing;
