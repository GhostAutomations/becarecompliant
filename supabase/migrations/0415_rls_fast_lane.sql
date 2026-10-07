-- 0415: the dashboard and registers were slow (Phil, 2026-10-07: "dash is still slow to open").
--
-- Measured: person_check_status for Thistle took 355ms for 426 rows as a Company Admin. Every row
-- ran the permission functions one by one (senior, team member, booked conductor, then admin),
-- each a separate lookup, because SECURITY DEFINER functions with a per row argument are called
-- per row. And the view's people join read every company's people, not just the company asked.
--
-- The fix grants NOTHING new. Each "fast lane" policy below is an exact subset of what the
-- table's existing SELECT policies already allow (platform admin, the company's admin / company
-- wide roles, branch leads), but worked out ONCE per query: the helpers take no per row argument,
-- so (select helper()) becomes an InitPlan and each row is a plain comparison. Permissive
-- policies are OR'd and Postgres checks permissive policies in REVERSE name order (measured 2026-10-07), so "..._zz_fast" runs first, so a row the fast lane admits
-- never reaches the slow functions. Everyone else falls through to the policies as they were.

-- The caller's active company, and the companies where they hold each kind of reach.
create or replace function public.my_company_id() returns uuid
language sql stable security definer set search_path = public as $$
  select p.company_id from public.profiles p where p.id = auth.uid() and p.status = 'active';
$$;

create or replace function public.my_admin_company_id() returns uuid
language sql stable security definer set search_path = public as $$
  select p.company_id from public.profiles p
  where p.id = auth.uid() and p.status = 'active' and p.role = 'company_admin';
$$;

create or replace function public.my_wide_company_id() returns uuid
language sql stable security definer set search_path = public as $$
  select p.company_id from public.profiles p
  where p.id = auth.uid() and p.status = 'active'
    and p.role in ('company_admin', 'registered_individual', 'registered_manager');
$$;

-- Exactly the branches is_branch_lead(bid) is true for, platform admin aside (handled on its own):
-- is_branch_manager = manager on the branch, or company wide in its company;
-- is_branch_supervisor = supervisor on the branch, or recruiter in its company.
create or replace function public.my_lead_branch_ids() returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct x.id), '{}'::uuid[]) from (
    select ub.branch_id as id
      from public.profiles p join public.user_branches ub on ub.user_id = p.id
     where p.id = auth.uid() and p.status = 'active' and p.role in ('manager', 'supervisor')
    union
    select b.id
      from public.profiles p join public.branches b on b.company_id = p.company_id
     where p.id = auth.uid() and p.status = 'active'
       and p.role in ('company_admin', 'registered_individual', 'registered_manager', 'recruiter')
  ) x;
$$;

revoke all on function public.my_company_id(), public.my_admin_company_id(), public.my_wide_company_id(),
  public.my_lead_branch_ids() from public, anon;
grant execute on function public.my_company_id(), public.my_admin_company_id(), public.my_wide_company_id(),
  public.my_lead_branch_ids() to authenticated;

-- Subset of check_instances_select: is_platform_admin() OR is_company_admin(company_id) OR is_branch_lead(branch_id).
create policy check_instances_zz_fast on public.check_instances for select to authenticated using (
  (select public.is_platform_admin())
  or company_id = (select public.my_admin_company_id())
  or branch_id = any ((select public.my_lead_branch_ids())::uuid[])
);

-- Subset of people_select.
create policy people_zz_fast on public.people for select to authenticated using (
  (select public.is_platform_admin())
  or company_id = (select public.my_admin_company_id())
  or branch_id = any ((select public.my_lead_branch_ids())::uuid[])
);

-- Subset of check_definitions_select: is_company_member(company_id) OR is_platform_admin().
create policy check_definitions_zz_fast on public.check_definitions for select to authenticated using (
  (select public.is_platform_admin()) or company_id = (select public.my_company_id())
);

-- Subset of companies_select.
create policy companies_zz_fast on public.companies for select to authenticated using (
  (select public.is_platform_admin()) or id = (select public.my_company_id())
);

-- Subset of person_trackers_select.
create policy person_trackers_zz_fast on public.person_trackers for select to authenticated using (
  (select public.is_platform_admin())
  or company_id = (select public.my_admin_company_id())
  or branch_id = any ((select public.my_lead_branch_ids())::uuid[])
);

-- Subset of service_users_select.
create policy service_users_zz_fast on public.service_users for select to authenticated using (
  (select public.is_platform_admin())
  or company_id = (select public.my_admin_company_id())
  or branch_id = any ((select public.my_lead_branch_ids())::uuid[])
);

-- Subset of service_user_trackers_select.
create policy service_user_trackers_zz_fast on public.service_user_trackers for select to authenticated using (
  (select public.is_platform_admin())
  or company_id = (select public.my_admin_company_id())
  or branch_id = any ((select public.my_lead_branch_ids())::uuid[])
);

-- Subset of person_training_select: is_platform_admin() OR is_company_wide(company_id) OR is_branch_lead(branch_id).
create policy person_training_zz_fast on public.person_training for select to authenticated using (
  (select public.is_platform_admin())
  or company_id = (select public.my_wide_company_id())
  or branch_id = any ((select public.my_lead_branch_ids())::uuid[])
);

-- Subset of training_courses_select / _select_member: is_company_member(company_id).
create policy training_courses_zz_fast on public.training_courses for select to authenticated using (
  (select public.is_platform_admin()) or company_id = (select public.my_company_id())
);

-- The status views: a check's record is always in the check's company, so saying so lets the
-- planner read only that company's people / service users instead of everyone's.
create or replace view public.person_check_status with (security_invoker = true) as
 SELECT ci.id AS instance_id, ci.company_id, ci.branch_id, ci.person_id, ci.definition_id,
    cd.key AS check_key, cd.name AS check_name, cd.population, cd.recurring, cd.anchor, cd.form_id,
    cd.expiry_field_key, ci.due_date, ci.last_completed_on, ci.expiry_date, ci.last_evidence_id,
    COALESCE(cd.amber_days, co.amber_days_default, 30) AS effective_amber,
    check_rag(ci.due_date, COALESCE(cd.amber_days, co.amber_days_default, 30)) AS rag
   FROM check_instances ci
     JOIN check_definitions cd ON cd.id = ci.definition_id
     JOIN people pe ON pe.id = ci.person_id AND pe.company_id = ci.company_id
     JOIN companies co ON co.id = ci.company_id
  WHERE ci.active AND cd.active AND pe.employment_status <> 'leaver'::text AND pe.archived_at IS NULL;

create or replace view public.service_user_check_status with (security_invoker = true) as
 SELECT ci.id AS instance_id, ci.company_id, ci.branch_id, ci.service_user_id, ci.definition_id,
    cd.key AS check_key, cd.name AS check_name, cd.population, cd.recurring, cd.anchor, cd.form_id,
    cd.expiry_field_key, ci.due_date, ci.last_completed_on, ci.expiry_date, ci.last_evidence_id,
    COALESCE(cd.amber_days, co.amber_days_default, 30) AS effective_amber,
        CASE
            WHEN NOT cd.recurring AND ci.last_completed_on IS NOT NULL THEN 'green'::text
            ELSE check_rag(ci.due_date, COALESCE(cd.amber_days, co.amber_days_default, 30))
        END AS rag
   FROM check_instances ci
     JOIN check_definitions cd ON cd.id = ci.definition_id
     JOIN service_users su ON su.id = ci.service_user_id AND su.company_id = ci.company_id
     JOIN companies co ON co.id = ci.company_id
  WHERE ci.active AND cd.active AND su.service_status <> 'cancelled'::text AND su.archived_at IS NULL;
