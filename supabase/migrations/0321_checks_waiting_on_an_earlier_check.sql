-- 0321_checks_waiting_on_an_earlier_check
--
-- Operation Thistle item 10 (Phil, 2026-09-23). Thistle's readiness page said 49 checks had no
-- due date. Almost none of them were gaps:
--   * 40 were AD HOC checks (Mentoring, One to One, Health Check, Lead the Leader). They are done
--     when needed and never have a due date. Phil: leave them out of the count for now.
--   * 8 were WAITING on an earlier check: an Annual Appraisal on "after Supervision 3" waiting
--     for Supervision 3, a supervision waiting for its appraisal, or a new starter's first
--     supervision waiting for probation to be signed off. Phil: show them as waiting, not as
--     missing a date.
--   * 1 was a real gap: a new starter's Audit, which nothing ever dated (fixed in the app:
--     lib/people/logic.ts dates it from the start date, like Spot Check).
--
-- "No due date" now means only the last kind. The waiting ones get their own counts, by what
-- they are waiting for, so the page can say so. The score is unchanged: none of these were in it.
--
-- The return type changes, so the function is dropped and created again, with its grant.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

drop function if exists public.get_framework_check_readiness(uuid, text);

create function public.get_framework_check_readiness(p_company uuid, p_regulator text)
returns table(
  requirement_id uuid,
  overdue integer,
  due_soon integer,
  on_track integer,
  total integer,
  unscheduled integer,
  waiting_sup3 integer,
  waiting_appraisal integer,
  waiting_probation integer
)
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  with mapped as (
    select m.requirement_id, m.check_definition_id
    from public.requirement_evidence_map m
    join public.framework_requirements r on r.id = m.requirement_id and r.regulator = p_regulator
    where m.company_id = p_company and m.check_definition_id is not null
  ),
  inst as (
    select mp.requirement_id,
           ci.due_date,
           coalesce(cd.amber_days, c.amber_days_default) as amber,
           ( ci.last_completed_on is not null
             and ( cd.recurring = false or ci.due_date <= ci.last_completed_on ) ) as settled,
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
                    where a.person_id = ci.person_id and a.last_completed_on is not null
                  ) then 'wait_probation'
             else 'unscheduled'
           end as bucket
    from mapped mp
    join public.check_definitions cd on cd.id = mp.check_definition_id and cd.active = true
    join public.check_instances ci on ci.definition_id = mp.check_definition_id and ci.active = true
    join public.companies c on c.id = p_company
    left join public.people pe on pe.id = ci.person_id
    left join public.person_trackers t on t.person_id = ci.person_id
    left join public.service_users su on su.id = ci.service_user_id
    where ci.company_id = p_company
      and ( (ci.record_type = 'person' and pe.employment_status = 'active' and pe.archived_at is null)
         or (ci.record_type = 'service_user' and su.service_status = 'active' and su.archived_at is null) )
  )
  select requirement_id,
    count(*) filter (where due_date is not null and not settled and due_date < current_date)::int as overdue,
    count(*) filter (where due_date is not null and not settled and due_date >= current_date and due_date <= current_date + amber)::int as due_soon,
    count(*) filter (where due_date is not null and (settled or due_date > current_date + amber))::int as on_track,
    count(*) filter (where due_date is not null)::int as total,
    count(*) filter (where bucket = 'unscheduled')::int as unscheduled,
    count(*) filter (where bucket = 'wait_sup3')::int as waiting_sup3,
    count(*) filter (where bucket = 'wait_appraisal')::int as waiting_appraisal,
    count(*) filter (where bucket = 'wait_probation')::int as waiting_probation
  from inst
  group by requirement_id;
$function$;

grant execute on function public.get_framework_check_readiness(uuid, text) to authenticated;
