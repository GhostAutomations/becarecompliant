-- 0175_whistleblowing_responsible_individual
--
-- 0174 gated whistleblowing_disclosures on is_platform_admin() OR is_company_admin(company_id).
-- is_company_admin() checks role = 'company_admin' ONLY, so the Responsible Individual
-- (role 'registered_individual') could not see the disclosures they must report on in the
-- Reg 80 aggregate. Phil's decision was "Company Admin and Responsible Individual only".
--
-- This is deliberately a NEW predicate rather than a widening of is_company_admin():
-- is_company_admin() gates most of the product, and widening it here would silently
-- widen every other table.
--
-- Proven by impersonation on 2026-08-12 (inside a rolled back transaction):
--   company_admin                  sees it
--   registered_individual (active) sees it
--   registered_individual disabled does NOT
--   branch manager (active)        does NOT
--   staff                          does NOT
--   anon                           does NOT

create or replace function public.is_responsible_individual(cid uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.company_id = cid
      and p.role = 'registered_individual'
      and p.status = 'active'
  );
$$;

comment on function public.is_responsible_individual(uuid) is
  'True when the caller is the active Responsible Individual for the given company. Deliberately separate from is_company_admin() so whistleblowing access does not widen every other policy.';

drop policy if exists whistleblowing_select on public.whistleblowing_disclosures;
create policy whistleblowing_select on public.whistleblowing_disclosures
  for select using (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or public.is_responsible_individual(company_id)
  );

drop policy if exists whistleblowing_insert on public.whistleblowing_disclosures;
create policy whistleblowing_insert on public.whistleblowing_disclosures
  for insert with check (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or public.is_responsible_individual(company_id)
  );

-- 0174 had no with check on the update policy, which let a row be moved to another company.
drop policy if exists whistleblowing_update on public.whistleblowing_disclosures;
create policy whistleblowing_update on public.whistleblowing_disclosures
  for update using (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or public.is_responsible_individual(company_id)
  ) with check (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or public.is_responsible_individual(company_id)
  );
