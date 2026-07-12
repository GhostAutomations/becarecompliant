-- 0053_declined_not_booked
-- Phase 6 (Phil, 2026-07-12): a DECLINED invitation means the meeting is NOT
-- booked in. A declined open booking (no evidence, response = declined) must
-- not advance the person's meeting stage; the manager rearranges (which resets
-- the response) or cancels it. Held meetings (with Evidence) always count,
-- whatever the invitation said. The card still shows the declined booking with
-- its reason so it is never invisible.
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
      -- declined open bookings are not booked in (held meetings always count)
      and not (am.evidence_id is null and am.response = 'declined')
  ) as latest_meeting_stage
from public.people pe
join ev on ev.person_id = pe.id
where pe.employment_status = 'active'
group by pe.company_id, pe.id, pe.full_name, pe.branch_id;
