-- 0115_on_call_rota_grid
-- Reshape the On Call rota into a 3-week (Current / +1 / +2) Monday->Sunday grid
-- with two slots per day (AM / PM). Each cell is one assignment. A company runs
-- the rota EITHER by branch OR company-wide (companies.on_call_rota_scope):
--   * branch  : one grid per branch (on_call_shifts.branch_id set)
--   * company : one grid for the whole company (on_call_shifts.branch_id NULL)
-- starts_at/ends_at are kept (derived from shift_date + slot: AM 00:00-12:00,
-- PM 12:00-24:00 UTC wall-clock) so "on call now" and the call-log link still work.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

-- 1. Per-company rota scope.
alter table public.companies
  add column if not exists on_call_rota_scope text not null default 'branch'
    check (on_call_rota_scope in ('branch', 'company'));

-- The company currently being built runs on-call company-wide.
update public.companies set on_call_rota_scope = 'company'
  where id = '9d7d082b-89d8-44f6-83b8-71b5155c7d51';

-- 2. Slot + date on shifts; allow a company-wide (branch-less) shift.
alter table public.on_call_shifts add column if not exists shift_date date;
alter table public.on_call_shifts add column if not exists slot text check (slot in ('am', 'pm'));
alter table public.on_call_shifts alter column branch_id drop not null;

-- Backfill any existing rows from their timestamps.
update public.on_call_shifts
  set shift_date = coalesce(shift_date, (starts_at at time zone 'UTC')::date),
      slot = coalesce(slot, case when extract(hour from (starts_at at time zone 'UTC')) < 12 then 'am' else 'pm' end)
  where shift_date is null or slot is null;

-- One assignment per cell (separate partial indexes for the two scopes).
create unique index if not exists on_call_shifts_company_slot_uniq
  on public.on_call_shifts (company_id, shift_date, slot) where branch_id is null;
create unique index if not exists on_call_shifts_branch_slot_uniq
  on public.on_call_shifts (company_id, branch_id, shift_date, slot) where branch_id is not null;

-- 3. Recreate RLS to cope with a NULL branch_id (company-wide shift). Company-wide
--    seniors + the On Call role manage any shift; branch managers/supervisors keep
--    their branch shifts.
drop policy if exists on_call_shifts_select on public.on_call_shifts;
drop policy if exists on_call_shifts_insert on public.on_call_shifts;
drop policy if exists on_call_shifts_update on public.on_call_shifts;
drop policy if exists on_call_shifts_delete on public.on_call_shifts;

create policy on_call_shifts_select on public.on_call_shifts
  for select to authenticated
  using (
    public.is_platform_admin()
    or public.is_company_wide(company_id)
    or public.is_company_on_call(company_id)
    or (branch_id is not null and (public.is_branch_manager(branch_id) or public.is_branch_supervisor(branch_id)))
  );
create policy on_call_shifts_insert on public.on_call_shifts
  for insert to authenticated
  with check (
    public.is_platform_admin()
    or public.is_company_wide(company_id)
    or public.is_company_on_call(company_id)
    or (branch_id is not null and (public.is_branch_manager(branch_id) or public.is_branch_supervisor(branch_id)))
  );
create policy on_call_shifts_update on public.on_call_shifts
  for update to authenticated
  using (
    public.is_platform_admin()
    or public.is_company_wide(company_id)
    or public.is_company_on_call(company_id)
    or (branch_id is not null and (public.is_branch_manager(branch_id) or public.is_branch_supervisor(branch_id)))
  )
  with check (
    public.is_platform_admin()
    or public.is_company_wide(company_id)
    or public.is_company_on_call(company_id)
    or (branch_id is not null and (public.is_branch_manager(branch_id) or public.is_branch_supervisor(branch_id)))
  );
create policy on_call_shifts_delete on public.on_call_shifts
  for delete to authenticated
  using (
    public.is_platform_admin()
    or public.is_company_wide(company_id)
    or public.is_company_on_call(company_id)
    or (branch_id is not null and (public.is_branch_manager(branch_id) or public.is_branch_supervisor(branch_id)))
  );
