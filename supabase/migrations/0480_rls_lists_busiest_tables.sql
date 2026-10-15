-- 0480: Speed plan, Push 1b (Phil, 2026-10-15). The busiest tables' permission checks worked out
-- once per query instead of once per row. NO CHANGE TO WHO SEES WHAT.
--
-- Why: a Supervisor's reads of people, checks, training and service users took 250 to 650ms. For
-- every row in their own company they may NOT see (other branches), Postgres ran each permission
-- helper (is_person_supervisor, is_branch_team_member, senior_may_do_instance and the rest) one
-- at a time, each a separate lookup, before turning the row away.
--
-- How: each per row helper gets a twin that returns, once per query, the list it would say yes to,
-- and the SELECT policies on people, check_instances, person_training and service_users use the
-- list instead ("x = any(list)" is true exactly when "helper(x)" is). The twins read the same rows
-- with the same conditions as the helpers they stand in for. The old helpers are not changed and
-- are still used everywhere else.
--
-- is_branch_lead(x) becomes "x = any(my_lead_branch_ids())" (0415). That list leaves out the
-- Founder's every-branch case, which every policy changed here already allows through its own
-- is_platform_admin() term.
--
-- Proved before applying: for every profile in the database, each twin's list equals the set of
-- values its helper says yes to; then the who-sees-what fingerprint (15 logins) after applying.

-- The company where the caller is On call.
create or replace function public.my_on_call_company_id() returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select p.company_id from public.profiles p
   where p.id = auth.uid() and p.role = 'on_call' and p.status = 'active';
$$;

-- The branches where is_branch_team_member(branch) is true.
create or replace function public.my_team_branch_ids() returns uuid[]
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(array_agg(distinct ub.branch_id), '{}'::uuid[])
    from public.profiles p join public.user_branches ub on ub.user_id = p.id
   where p.id = auth.uid() and p.role = 'team_member' and p.status = 'active';
$$;

-- The people for whom is_person_supervisor(person) is true.
create or replace function public.my_supervised_person_ids() returns uuid[]
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(array_agg(distinct pe.id), '{}'::uuid[])
    from public.people pe
    join public.user_branches ub on ub.branch_id = pe.branch_id and ub.user_id = auth.uid()
    join public.profiles pr on pr.id = auth.uid()
   where pr.role = 'supervisor' and pr.status = 'active';
$$;

-- The service users for whom is_service_user_supervisor(service user) is true.
create or replace function public.my_supervised_service_user_ids() returns uuid[]
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(array_agg(distinct su.id), '{}'::uuid[])
    from public.service_users su
    join public.user_branches ub on ub.branch_id = su.branch_id and ub.user_id = auth.uid()
    join public.profiles pr on pr.id = auth.uid()
   where pr.role = 'supervisor' and pr.status = 'active';
$$;

-- The people for whom is_booked_conductor_for_person(person) is true.
create or replace function public.my_booked_person_ids() returns uuid[]
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(array_agg(distinct b.subject_person_id), '{}'::uuid[])
    from public.planner_bookings b
   where b.subject_person_id is not null
     and b.conductor_profile_id = auth.uid()
     and b.created_by is distinct from auth.uid()
     and b.status = 'planned';
$$;

-- The service users for whom is_booked_conductor_for_service_user(service user) is true.
create or replace function public.my_booked_service_user_ids() returns uuid[]
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(array_agg(distinct b.subject_service_user_id), '{}'::uuid[])
    from public.planner_bookings b
   where b.subject_service_user_id is not null
     and b.conductor_profile_id = auth.uid()
     and b.created_by is distinct from auth.uid()
     and b.status = 'planned';
$$;

-- The check instances for which senior_may_do_instance(instance) is true: the same query with the
-- instance left open.
create or replace function public.my_senior_instance_ids() returns uuid[]
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_company uuid;
  v_ids uuid[];
begin
  select p.company_id into v_company from public.profiles p
   where p.id = auth.uid() and p.role = 'senior' and p.status = 'active';
  if v_company is null then
    return '{}'::uuid[];
  end if;
  select coalesce(array_agg(distinct ci.id), '{}'::uuid[]) into v_ids
    from public.check_instances ci
    join public.check_definitions cd on cd.id = ci.definition_id
    left join public.people pe on pe.id = ci.person_id
    left join public.service_users su on su.id = ci.service_user_id
    join public.user_branches ub on ub.user_id = auth.uid() and ub.branch_id = coalesce(pe.branch_id, su.branch_id)
   where ci.company_id = v_company
     and ci.active
     and cd.active
     and not exists (
       select 1 from public.company_role_modules m
        where m.company_id = v_company and m.role = 'senior'
          and m.module_key = case when ci.person_id is not null then 'people' else 'service_users' end
     )
     and not exists (
       select 1 from public.senior_check_access_off o
        where o.company_id = v_company and o.definition_id = cd.id
     )
     and (
       (ci.person_id is not null and pe.archived_at is null
        and coalesce(pe.employment_status, 'active') = 'active'
        and pe.profile_id is distinct from auth.uid())
       or
       (ci.service_user_id is not null and su.archived_at is null
        and coalesce(su.service_status, 'active') = 'active'
        and (su.discharge_date is null or su.discharge_date >= (now() at time zone 'Europe/London')::date))
     );
  return v_ids;
end;
$$;

revoke all on function public.my_on_call_company_id(), public.my_team_branch_ids(), public.my_supervised_person_ids(),
  public.my_supervised_service_user_ids(), public.my_booked_person_ids(), public.my_booked_service_user_ids(),
  public.my_senior_instance_ids() from public, anon;
grant execute on function public.my_on_call_company_id(), public.my_team_branch_ids(), public.my_supervised_person_ids(),
  public.my_supervised_service_user_ids(), public.my_booked_person_ids(), public.my_booked_service_user_ids(),
  public.my_senior_instance_ids() to authenticated;

-- PEOPLE
alter policy people_select on public.people using (
  ( select public.is_platform_admin() as is_platform_admin)
  or company_id = ( select public.my_admin_company_id() as my_admin_company_id)
  or branch_id = any (( select public.my_lead_branch_ids() as my_lead_branch_ids)::uuid[])
  or branch_id = any (( select public.my_team_branch_ids() as my_team_branch_ids)::uuid[])
  or id = any (( select public.my_supervised_person_ids() as my_supervised_person_ids)::uuid[])
  or company_id = ( select public.my_on_call_company_id() as my_on_call_company_id)
  or profile_id = ( select auth.uid() as uid)
);
alter policy people_booked_conductor_select on public.people using (
  id = any (( select public.my_booked_person_ids() as my_booked_person_ids)::uuid[])
);

-- CHECK INSTANCES
alter policy check_instances_select on public.check_instances using (
  ( select public.is_platform_admin() as is_platform_admin)
  or company_id = ( select public.my_admin_company_id() as my_admin_company_id)
  or (branch_id is not null and branch_id = any (( select public.my_lead_branch_ids() as my_lead_branch_ids)::uuid[]))
  or (person_id is not null and person_id = any (( select public.my_supervised_person_ids() as my_supervised_person_ids)::uuid[]))
  or (person_id is not null and exists (
        select 1 from public.people pe
         where pe.id = check_instances.person_id and pe.profile_id = ( select auth.uid() as uid)))
  or (service_user_id is not null and service_user_id = any (( select public.my_supervised_service_user_ids() as my_supervised_service_user_ids)::uuid[]))
);
alter policy check_instances_booked_conductor_select on public.check_instances using (
  (person_id is not null and person_id = any (( select public.my_booked_person_ids() as my_booked_person_ids)::uuid[]))
  or (service_user_id is not null and service_user_id = any (( select public.my_booked_service_user_ids() as my_booked_service_user_ids)::uuid[]))
);
alter policy check_instances_senior_select on public.check_instances using (
  id = any (( select public.my_senior_instance_ids() as my_senior_instance_ids)::uuid[])
);
alter policy check_instances_viewer_select on public.check_instances using (
  branch_id is not null and branch_id = any (( select public.my_team_branch_ids() as my_team_branch_ids)::uuid[])
);

-- PERSON TRAINING
alter policy person_training_select on public.person_training using (
  ( select public.is_platform_admin() as is_platform_admin)
  or company_id = ( select public.my_wide_company_id() as my_wide_company_id)
  or (branch_id is not null and branch_id = any (( select public.my_lead_branch_ids() as my_lead_branch_ids)::uuid[]))
);
-- is_branch_manager(b) or is_branch_supervisor(b) is is_branch_lead(b).
alter policy person_training_write on public.person_training using (
  ( select public.is_platform_admin() as is_platform_admin)
  or company_id = ( select public.my_wide_company_id() as my_wide_company_id)
  or (branch_id is not null and branch_id = any (( select public.my_lead_branch_ids() as my_lead_branch_ids)::uuid[]))
);

-- SERVICE USERS
alter policy service_users_select on public.service_users using (
  ( select public.is_platform_admin() as is_platform_admin)
  or company_id = ( select public.my_admin_company_id() as my_admin_company_id)
  or branch_id = any (( select public.my_lead_branch_ids() as my_lead_branch_ids)::uuid[])
  or id = any (( select public.my_supervised_service_user_ids() as my_supervised_service_user_ids)::uuid[])
);
alter policy service_users_booked_conductor_select on public.service_users using (
  id = any (( select public.my_booked_service_user_ids() as my_booked_service_user_ids)::uuid[])
);
alter policy service_users_viewer_select on public.service_users using (
  branch_id is not null and branch_id = any (( select public.my_team_branch_ids() as my_team_branch_ids)::uuid[])
);
