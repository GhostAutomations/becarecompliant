-- 0339: a Senior completes the Checks ticked on their tile (Phil, 2026-09-29).
--
-- Under People and Service users on the Senior tile in Role access there is now a box per Check,
-- the company's own Checks. A ticked Check lets a Senior see its status and due date against each
-- name in their own branch(es) and open and complete its Form. A Check the company adds later
-- starts ticked, so what is stored is what is switched OFF (the same shape as
-- company_role_modules): no row means ticked.
--
-- WHAT A SENIOR STILL CANNOT READ. No new policy on people or service_users: the record rows
-- (contact details, SSID, invoicing) stay closed to a Senior's own client. The names and the
-- statuses come from senior_register below, and the Complete page reads what it needs on the
-- server only after senior_may_do_instance has said yes. Past Evidence stays closed too: a
-- Senior reads only the Evidence they wrote themselves (author_id, already in evidence_select).

create table if not exists public.senior_check_access_off (
  company_id uuid not null references public.companies(id) on delete cascade,
  definition_id uuid not null references public.check_definitions(id) on delete cascade,
  disabled_at timestamptz not null default now(),
  disabled_by uuid references public.profiles(id) on delete set null,
  primary key (company_id, definition_id)
);

alter table public.senior_check_access_off enable row level security;

drop policy if exists senior_check_access_off_select on public.senior_check_access_off;
create policy senior_check_access_off_select on public.senior_check_access_off
  for select to authenticated
  using (public.is_company_member(company_id) or public.is_platform_admin());

drop policy if exists senior_check_access_off_insert on public.senior_check_access_off;
create policy senior_check_access_off_insert on public.senior_check_access_off
  for insert to authenticated
  with check (
    (public.is_company_admin(company_id) or public.is_platform_admin())
    and exists (
      select 1 from public.check_definitions cd
      where cd.id = definition_id and cd.company_id = senior_check_access_off.company_id
    )
  );

drop policy if exists senior_check_access_off_delete on public.senior_check_access_off;
create policy senior_check_access_off_delete on public.senior_check_access_off
  for delete to authenticated
  using (public.is_company_admin(company_id) or public.is_platform_admin());

/* May the caller, as a Senior, see and complete this one Check instance? Every rule in one
   place: an active Senior of the same company, the record in one of their branches and current,
   the list (People or Service users) ticked, and the Check itself ticked and active. */
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
          and coalesce(pe.employment_status, 'active') = 'active')
        or
        (ci.service_user_id is not null and su.archived_at is null
          and coalesce(su.service_status, 'active') = 'active'
          and (su.discharge_date is null or su.discharge_date >= (now() at time zone 'Europe/London')::date))
      )
  );
end;
$$;

/* The same question by Check key, for the two follow-on schedulers a completion runs: an
   Appraisal re-anchors the Supervision cycle, and Supervision 3 dates the Appraisal. */
create or replace function public.senior_may_do_person_check(p_person_id uuid, p_check_key text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.check_instances ci
    join public.check_definitions cd on cd.id = ci.definition_id
    where ci.person_id = p_person_id
      and cd.key = p_check_key
      and cd.population = 'people'
      and public.senior_may_do_instance(ci.id)
  );
$$;

/* A Senior's register: one row per current record in their branches, and one row per ticked
   Check on it (instance columns null when the record has none ticked). Nothing when the list
   itself is switched off. Status mirrors person_check_status / service_user_check_status. */
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

/* The names a Senior's Form may offer in a "pick the service user / person" field (Spot Check,
   Mentoring): current records in their own branches. Names and branch only. */
create or replace function public.senior_lookup_choices(p_kind text)
returns table (id uuid, full_name text, branch_name text)
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

  if p_kind = 'person' then
    return query
      select pe.id, pe.full_name, b.name
      from public.people pe
      join public.user_branches ub on ub.branch_id = pe.branch_id and ub.user_id = auth.uid()
      left join public.branches b on b.id = pe.branch_id
      where pe.company_id = v_company and pe.archived_at is null
        and coalesce(pe.employment_status, 'active') = 'active'
      order by pe.surname_key nulls last, pe.full_name;
  elsif p_kind = 'service_user' then
    return query
      select su.id, su.full_name, b.name
      from public.service_users su
      join public.user_branches ub on ub.branch_id = su.branch_id and ub.user_id = auth.uid()
      left join public.branches b on b.id = su.branch_id
      where su.company_id = v_company and su.archived_at is null
        and coalesce(su.service_status, 'active') = 'active'
      order by su.surname_key nulls last, su.full_name;
  end if;
end;
$$;

-- The names-only list is replaced by senior_register.
drop function if exists public.senior_name_list(text);

-- A Senior's own client may read the instance rows of the Checks they may do (ids and dates).
drop policy if exists check_instances_senior_select on public.check_instances;
create policy check_instances_senior_select on public.check_instances
  for select to authenticated
  using (public.senior_may_do_instance(id));

-- Completing: the Senior path is by instance, so an unticked Check on the same record stays shut.
create or replace function public.complete_check(p_instance_id uuid, p_completed_on date, p_evidence_id uuid, p_next_due date, p_expiry_date date default null::date)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_person uuid;
  v_service_user uuid;
  v_recurring boolean;
  v_existing uuid;
  v_last date;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select ci.person_id, ci.service_user_id, cd.recurring, ci.last_evidence_id, ci.last_completed_on
    into v_person, v_service_user, v_recurring, v_existing, v_last
  from public.check_instances ci
  join public.check_definitions cd on cd.id = ci.definition_id
  where ci.id = p_instance_id;

  if v_person is null and v_service_user is null then raise exception 'Unknown check'; end if;

  if v_person is not null then
    if not (public.can_complete_person_check(v_person) or public.senior_may_do_instance(p_instance_id)) then
      raise exception 'Not allowed to complete this check';
    end if;
  else
    if not (public.can_complete_service_user_check(v_service_user) or public.senior_may_do_instance(p_instance_id)) then
      raise exception 'Not allowed to complete this check';
    end if;
  end if;

  if v_existing is not null and v_existing = p_evidence_id then return; end if;

  if v_last is not null and p_completed_on is not null and p_completed_on < v_last then return; end if;

  update public.check_instances set
    last_completed_on = p_completed_on,
    last_evidence_id = p_evidence_id,
    expiry_date = coalesce(p_expiry_date, expiry_date),
    due_date = case
      when v_recurring then p_next_due
      when v_service_user is not null then due_date
      else null
    end,
    updated_at = now()
  where id = p_instance_id;
end;
$function$;

create or replace function public.reanchor_supervision_cycle(p_person_id uuid, p_due_date date)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not (public.can_complete_person_check(p_person_id)
          or public.senior_may_do_person_check(p_person_id, 'appraisal')) then
    raise exception 'Not allowed to reschedule supervision for this person';
  end if;

  update public.check_instances ci
    set due_date = p_due_date,
        last_completed_on = null,
        last_evidence_id = null,
        updated_at = now()
  from public.check_definitions cd
  where ci.definition_id = cd.id
    and ci.person_id = p_person_id
    and cd.key = 'supervision'
    and cd.population = 'people';
end;
$function$;

create or replace function public.set_person_check_due(p_person_id uuid, p_check_key text, p_due_date date)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not (public.can_complete_person_check(p_person_id)
          or (p_check_key = 'appraisal' and public.senior_may_do_person_check(p_person_id, 'supervision'))) then
    raise exception 'Not allowed to schedule this check';
  end if;

  update public.check_instances ci
    set due_date = p_due_date, updated_at = now()
  from public.check_definitions cd
  where ci.definition_id = cd.id
    and ci.person_id = p_person_id
    and cd.key = p_check_key
    and cd.population = 'people';
end;
$function$;

revoke all on function public.senior_may_do_instance(uuid) from public, anon;
revoke all on function public.senior_may_do_person_check(uuid, text) from public, anon;
revoke all on function public.senior_register(text) from public, anon;
revoke all on function public.senior_lookup_choices(text) from public, anon;
grant execute on function public.senior_may_do_instance(uuid) to authenticated;
grant execute on function public.senior_may_do_person_check(uuid, text) to authenticated;
grant execute on function public.senior_register(text) to authenticated;
grant execute on function public.senior_lookup_choices(text) to authenticated;
grant select, insert, delete on public.senior_check_access_off to authenticated;
