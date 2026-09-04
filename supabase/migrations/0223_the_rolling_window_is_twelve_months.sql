-- 0223_the_rolling_window_is_twelve_months
-- The absence rolling window was a number of days. Every UK absence policy says "in a
-- rolling twelve month period", and twelve months is not 365 days: a window from 29
-- February lands on 28 February, and any window spanning a leap day is 366 days long.
-- The window is now a NUMBER and a UNIT, exactly like the probationary period (0220),
-- and the interval is built from both.
--
-- person_absence_summary is where the window is actually applied, so the view is
-- recreated to read the new columns. Postgres builds '12 month' / '52 week' /
-- '365 day' intervals natively, so calendar months are calendar months.
--
-- Backfill: 365 days becomes 12 months and 730 becomes 24, because that is what those
-- numbers were standing in for. A window in whole weeks becomes weeks. Anything else
-- is preserved exactly, in days, because it was chosen.
--
-- rolling_window_days is deliberately LEFT IN PLACE, as in 0220: the build still live
-- while this deploys writes it. It is dropped in a follow-up once the new build is
-- serving.
-- Applied to the becarecompliant project ONLY (ref bgrtcvyjuwopunpnudeu).

alter table public.absence_config
  add column if not exists rolling_window_value integer not null default 12,
  add column if not exists rolling_window_unit text not null default 'month';

alter table public.absence_config
  drop constraint if exists absence_config_rolling_window_unit_check;
alter table public.absence_config
  add constraint absence_config_rolling_window_unit_check
  check (rolling_window_unit in ('day', 'week', 'month'));

alter table public.absence_config
  drop constraint if exists absence_config_rolling_window_value_check;
alter table public.absence_config
  add constraint absence_config_rolling_window_value_check
  check (rolling_window_value between 1 and 1825);

update public.absence_config
   set rolling_window_value =
         case
           when rolling_window_days = 365 then 12
           when rolling_window_days = 730 then 24
           when rolling_window_days % 7 = 0 and rolling_window_days / 7 <= 260
             then rolling_window_days / 7
           else rolling_window_days
         end,
       rolling_window_unit =
         case
           when rolling_window_days in (365, 730) then 'month'
           when rolling_window_days % 7 = 0 and rolling_window_days / 7 <= 260 then 'week'
           else 'day'
         end
 where rolling_window_days between 1 and 1825;

-- The window applied. Everything else in this view is unchanged from the definition
-- 0055 left behind (the declined-meeting stage rule included).
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
    coalesce(cfg.rolling_window_value, 12)::text || ' ' ||
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
