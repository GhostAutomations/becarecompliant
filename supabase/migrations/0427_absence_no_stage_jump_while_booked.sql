-- 0427 — no stage jump while a meeting is only booked (Phil, 2026-10-08, the four stage test).
--
-- Booking Stage 2 made the card say "A Stage 3 meeting is due: a new absence since the Stage 2
-- meeting" before Stage 2 was even held: latest_meeting_stage counts a booked meeting, but
-- absences_since_meeting counted from the last RECORDED one, so the absence that led to the
-- booking looked like a new one after it. absences_since_meeting now counts from the latest
-- meeting held or booked (a declined booking still does not count), the same meetings
-- latest_meeting_stage reads. Everything else in the view is unchanged.

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
          WHERE am2.person_id = pe.id AND am2.company_id = pe.company_id AND NOT (am2.evidence_id IS NULL AND COALESCE(am2.response, ''::text) = 'declined'::text) AND am2.meeting_date >= ev.window_starts)))::integer AS absences_since_meeting
   FROM people pe
     JOIN ev ON ev.person_id = pe.id
  WHERE pe.employment_status = 'active'::text AND pe.archived_at IS NULL
  GROUP BY pe.company_id, pe.id, pe.full_name, pe.branch_id;
