-- 0340: a Senior never completes a Check on their own People record.
--
-- Found testing 0339: a Senior is also a Person, and their own record is in their own branch, so
-- the list offered them their own Supervision to complete. Nobody supervises themselves. Their
-- own name stays on the list; the Checks against it do not, and senior_may_do_instance refuses
-- them, so complete_check does too.

create or replace function public.senior_may_do_instance(p_instance_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_company uuid;
begin
  select p.company_id into v_company
  from public.profiles p
  where p.id = auth.uid() and p.role = 'senior' and p.status = 'active';
  if v_company is null then return false; end if;

  return exists (
    select 1
    from public.check_instances ci
    join public.check_definitions cd on cd.id = ci.definition_id
    left join public.people pe on pe.id = ci.person_id
    left join public.service_users su on su.id = ci.service_user_id
    join public.user_branches ub
      on ub.user_id = auth.uid() and ub.branch_id = coalesce(pe.branch_id, su.branch_id)
    where ci.id = p_instance_id
      and ci.company_id = v_company
      and ci.active and cd.active
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
      )
  );
end;
$$;

create or replace function public.senior_register(p_kind text)
returns table (
  record_id uuid,
  full_name text,
  branch_name text,
  instance_id uuid,
  check_name text,
  check_key text,
  check_order integer,
  due_date date,
  last_completed_on date,
  rag text,
  has_form boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_company uuid;
begin
  select p.company_id into v_company
  from public.profiles p
  where p.id = auth.uid() and p.role = 'senior' and p.status = 'active';
  if v_company is null then return; end if;
  if p_kind not in ('people', 'service_users') then return; end if;
  if exists (
    select 1 from public.company_role_modules m
    where m.company_id = v_company and m.role = 'senior' and m.module_key = p_kind
  ) then
    return;
  end if;

  if p_kind = 'people' then
    return query
      select pe.id, pe.full_name, b.name,
             ci.id, cd.name, cd.key, cd.sort_order,
             ci.due_date, ci.last_completed_on,
             case when ci.id is null then null
                  else public.check_rag(ci.due_date, coalesce(cd.amber_days, co.amber_days_default, 30)) end,
             cd.form_id is not null
      from public.people pe
      join public.user_branches ub on ub.branch_id = pe.branch_id and ub.user_id = auth.uid()
      left join public.branches b on b.id = pe.branch_id
      join public.companies co on co.id = pe.company_id
      left join public.check_instances ci
        on ci.person_id = pe.id and ci.active
       and pe.profile_id is distinct from auth.uid()
       and exists (select 1 from public.check_definitions d2 where d2.id = ci.definition_id and d2.active)
       and not exists (
         select 1 from public.senior_check_access_off o
         where o.company_id = v_company and o.definition_id = ci.definition_id
       )
      left join public.check_definitions cd on cd.id = ci.definition_id
      where pe.company_id = v_company
        and pe.archived_at is null
        and coalesce(pe.employment_status, 'active') = 'active'
      order by pe.surname_key nulls last, pe.full_name, cd.sort_order nulls last, cd.name;
  else
    return query
      select su.id, su.full_name, b.name,
             ci.id, cd.name, cd.key, cd.sort_order,
             ci.due_date, ci.last_completed_on,
             case when ci.id is null then null
                  when (not cd.recurring) and ci.last_completed_on is not null then 'green'
                  else public.check_rag(ci.due_date, coalesce(cd.amber_days, co.amber_days_default, 30)) end,
             cd.form_id is not null
      from public.service_users su
      join public.user_branches ub on ub.branch_id = su.branch_id and ub.user_id = auth.uid()
      left join public.branches b on b.id = su.branch_id
      join public.companies co on co.id = su.company_id
      left join public.check_instances ci
        on ci.service_user_id = su.id and ci.active
       and exists (select 1 from public.check_definitions d2 where d2.id = ci.definition_id and d2.active)
       and not exists (
         select 1 from public.senior_check_access_off o
         where o.company_id = v_company and o.definition_id = ci.definition_id
       )
      left join public.check_definitions cd on cd.id = ci.definition_id
      where su.company_id = v_company
        and su.archived_at is null
        and coalesce(su.service_status, 'active') = 'active'
        and (su.discharge_date is null or su.discharge_date >= (now() at time zone 'Europe/London')::date)
      order by su.surname_key nulls last, su.full_name, cd.sort_order nulls last, cd.name;
  end if;
end;
$$;
