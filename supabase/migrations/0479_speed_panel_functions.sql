-- 0479: Speed plan, Push 3. New set based read functions for the heavy panels. ADDS ONLY: no
-- existing view, policy, function, table or trigger is changed, and nothing live calls these until
-- the speed-overnight branch is merged.
--
-- All three are SECURITY INVOKER (the caller's own row level security applies, exactly as when the
-- views are read directly) with search_path pinned. Each returns what the old read returned; the
-- only difference is that they say "this company" up front. A check's record is always in the
-- check's company (0443 enforces it), so telling the planner so lets Postgres read one company's
-- people or service users instead of every company's, each of them run through the row level
-- security functions. The who-sees-what fingerprint compares old and new for every test login.

-- The People register: the same rows and columns as person_check_status_all for one company.
create or replace function public.register_person_status(p_company uuid)
returns table (
  instance_id uuid, company_id uuid, branch_id uuid, person_id uuid, definition_id uuid,
  check_key text, check_name text, population text, recurring boolean, anchor text, form_id uuid,
  expiry_field_key text, due_date date, last_completed_on date, expiry_date date,
  last_evidence_id uuid, effective_amber integer, rag text
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select ci.id, ci.company_id, ci.branch_id, ci.person_id, ci.definition_id,
         cd.key, cd.name, cd.population, cd.recurring, cd.anchor, cd.form_id, cd.expiry_field_key,
         ci.due_date, ci.last_completed_on, ci.expiry_date, ci.last_evidence_id,
         coalesce(cd.amber_days, co.amber_days_default, 30),
         public.check_rag(ci.due_date, coalesce(cd.amber_days, co.amber_days_default, 30))
    from public.check_instances ci
    join public.check_definitions cd on cd.id = ci.definition_id
    join public.people pe on pe.id = ci.person_id and pe.company_id = ci.company_id
    join public.companies co on co.id = ci.company_id
   where ci.company_id = p_company
     and ci.active and cd.active;
$$;

-- The Service User register: the same rows and columns as service_user_check_status_all for one
-- company.
create or replace function public.register_service_user_status(p_company uuid)
returns table (
  instance_id uuid, company_id uuid, branch_id uuid, service_user_id uuid, definition_id uuid,
  check_key text, check_name text, population text, recurring boolean, anchor text, form_id uuid,
  expiry_field_key text, due_date date, last_completed_on date, expiry_date date,
  last_evidence_id uuid, effective_amber integer, rag text, scheduled_due_date date,
  paused boolean, hospital_since date, service_status text
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select ci.id, ci.company_id, ci.branch_id, ci.service_user_id, ci.definition_id,
         cd.key, cd.name, cd.population, cd.recurring, cd.anchor, cd.form_id, cd.expiry_field_key,
         public.check_effective_due(ci.due_date, ci.resume_due_date),
         ci.last_completed_on, ci.expiry_date, ci.last_evidence_id,
         coalesce(cd.amber_days, co.amber_days_default, 30),
         case
           when not cd.recurring and ci.last_completed_on is not null then 'green'
           when public.su_check_paused(su.service_status, cd.recurring, ci.last_completed_on, ci.due_date) then 'paused'
           else public.check_rag(public.check_effective_due(ci.due_date, ci.resume_due_date), coalesce(cd.amber_days, co.amber_days_default, 30))
         end,
         ci.due_date,
         public.su_check_paused(su.service_status, cd.recurring, ci.last_completed_on, ci.due_date),
         su.hospital_since,
         su.service_status
    from public.check_instances ci
    join public.check_definitions cd on cd.id = ci.definition_id
    join public.service_users su on su.id = ci.service_user_id and su.company_id = ci.company_id
    join public.companies co on co.id = ci.company_id
   where ci.company_id = p_company
     and ci.active and cd.active;
$$;

-- Readiness: the same answer as get_framework_check_readiness, with the company said on every join.
create or replace function public.readiness_check_counts(p_company uuid, p_regulator text, p_branch uuid default null)
returns table (
  requirement_id uuid, overdue integer, due_soon integer, on_track integer, total integer,
  unscheduled integer, waiting_sup3 integer, waiting_appraisal integer, waiting_probation integer
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with mapped as (
    select m.requirement_id, m.check_definition_id
    from public.requirement_evidence_map m
    join public.framework_requirements r on r.id = m.requirement_id and r.regulator = p_regulator
    where m.company_id = p_company and m.check_definition_id is not null
  ),
  inst as (
    select mp.requirement_id,
           public.check_effective_due(ci.due_date, ci.resume_due_date) as due_date,
           coalesce(cd.amber_days, c.amber_days_default) as amber,
           ( ci.last_completed_on is not null
             and ( cd.recurring = false or public.check_effective_due(ci.due_date, ci.resume_due_date) <= ci.last_completed_on ) ) as settled,
           case
             when ci.due_date is not null then 'dated'
             when cd.schedule_mode = 'ad_hoc' then 'ad_hoc'
             when ci.record_type = 'person' and cd.key = 'appraisal'
                  and cd.schedule_mode = 'after_sup3' then 'wait_sup3'
             when ci.record_type = 'person' and cd.key = 'supervision'
                  and ci.last_completed_on is not null then 'wait_appraisal'
             when ci.record_type = 'person' and cd.key = 'supervision'
                  and t.probation_end_actual is null
                  and not exists (
                    select 1
                    from public.check_instances a
                    join public.check_definitions ad on ad.id = a.definition_id and ad.key = 'appraisal'
                    where a.person_id = ci.person_id and a.company_id = p_company and a.last_completed_on is not null
                  ) then 'wait_probation'
             else 'unscheduled'
           end as bucket
    from mapped mp
    join public.check_definitions cd on cd.id = mp.check_definition_id and cd.active = true
    join public.check_instances ci on ci.definition_id = mp.check_definition_id and ci.active = true
    join public.companies c on c.id = p_company
    left join public.people pe on pe.id = ci.person_id and pe.company_id = p_company
    left join public.person_trackers t on t.person_id = ci.person_id and t.company_id = p_company
    left join public.service_users su on su.id = ci.service_user_id and su.company_id = p_company
    where ci.company_id = p_company
      and ( (ci.record_type = 'person' and pe.employment_status <> 'leaver' and pe.archived_at is null)
         or (ci.record_type = 'service_user' and su.service_status <> 'cancelled' and su.archived_at is null
             and not public.su_check_paused(su.service_status, cd.recurring, ci.last_completed_on, ci.due_date)) )
      and ( p_branch is null or coalesce(pe.branch_id, su.branch_id) = p_branch )
  )
  select requirement_id,
    count(*) filter (where due_date is not null and not settled and due_date < ((now() at time zone 'Europe/London')::date))::int as overdue,
    count(*) filter (where due_date is not null and not settled and due_date >= ((now() at time zone 'Europe/London')::date) and due_date <= ((now() at time zone 'Europe/London')::date) + amber)::int as due_soon,
    count(*) filter (where due_date is not null and (settled or due_date > ((now() at time zone 'Europe/London')::date) + amber))::int as on_track,
    count(*) filter (where due_date is not null)::int as total,
    count(*) filter (where bucket = 'unscheduled')::int as unscheduled,
    count(*) filter (where bucket = 'wait_sup3')::int as waiting_sup3,
    count(*) filter (where bucket = 'wait_appraisal')::int as waiting_appraisal,
    count(*) filter (where bucket = 'wait_probation')::int as waiting_probation
  from inst
  group by requirement_id;
$$;

revoke all on function public.register_person_status(uuid), public.register_service_user_status(uuid),
  public.readiness_check_counts(uuid, text, uuid) from public, anon;
grant execute on function public.register_person_status(uuid), public.register_service_user_status(uuid),
  public.readiness_check_counts(uuid, text, uuid) to authenticated;
