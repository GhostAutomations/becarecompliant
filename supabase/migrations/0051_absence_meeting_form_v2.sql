-- 0051_absence_meeting_form_v2
-- Phase 6 (Phil, 2026-07-12, Record meeting rework): the Absence Management
-- Meeting form gets version 2.
--   - Job Title REMOVED.
--   - Meeting Type is the first question (dialog narrows its options to the
--     person's booked stages and prefills from the booking).
--   - NEW "Meeting Minutes" section (full record of what was said and agreed).
-- Applied to the founder master template AND published as the next version of
-- every company's copy (evidence keeps pointing at the version it used, so
-- old records are untouched). Data migration, idempotent: the insert skips
-- companies whose latest published version already lacks job_title.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

do $$
declare
  v2 jsonb := '{
    "schemaVersion": 1,
    "sections": [
      {
        "id": "section-1",
        "title": "Meeting Details",
        "fields": [
          {"key": "name", "type": "short_text", "label": "Name"},
          {"key": "meeting_type", "type": "single_select", "label": "Meeting Type",
           "options": [
             {"label": "Stage 1", "value": "Stage 1"},
             {"label": "Stage 2", "value": "Stage 2"},
             {"label": "Stage 3", "value": "Stage 3"},
             {"label": "Stage 4", "value": "Stage 4"}
           ]},
          {"key": "manager_conducting", "type": "short_text", "label": "Manager Conducting Meeting"},
          {"key": "date_of_meeting", "type": "date", "label": "Date of Meeting"},
          {"key": "purpose_of_meeting", "type": "long_text", "label": "Purpose of Meeting",
           "help": "To discuss the employee''s attendance record, review absence history, understand any underlying reasons for absence, and agree any appropriate actions and support measures."}
        ]
      },
      {
        "id": "section-2",
        "title": "Attendance Record Review",
        "fields": [
          {"key": "current_absence_level", "type": "long_text", "label": "Current absence level"},
          {"key": "number_of_absences", "type": "long_text", "label": "Number of absences in review period"},
          {"key": "dates_of_absence_discussed", "type": "long_text", "label": "Dates of absence discussed"}
        ]
      },
      {
        "id": "section-3",
        "title": "Summary of Discussion",
        "fields": [
          {"key": "employees_explanation", "type": "long_text", "label": "Employee''s Explanation",
           "help": "Employee''s comments regarding reasons for absence"},
          {"key": "managers_comments", "type": "long_text", "label": "Manager''s Comments",
           "help": "Summary of attendance concerns and impact on service/team"},
          {"key": "support_adjustments_discussed", "type": "long_text", "label": "Support and Adjustments Discussed"}
        ]
      },
      {
        "id": "section-4",
        "title": "Meeting Minutes",
        "fields": [
          {"key": "meeting_minutes", "type": "long_text", "label": "Meeting Minutes",
           "help": "A full record of what was said and agreed in the meeting."}
        ]
      }
    ]
  }'::jsonb;
  f record;
begin
  -- Founder master template: future companies seed v2.
  update public.form_templates
  set schema = v2, version = version + 1, updated_at = now()
  where key = 'absence_management_meeting';

  -- Every company copy: publish v2 as the next version, unless their current
  -- published version already has no job_title field (already migrated).
  for f in
    select fo.id
    from public.forms fo
    where fo.key = 'absence_management_meeting'
      and (
        select fv.schema::text like '%job_title%'
        from public.form_versions fv
        where fv.form_id = fo.id and fv.status = 'published'
        order by fv.version desc limit 1
      )
  loop
    insert into public.form_versions (form_id, version, schema, status)
    select f.id, coalesce(max(fv.version), 0) + 1, v2, 'published'
    from public.form_versions fv
    where fv.form_id = f.id;
  end loop;
end $$;
