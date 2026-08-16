/*
 * 0203. A company-wide On Call rota was invisible to every Manager and Supervisor.
 *
 * Both tables let a branch role in through
 *     (branch_id IS NOT NULL AND (is_branch_manager(branch_id) OR is_branch_supervisor(branch_id)))
 * and a company whose rota scope is "company" writes NO branch on any shift or log. So that
 * clause can never fire, and the result is not a partial view, it is nothing: an empty three
 * week grid, an empty archive and an empty call log, on a screen that still draws a + in every
 * cell and a Log a call button, every one of which the database then refuses. Acme is in exactly
 * this state, which is how it was found.
 *
 * The rota: SEE IT, DO NOT CHANGE IT (Phil, 2026-08-17). Knowing who to ring at 2am is the whole
 * purpose of the screen, and a Manager needs that. Rostering the company's out of hours cover
 * belongs to the people who own it, so INSERT, UPDATE and DELETE are left exactly as they were.
 *
 * The call log: SEE IT AND RECORD A CALL. Reading is the same argument. Writing is a different
 * question from rostering: if the Manager takes the out of hours phone, refusing to let her
 * write down what happened means the call is not recorded anywhere. She can already add and edit
 * logs in a branch she runs, so this is the same right in a company that keeps one list rather
 * than a new one.
 *
 * is_company_planner is manager + supervisor, and is scoped to the company on the row.
 */

drop policy if exists on_call_shifts_select on public.on_call_shifts;
create policy on_call_shifts_select on public.on_call_shifts
for select using (
  is_platform_admin()
  or is_company_wide(company_id)
  or is_company_on_call(company_id)
  or (branch_id is not null and (is_branch_manager(branch_id) or is_branch_supervisor(branch_id)))
  -- Read only, on purpose: the write policies below are unchanged.
  or (branch_id is null and is_company_planner(company_id))
);

drop policy if exists on_call_logs_select on public.on_call_logs;
create policy on_call_logs_select on public.on_call_logs
for select using (
  is_platform_admin()
  or is_company_wide(company_id)
  or is_company_on_call(company_id)
  or (branch_id is not null and (is_branch_manager(branch_id) or is_branch_supervisor(branch_id)))
  or (branch_id is null and is_company_planner(company_id))
);

drop policy if exists on_call_logs_insert on public.on_call_logs;
create policy on_call_logs_insert on public.on_call_logs
for insert with check (
  is_platform_admin()
  or is_company_wide(company_id)
  or is_company_on_call(company_id)
  or (branch_id is not null and (is_branch_manager(branch_id) or is_branch_supervisor(branch_id)))
  or (branch_id is null and is_company_planner(company_id))
);

drop policy if exists on_call_logs_update on public.on_call_logs;
create policy on_call_logs_update on public.on_call_logs
for update using (
  is_platform_admin()
  or is_company_wide(company_id)
  or is_company_on_call(company_id)
  or (branch_id is not null and (is_branch_manager(branch_id) or is_branch_supervisor(branch_id)))
  or (branch_id is null and is_company_planner(company_id))
) with check (
  is_platform_admin()
  or is_company_wide(company_id)
  or is_company_on_call(company_id)
  or (branch_id is not null and (is_branch_manager(branch_id) or is_branch_supervisor(branch_id)))
  or (branch_id is null and is_company_planner(company_id))
);

/*
 * DELETE is deliberately NOT extended. Removing an out of hours call record is not part of
 * taking the call, and on_call_logs_delete stays with the roles that own the register.
 */
