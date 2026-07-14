-- 0063_complaints
-- Phase 10 Additions, Round 1, Item 1: Complaints section.
-- A THIRD top-level section alongside People and Service Users. A complaint is a
-- CASE with an Open / In Progress / Closed lifecycle plus a response-deadline RAG
-- (per-complaint due date, NOT the recurring check/RAG engine). Complaints can
-- hold special-category service user data, so isolation mirrors Service Users:
-- Company Admins (all branches), branch Managers (their branch), Founder. NO
-- Supervisor or Team Member access. Applied to the becarecompliant Supabase
-- project ONLY (ref bgrtcvyjuwopunpnudeu).
--
-- Response-deadline defaults are cited sector norms, editable per company:
--   acknowledge within 3 working days, respond within 25 working days
--   (England: CQC Regulation 16 / LGSCO benchmarks; Wales: Social Services
--    Complaints Procedure (Wales) Regulations 2014, Stage 1 10wd / Stage 2 25wd).

-- ===========================================================================
-- 1. Extend the form population + evidence record_type vocabularies.
-- ===========================================================================
alter table public.form_templates drop constraint if exists form_templates_population_check;
alter table public.form_templates
  add constraint form_templates_population_check
  check (population in ('people', 'service_users', 'complaints'));

alter table public.forms drop constraint if exists forms_population_check;
alter table public.forms
  add constraint forms_population_check
  check (population in ('people', 'service_users', 'complaints'));

alter table public.evidence drop constraint if exists evidence_record_type_check;
alter table public.evidence
  add constraint evidence_record_type_check
  check (record_type in ('person', 'service_user', 'complaint'));

-- ===========================================================================
-- 2. Repoint the three complaint forms from the interim 'service_users'
--    population to the new 'complaints' population (master + any company copies).
-- ===========================================================================
update public.form_templates
  set population = 'complaints'
  where key in ('complaints_concerns', 'cardiff_complaint_response', 'newport_complaint_response');

update public.forms
  set population = 'complaints'
  where key in ('complaints_concerns', 'cardiff_complaint_response', 'newport_complaint_response');

-- ===========================================================================
-- 3. Per-company complaint response timescales (Admin-configurable).
--    Rows are optional: the app falls back to the cited defaults when absent.
-- ===========================================================================
create table if not exists public.complaints_config (
  company_id uuid primary key references public.companies(id) on delete cascade,
  acknowledgement_days integer not null default 3 check (acknowledgement_days >= 0),
  response_days integer not null default 25 check (response_days >= 0),
  amber_days integer not null default 5 check (amber_days >= 0),
  count_working_days boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.complaints_config enable row level security;

create policy complaints_config_select on public.complaints_config
  for select to authenticated
  using (public.is_platform_admin() or public.is_company_member(company_id));

create policy complaints_config_insert on public.complaints_config
  for insert to authenticated
  with check (public.is_platform_admin() or public.is_company_admin(company_id));

create policy complaints_config_update on public.complaints_config
  for update to authenticated
  using (public.is_platform_admin() or public.is_company_admin(company_id))
  with check (public.is_platform_admin() or public.is_company_admin(company_id));

-- ===========================================================================
-- 4. Complaints (the records). Lifecycle case, not a recurring check.
-- ===========================================================================
create table if not exists public.complaints (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete restrict,
  ref_number integer not null,
  subject text not null,
  details text,
  complainant_name text,
  complainant_relationship text
    check (complainant_relationship is null or complainant_relationship in
      ('service_user', 'relative', 'staff', 'professional', 'public', 'anonymous')),
  -- Optional link to a Service User record when the complaint is about one.
  service_user_id uuid references public.service_users(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'in_progress', 'closed')),
  -- Lifecycle dates (civil dates, Europe/London).
  date_raised date not null default (now() at time zone 'Europe/London')::date,
  date_occurred date,
  date_acknowledged date,
  acknowledgement_due date,
  investigation_completed date,
  response_due date,
  date_closed date,
  outcome text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (company_id, ref_number)
);

create index complaints_company_idx on public.complaints (company_id, status);
create index complaints_branch_idx on public.complaints (branch_id);
create index complaints_service_user_idx on public.complaints (service_user_id);
create index complaints_response_due_idx on public.complaints (response_due);

-- Per-company incrementing reference number, assigned server-side on insert.
create or replace function public.complaints_assign_ref()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.ref_number is null then
    select coalesce(max(ref_number), 0) + 1
      into new.ref_number
      from public.complaints
      where company_id = new.company_id;
  end if;
  return new;
end;
$$;

create trigger complaints_assign_ref_trg
  before insert on public.complaints
  for each row execute function public.complaints_assign_ref();

-- RLS: mirrors Service User isolation (special-category data). Admins all
-- branches, branch Managers their branch(es), Founder all. No Supervisor / Team
-- Member access.
alter table public.complaints enable row level security;

create policy complaints_select on public.complaints
  for select to authenticated
  using (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or public.is_branch_manager(branch_id)
  );

create policy complaints_insert on public.complaints
  for insert to authenticated
  with check (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or public.is_branch_manager(branch_id)
  );

create policy complaints_update on public.complaints
  for update to authenticated
  using (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or public.is_branch_manager(branch_id)
  )
  with check (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or public.is_branch_manager(branch_id)
  );
