-- 0305_a_check_that_is_done_is_not_overdue_on_readiness
--
-- Phil, 2026-09-19: the Readiness page listed twelve Setup Visits as overdue, back to Robert
-- Owen's in February 2021. Every one of them was DONE. A Setup Visit is a one-off: once it is
-- completed it is finished for ever, and its due date stays where it was.
--
-- The daily report learnt this on 2026-09-18 (lib/notifications/reportable.ts). The readiness
-- roll-up never did, so it counted every completed setup as overdue and pulled the CIW score
-- down with work that had been done. Same rule here, the same two cases:
--   * a one-off (recurring = false) with a completion is settled;
--   * any check whose own completion already met its due date is settled, because that deadline
--     was discharged and the next one has not been set yet.
-- A settled check counts as ON TRACK: it is evidence of work done, not a gap.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

create or replace function public.get_framework_check_readiness(p_company uuid, p_regulator text)
returns table(requirement_id uuid, overdue integer, due_soon integer, on_track integer, total integer, unscheduled integer)
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
             and ( cd.recurring = false or ci.due_date <= ci.last_completed_on ) ) as settled
    from mapped mp
    join public.check_definitions cd on cd.id = mp.check_definition_id and cd.active = true
    join public.check_instances ci on ci.definition_id = mp.check_definition_id and ci.active = true
    join public.companies c on c.id = p_company
    left join public.people pe on pe.id = ci.person_id
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
    count(*) filter (where due_date is null)::int as unscheduled
  from inst
  group by requirement_id;
$function$;
