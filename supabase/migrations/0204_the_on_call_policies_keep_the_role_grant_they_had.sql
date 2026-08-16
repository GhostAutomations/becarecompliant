/*
 * 0204. Hygiene on 0203.
 *
 * 0203 recreated five On Call policies to add one OR clause and, in doing so, silently dropped
 * `to authenticated` from all five and left the new predicate unqualified. Neither is a leak
 * today: every predicate resolves through auth.uid(), which is null for anon, so a public grant
 * still refuses. But a policy that says `to public` invites the next reader to believe that was
 * meant, and an unqualified function call depends on a search_path that policies do not pin.
 * A migration whose stated scope is one clause should not also relax five role grants.
 */

drop policy if exists on_call_shifts_select on public.on_call_shifts;
create policy on_call_shifts_select on public.on_call_shifts
for select to authenticated using (
  public.is_platform_admin()
  or public.is_company_wide(company_id)
  or public.is_company_on_call(company_id)
  or (branch_id is not null and (public.is_branch_manager(branch_id) or public.is_branch_supervisor(branch_id)))
  -- Read only, on purpose: the write policies are unchanged and grant nothing here.
  or (branch_id is null and public.is_company_planner(company_id))
);

drop policy if exists on_call_logs_select on public.on_call_logs;
create policy on_call_logs_select on public.on_call_logs
for select to authenticated using (
  public.is_platform_admin()
  or public.is_company_wide(company_id)
  or public.is_company_on_call(company_id)
  or (branch_id is not null and (public.is_branch_manager(branch_id) or public.is_branch_supervisor(branch_id)))
  or (branch_id is null and public.is_company_planner(company_id))
);

drop policy if exists on_call_logs_insert on public.on_call_logs;
create policy on_call_logs_insert on public.on_call_logs
for insert to authenticated with check (
  public.is_platform_admin()
  or public.is_company_wide(company_id)
  or public.is_company_on_call(company_id)
  or (branch_id is not null and (public.is_branch_manager(branch_id) or public.is_branch_supervisor(branch_id)))
  or (branch_id is null and public.is_company_planner(company_id))
);

drop policy if exists on_call_logs_update on public.on_call_logs;
create policy on_call_logs_update on public.on_call_logs
for update to authenticated using (
  public.is_platform_admin()
  or public.is_company_wide(company_id)
  or public.is_company_on_call(company_id)
  or (branch_id is not null and (public.is_branch_manager(branch_id) or public.is_branch_supervisor(branch_id)))
  or (branch_id is null and public.is_company_planner(company_id))
) with check (
  public.is_platform_admin()
  or public.is_company_wide(company_id)
  or public.is_company_on_call(company_id)
  or (branch_id is not null and (public.is_branch_manager(branch_id) or public.is_branch_supervisor(branch_id)))
  or (branch_id is null and public.is_company_planner(company_id))
);
