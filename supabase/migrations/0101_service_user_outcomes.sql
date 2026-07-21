-- 0101_service_user_outcomes
-- Personal outcomes for a Service User (Welsh well-being / CIW outcomes framework,
-- feeds the PQS return). Each row is one outcome statement ("what matters to me")
-- with a current status. Reviewed on a recurring cadence; the % achieving or
-- progressing rolls up for the PQS. Manager+ only, scoped to the SU's branch.
-- becarecompliant project ONLY.
create table if not exists public.service_user_outcomes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  service_user_id uuid not null references public.service_users(id) on delete cascade,
  statement text not null,
  status text not null default 'working_towards'
    check (status in ('achieved','progressing','working_towards','no_longer_relevant')),
  last_reviewed date,
  review_note text,
  position integer not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz not null default now()
);

create index if not exists service_user_outcomes_su_idx on public.service_user_outcomes (service_user_id, position);
create index if not exists service_user_outcomes_company_idx on public.service_user_outcomes (company_id);

alter table public.service_user_outcomes enable row level security;

create policy service_user_outcomes_select on public.service_user_outcomes
  for select to authenticated
  using (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or public.is_branch_manager((select s.branch_id from public.service_users s where s.id = service_user_id))
  );

create policy service_user_outcomes_write on public.service_user_outcomes
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
