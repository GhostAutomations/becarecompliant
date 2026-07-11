-- 0042_absence_event_update
-- Allow a Manager/Admin to edit a recorded absence (e.g. change the last date of
-- a multi-day absence via "View absence"), scoped to the absence's branch/company.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

create policy absence_events_update on public.absence_events
  for update to authenticated
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
