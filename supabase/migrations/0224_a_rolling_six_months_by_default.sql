-- 0224_a_rolling_six_months_by_default
-- The absence rolling window shipped at twelve months (365 days before 0223). Twelve
-- is the longest window in common use; six months is the one that catches a pattern
-- while something can still be done about it, so six is the product default (Phil,
-- 2026-09-04).
--
-- Same rule as every default change in this batch: the DEFAULT the product creates
-- changes, so no future company gets the old one, AND existing companies still on the
-- untouched default move. A company that has chosen its own window keeps it -- only a
-- row reading exactly twelve months is touched.
--
-- The view's fallback (for a company with no absence_config row at all) moves with it.
-- Applied to the becarecompliant project ONLY (ref bgrtcvyjuwopunpnudeu).

alter table public.absence_config
  alter column rolling_window_value set default 6;

update public.absence_config
   set rolling_window_value = 6
 where rolling_window_value = 12
   and rolling_window_unit = 'month';

create or replace view public.person_absence_summary as
with ev as (
  select
    ae.company_id,
    ae.person_id,
    ae.branch_id,
    ae.start_date,
    coalesce(ae.end_date, ae.start_date) as end_date,
    coalesce(ae.days, (coalesce(ae.end_date, ae.start_date) - ae.start_date + 1)::numeric) as days
  from public.absence_events ae
  left join public.absence_config cfg on cfg.company_id = ae.company_id
  where ae.start_date >= current_date - (
    coalesce(cfg.rolling_window_value, 6)::text || ' ' ||
    coalesce(cfg.rolling_window_unit, 'month')
  )::interval
)
select
  pe.company_id,
  pe.id as person_id,
  pe.full_name,
  pe.branch_id,
  count(ev.*)::integer as occasions,
  coalesce(sum(ev.days), 0::numeric) as total_days,
  min(ev.start_date) as first_absence,
  max(ev.end_date) as last_absence,
  (
    select max(am.stage)
      from public.absence_meetings am
     where am.person_id = pe.id
       and am.company_id = pe.company_id
       and not (am.evidence_id is null and coalesce(am.response, '') = 'declined')
  ) as latest_meeting_stage
from public.people pe
join ev on ev.person_id = pe.id
where pe.employment_status = 'active'
group by pe.company_id, pe.id, pe.full_name, pe.branch_id;

grant select on public.person_absence_summary to authenticated;
