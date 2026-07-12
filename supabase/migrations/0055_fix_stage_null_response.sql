-- 0055_fix_stage_null_response
-- Bug found live (Claude driving Chrome, 2026-07-12): 0053's predicate
--   not (evidence_id is null and response = 'declined')
-- goes NULL for UNANSWERED bookings (response is null), which excluded them
-- from latest_meeting_stage: an open unanswered booking stopped counting as
-- booked in (met. stage showed nothing and Stage 1 was offered again).
-- coalesce makes the comparison two-valued.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

create or replace view public.person_absence_summary
with (security_invoker = on) as
with ev as (
  select
    ae.company_id,
    ae.person_id,
    ae.branch_id,
    ae.start_date,
    coalesce(ae.end_date, ae.start_date) as end_date,
    coalesce(ae.days, (coalesce(ae.end_date, ae.start_date) - ae.start_date) + 1) as days
  from public.absence_events ae
  left join public.absence_config cfg on cfg.company_id = ae.company_id
  where ae.start_date >= current_date
    - ((coalesce(cfg.rolling_window_days, 365))::text || ' days')::interval
)
select
  pe.company_id,
  pe.id as person_id,
  pe.full_name,
  pe.branch_id,
  count(ev.*)::int as occasions,
  coalesce(sum(ev.days), 0) as total_days,
  min(ev.start_date) as first_absence,
  max(ev.end_date) as last_absence,
  (
    select max(am.stage) from public.absence_meetings am
    where am.person_id = pe.id and am.company_id = pe.company_id
      -- declined open bookings are not booked in; unanswered/accepted count
      and not (am.evidence_id is null and coalesce(am.response, '') = 'declined')
  ) as latest_meeting_stage
from public.people pe
join ev on ev.person_id = pe.id
where pe.employment_status = 'active'
group by pe.company_id, pe.id, pe.full_name, pe.branch_id;
