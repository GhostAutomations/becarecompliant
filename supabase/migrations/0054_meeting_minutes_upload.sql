-- 0054_meeting_minutes_upload
-- Phase 6 (Phil, 2026-07-12): Meeting Minutes becomes an UPLOAD, not a text
-- box. The Meeting Minutes section now has the "Meeting minutes not required"
-- checkbox and an "Upload meeting minutes" file field. Version 4 of the form,
-- master template + every company copy; old evidence keeps its version.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

do $$
declare
  v4 jsonb := '{
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
      }
    ]
  }'::jsonb;
  f record;
begin
  update public.form_templates
  set schema = v4, version = version + 1, updated_at = now()
  where key = 'absence_management_meeting';

  for f in
    select fo.id
    from public.forms fo
    where fo.key = 'absence_management_meeting'
      and not (
        select fv.schema::text like '%meeting_minutes_upload%'
        from public.form_versions fv
        where fv.form_id = fo.id and fv.status = 'published'
        order by fv.version desc limit 1
      )
  loop
    insert into public.form_versions (form_id, version, schema, status)
    select f.id, coalesce(max(fv.version), 0) + 1, v4, 'published'
    from public.form_versions fv
    where fv.form_id = f.id;
  end loop;
end $$;
