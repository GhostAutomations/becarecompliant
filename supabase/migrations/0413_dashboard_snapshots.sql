-- 0413: a ten minute snapshot of the dashboard's heavy figures, per person and company (Phil,
-- 2026-10-07: "it takes too long ... is it possible to say load it every 10 minutes"). The
-- compliance score, training, PQS and readiness engines are the slow part of the dashboard; they
-- are worked out at most once every ten minutes per person (or when they press Refresh), while
-- the overdue and due soon numbers stay live. Read and written only by the server (service role);
-- nobody can read another person's snapshot.
create table if not exists public.dashboard_snapshots (
  user_id uuid not null references public.profiles(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  role text not null,
  payload jsonb not null,
  built_at timestamptz not null default now(),
  primary key (user_id, company_id)
);
alter table public.dashboard_snapshots enable row level security;
revoke all on public.dashboard_snapshots from anon, authenticated;
