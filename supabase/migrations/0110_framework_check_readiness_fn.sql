-- 0110_framework_check_readiness_fn
-- Per requirement roll-up of the mapped checks for the Inspection Readiness view.
-- SECURITY INVOKER (default), so it runs under the caller's RLS and is therefore
-- automatically scoped to their role and branch. Counts active checks on active
-- records (leavers, archived and discharged excluded).
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

create or replace function public.get_framework_check_readiness(p_company uuid, p_regulator text)
returns table(requirement_id uuid, overdue int, due_soon int, on_track int, total int)
language sql stable
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
           ci.due_date,
           coalesce(cd.amber_days, c.amber_days_default) as amber
    from mapped mp
    join public.check_instances ci on ci.definition_id = mp.check_definition_id and ci.active = true
    join public.check_definitions cd on cd.id = mp.check_definition_id
    join public.companies c on c.id = p_company
    left join public.people pe on pe.id = ci.person_id
    left join public.service_users su on su.id = ci.service_user_id
    where ci.company_id = p_company
      and ci.due_date is not null
      and ( (ci.record_type = 'person' and pe.employment_status = 'active' and pe.archived_at is null)
         or (ci.record_type = 'service_user' and su.service_status = 'active' and su.archived_at is null) )
  )
  select requirement_id,
    count(*) filter (where due_date < current_date)::int as overdue,
    count(*) filter (where due_date >= current_date and due_date <= current_date + amber)::int as due_soon,
    count(*) filter (where due_date > current_date + amber)::int as on_track,
    count(*)::int as total
  from inst
  group by requirement_id;
$$;

grant execute on function public.get_framework_check_readiness(uuid, text) to authenticated;
