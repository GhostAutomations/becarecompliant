-- 0012_working_status
-- Working Status gains Mat Leave and LTS (long term sick) alongside Active and
-- Leaver. Only Leaver (and archived) are excluded from the active register and
-- rollups; Mat Leave and LTS carers stay visible and counted.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

alter table public.people drop constraint if exists people_employment_status_check;
alter table public.people add constraint people_employment_status_check
  check (employment_status in ('active', 'mat_leave', 'lts', 'leaver'));

create or replace view public.person_check_status
  with (security_invoker = true) as
select
  ci.id            as instance_id,
  ci.company_id,
  ci.branch_id,
  ci.person_id,
  ci.definition_id,
  cd.key           as check_key,
  cd.name          as check_name,
  cd.population,
  cd.recurring,
  cd.anchor,
  cd.form_id,
  cd.expiry_field_key,
  ci.due_date,
  ci.last_completed_on,
  ci.expiry_date,
  ci.last_evidence_id,
  coalesce(cd.amber_days, co.amber_days_default, 30) as effective_amber,
  public.check_rag(ci.due_date, coalesce(cd.amber_days, co.amber_days_default, 30)) as rag
from public.check_instances ci
join public.check_definitions cd on cd.id = ci.definition_id
join public.people pe on pe.id = ci.person_id
join public.companies co on co.id = ci.company_id
where ci.active
  and cd.active
  and pe.employment_status <> 'leaver'
  and pe.archived_at is null;

create or replace view public.person_rollup
  with (security_invoker = true) as
select
  pe.id as person_id,
  pe.company_id,
  pe.branch_id,
  count(s.instance_id)                          as total_checks,
  count(*) filter (where s.rag = 'red')         as red_count,
  count(*) filter (where s.rag = 'amber')       as amber_count,
  count(*) filter (where s.rag = 'green')       as green_count,
  case
    when count(*) filter (where s.rag = 'red') > 0 then 'red'
    when count(*) filter (where s.rag = 'amber') > 0 then 'amber'
    when count(s.instance_id) = 0 then 'none'
    else 'green'
  end as rag
from public.people pe
left join public.person_check_status s on s.person_id = pe.id
where pe.employment_status <> 'leaver' and pe.archived_at is null
group by pe.id, pe.company_id, pe.branch_id;
