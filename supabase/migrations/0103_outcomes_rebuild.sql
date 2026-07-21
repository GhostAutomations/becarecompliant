-- 0103_outcomes_rebuild
-- Rebuild personal outcomes into rich, per-outcome tracked records (Birdie-style),
-- keeping our compliance edge (PQS % + a "needs an update" RAG per outcome).
--
-- Each outcome: a title, a "what matters" detail, an optional target date, and a
-- lifecycle status. Progress is tracked PER OUTCOME via service_user_outcome_updates
-- (progressing / no change / regressing, or a completion), each an immutable, authored,
-- timestamped entry. status is derived from the latest update; achieved outcomes move
-- to the Achieved list; archived_at soft-removes.

alter table public.service_user_outcomes
  add column if not exists title text,
  add column if not exists detail text,
  add column if not exists target_date date,
  add column if not exists achieved_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists last_update_at timestamptz;

-- Carry existing one-line statements over as the title (test data only at this point).
update public.service_user_outcomes set title = coalesce(nullif(btrim(title), ''), statement) where title is null or btrim(title) = '';
update public.service_user_outcomes set detail = review_note where detail is null;

-- statement is superseded by title; keep it nullable so old writers don't break, but
-- future writes go through title.
alter table public.service_user_outcomes alter column statement drop not null;

-- New status vocabulary. Old rows (if any) map: no_longer_relevant -> archived.
update public.service_user_outcomes set archived_at = now() where status = 'no_longer_relevant' and archived_at is null;
update public.service_user_outcomes set status = 'working_towards' where status not in ('working_towards','progressing','no_change','regressing','achieved');

-- Per-outcome progress updates (the timeline / evidence).
create table if not exists public.service_user_outcome_updates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  service_user_id uuid not null references public.service_users(id) on delete cascade,
  outcome_id uuid not null references public.service_user_outcomes(id) on delete cascade,
  kind text not null default 'progress' check (kind in ('progress','completed','reopened')),
  progress text check (progress in ('progressing','no_change','regressing')),
  note text,
  created_by uuid,
  author_name text,
  created_at timestamptz not null default now()
);

create index if not exists su_outcome_updates_outcome_idx on public.service_user_outcome_updates (outcome_id, created_at);
create index if not exists su_outcome_updates_company_idx on public.service_user_outcome_updates (company_id);

alter table public.service_user_outcome_updates enable row level security;

create policy su_outcome_updates_select on public.service_user_outcome_updates
  for select to authenticated
  using (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or public.is_branch_manager((select s.branch_id from public.service_users s where s.id = service_user_id))
  );

create policy su_outcome_updates_write on public.service_user_outcome_updates
  for all to authenticated
  using (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or public.is_branch_manager((select s.branch_id from public.service_users s where s.id = service_user_id))
  )
  with check (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or public.is_branch_manager((select s.branch_id from public.service_users s where s.id = service_user_id))
  );

-- companies.outcomes_review_months is repurposed as the "flag for an update after N
-- months without a progress update" cadence. Column already exists (0102).
