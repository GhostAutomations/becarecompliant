-- 0121_audit_check
-- New "Audit" compliance check on BOTH the People and Service User matrices,
-- fed by an Audit form copied from Thistle's monday "Staff or Service User Audit
-- Form". Monthly recurrence (anchor = completion). Service User/Staff name and
-- Region are auto-derived from the record, so they are not form fields.
-- Seeded for Acme Care Company (9d7d082b) only. Applied to becarecompliant
-- (ref bgrtcvyjuwopunpnudeu) ONLY.

do $mig$
declare
  v_company uuid := '9d7d082b-89d8-44f6-83b8-71b5155c7d51';
  v_desc text := $d$Please complete this form to provide details for your staff or service user audit. Ensure all required fields are filled out accurately. Relevant instructions and explanations are provided for each section. Thank you for your attention to detail.$d$;
  v_schema jsonb := $j$
  {
    "schemaVersion": 1,
    "sections": [
      {
        "id": "audit_details",
        "title": "Audit details",
        "fields": [
          { "key": "auditor_name", "type": "short_text", "label": "Auditor Full Name", "required": true, "help": "Please enter the first name of the person who audited the paperwork." },
          { "key": "date_of_audit", "type": "date", "label": "Date of Audit", "required": true, "help": "Please select the date the audit was conducted." },
          { "key": "audit_period_start", "type": "date", "label": "Start Date for Audit Period (Only for Staff ECM Audits)", "help": "Enter the week commencing date for the start of the audit period. Optional." },
          { "key": "audit_period_end", "type": "date", "label": "End Date for Audit Period (Only for Staff ECM Audits)", "help": "Enter the week commencing date for the end of the audit period. This is optional." }
        ]
      },
      {
        "id": "call_attendance",
        "title": "Call attendance",
        "fields": [
          { "key": "calls_attended", "type": "number", "label": "Calls Attended", "required": true, "help": "Please enter the total number of calls you attended within the audit period." },
          { "key": "avg_call_duration_pct", "type": "number", "label": "Average Call Duration (%)", "required": true, "help": "Enter the percentage of allocated time spent within calls. The minimum value should be 90%." },
          { "key": "avg_earliness_mins", "type": "number", "label": "Average Earliness of Call Attendance (minutes)", "help": "Please enter the average number of minutes you arrive early for appointments. This value should not exceed 15 minutes.", "validation": { "min": 0, "max": 15 } },
          { "key": "avg_lateness_mins", "type": "number", "label": "Average Lateness of Call Attendance (minutes)", "help": "Please enter the average number of minutes late to appointments. The value should not exceed 15 minutes.", "validation": { "min": 0, "max": 15 } },
          { "key": "cancelled_calls", "type": "number", "label": "Cancelled Calls", "required": true, "help": "Enter the number of cancelled calls or appointments within the audit period." },
          { "key": "calls_attended_pct", "type": "number", "label": "Calls Attended (%)", "required": true, "help": "Please provide the percentage rate of calls you have attended. Enter a number between 0 and 100.", "validation": { "min": 0, "max": 100 } }
        ]
      },
      {
        "id": "care_documentation",
        "title": "Care documentation",
        "fields": [
          { "key": "food_fluid_documented", "type": "single_select", "label": "Has the employee documented food and fluid intake?", "required": true, "help": "Please select Yes, No, or N/A.", "options": [ { "value": "yes", "label": "Yes" }, { "value": "no", "label": "No" }, { "value": "na", "label": "N/A" } ] },
          { "key": "food_fluid_reason", "type": "long_text", "label": "If no, please indicate reason below (food/fluid notes)", "help": "If notes describe what food was given, specify details and fluid types. Please note the date and staff member who failed to note. Optional.", "visibleWhen": { "field": "food_fluid_documented", "in": ["no"] } },
          { "key": "bowel_urine_documented", "type": "single_select", "label": "Has the employee documented bowel movements/urine output?", "required": true, "help": "Please select Yes, No, or NA.", "options": [ { "value": "yes", "label": "Yes" }, { "value": "no", "label": "No" }, { "value": "na", "label": "NA" } ] },
          { "key": "bowel_urine_detail", "type": "long_text", "label": "Please provide detail below (bowel movements/urine output)", "help": "Provide any relevant details regarding bowel movements or urine output. This information is optional.", "visibleWhen": { "field": "bowel_urine_documented", "in": ["no"] } },
          { "key": "tasks_acknowledged", "type": "single_select", "label": "Has the employee acknowledged all tasks required were completed with the required detail?", "required": true, "help": "Please select Yes, No, or NA.", "options": [ { "value": "yes", "label": "Yes" }, { "value": "no", "label": "No" }, { "value": "na", "label": "NA" } ] },
          { "key": "tasks_reason", "type": "long_text", "label": "If no, please indicate why the task was not completed or not in log notes", "help": "Please provide the reason if the task was not completed or not included in the log notes. This is optional.", "visibleWhen": { "field": "tasks_acknowledged", "in": ["no"] } },
          { "key": "mood_wellbeing_documented", "type": "single_select", "label": "Has the employee provided detail of the general mood and well-being in care notes?", "required": true, "help": "Please select Yes, No, or NA.", "options": [ { "value": "yes", "label": "Yes" }, { "value": "no", "label": "No" }, { "value": "na", "label": "NA" } ] },
          { "key": "mood_wellbeing_detail", "type": "long_text", "label": "If no, please indicate detail below (mood/well-being)", "help": "Provide additional detail if the general mood and well-being were not documented. Optional.", "visibleWhen": { "field": "mood_wellbeing_documented", "in": ["no"] } }
        ]
      },
      {
        "id": "follow_up",
        "title": "Follow up",
        "fields": [
          { "key": "other_follow_up", "type": "long_text", "label": "Please detail any other follow up actions or areas of improvement as a result of this audit", "help": "Optional." },
          { "key": "environment_flag", "type": "long_text", "label": "Has environment been mentioned, or do the notes identify concerns or queries which should have been flagged (e.g. Supervisor Alert)?", "help": "Please describe any environmental concerns or queries that have been flagged or should be flagged as a Supervisor Alert. This is optional." }
        ]
      },
      {
        "id": "sign_off",
        "title": "Sign off",
        "fields": [
          { "key": "signoff_date", "type": "date", "label": "Date", "required": true, "help": "Please select the date from the calendar." },
          { "key": "signature", "type": "signature", "label": "Signature", "required": true, "help": "Sign to confirm the information provided." },
          { "key": "approval_comments", "type": "long_text", "label": "Approval - Actions/Comments", "help": "Enter any actions or comments regarding approval. Optional." }
        ]
      }
    ]
  }
  $j$::jsonb;
  v_people_form uuid;
  v_su_form uuid;
  v_def uuid;
  v_sort int;
begin
  -- People Audit form.
  insert into public.forms (company_id, key, name, population, description, status, current_version)
  values (v_company, 'audit', 'Audit', 'people', v_desc, 'active', 1)
  returning id into v_people_form;
  insert into public.form_versions (form_id, version, schema, status)
  values (v_people_form, 1, v_schema, 'published');

  -- Service User Audit form.
  insert into public.forms (company_id, key, name, population, description, status, current_version)
  values (v_company, 'audit_su', 'Audit', 'service_users', v_desc, 'active', 1)
  returning id into v_su_form;
  insert into public.form_versions (form_id, version, schema, status)
  values (v_su_form, 1, v_schema, 'published');

  -- People Audit check + backfill active people (blank due until first completion).
  select coalesce(max(sort_order), 0) + 1 into v_sort
    from public.check_definitions where company_id = v_company and population = 'people';
  insert into public.check_definitions
    (company_id, population, key, name, form_id, recurring, frequency, "interval", anchor, active, sort_order)
  values (v_company, 'people', 'audit', 'Audit', v_people_form, true, 'month', 1, 'completion', true, v_sort)
  returning id into v_def;
  insert into public.check_instances
    (company_id, branch_id, definition_id, record_type, person_id, due_date)
  select pe.company_id, pe.branch_id, v_def, 'person', pe.id, null
  from public.people pe
  where pe.company_id = v_company and pe.employment_status = 'active' and pe.archived_at is null
  on conflict (definition_id, person_id) do nothing;

  -- Service User Audit check + backfill active service users.
  select coalesce(max(sort_order), 0) + 1 into v_sort
    from public.check_definitions where company_id = v_company and population = 'service_users';
  insert into public.check_definitions
    (company_id, population, key, name, form_id, recurring, frequency, "interval", anchor, active, sort_order)
  values (v_company, 'service_users', 'audit', 'Audit', v_su_form, true, 'month', 1, 'completion', true, v_sort)
  returning id into v_def;
  insert into public.check_instances
    (company_id, branch_id, definition_id, record_type, service_user_id, due_date)
  select su.company_id, su.branch_id, v_def, 'service_user', su.id, null
  from public.service_users su
  where su.company_id = v_company and su.service_status <> 'cancelled' and su.archived_at is null
  on conflict (definition_id, service_user_id) where service_user_id is not null do nothing;
end
$mig$;
