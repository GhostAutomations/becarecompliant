-- 0143_return_to_work_form
-- The Return to Work interview form (People population), added to the master template
-- library and seeded into every existing company. Section 1 is "Prepared for you": the
-- summary and the suggested questions the AI drafts from the absence record, which the
-- manager edits before completing, then the interview itself ending with the employee's
-- signature. See 0142 for the absence_events columns and the trigger that makes one due.
-- Idempotent: the template upserts by key, each company form is created only if absent.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

do $$
declare
  v_schema jsonb := $j${
    "schemaVersion": 1,
    "sections": [
      {
        "id": "section-1",
        "title": "Prepared for you",
        "description": "Drafted from the absence record. Read it, change anything that is not right, and delete what you did not use. Nothing here is sent anywhere until you complete the form.",
        "fields": [
          {"key": "absence_summary", "type": "long_text", "label": "Summary of the absence"},
          {"key": "suggested_questions", "type": "long_text", "label": "Questions to ask",
           "help": "Suggestions only. The conversation matters more than the list."}
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
          {"key": "adjustments_needed", "type": "long_text", "label": "Adjustments needed on their return",
           "visibleWhen": {"field": "fit_to_return", "in": ["Yes, with adjustments", "No"]}}
        ]
      },
      {
        "id": "section-4",
        "title": "Support and next steps",
        "fields": [
          {"key": "support_agreed", "type": "long_text", "label": "Support agreed"},
          {"key": "referral", "type": "single_select", "label": "Referral made",
           "options": [
             {"label": "None", "value": "None"},
             {"label": "Occupational health", "value": "Occupational health"},
             {"label": "HR", "value": "HR"},
             {"label": "Their GP", "value": "Their GP"}
           ]},
          {"key": "trigger_reached", "type": "checkbox",
           "label": "This absence takes them to a trigger point under the absence procedure"},
          {"key": "follow_up_date", "type": "date", "label": "Follow up date"}
        ]
      },
      {
        "id": "section-5",
        "title": "Confirmation",
        "fields": [
          {"key": "employee_comments", "type": "long_text", "label": "Employee comments"},
          {"key": "conducted_by", "type": "short_text", "label": "Interview conducted by"},
          {"key": "interview_date", "type": "date", "label": "Date of the interview", "required": true},
          {"key": "employee_signature", "type": "signature", "label": "Employee signature"}
        ]
      }
    ]
  }$j$::jsonb;
  v_desc text := 'Return to Work interview, completed after every absence at every stage.';
  c record;
  v_form uuid;
begin
  insert into public.form_templates (key, name, population, description, schema, status, version)
  values ('return_to_work', 'Return to Work', 'people', v_desc, v_schema, 'active', 1)
  on conflict (key) do update
    set schema = excluded.schema, version = public.form_templates.version + 1, updated_at = now();

  for c in select id from public.companies loop
    if not exists (
      select 1 from public.forms where company_id = c.id and key = 'return_to_work'
    ) then
      insert into public.forms (company_id, key, name, population, description, status, source_template_key, current_version)
      values (c.id, 'return_to_work', 'Return to Work', 'people', v_desc, 'active', 'return_to_work', 1)
      returning id into v_form;
      insert into public.form_versions (form_id, version, schema, status)
      values (v_form, 1, v_schema, 'published');
    end if;
  end loop;
end
$$;
