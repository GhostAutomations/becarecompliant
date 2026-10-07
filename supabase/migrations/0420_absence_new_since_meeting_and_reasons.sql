-- 0420: Thistle's absence notes (Phil, 2026-10-07).
--
-- 1. A NEW ABSENCE AFTER A STAGE MEETING. person_absence_summary gains absences_since_meeting:
--    counted absences in the window that began after the last RECORDED meeting. With it,
--    lib/absence/next-stage.ts makes the next stage due ("Next stage meeting due", popup), so
--    somebody off again after their Stage 1 meeting moves to Action required even when old
--    absences have aged out or were discounted. The new column is added at the end; nothing
--    else in the view changes.
-- 2. REASONS FOR ABSENCE. The Absence Back Office form asks for one or more reasons from a list,
--    each with its own details box; for sickness and diarrhoea whether it is still going on and,
--    if not, the date and time it last happened; then any further information. Thistle and Bevan
--    (the test company). Changed in place at version 1, as default forms stay at v1 while they are
--    being built: every saved absence keeps its own copy of the form (schema_snapshot, all 93
--    checked 2026-10-07), so nothing already recorded reads differently.

create or replace view public.person_absence_summary with (security_invoker = on) as
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
    ( SELECT max(am.stage) AS max
           FROM absence_meetings am
          WHERE am.person_id = pe.id AND am.company_id = pe.company_id AND NOT (am.evidence_id IS NULL AND COALESCE(am.response, ''::text) = 'declined'::text) AND (am.meeting_date IS NULL OR am.meeting_date >= min(ev.window_starts))) AS latest_meeting_stage,
    count(*) FILTER (WHERE NOT ev.counts)::integer AS not_counted,
    count(*) FILTER (WHERE ev.counts AND ev.start_date > ( SELECT max(am2.meeting_date)
           FROM absence_meetings am2
          WHERE am2.person_id = pe.id AND am2.company_id = pe.company_id AND am2.evidence_id IS NOT NULL AND am2.meeting_date >= ev.window_starts))::integer AS absences_since_meeting
   FROM people pe
     JOIN ev ON ev.person_id = pe.id
  WHERE pe.employment_status = 'active'::text AND pe.archived_at IS NULL
  GROUP BY pe.company_id, pe.id, pe.full_name, pe.branch_id;

update public.form_versions fv
   set schema = '{"sections": [{"id": "section-1", "title": "Absence Details", "fields": [{"key": "name", "type": "short_text", "label": "Name"}, {"key": "email", "type": "email", "label": "Email"}, {"key": "first_date_of_absence", "type": "date", "label": "First date of absence", "required": true}, {"key": "last_date_of_absence", "type": "date", "label": "Last date of absence"}, {"key": "reasons", "type": "multi_select", "label": "Reason for absence", "description": "Tick every reason that applies.", "required": true, "options": [{"value": "Sickness and diarrhoea", "label": "Sickness and diarrhoea"}, {"value": "Cold or flu", "label": "Cold or flu"}, {"value": "Headache or migraine", "label": "Headache or migraine"}, {"value": "Stomach upset", "label": "Stomach upset"}, {"value": "Injury", "label": "Injury"}, {"value": "Back or muscle pain", "label": "Back or muscle pain"}, {"value": "Stress or mental health", "label": "Stress or mental health"}, {"value": "Dental", "label": "Dental"}, {"value": "Medical appointment", "label": "Medical appointment"}, {"value": "Childcare or dependant", "label": "Childcare or dependant"}, {"value": "Bereavement", "label": "Bereavement"}, {"value": "Other", "label": "Other"}]}, {"key": "reason_detail_sickness_diarrhoea", "type": "long_text", "label": "Sickness and diarrhoea: details", "visibleWhen": {"field": "reasons", "in": ["Sickness and diarrhoea"]}}, {"key": "dv_still_symptoms", "type": "yes_no", "label": "Are you still having sickness or diarrhoea?", "required": true, "visibleWhen": {"field": "reasons", "in": ["Sickness and diarrhoea"]}}, {"key": "dv_last_episode_date", "type": "date", "label": "When were you last sick, or last had diarrhoea? Date", "required": true, "visibleWhen": {"field": "dv_still_symptoms", "in": ["No"]}}, {"key": "dv_last_episode_time", "type": "time", "label": "Time", "required": true, "visibleWhen": {"field": "dv_still_symptoms", "in": ["No"]}}, {"key": "reason_detail_cold_flu", "type": "long_text", "label": "Cold or flu: details", "visibleWhen": {"field": "reasons", "in": ["Cold or flu"]}}, {"key": "reason_detail_headache_migraine", "type": "long_text", "label": "Headache or migraine: details", "visibleWhen": {"field": "reasons", "in": ["Headache or migraine"]}}, {"key": "reason_detail_stomach_upset", "type": "long_text", "label": "Stomach upset: details", "visibleWhen": {"field": "reasons", "in": ["Stomach upset"]}}, {"key": "reason_detail_injury", "type": "long_text", "label": "Injury: details", "visibleWhen": {"field": "reasons", "in": ["Injury"]}}, {"key": "reason_detail_back_muscle", "type": "long_text", "label": "Back or muscle pain: details", "visibleWhen": {"field": "reasons", "in": ["Back or muscle pain"]}}, {"key": "reason_detail_stress_mental_health", "type": "long_text", "label": "Stress or mental health: details", "visibleWhen": {"field": "reasons", "in": ["Stress or mental health"]}}, {"key": "reason_detail_dental", "type": "long_text", "label": "Dental: details", "visibleWhen": {"field": "reasons", "in": ["Dental"]}}, {"key": "reason_detail_medical_appointment", "type": "long_text", "label": "Medical appointment: details", "visibleWhen": {"field": "reasons", "in": ["Medical appointment"]}}, {"key": "reason_detail_childcare_dependant", "type": "long_text", "label": "Childcare or dependant: details", "visibleWhen": {"field": "reasons", "in": ["Childcare or dependant"]}}, {"key": "reason_detail_bereavement", "type": "long_text", "label": "Bereavement: details", "visibleWhen": {"field": "reasons", "in": ["Bereavement"]}}, {"key": "reason_detail_other", "type": "long_text", "label": "Other: details", "visibleWhen": {"field": "reasons", "in": ["Other"]}}, {"key": "further_information", "type": "long_text", "label": "Any further information"}]}], "schemaVersion": 1}'::jsonb
  from public.forms f
 where fv.form_id = f.id
   and f.key = 'absence_back_office'
   and f.company_id in ('eae26e83-1e41-472b-abc0-e2b39b907e49', '84172279-54e4-4d5b-94b4-c92dc05c6baa')
   and fv.version = 1;
