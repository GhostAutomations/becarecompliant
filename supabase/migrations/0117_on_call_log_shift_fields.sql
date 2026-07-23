-- 0117_on_call_log_shift_fields
-- Reshape the on-call call log into a per-shift record:
--   * shift_date + slot (AM/PM) instead of a free "when the call came in"
--   * branch optional (company-wide rota logs have no branch)
--   * On Call Notes (details), plus number of complaints / absences during the
--     shift and whether each has been logged, and an "urgent follow up" flag.
-- The handler is always the logged-in user (created_by); the old caller/category
-- columns are left in place (unused) to avoid destructive changes.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

alter table public.on_call_logs alter column branch_id drop not null;
alter table public.on_call_logs add column if not exists shift_date date;
alter table public.on_call_logs add column if not exists slot text check (slot in ('am', 'pm'));
alter table public.on_call_logs add column if not exists complaints_count integer not null default 0 check (complaints_count >= 0);
alter table public.on_call_logs add column if not exists complaints_logged boolean not null default false;
alter table public.on_call_logs add column if not exists absences_count integer not null default 0 check (absences_count >= 0);
alter table public.on_call_logs add column if not exists absences_logged boolean not null default false;

-- Recreate RLS so a company-wide (branch-less) log is covered by the company-wide
-- seniors + On Call role; branch logs keep branch manager/supervisor access.
drop policy if exists on_call_logs_select on public.on_call_logs;
drop policy if exists on_call_logs_insert on public.on_call_logs;
drop policy if exists on_call_logs_update on public.on_call_logs;
drop policy if exists on_call_logs_delete on public.on_call_logs;

create policy on_call_logs_select on public.on_call_logs
  for select to authenticated
  using (
    public.is_platform_admin()
    or public.is_company_wide(company_id)
    or public.is_company_on_call(company_id)
    or (branch_id is not null and (public.is_branch_manager(branch_id) or public.is_branch_supervisor(branch_id)))
  );
create policy on_call_logs_insert on public.on_call_logs
  for insert to authenticated
  with check (
    public.is_platform_admin()
    or public.is_company_wide(company_id)
    or public.is_company_on_call(company_id)
    or (branch_id is not null and (public.is_branch_manager(branch_id) or public.is_branch_supervisor(branch_id)))
  );
create policy on_call_logs_update on public.on_call_logs
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
create policy on_call_logs_delete on public.on_call_logs
  for delete to authenticated
  using (
    public.is_platform_admin()
    or public.is_company_wide(company_id)
    or public.is_company_on_call(company_id)
    or (branch_id is not null and (public.is_branch_manager(branch_id) or public.is_branch_supervisor(branch_id)))
  );
