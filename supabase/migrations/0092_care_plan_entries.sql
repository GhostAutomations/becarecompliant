-- 0092_care_plan_entries
-- Structured weekly care plan for a Service User: rows of day of week, service,
-- unit (a visit duration, or Fixed for a fixed-rate item) and quantity. Edited on
-- a dedicated page opened from the Service User record. Manager+ only, scoped to
-- the service user's branch. becarecompliant project ONLY.

create table if not exists public.care_plan_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  service_user_id uuid not null references public.service_users(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6), -- 0 = Monday
  service text not null,
  unit text not null,        -- e.g. 15m, 30m, 1hr .. 12hr, or Fixed
  quantity numeric(6,2) not null default 1 check (quantity >= 0),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index care_plan_entries_su_idx on public.care_plan_entries (service_user_id, position);

alter table public.care_plan_entries enable row level security;

create policy care_plan_entries_select on public.care_plan_entries
  for select to authenticated
  using (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or public.is_branch_manager((select s.branch_id from public.service_users s where s.id = service_user_id))
  );

create policy care_plan_entries_write on public.care_plan_entries
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
