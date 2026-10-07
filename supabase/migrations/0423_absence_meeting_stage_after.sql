-- 0423 — the stage someone is on after an absence meeting (Phil, 2026-10-07: "follow the letter").
--
-- A Stage 2 meeting that ends with No further action, because the absences it discounted take the
-- record below the Stage 2 trigger, leaves the employee at their earlier stage (Stage 1). The
-- meeting's own stage stays what was held (it WAS a Stage 2 hearing, and the evidence says so);
-- stage_after says where it left them. Null = the meeting's own stage. 0 = no stage at all.
--
-- latest_meeting_stage in person_absence_summary now reads stage_after when it is set, so the
-- next meeting due follows it. Everything else in the view is unchanged.

alter table public.absence_meetings
  add column if not exists stage_after smallint
  check (stage_after is null or stage_after between 0 and 4);

comment on column public.absence_meetings.stage_after is
  'The stage the employee is on after this meeting when it differs from stage (No further action after discounts). Null = same as stage; 0 = no stage.';

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
          WHERE am2.person_id = pe.id AND am2.company_id = pe.company_id AND am2.evidence_id IS NOT NULL AND am2.meeting_date >= ev.window_starts)))::integer AS absences_since_meeting
   FROM people pe
     JOIN ev ON ev.person_id = pe.id
  WHERE pe.employment_status = 'active'::text AND pe.archived_at IS NULL
  GROUP BY pe.company_id, pe.id, pe.full_name, pe.branch_id;
