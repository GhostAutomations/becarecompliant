-- 0060_training
-- People extension: Training sub-department (nested under People).
-- A company-defined catalogue of training courses + a per-person record per course.
-- Expiry-driven RAG (not the Check/completion model): each recurring course has a
-- renewal period; a person's record carries the next-due (expiry) date the RAG is
-- computed from. One-off courses have no expiry (renewal_months null): done or not.
-- The PQS mandatory-training and safeguarding rates are reported from these records.
-- Access is Admins and Managers only (no Supervisor / Team Member visibility), so RLS
-- is is_platform_admin / is_company_admin / is_branch_manager only.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

-- ===========================================================================
-- Social Care Wales registration number on the Person (PQS Quality Q3 data).
-- Registration itself renews every 3 years; for now we capture the number, which
-- is what the PQS "registered with Social Care Wales" question needs.
-- ===========================================================================
alter table public.people
  add column if not exists scw_registration_number text;

-- ===========================================================================
-- training_courses — one company's catalogue of courses.
-- ===========================================================================
create table if not exists public.training_courses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  -- Renewal period in months. Null = one off (no expiry, done or not done).
  renewal_months integer check (renewal_months is null or renewal_months >= 1),
  mandatory boolean not null default true,
  is_safeguarding boolean not null default false,
  amber_days integer not null default 30 check (amber_days >= 0),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists training_courses_company_idx
  on public.training_courses (company_id, active, sort_order);

alter table public.training_courses enable row level security;

-- Read: platform / company admin / any manager in the company (to render the matrix).
create policy training_courses_select on public.training_courses
  for select to authenticated
  using (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or public.is_company_manager(company_id)
  );

-- Write (catalogue config): company admins only.
create policy training_courses_write on public.training_courses
  for all to authenticated
  using (public.is_platform_admin() or public.is_company_admin(company_id))
  with check (public.is_platform_admin() or public.is_company_admin(company_id));

-- ===========================================================================
-- person_training — one Person's record for one course.
-- ===========================================================================
create table if not exists public.person_training (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  person_id uuid not null references public.people(id) on delete cascade,
  course_id uuid not null references public.training_courses(id) on delete cascade,
  status text not null default 'not_done' check (status in ('completed', 'not_done')),
  completed_on date,
  expiry_on date,
  certificate_path text,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (person_id, course_id)
);

create index if not exists person_training_company_idx on public.person_training (company_id);
create index if not exists person_training_branch_idx on public.person_training (branch_id);
create index if not exists person_training_person_idx on public.person_training (person_id);
create index if not exists person_training_course_idx on public.person_training (course_id);
create index if not exists person_training_expiry_idx on public.person_training (expiry_on);

alter table public.person_training enable row level security;

-- Read: platform / company admin / branch manager of the record's branch.
create policy person_training_select on public.person_training
  for select to authenticated
  using (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or (branch_id is not null and public.is_branch_manager(branch_id))
  );

-- Write: same set (Admins and Managers record training).
create policy person_training_write on public.person_training
  for all to authenticated
  using (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or (branch_id is not null and public.is_branch_manager(branch_id))
  )
  with check (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or (branch_id is not null and public.is_branch_manager(branch_id))
  );

-- Realtime: RLS-protected tables need REPLICA IDENTITY FULL for UPDATE/DELETE
-- events to reach subscribers (JCN gotcha). Subscribe unfiltered + poll fallback.
alter table public.person_training replica identity full;
alter table public.training_courses replica identity full;
alter publication supabase_realtime add table public.person_training;
alter publication supabase_realtime add table public.training_courses;
