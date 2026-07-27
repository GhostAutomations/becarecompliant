-- 0141_absence_meeting_outcome
-- Phase 10 Additions (Phil, popup 2026-07-27): the Absence Management Meeting form
-- recorded the details, the attendance review, the discussion and the minutes, but NO
-- OUTCOME. A capability meeting whose outcome is not written down is the single worst
-- gap in an absence file: at appeal or tribunal the question is always what was decided,
-- what the employee was told to improve, by when, and whether they were told they could
-- appeal. Version 5 adds an Outcome section covering exactly that.
--
-- Phil chose the outcome to live ON the existing form (one form, one Evidence record)
-- rather than as a separate record, and NOT to drive the absence stage automatically:
-- the stage is already auto derived and overriding it from here would fight that logic.
--
-- Master template updated + published as the next version of every company copy whose
-- current published version still lacks the outcome. Old evidence keeps its version.
-- Idempotent. Applied to the becarecompliant Supabase project ONLY (bgrtcvyjuwopunpnudeu).

do $$
declare
  v5 jsonb := '{
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
          {"key": "purpose_of_meeting", "type": "long_text", "label": "Purpose of Meeting"}
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
          {"key": "minutes_not_required", "type": "checkbox", "label": "Meeting minutes not required"},
          {"key": "meeting_minutes_upload", "type": "file_upload", "label": "Upload meeting minutes"}
        ]
      },
      {
        "id": "section-5",
        "title": "Outcome",
        "fields": [
          {"key": "meeting_outcome", "type": "single_select", "label": "Outcome of the meeting",
           "required": true,
           "help": "What was decided at the end of the meeting.",
           "options": [
             {"label": "No further action", "value": "No further action"},
             {"label": "Informal support and monitoring", "value": "Informal support and monitoring"},
             {"label": "Formal warning issued", "value": "Formal warning issued"},
             {"label": "Moved to the next stage", "value": "Moved to the next stage"},
             {"label": "Referred to occupational health", "value": "Referred to occupational health"},
             {"label": "Absence procedure concluded", "value": "Absence procedure concluded"},
             {"label": "Other", "value": "Other"}
           ]},
          {"key": "warning_issued", "type": "single_select", "label": "Warning issued",
           "help": "Leave as None unless a formal warning was given.",
           "options": [
             {"label": "None", "value": "None"},
             {"label": "First written warning", "value": "First written warning"},
             {"label": "Final written warning", "value": "Final written warning"}
           ]},
          {"key": "warning_live_until", "type": "date", "label": "Warning remains live until",
           "help": "The date the warning expires from their record.",
           "visibleWhen": {"field": "warning_issued", "in": ["First written warning", "Final written warning"]}},
          {"key": "improvement_targets", "type": "long_text", "label": "Improvement targets set",
           "help": "What the employee has been asked to achieve, in measurable terms."},
          {"key": "review_date", "type": "date", "label": "Review date",
           "help": "When attendance will be looked at again."},
          {"key": "outcome_explained", "type": "checkbox",
           "label": "Outcome and right of appeal explained to the employee"}
        ]
      }
    ]
  }'::jsonb;
  f record;
begin
  update public.form_templates
  set schema = v5, version = version + 1, updated_at = now()
  where key = 'absence_management_meeting';

  for f in
    select fo.id
    from public.forms fo
    where fo.key = 'absence_management_meeting'
      and not (
        select fv.schema::text like '%meeting_outcome%'
        from public.form_versions fv
        where fv.form_id = fo.id and fv.status = 'published'
        order by fv.version desc limit 1
      )
  loop
    insert into public.form_versions (form_id, version, schema, status)
    select f.id, coalesce(max(fv.version), 0) + 1, v5, 'published'
    from public.form_versions fv
    where fv.form_id = f.id;
  end loop;
end $$;
