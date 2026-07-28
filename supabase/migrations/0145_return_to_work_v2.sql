-- 0145_return_to_work_v2
-- Phase 10 Additions (Phil, 2026-07-28). Version 2 of the Return to Work form, one
-- day after 0143 shipped version 1, because using it exposed four things:
--
-- 1. The questions were a single long_text the AI dumped a list into. Nothing was
--    answerable, searchable or reportable, and a manager could complete the form
--    without ever answering the question the list contained. The standard Return to
--    Work questions are now REAL fields of the right type (doctor seen, fit note,
--    medication affecting work or driving, outstanding appointments, anything at work
--    making it worse, what support would help), so the answers land in Evidence as
--    answers. The AI now drafts the summary plus a short "anything else worth asking"
--    note that ADDS to the standard questions instead of replacing them.
-- 2. trigger_reached is gone. The app already derives the stage and the Bradford
--    score from the absence record, so asking the manager to restate it invites a
--    contradiction between the form and the register, and the form would lose.
-- 3. "Interview conducted by" was free text, which is useless for reporting and
--    invites three spellings of the same person. It is now a single_select whose
--    options are the company's own staff, baked into the stored schema by
--    public.rebake_form_field_options (migration 0144) and re-baked by the app
--    whenever the staff list changes.
-- 4. Return to Work interviews are often held over the phone, where the employee
--    cannot sign. completed_over_phone now switches which signature is asked for:
--    the employee signs in person, otherwise the interviewer signs to confirm the
--    conversation took place and this record is accurate. Note the visibleWhen trap:
--    an untouched checkbox is undefined and isFieldVisible returns false for BOTH
--    branches, so the caller presets completed_over_phone to false (see
--    components/absence/absence-view.tsx).
--
-- Old evidence keeps the version it was completed against. Idempotent: the marker
-- string completed_over_phone means a re-run does nothing.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

do $$
declare
  v2 jsonb := $j${
    "schemaVersion": 1,
    "sections": [
      {
        "id": "section-1",
        "title": "Prepared for you",
        "description": "Drafted from the absence record. Read it, change anything that is not right, and delete what you did not use. Nothing here is sent anywhere until you complete the form.",
        "fields": [
          {"key": "absence_summary", "type": "long_text", "label": "Summary of the absence"},
          {"key": "extra_questions", "type": "long_text", "label": "Anything else worth asking",
           "help": "Points specific to this absence. The standard questions are already below, so this only adds to them."}
        ]
      },
      {
        "id": "section-2",
        "title": "The absence",
        "fields": [
          {"key": "absence_dates", "type": "short_text", "label": "Dates of absence"},
          {"key": "days_lost", "type": "short_text", "label": "Working days lost"},
          {"key": "reason_given", "type": "long_text", "label": "Reason given for the absence"}
        ]
      },
      {
        "id": "section-3",
        "title": "Health and fitness",
        "description": "Ask these every time. Record what you are told, not what you think it means.",
        "fields": [
          {"key": "doctor_seen", "type": "yes_no", "label": "Have they seen a doctor about this absence"},
          {"key": "fit_note_provided", "type": "yes_no", "label": "Has a fit note been provided"},
          {"key": "medication_affects_work", "type": "single_select",
           "label": "Is any medication likely to affect their work or their driving",
           "help": "Ask what they have been told about side effects. You do not need to know what the medication is for.",
           "options": [
             {"label": "No", "value": "No"},
             {"label": "Yes", "value": "Yes"},
             {"label": "They are not sure", "value": "They are not sure"}
           ]},
          {"key": "medication_detail", "type": "long_text",
           "label": "What they told you about the effect, and what you have agreed",
           "visibleWhen": {"field": "medication_affects_work", "in": ["Yes", "They are not sure"]}},
          {"key": "outstanding_appointments", "type": "long_text",
           "label": "Any outstanding medical appointments",
           "help": "Dates if they know them, and whether time off will be needed."}
        ]
      },
      {
        "id": "section-4",
        "title": "The conversation",
        "fields": [
          {"key": "fit_to_return", "type": "single_select", "label": "Fit to return to their normal duties",
           "required": true,
           "options": [
             {"label": "Yes", "value": "Yes"},
             {"label": "Yes, with adjustments", "value": "Yes, with adjustments"},
             {"label": "No", "value": "No"}
           ]},
          {"key": "ongoing_symptoms", "type": "long_text", "label": "Any ongoing symptoms or treatment"},
          {"key": "work_related", "type": "single_select", "label": "Was the absence work related",
           "options": [
             {"label": "No", "value": "No"},
             {"label": "Yes", "value": "Yes"},
             {"label": "Partly", "value": "Partly"}
           ]},
          {"key": "work_making_it_worse", "type": "long_text",
           "label": "Is anything at work making it worse",
           "help": "Workload, a rota pattern, equipment, travel, a relationship at work. Leave blank if nothing was raised."},
          {"key": "adjustments_needed", "type": "long_text", "label": "Adjustments needed on their return",
           "visibleWhen": {"field": "fit_to_return", "in": ["Yes, with adjustments", "No"]}}
        ]
      },
      {
        "id": "section-5",
        "title": "Support and next steps",
        "fields": [
          {"key": "support_would_help", "type": "long_text", "label": "What support would help",
           "help": "In their words, before you decide what you can offer."},
          {"key": "support_agreed", "type": "long_text", "label": "Support agreed"},
          {"key": "referral", "type": "single_select", "label": "Referral made",
           "options": [
             {"label": "None", "value": "None"},
             {"label": "Occupational health", "value": "Occupational health"},
             {"label": "HR", "value": "HR"},
             {"label": "Their GP", "value": "Their GP"}
           ]},
          {"key": "follow_up_date", "type": "date", "label": "Follow up date"}
        ]
      },
      {
        "id": "section-6",
        "title": "Confirmation",
        "fields": [
          {"key": "employee_comments", "type": "long_text", "label": "Employee comments"},
          {"key": "conducted_by", "type": "single_select", "label": "Interview conducted by",
           "help": "Your staff list. Ask an administrator to add anyone missing.",
           "options": []},
          {"key": "interview_date", "type": "date", "label": "Date of the interview", "required": true},
          {"key": "completed_over_phone", "type": "checkbox",
           "label": "This interview was completed over the phone",
           "help": "Tick this and the interviewer signs instead of the employee."},
          {"key": "employee_signature", "type": "signature", "label": "Employee signature",
           "visibleWhen": {"field": "completed_over_phone", "in": ["false"]}},
          {"key": "interviewer_signature", "type": "signature",
           "label": "Interviewer signature confirming a conversation held over the phone",
           "help": "The employee is not present to sign, so you sign to confirm the conversation took place and this record is accurate.",
           "visibleWhen": {"field": "completed_over_phone", "in": ["true"]}}
        ]
      }
    ]
  }$j$::jsonb;
  f record;
  c record;
begin
  update public.form_templates
  set schema = v2, version = version + 1, updated_at = now()
  where key = 'return_to_work';

  for f in
    select fo.id
    from public.forms fo
    where fo.key = 'return_to_work'
      and not coalesce((
        select fv.schema::text like '%completed_over_phone%'
        from public.form_versions fv
        where fv.form_id = fo.id and fv.status = 'published'
        order by fv.version desc limit 1
      ), false)
  loop
    insert into public.form_versions (form_id, version, schema, status)
    select f.id, coalesce(max(fv.version), 0) + 1, v2, 'published'
    from public.form_versions fv
    where fv.form_id = f.id;
  end loop;

  -- Bake the real staff list into the brand new conducted_by field (and refresh the
  -- branch options 0076 baked) for every company. Without this the dropdown has no
  -- options at all, and server side validation would reject any answer.
  for c in select id from public.companies loop
    perform public.rebake_form_field_options(c.id);
  end loop;
end $$;
