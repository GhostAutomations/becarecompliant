-- Meeting stages age out with the rolling window; Restart the count goes (Phil, 2026-09-24).
--
-- 0328 added "Restart the count from a date" because a meeting's stage never expired: once someone
-- had a Stage 1 meeting, three absences a year later could never call for Stage 1 again. Testing it,
-- Phil: "i dont think we need this" and then "i think it needs to be automatic". So the slate now
-- wipes itself: a meeting counts towards the stage only while it is inside the company's rolling
-- window, exactly like the absences. The button, its table and its two functions are removed.
--
-- The only row the table ever held was a Bevan Care Ltd test restart, already undone
-- (ce4f6ccd-1dcd-41f8-9158-fc6eba16adbd). Discounting a single absence (0328) is unchanged.

drop view if exists public.person_absence_summary;

create view public.person_absence_summary
with (security_invoker = on) as
with ev as (
  select ae.company_id,
         ae.person_id,
         ae.branch_id,
         ae.start_date,
         coalesce(ae.end_date, ae.start_date) as end_date,
         coalesce(ae.days, (coalesce(ae.end_date, ae.start_date) - ae.start_date + 1)::numeric) as days,
         (ae.discounted_at is null) as counts,
         (current_date - (((coalesce(cfg.rolling_window_value, 6)::text || ' ') || coalesce(cfg.rolling_window_unit, 'month'))::interval))::date as window_starts
  from public.absence_events ae
  left join public.absence_config cfg on cfg.company_id = ae.company_id
  where ae.start_date >= (current_date - (((coalesce(cfg.rolling_window_value, 6)::text || ' ') || coalesce(cfg.rolling_window_unit, 'month'))::interval))
)
select pe.company_id,
       pe.id as person_id,
       pe.full_name,
       pe.branch_id,
       (count(*) filter (where ev.counts))::integer as occasions,
       coalesce(sum(ev.days) filter (where ev.counts), 0::numeric) as total_days,
       min(ev.start_date) filter (where ev.counts) as first_absence,
       max(ev.end_date) filter (where ev.counts) as last_absence,
       ( select max(am.stage)
           from public.absence_meetings am
          where am.person_id = pe.id and am.company_id = pe.company_id
            and not (am.evidence_id is null and coalesce(am.response, '') = 'declined')
            -- A meeting sets the stage only while it is inside the rolling window.
            and (am.meeting_date is null or am.meeting_date >= min(ev.window_starts))
       ) as latest_meeting_stage,
       (count(*) filter (where not ev.counts))::integer as not_counted
from public.people pe
join ev on ev.person_id = pe.id
where pe.employment_status = 'active'
group by pe.company_id, pe.id, pe.full_name, pe.branch_id;

revoke all on public.person_absence_summary from anon;
revoke insert, update, delete, truncate, references, trigger on public.person_absence_summary from authenticated;
grant select on public.person_absence_summary to authenticated;

drop function if exists public.restart_absence_count(uuid, date, text);
drop function if exists public.clear_absence_restart(uuid);
drop table if exists public.absence_count_restarts;
