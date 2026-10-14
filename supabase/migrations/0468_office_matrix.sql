-- 0468: The Office branch matrix, with Lead the Leader (LTL) in place of supervisions
-- (Phil, 2026-10-14; docs/decisions/office-matrix.md).
--
-- A login ticked "Show on Office matrix" moves its People record into the company's office
-- branch, renamed "Office". While there, Lead the Leader runs the supervision cycle: LTL 1 to 3
-- then the Annual Appraisal, on the company's supervision interval, carrying on from where their
-- supervisions had got to. Untick and they go back to the branch they came from, carrying on from
-- where their LTLs had got to.
--
-- HOW IT STAYS ONE ENGINE. The register works the cycle out from completion dates
-- (lib/people/logic.ts supervisionSlots). An office person's cycle dates are their supervisions
-- plus the LTLs done while ticked (the periods below), so the same engine draws LTL 1 to 3.
-- Everything that CHASES works off check instances, so while ticked:
--   * the supervision instance is set inactive: no supervision due, count, email or chaser;
--   * the LTL instance carries the due date the supervision instance had, and is kept with no
--     "last completed" so nothing reads it as a finished one off check.
-- An LTL instance has a due date ONLY while its person is ticked; everyone else's LTL stays ad
-- hoc with no due date, exactly as before.
--
-- 1. person_office_periods: when each person was ticked, and the branch they came from.
-- 2. The office branch is called "Office" in every company and every new one.
-- 3. Lead the Leader keeps its five job titles in every company and every new one.
-- 4. set_office_matrix: the tick, Admin and Founder only, audit logged.
-- 5. A ticked person stays in the office branch until unticked.
-- 6. complete_check: an LTL (or a supervision) done while ticked moves the cycle on, LTL 3 dates an
--    "after Supervision 3" appraisal, and an appraisal restarts the LTL cycle.
-- 7. set_person_check_due: probation passed while ticked schedules LTL 1.

-- ---------------------------------------------------------------------------------------------
-- 1. The periods
-- ---------------------------------------------------------------------------------------------
create table if not exists public.person_office_periods (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  from_branch_id uuid references public.branches(id),
  -- Timestamps, not dates: an LTL counts towards the cycle when it was RECORDED while ticked
  -- (evidence.submitted_at), whatever date the form carries.
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  started_by uuid references auth.users(id) on delete set null,
  ended_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists person_office_periods_one_open
  on public.person_office_periods (person_id) where ended_at is null;
create index if not exists person_office_periods_company
  on public.person_office_periods (company_id);

alter table public.person_office_periods enable row level security;

-- Seen by whoever can see the person (people's own policies decide). Written only by
-- set_office_matrix.
drop policy if exists person_office_periods_select on public.person_office_periods;
create policy person_office_periods_select on public.person_office_periods
  for select to authenticated
  using (exists (select 1 from public.people p where p.id = person_id));

-- Is this person ticked right now?
create or replace function public.person_on_office(p_person_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.person_office_periods o
     where o.person_id = p_person_id and o.ended_at is null
  );
$$;
revoke execute on function public.person_on_office(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 2. "Office" in every company, and every new one
-- ---------------------------------------------------------------------------------------------
update public.branches
   set name = 'Office'
 where kind = 'team'
   and name = (select c.name from public.companies c where c.id = company_id) || ' Office';

create or replace function public.provision_company(p_name text, p_slug text, p_tier text, p_branch_name text, p_trial_days integer, p_owner_email text, p_owner_domain text, p_request_id uuid, p_override_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_company_id uuid;
  v_name text := nullif(btrim(p_name), '');
  v_slug text := nullif(btrim(lower(p_slug)), '');
  v_email text := nullif(btrim(lower(p_owner_email)), '');
  v_domain text := nullif(btrim(lower(p_owner_domain)), '');
  v_days integer := coalesce(p_trial_days, 0);
  v_tier text := coalesce(nullif(btrim(lower(p_tier)), ''), 'business');
  v_forms int;
  v_people int;
  v_su int;
  v_training int;
  v_map int;
begin
  if not public.is_platform_admin() then
    raise exception 'Only the platform admin may provision a company';
  end if;
  if v_name is null or v_slug is null then
    raise exception 'A company needs a name and a slug';
  end if;
  if v_tier not in ('business', 'pro', 'black') then
    raise exception 'Unknown tier: %', v_tier;
  end if;

  insert into public.companies (
    name, slug, tier, trial_started_at, trial_ends_at,
    trial_owner_email, trial_owner_domain, provisioned_by
  ) values (
    v_name, v_slug, v_tier,
    case when v_days > 0 then now() end,
    case when v_days > 0 then now() + make_interval(days => v_days) end,
    case when p_override_reason is null then v_email end,
    case when p_override_reason is null then v_domain end,
    case when p_request_id is null then 'founder' else 'trial_request' end
  )
  returning id into v_company_id;

  -- The office branch is "Office" (0468, Phil 2026-10-14).
  insert into public.branches (company_id, name, kind) values
    (v_company_id, 'Office', 'team'),
    (v_company_id, coalesce(nullif(btrim(p_branch_name), ''), 'Main Branch'), 'branch');

  v_forms    := public.seed_company_form_templates(v_company_id);
  v_people   := public.seed_company_people_checks(v_company_id);
  v_su       := public.seed_company_service_user_checks(v_company_id);
  v_training := public.seed_company_training_courses(v_company_id);
  perform public.seed_company_job_titles(v_company_id);
  v_map      := public.seed_requirement_map(v_company_id);

  if p_request_id is not null then
    update public.trial_requests
       set company_id = v_company_id,
           status = 'provisioned',
           status_changed_at = now(),
           status_changed_by = auth.uid()
     where id = p_request_id;
  end if;

  return jsonb_build_object(
    'company_id', v_company_id,
    'forms_seeded', v_forms,
    'people_checks_seeded', v_people,
    'su_checks_seeded', v_su,
    'training_seeded', v_training,
    'requirement_maps_seeded', v_map,
    'trial_days', v_days
  );
end;
$function$;

-- ---------------------------------------------------------------------------------------------
-- 3. Lead the Leader's job titles, in every company and every new one
-- ---------------------------------------------------------------------------------------------
-- The seed table has no job titles column, so a new company's Lead the Leader applied to
-- everybody (Demo's does). Said once here, for every way a company is seeded.
create or replace function public.lead_the_leader_job_titles()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.key = 'lead_the_leader' and new.population = 'people'
     and (new.job_titles is null or cardinality(new.job_titles) = 0) then
    new.job_titles := array['Supervisor', 'Senior Supervisor', 'Deputy Manager',
                            'Registered Manager', 'Senior Care Assistant'];
  end if;
  return new;
end;
$$;
revoke execute on function public.lead_the_leader_job_titles() from public, anon, authenticated;

drop trigger if exists check_definitions_lead_the_leader_titles on public.check_definitions;
create trigger check_definitions_lead_the_leader_titles
  before insert on public.check_definitions
  for each row execute function public.lead_the_leader_job_titles();

update public.check_definitions
   set job_titles = array['Supervisor', 'Senior Supervisor', 'Deputy Manager',
                          'Registered Manager', 'Senior Care Assistant']
 where key = 'lead_the_leader' and population = 'people'
   and (job_titles is null or cardinality(job_titles) = 0);

-- ---------------------------------------------------------------------------------------------
-- 4. The tick
-- ---------------------------------------------------------------------------------------------
create or replace function public.set_office_matrix(p_profile_id uuid, p_on boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company uuid;
  v_person public.people%rowtype;
  v_ltl public.check_definitions%rowtype;
  v_office uuid;
  v_period public.person_office_periods%rowtype;
  v_due date;
  v_last date;
  v_back uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated' using errcode = '42501'; end if;

  select company_id into v_company from public.profiles where id = p_profile_id;
  if v_company is null then raise exception 'Unknown login'; end if;
  if not (public.is_platform_admin() or public.is_company_admin(v_company)) then
    raise exception 'Only an Admin can change who is on the Office matrix.' using errcode = '42501';
  end if;

  select * into v_person from public.people
   where profile_id = p_profile_id and company_id = v_company;
  if v_person.id is null then
    raise exception 'This login is not linked to a People record, so there is nobody to show on the Office matrix. Link it to their record first.';
  end if;

  select * into v_period from public.person_office_periods
   where person_id = v_person.id and ended_at is null;

  if p_on then
    if v_period.id is not null then return; end if; -- already ticked
    if v_person.archived_at is not null or v_person.employment_status = 'leaver' then
      raise exception 'A leaver or an archived record cannot go on the Office matrix.';
    end if;

    select * into v_ltl from public.check_definitions
     where company_id = v_company and population = 'people' and key = 'lead_the_leader' and active;
    if v_ltl.id is null or v_ltl.form_id is null then
      raise exception 'This company has no Lead the Leader check with a form, so the Office matrix has nothing to run.';
    end if;
    if v_ltl.job_titles is not null and cardinality(v_ltl.job_titles) > 0
       and not exists (select 1 from unnest(v_ltl.job_titles) jt
                        where lower(btrim(jt)) = lower(btrim(coalesce(v_person.job_title, '')))) then
      raise exception 'Lead the Leader does not apply to the job title "%", so this person cannot go on the Office matrix.',
        coalesce(nullif(btrim(v_person.job_title), ''), 'none');
    end if;

    select id into v_office from public.branches
     where company_id = v_company and kind = 'team' and status = 'active'
     order by created_at limit 1;
    if v_office is null then raise exception 'This company has no Office branch.'; end if;

    insert into public.person_office_periods (company_id, person_id, from_branch_id, started_by)
    values (v_company, v_person.id, v_person.branch_id, auth.uid());

    update public.people set branch_id = v_office, updated_at = now()
     where id = v_person.id and branch_id is distinct from v_office;

    -- Their LTL takes over the supervision's due date: carry on from where they are.
    select ci.due_date into v_due
      from public.check_instances ci
      join public.check_definitions cd on cd.id = ci.definition_id
     where ci.person_id = v_person.id and cd.key = 'supervision' and cd.population = 'people';

    insert into public.check_instances (company_id, branch_id, definition_id, record_type, person_id)
    values (v_company, v_office, v_ltl.id, 'person', v_person.id)
    on conflict (definition_id, person_id) do nothing;

    update public.check_instances
       set active = true, due_date = v_due, last_completed_on = null, updated_at = now()
     where definition_id = v_ltl.id and person_id = v_person.id;

    update public.check_instances ci
       set active = false, updated_at = now()
      from public.check_definitions cd
     where cd.id = ci.definition_id and ci.person_id = v_person.id
       and cd.key = 'supervision' and cd.population = 'people';
  else
    if v_period.id is null then return; end if; -- not ticked

    select ci.due_date into v_due
      from public.check_instances ci
      join public.check_definitions cd on cd.id = ci.definition_id
     where ci.person_id = v_person.id and cd.key = 'lead_the_leader' and cd.population = 'people';

    v_office := v_person.branch_id;
    v_back := v_period.from_branch_id;
    if v_back is null or not exists (select 1 from public.branches b
                                      where b.id = v_back and b.company_id = v_company and b.status = 'active') then
      raise exception 'The branch this person came from is no longer open. Move them to a branch on their record, then untick.';
    end if;

    update public.person_office_periods
       set ended_at = now(), ended_by = auth.uid()
     where id = v_period.id;

    update public.people set branch_id = v_back, updated_at = now()
     where id = v_person.id;

    -- Supervisions carry on from where their LTLs had got to.
    update public.check_instances ci
       set active = true, due_date = coalesce(v_due, ci.due_date), updated_at = now()
      from public.check_definitions cd
     where cd.id = ci.definition_id and ci.person_id = v_person.id
       and cd.key = 'supervision' and cd.population = 'people';

    -- Lead the Leader goes back to ad hoc: no due date, its last completion on file.
    select max(public.evidence_completion_date(e.answers, e.schema_snapshot, e.submitted_at)) into v_last
      from public.evidence e
      join public.check_definitions cd on cd.form_id = e.form_id and cd.company_id = e.company_id
     where cd.key = 'lead_the_leader' and cd.population = 'people'
       and e.record_type = 'person' and e.record_id = v_person.id;

    update public.check_instances ci
       set due_date = null, last_completed_on = v_last, updated_at = now()
      from public.check_definitions cd
     where cd.id = ci.definition_id and ci.person_id = v_person.id
       and cd.key = 'lead_the_leader' and cd.population = 'people';
  end if;

  insert into public.audit_log (company_id, actor_id, actor_role, action, entity_type, entity_id, summary, metadata)
  values (
    v_company, auth.uid(),
    (select role from public.profiles where id = auth.uid()),
    case when p_on then 'person.office_matrix_on' else 'person.office_matrix_off' end,
    'person', v_person.id::text,
    case when p_on then v_person.full_name || ' put on the Office matrix'
         else v_person.full_name || ' taken off the Office matrix' end,
    jsonb_build_object('profile_id', p_profile_id,
                       'from_branch_id', case when p_on then v_person.branch_id else v_office end,
                       'to_branch_id', case when p_on then v_office else v_back end)
  );
end;
$$;
revoke execute on function public.set_office_matrix(uuid, boolean) from public, anon;
grant execute on function public.set_office_matrix(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 5. A ticked person stays in the office branch until unticked
-- ---------------------------------------------------------------------------------------------
create or replace function public.people_office_branch_holds()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.branch_id is distinct from old.branch_id
     and exists (select 1 from public.person_office_periods o
                  where o.person_id = new.id and o.ended_at is null)
     and not exists (select 1 from public.branches b where b.id = new.branch_id and b.kind = 'team') then
    raise exception 'This person is on the Office matrix. Untick "Show on Office matrix" on their login to move them back to a branch.';
  end if;
  return new;
end;
$$;
revoke execute on function public.people_office_branch_holds() from public, anon, authenticated;

drop trigger if exists people_office_branch_holds on public.people;
create trigger people_office_branch_holds
  before update of branch_id on public.people
  for each row execute function public.people_office_branch_holds();

-- ---------------------------------------------------------------------------------------------
-- 6. complete_check: as 0444 word for word, plus the office cycle (marked OFFICE)
-- ---------------------------------------------------------------------------------------------
create or replace function public.office_cycle_dates(p_person_id uuid)
returns table(completed_on date, evidence_id uuid)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  -- The register's cycle for this person: every supervision, plus every LTL recorded while ticked
  -- (lib/people/data.ts reads the same).
  select public.evidence_completion_date(e.answers, e.schema_snapshot, e.submitted_at), e.id
    from public.evidence e
    join public.people pe on pe.id = e.record_id
    join public.check_definitions cd on cd.form_id = e.form_id and cd.company_id = pe.company_id
   where e.record_type = 'person' and e.record_id = p_person_id
     and cd.key = 'supervision' and cd.population = 'people'
  union all
  select m.completed_on, null::uuid
    from public.migrated_completions m
    join public.check_definitions cd on cd.id = m.definition_id
   where m.record_type = 'person' and m.record_id = p_person_id
     and cd.key = 'supervision' and cd.population = 'people'
  union all
  select public.evidence_completion_date(e.answers, e.schema_snapshot, e.submitted_at), e.id
    from public.evidence e
    join public.people pe on pe.id = e.record_id
    join public.check_definitions cd on cd.form_id = e.form_id and cd.company_id = pe.company_id
   where e.record_type = 'person' and e.record_id = p_person_id
     and cd.key = 'lead_the_leader' and cd.population = 'people'
     and exists (select 1 from public.person_office_periods o
                  where o.person_id = p_person_id
                    and e.submitted_at >= o.started_at
                    and (o.ended_at is null or e.submitted_at <= o.ended_at));
$$;
revoke execute on function public.office_cycle_dates(uuid) from public, anon, authenticated;

create or replace function public.complete_check(
  p_instance_id uuid,
  p_completed_on date,
  p_evidence_id uuid,
  p_next_due date,
  p_expiry_date date default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ci public.check_instances%rowtype;
  cd public.check_definitions%rowtype;
  ev public.evidence%rowtype;
  v_dates record;
  v_today date := (now() at time zone 'Europe/London')::date;
  v_sup int;
  v_office boolean;
  v_last_app date;
  v_pos int;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select * into ci from public.check_instances where id = p_instance_id for update;
  if ci.id is null then raise exception 'Unknown check'; end if;
  select * into cd from public.check_definitions where id = ci.definition_id;

  if ci.person_id is not null then
    if exists (select 1 from public.people pe where pe.id = ci.person_id and pe.profile_id = auth.uid()) then
      raise exception 'This is your own record, so someone else must complete this check.';
    end if;
    if not (public.can_complete_person_check(ci.person_id) or public.senior_may_do_instance(ci.id)) then
      raise exception 'Not allowed to complete this check';
    end if;
  elsif not (public.can_complete_service_user_check(ci.service_user_id) or public.senior_may_do_instance(ci.id)) then
    raise exception 'Not allowed to complete this check';
  end if;
  -- A Recruiter completes only the check they are booked on the Planner to carry out (4.1).
  if exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'recruiter')
     and not public.is_booked_conductor_for_check(ci.id) then
    raise exception 'A Recruiter completes a check only when they are booked on the Planner to do it.';
  end if;

  if p_evidence_id is null then
    raise exception 'A check is completed by filling in its form.';
  end if;
  -- The same completion sent again (a retry): nothing to do.
  if ci.last_evidence_id is not distinct from p_evidence_id then return; end if;

  select * into ev from public.evidence where id = p_evidence_id;
  if ev.id is null
     or ev.company_id is distinct from ci.company_id
     or ev.record_type is distinct from (case when ci.person_id is not null then 'person' else 'service_user' end)
     or ev.record_id is distinct from coalesce(ci.person_id, ci.service_user_id)
     or ev.form_id is distinct from cd.form_id
     or ev.author_id is distinct from auth.uid()
     or ev.anonymised_at is not null then
    raise exception 'That is not a completed form for this check.';
  end if;
  if exists (select 1 from public.check_instances x where x.last_evidence_id = p_evidence_id and x.id <> ci.id) then
    raise exception 'That form has already completed a check.';
  end if;
  if not public.evidence_completes_check(ev.answers, ev.schema_snapshot) then
    raise exception 'The form says this did not take place, so the check stays due.';
  end if;

  select * into v_dates from public.check_dates_from_evidence(ci.id, ev.id);
  if v_dates.completed_on > v_today then
    raise exception 'The date on this form is in the future. Enter the date it was done.';
  end if;
  -- Older than the completion on file: it is history, and the check stays where it is (0319).
  if ci.last_completed_on is not null and v_dates.completed_on < ci.last_completed_on then return; end if;

  update public.check_instances set
    last_completed_on = v_dates.completed_on,
    last_evidence_id = p_evidence_id,
    expiry_date = coalesce(v_dates.expiry, expiry_date),
    due_date = case
      when cd.recurring then v_dates.next_due
      when ci.service_user_id is not null then due_date
      else null
    end,
    updated_at = now()
  where id = ci.id;

  -- OFFICE (0468): is this person on the Office matrix right now?
  v_office := ci.person_id is not null and public.person_on_office(ci.person_id);

  if ci.person_id is not null and cd.key in ('appraisal', 'supervision', 'lead_the_leader') then
    select s."interval" into v_sup
      from public.check_definitions s
     where s.company_id = ci.company_id and s.population = 'people' and s.key = 'supervision';
    v_sup := case when coalesce(v_sup, 0) >= 1 then v_sup else 90 end;

    if cd.key = 'appraisal' and v_office then
      -- OFFICE: an Appraisal restarts the LTL cycle, LTL 1 due one supervision interval after it.
      update public.check_instances x
         set due_date = v_dates.completed_on + v_sup,
             last_completed_on = null,
             updated_at = now()
        from public.check_definitions s
       where x.definition_id = s.id
         and x.person_id = ci.person_id
         and s.key = 'lead_the_leader' and s.population = 'people';
    elsif cd.key = 'appraisal' then
      -- An Appraisal restarts the supervision cycle: Supervision 1 is due one supervision interval
      -- after it, with none of the new cycle done yet.
      update public.check_instances x
         set due_date = v_dates.completed_on + v_sup,
             last_completed_on = null,
             last_evidence_id = null,
             updated_at = now()
        from public.check_definitions s
       where x.definition_id = s.id
         and x.person_id = ci.person_id
         and s.key = 'supervision' and s.population = 'people';
    elsif v_office then
      -- OFFICE: an LTL (or a supervision) done while ticked moves the LTL cycle on, unless an
      -- older one is being filed after a newer (history, as 0319). The LTL instance never keeps a
      -- "last completed" while ticked, or a one off check that has been done reads as finished.
      update public.check_instances x
         set last_completed_on = null
        from public.check_definitions s
       where x.definition_id = s.id
         and x.person_id = ci.person_id
         and s.key = 'lead_the_leader' and s.population = 'people';
      if not exists (select 1 from public.office_cycle_dates(ci.person_id) d
                      where d.completed_on > v_dates.completed_on
                        and d.evidence_id is distinct from p_evidence_id) then
        update public.check_instances x
           set due_date = v_dates.completed_on + v_sup,
               last_completed_on = null,
               updated_at = now()
          from public.check_definitions s
         where x.definition_id = s.id
           and x.person_id = ci.person_id
           and s.key = 'lead_the_leader' and s.population = 'people';

        -- The third of the cycle (counted by date since the last appraisal, as the register
        -- counts) dates an "after Supervision 3" Appraisal.
        select max(d.c) into v_last_app from (
          select public.evidence_completion_date(e.answers, e.schema_snapshot, e.submitted_at) as c
            from public.evidence e
            join public.check_definitions a on a.form_id = e.form_id and a.company_id = ci.company_id
           where a.key = 'appraisal' and a.population = 'people'
             and e.record_type = 'person' and e.record_id = ci.person_id
          union all
          select m.completed_on
            from public.migrated_completions m
            join public.check_definitions a on a.id = m.definition_id
           where a.key = 'appraisal' and a.population = 'people'
             and m.record_type = 'person' and m.record_id = ci.person_id
        ) d;
        select count(*) into v_pos from public.office_cycle_dates(ci.person_id) d
         where (v_last_app is null or d.completed_on > v_last_app)
           and d.completed_on <= v_dates.completed_on;
        if v_pos = 3 and exists (select 1 from public.check_definitions a
                                   where a.company_id = ci.company_id and a.population = 'people'
                                     and a.key = 'appraisal' and a.active and a.schedule_mode = 'after_sup3') then
          update public.check_instances x
             set due_date = v_dates.completed_on + v_sup,
                 updated_at = now()
            from public.check_definitions a
           where x.definition_id = a.id
             and x.person_id = ci.person_id
             and a.key = 'appraisal' and a.population = 'people';
        end if;
      end if;
    elsif cd.key = 'supervision'
          and ev.answers ->> 'supervision_type' = '3'
          and exists (select 1 from public.check_definitions a
                       where a.company_id = ci.company_id and a.population = 'people'
                         and a.key = 'appraisal' and a.active and a.schedule_mode = 'after_sup3') then
      -- Supervision 3 done: an "after Supervision 3" Appraisal falls due one supervision interval
      -- later, keeping the cycle on cadence.
      update public.check_instances x
         set due_date = v_dates.completed_on + v_sup,
             updated_at = now()
        from public.check_definitions a
       where x.definition_id = a.id
         and x.person_id = ci.person_id
         and a.key = 'appraisal' and a.population = 'people';
    end if;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 7. set_person_check_due: as 0444, plus LTL 1 for a ticked person (marked OFFICE)
-- ---------------------------------------------------------------------------------------------
create or replace function public.set_person_check_due(p_person_id uuid, p_check_key text, p_due_date date)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company uuid;
  v_profile uuid;
  v_status text;
  v_end date;
  v_int int;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_check_key is distinct from 'supervision' then
    raise exception 'A check''s due date is set by completing its form.';
  end if;

  select pe.company_id, pe.profile_id, pt.probation_status, pt.probation_end_actual
    into v_company, v_profile, v_status, v_end
    from public.people pe
    left join public.person_trackers pt on pt.person_id = pe.id
   where pe.id = p_person_id;
  if v_company is null then raise exception 'Unknown person'; end if;
  if v_profile is not null and v_profile = auth.uid() then
    raise exception 'This is your own record, so someone else must schedule this check.';
  end if;
  if not public.can_manage_person(p_person_id) then
    raise exception 'Not allowed to schedule this check';
  end if;
  if v_status is distinct from 'passed' or v_end is null then
    raise exception 'Supervision 1 is scheduled once the Probation Review is passed.';
  end if;

  select cd."interval" into v_int
    from public.check_definitions cd
   where cd.company_id = v_company and cd.population = 'people' and cd.key = 'supervision';
  v_int := case when coalesce(v_int, 0) >= 1 then v_int else 90 end;

  update public.check_instances ci
     set due_date = v_end + v_int, updated_at = now()
    from public.check_definitions cd
   where ci.definition_id = cd.id
     and ci.person_id = p_person_id
     -- OFFICE: a ticked person's cycle runs on Lead the Leader (0468).
     and cd.key = case when public.person_on_office(p_person_id) then 'lead_the_leader' else 'supervision' end
     and cd.population = 'people'
     and ci.active and ci.due_date is null and ci.last_completed_on is null;
end;
$$;

select public.install_company_link_triggers();
