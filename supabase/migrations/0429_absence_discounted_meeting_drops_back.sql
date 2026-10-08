-- 0429 — a meeting whose absences were discounted below its stage drops the person back (Phil,
-- 2026-10-08: Asim Riaz and Jamie Meredith showed Stage 2 due after their Stage 1 meeting's
-- absences were disallowed).
--
-- Five columns added at the end of person_absence_summary (nothing else changes):
--   held_meeting_stage  the stage of the LATEST meeting actually held (stage_after when set)
--   last_held_stage     the highest stage actually held, for the "last meeting" box on the card
--   counted_at_meeting  absences that still count, dated on or before that latest held meeting
--   discounted_at_meeting  absences discounted, dated on or before that meeting
--   held_meeting_warning   the warning recorded at that meeting ("None" or blank: no warning given)
-- lib/absence/logic.ts uses them: when NO WARNING was given, absences up to the meeting were DISCOUNTED and what still
-- counts is below the held stage's trigger, the person is back at the stage those absences reach
-- (0 for none), and from there the count decides. Absences that have simply aged out of the window
-- do not do this: the 7 October rule (a new absence after a meeting makes the next stage due) stands.
-- A Stage 3 meeting discounted to No further action leaves them at Stage 2, so the next absence
-- brings Stage 3 again, not Stage 4.

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
    ( SELECT ev2.answers ->> 'warning_issued'
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
          WHERE h3.person_id = pe.id AND h3.company_id = pe.company_id AND h3.evidence_id IS NOT NULL AND h3.meeting_date >= ev.window_starts)))::integer AS discounted_at_meeting
   FROM people pe
     JOIN ev ON ev.person_id = pe.id
  WHERE pe.employment_status = 'active'::text AND pe.archived_at IS NULL
  GROUP BY pe.company_id, pe.id, pe.full_name, pe.branch_id;
