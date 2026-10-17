-- Be Care Compliant 0508: funders (Rota and Visits Stage 7b, Phil's popups 2026-10-17;
-- docs/decisions/rota-visits.md, Stage 7b decision 7).
--
-- Each company keeps a list of the councils and health boards that fund its service users
-- (Newport City Council, Cardiff Council, a health board), and every company's service user
-- Manage record gets a Funder from that list (Phil's choice: every company, not only the module).
-- Cancellation rules follow the funder (Stage 7b decision 6).
--
-- Approved change to an existing table: service_users gains funder_id (empty until set), and its
-- company link check is reinstalled to cover it. Nothing else on service_users changes.

create table if not exists public.funders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);
create unique index if not exists funders_company_name on public.funders (company_id, lower(btrim(name)));
create index if not exists funders_created_by on public.funders (created_by);

alter table public.funders enable row level security;
drop policy if exists funders_select on public.funders;
create policy funders_select on public.funders
  for select to authenticated
  using ((select public.is_company_member(company_id)) or (select public.is_platform_admin()));
drop policy if exists funders_write on public.funders;
create policy funders_write on public.funders
  for all to authenticated
  using ((select public.is_company_admin(company_id)) or (select public.is_platform_admin()))
  with check ((select public.is_company_admin(company_id)) or (select public.is_platform_admin()));

alter table public.service_users
  add column if not exists funder_id uuid references public.funders(id) on delete set null;
create index if not exists service_users_funder on public.service_users (funder_id);

select public.install_company_link_triggers();
