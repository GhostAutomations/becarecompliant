-- 0102_outcomes_reviews
-- Recurring outcomes review with RAG. companies.outcomes_review_months sets the
-- cadence (default quarterly). Each review is logged in outcomes_reviews as
-- immutable evidence: who, when, a note, and a JSON snapshot of the outcomes and
-- their statuses at review time. The next-due date is derived from the latest
-- review + the interval. Manager+ RLS, scoped to the SU's branch.
alter table public.companies
  add column if not exists outcomes_review_months smallint not null default 3;

create table if not exists public.outcomes_reviews (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  service_user_id uuid not null references public.service_users(id) on delete cascade,
  reviewed_at date not null default current_date,
  reviewed_by uuid,
  reviewer_name text,
  note text,
  snapshot jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists outcomes_reviews_su_idx on public.outcomes_reviews (service_user_id, reviewed_at desc);
create index if not exists outcomes_reviews_company_idx on public.outcomes_reviews (company_id);

alter table public.outcomes_reviews enable row level security;

create policy outcomes_reviews_select on public.outcomes_reviews
  for select to authenticated
  using (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or public.is_branch_manager((select s.branch_id from public.service_users s where s.id = service_user_id))
  );

create policy outcomes_reviews_write on public.outcomes_reviews
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
