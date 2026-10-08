-- 0433_absence_recheck_fixes
-- The absence recheck (Phil, 2026-10-08). Four fixes:
--  1. The warning given at a meeting is kept on the meeting (absence_meetings.warning_issued), set
--     when the meeting is recorded and filled in now from each meeting's Evidence. The summary reads
--     it from there: On Call cannot read the Evidence, so they were shown a different stage.
--  2. held_meeting_stage_after_set: whether the latest held meeting's stage after was decided when
--     it was recorded. Every meeting recorded from now stores it, so the drop back in
--     lib/absence/logic.ts is only worked out again for older meetings (it was counting twice).
--  3. Older meetings recorded with No further action get the stage after a new one would (Phil,
--     popup: "set them like new ones"): the stage their counted absences reached then, or the last
--     stage held before, whichever is higher.
--  4. A double press cannot make two: one Evidence per meeting, one open booking per person and
--     stage. And a meeting can only be updated into a branch the person updating it can reach.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

alter table public.absence_meetings add column if not exists warning_issued text;

update public.absence_meetings am
set warning_issued = nullif(btrim(e.answers->>'warning_issued'), '')
from public.evidence e
where e.id = am.evidence_id and am.warning_issued is null
  and nullif(btrim(e.answers->>'warning_issued'), '') is not null;

with m as (
  select am.id, am.person_id, am.stage, am.meeting_date, cfg.thresholds,
         (am.meeting_date - ((coalesce(cfg.rolling_window_value, 6)::text || ' ' || coalesce(cfg.rolling_window_unit, 'month'))::interval))::date as wstart
  from public.absence_meetings am
  join public.evidence e on e.id = am.evidence_id
  left join public.absence_config cfg on cfg.company_id = am.company_id
  where am.stage_after is null and am.stage is not null
    and e.answers->>'meeting_outcome' = 'No further action'
), c as (
  select m.*,
    (select count(*) from public.absence_events ae
      where ae.person_id = m.person_id and ae.discounted_at is null
        and ae.start_date between m.wstart and m.meeting_date) as counted_then,
    (select max(coalesce(x.stage_after, x.stage)) from public.absence_meetings x
      where x.person_id = m.person_id and x.evidence_id is not null and x.id <> m.id
        and x.meeting_date < m.meeting_date and x.meeting_date >= m.wstart) as prior_held
  from m
), r as (
  select c.*,
    coalesce((select max((t->>'stage')::int) from jsonb_array_elements(coalesce(c.thresholds, '[]'::jsonb)) t
      where (t->>'occasions') is not null and (t->>'occasions')::int <= c.counted_then), 0) as reached
  from c
)
update public.absence_meetings am
set stage_after = case when r.reached >= r.stage then r.stage else greatest(r.reached, coalesce(r.prior_held, 0)) end
from r where r.id = am.id;

create unique index if not exists absence_meetings_one_per_evidence
  on public.absence_meetings (evidence_id) where evidence_id is not null;
create unique index if not exists absence_meetings_one_open_booking
  on public.absence_meetings (person_id, stage)
  where evidence_id is null and response is distinct from 'declined';

drop policy if exists absence_meetings_update on public.absence_meetings;
create policy absence_meetings_update on public.absence_meetings for update
  using (is_platform_admin() or is_company_admin(company_id) or (branch_id is not null and is_branch_lead(branch_id)))
  with check (is_platform_admin() or is_company_admin(company_id) or (branch_id is not null and is_branch_lead(branch_id)));

create or replace view public.person_absence_summary
with (security_invoker = on) as
 WITH ev AS (
         SELECT ae.company_id,
            ae.person_id,
            ae.branch_id,
            ae.start_date,
            COALESCE(ae.end_date, ae.start_date) AS end_date,
            COALESCE(ae.days, (COALESCE(ae.end_date, ae.start_date) - ae.start_date + 1)::numeric) AS days,
            ae.discounted_at IS NULL AS counts,
            ((now() AT TIME ZONE 'Europe/London'::text)::date - (((COALESCE(cfg.rolling_window_value, 6)::text || ' '::text) || COALESCE(cfg.rolling_window_unit, 'month'::text))::interval))::date AS window_starts
           FROM absence_events ae
             LEFT JOIN absence_config cfg ON cfg.company_id = ae.company_id
          WHERE ae.start_date >= ((now() AT TIME ZONE 'Europe/London'::text)::date - (((COALESCE(cfg.rolling_window_value, 6)::text || ' '::text) || COALESCE(cfg.rolling_window_unit, 'month'::text))::interval))
        )
 SELECT pe.company_id,
    pe.id AS person_id,
    pe.full_name,
    pe.branch_id,
    count(*) FILTER (WHERE ev.counts)::integer AS occasions,
    COALESCE(sum(ev.days) FILTER (WHERE ev.counts), 0::numeric) AS total_days,
    min(ev.start_date) FILTER (WHERE ev.counts) AS first_absence,
    max(ev.end_date) FILTER (WHERE ev.counts) AS last_absence,
    ( SELECT NULLIF(max(COALESCE(am.stage_after::integer, am.stage)), 0) AS max
           FROM absence_meetings am
          WHERE am.person_id = pe.id AND am.company_id = pe.company_id AND NOT (am.evidence_id IS NULL AND COALESCE(am.response, ''::text) = 'declined'::text) AND (am.meeting_date IS NULL OR am.meeting_date >= min(ev.window_starts))) AS latest_meeting_stage,
    count(*) FILTER (WHERE NOT ev.counts)::integer AS not_counted,
    count(*) FILTER (WHERE ev.counts AND ev.start_date > (( SELECT max(am2.meeting_date) AS max
           FROM absence_meetings am2
          WHERE am2.person_id = pe.id AND am2.company_id = pe.company_id AND NOT (am2.evidence_id IS NULL AND COALESCE(am2.response, ''::text) = 'declined'::text) AND am2.meeting_date >= ev.window_starts)))::integer AS absences_since_meeting,
    ( SELECT COALESCE(h.stage_after::integer, h.stage)
           FROM absence_meetings h
          WHERE h.person_id = pe.id AND h.company_id = pe.company_id AND h.evidence_id IS NOT NULL AND h.meeting_date >= min(ev.window_starts)
          ORDER BY h.meeting_date DESC, h.created_at DESC
         LIMIT 1) AS held_meeting_stage,
    ( SELECT COALESCE(h.warning_issued, ev2.answers ->> 'warning_issued')
           FROM absence_meetings h
             LEFT JOIN evidence ev2 ON ev2.id = h.evidence_id
          WHERE h.person_id = pe.id AND h.company_id = pe.company_id AND h.evidence_id IS NOT NULL AND h.meeting_date >= min(ev.window_starts)
          ORDER BY h.meeting_date DESC, h.created_at DESC
         LIMIT 1) AS held_meeting_warning,
    ( SELECT max(h.stage)
           FROM absence_meetings h
          WHERE h.person_id = pe.id AND h.company_id = pe.company_id AND h.evidence_id IS NOT NULL AND h.meeting_date >= min(ev.window_starts)) AS last_held_stage,
    count(*) FILTER (WHERE ev.counts AND ev.start_date <= (( SELECT max(h2.meeting_date) AS max
           FROM absence_meetings h2
          WHERE h2.person_id = pe.id AND h2.company_id = pe.company_id AND h2.evidence_id IS NOT NULL AND h2.meeting_date >= ev.window_starts)))::integer AS counted_at_meeting,
    count(*) FILTER (WHERE NOT ev.counts AND ev.start_date <= (( SELECT max(h3.meeting_date) AS max
           FROM absence_meetings h3
          WHERE h3.person_id = pe.id AND h3.company_id = pe.company_id AND h3.evidence_id IS NOT NULL AND h3.meeting_date >= ev.window_starts)))::integer AS discounted_at_meeting,
    ( SELECT h.stage_after IS NOT NULL
           FROM absence_meetings h
          WHERE h.person_id = pe.id AND h.company_id = pe.company_id AND h.evidence_id IS NOT NULL AND h.meeting_date >= min(ev.window_starts)
          ORDER BY h.meeting_date DESC, h.created_at DESC
         LIMIT 1) AS held_meeting_stage_after_set
   FROM people pe
     JOIN ev ON ev.person_id = pe.id
  WHERE pe.employment_status = 'active'::text AND pe.archived_at IS NULL
  GROUP BY pe.company_id, pe.id, pe.full_name, pe.branch_id;
