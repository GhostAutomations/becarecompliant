-- 0122_mentoring_check
-- New "Mentoring" check on the People record (shows in the Checks section, NOT a
-- register column), fed by a Mentoring Support Record form copied from Thistle's
-- monday "Mentoring Support Record". Ad-hoc: non-recurring, completed on demand,
-- no due date and no RAG countdown (schedule_mode = 'ad_hoc', recurring = false,
-- anchor = 'completion'). Carer's Name and Region are auto-derived from the Person
-- record + their branch, so they are not form fields. Seeded for Acme Care Company
-- (9d7d082b) only. Applied to becarecompliant (ref bgrtcvyjuwopunpnudeu) ONLY.

-- Allow the new 'ad_hoc' schedule mode (previously only 'interval'/'after_sup3').
alter table public.check_definitions drop constraint if exists check_definitions_schedule_mode_check;
alter table public.check_definitions add constraint check_definitions_schedule_mode_check
  check (schedule_mode = any (array['interval'::text, 'after_sup3'::text, 'ad_hoc'::text]));

do $mig$
declare
  v_company uuid := '9d7d082b-89d8-44f6-83b8-71b5155c7d51';
  v_desc text := $d$You must complete this Mentoring and support record with due diligence and honesty, and the record must be accurate. Where required, please provide sufficient detail in the comments box provided.$d$;
  v_schema jsonb := $j$
  {
    "schemaVersion": 1,
    "sections": [
      {
        "id": "visit_details",
        "title": "Visit details",
        "fields": [
          { "key": "supervisor_name", "type": "short_text", "label": "Supervisor's Name", "required": true, "help": "Enter the name of the supervisor or senior completing this record." },
          { "key": "visit_date", "type": "date", "label": "Date", "required": true, "help": "Select the date of the mentoring visit." },
          { "key": "mentoring_started", "type": "short_text", "label": "Please enter the time mentoring started", "required": true, "help": "Use the format HH:MM (24 hour, or 12 hour with AM/PM)." },
          { "key": "mentoring_finished", "type": "short_text", "label": "Please enter the time mentoring finished", "required": true, "help": "Use the format HH:MM (24 hour, or 12 hour with AM/PM)." }
        ]
      },
      {
        "id": "arrival",
        "title": "Section One: On arrival to the Service User's home",
        "fields": [
          { "key": "uniform_policy", "type": "single_select", "label": "Is the employee dressed as per Acme Care Company's Appearance and Wearing of Uniform Policy?", "required": true, "options": [ { "value": "yes", "label": "Yes" }, { "value": "no", "label": "No" } ] },
          { "key": "uniform_policy_detail", "type": "long_text", "label": "If the answer to the previous question is no, please input any details or explanation", "visibleWhen": { "field": "uniform_policy", "in": ["no"] } },
          { "key": "addressed_by_name", "type": "single_select", "label": "Upon entry, did they address the Service User by the name they wish to be addressed by on the Service User's Personal Plan?", "required": true, "options": [ { "value": "yes", "label": "Yes" }, { "value": "no", "label": "No" } ] },
          { "key": "addressed_by_name_detail", "type": "long_text", "label": "If the answer to the previous question is no, please input any details or explanation", "visibleWhen": { "field": "addressed_by_name", "in": ["no"] } },
          { "key": "valid_id_badge", "type": "single_select", "label": "Does the employee have a valid, in date ID badge?", "required": true, "options": [ { "value": "yes", "label": "Yes" }, { "value": "no", "label": "No" } ] },
          { "key": "valid_id_badge_detail", "type": "long_text", "label": "If the answer to the previous question is no, please input any details or explanation", "visibleWhen": { "field": "valid_id_badge", "in": ["no"] } }
        ]
      },
      {
        "id": "care_plan",
        "title": "Section Two: Care plan",
        "fields": [
          { "key": "checked_visit_notes", "type": "single_select", "label": "Did the employee check the previous visit notes upon arrival?", "required": true, "options": [ { "value": "yes", "label": "Yes" }, { "value": "no", "label": "No" } ] },
          { "key": "checked_visit_notes_detail", "type": "long_text", "label": "If the answer to the previous question is no, please input any details or explanation", "visibleWhen": { "field": "checked_visit_notes", "in": ["no"] } },
          { "key": "knows_care_needs", "type": "single_select", "label": "Does the employee know what care the Service User needs?", "required": true, "options": [ { "value": "yes", "label": "Yes" }, { "value": "no", "label": "No" } ] },
          { "key": "knows_care_needs_detail", "type": "long_text", "label": "If the answer to the previous question was no, please input any details or explanation", "visibleWhen": { "field": "knows_care_needs", "in": ["no"] } },
          { "key": "ppe_used_correctly", "type": "single_select", "label": "Did the employee use their PPE correctly?", "required": true, "options": [ { "value": "yes", "label": "Yes" }, { "value": "no", "label": "No" }, { "value": "na", "label": "N/A" } ] },
          { "key": "ppe_used_correctly_detail", "type": "long_text", "label": "If the answer to the previous question is no, please input any details or explanation", "visibleWhen": { "field": "ppe_used_correctly", "in": ["no"] } },
          { "key": "manual_handling_equipment", "type": "single_select", "label": "If the Service User has manual handling equipment, and it was used, did the employee use the equipment correctly? Examples: hoists, transfer aids, slide sheets, profiling beds etc.", "required": true, "options": [ { "value": "yes", "label": "Yes" }, { "value": "no", "label": "No" }, { "value": "na", "label": "N/A" } ] },
          { "key": "manual_handling_equipment_detail", "type": "long_text", "label": "If the answer to the previous question is no, please input any details or explanation", "visibleWhen": { "field": "manual_handling_equipment", "in": ["no"] } },
          { "key": "food_handled", "type": "single_select", "label": "Was any food handled correctly and hygienically?", "required": true, "options": [ { "value": "yes", "label": "Yes" }, { "value": "no", "label": "No" }, { "value": "na", "label": "N/A" } ] },
          { "key": "food_handled_detail", "type": "long_text", "label": "If the answer to the previous question was no, please input any details or explanation", "visibleWhen": { "field": "food_handled", "in": ["no"] } },
          { "key": "working_area_tidy", "type": "single_select", "label": "Did the employee keep the working area clean and tidy?", "required": true, "options": [ { "value": "yes", "label": "Yes" }, { "value": "no", "label": "No" } ] },
          { "key": "working_area_tidy_detail", "type": "long_text", "label": "If the answer to the previous question was no, please input any details or explanation", "visibleWhen": { "field": "working_area_tidy", "in": ["no"] } },
          { "key": "ppe_disposed", "type": "single_select", "label": "Did the employee dispose of PPE correctly?", "required": true, "options": [ { "value": "yes", "label": "Yes" }, { "value": "no", "label": "No" }, { "value": "na", "label": "N/A" } ] },
          { "key": "ppe_disposed_detail", "type": "long_text", "label": "If the answer to the previous question was no, please input any details or explanation", "visibleWhen": { "field": "ppe_disposed", "in": ["no"] } }
        ]
      },
      {
        "id": "medication",
        "title": "Section Four: Medication",
        "description": "All care staff would have had a medication competency assessment.",
        "fields": [
          { "key": "med_consent", "type": "single_select", "label": "Did the employee gain consent prior to administering medication?", "required": true, "options": [ { "value": "yes", "label": "Yes" }, { "value": "no", "label": "No" }, { "value": "na", "label": "N/A" } ] },
          { "key": "med_consent_detail", "type": "long_text", "label": "If the answer was no, please input any details or explanation", "visibleWhen": { "field": "med_consent", "in": ["no"] } },
          { "key": "med_six_rights", "type": "single_select", "label": "Did the employee follow the 6 Rights of Medication correctly? Right person, Right medication, Right route, Right dose, Right time, Service User's right to decline medication.", "required": true, "options": [ { "value": "yes", "label": "Yes" }, { "value": "no", "label": "No" }, { "value": "na", "label": "N/A" } ] },
          { "key": "med_six_rights_detail", "type": "long_text", "label": "If the answer to the previous question was no, please input any details or explanation", "visibleWhen": { "field": "med_six_rights", "in": ["no"] } },
          { "key": "mar_completed", "type": "single_select", "label": "Did the employee complete the MAR correctly?", "required": true, "options": [ { "value": "yes", "label": "Yes" }, { "value": "no", "label": "No" }, { "value": "na", "label": "N/A" } ] },
          { "key": "mar_completed_detail", "type": "long_text", "label": "If the answer to the previous question was no, please input any details or explanation", "visibleWhen": { "field": "mar_completed", "in": ["no"] } }
        ]
      },
      {
        "id": "attitude",
        "title": "Section Five: Attitude and behaviour",
        "fields": [
          { "key": "communicated_compassion", "type": "single_select", "label": "Did the employee communicate well with the Service User and evidence compassionate care?", "required": true, "options": [ { "value": "yes", "label": "Yes" }, { "value": "no", "label": "No" } ] },
          { "key": "communicated_compassion_detail", "type": "long_text", "label": "If the answer to the previous question was no, please input any details or explanation", "visibleWhen": { "field": "communicated_compassion", "in": ["no"] } },
          { "key": "respected_dignity", "type": "single_select", "label": "Did the employee respect the dignity of the Service User?", "required": true, "options": [ { "value": "yes", "label": "Yes" }, { "value": "no", "label": "No" } ] },
          { "key": "respected_dignity_detail", "type": "long_text", "label": "If the answer to the previous question was no, please input any details or explanation", "visibleWhen": { "field": "respected_dignity", "in": ["no"] } },
          { "key": "enabling_way", "type": "single_select", "label": "Did the employee work in an enabling way?", "required": true, "options": [ { "value": "yes", "label": "Yes" }, { "value": "no", "label": "No" } ] },
          { "key": "enabling_way_detail", "type": "long_text", "label": "If the answer to the previous question was no, please input any details or explanation", "visibleWhen": { "field": "enabling_way", "in": ["no"] } },
          { "key": "sent_observation", "type": "single_select", "label": "Did the employee send in an observation/handover note for this care visit?", "required": true, "options": [ { "value": "yes", "label": "Yes" }, { "value": "no", "label": "No" } ] },
          { "key": "sent_observation_detail", "type": "long_text", "label": "If an observation was sent in, please provide details", "visibleWhen": { "field": "sent_observation", "in": ["yes"] } }
        ]
      },
      {
        "id": "recording",
        "title": "Section Six: Recording",
        "description": "Seniors, please ensure it is recorded on the Daily Report Sheets that a spot check was completed at this visit.",
        "fields": [
          { "key": "accurate_record", "type": "single_select", "label": "Did the employee provide an accurate record of tasks that were undertaken?", "required": true, "options": [ { "value": "yes", "label": "Yes" }, { "value": "no", "label": "No" } ] },
          { "key": "accurate_record_detail", "type": "long_text", "label": "If the answer to the previous question was no, please input any details or explanation", "visibleWhen": { "field": "accurate_record", "in": ["no"] } }
        ]
      },
      {
        "id": "mentor_feedback",
        "title": "Section Seven: Mentor feedback",
        "description": "If the Service User is willing to provide feedback, please continue with the following questions.",
        "fields": [
          { "key": "su_willing_feedback", "type": "single_select", "label": "Was the Service User willing to provide feedback?", "required": true, "options": [ { "value": "yes", "label": "Yes" }, { "value": "no", "label": "No" } ] },
          { "key": "needed_prompting", "type": "single_select", "label": "Did you need to prompt the Individual at any time during the run, as a reminder to do specific tasks?", "options": [ { "value": "yes", "label": "Yes" }, { "value": "no", "label": "No" } ], "visibleWhen": { "field": "su_willing_feedback", "in": ["yes"] } },
          { "key": "needed_prompting_comments", "type": "long_text", "label": "Comments", "visibleWhen": { "field": "su_willing_feedback", "in": ["yes"] } },
          { "key": "carer_openly_communicated", "type": "single_select", "label": "Did the carer openly communicate with the Service User?", "options": [ { "value": "yes", "label": "Yes" }, { "value": "no", "label": "No" } ], "visibleWhen": { "field": "su_willing_feedback", "in": ["yes"] } },
          { "key": "carer_openly_communicated_comments", "type": "long_text", "label": "Comments", "visibleWhen": { "field": "su_willing_feedback", "in": ["yes"] } },
          { "key": "areas_improvement_needed", "type": "single_select", "label": "Are areas of improvement or further support needed?", "required": true, "options": [ { "value": "yes", "label": "Yes" }, { "value": "no", "label": "No" } ] },
          { "key": "areas_improvement_comment", "type": "long_text", "label": "Comment", "visibleWhen": { "field": "areas_improvement_needed", "in": ["yes"] } }
        ]
      },
      {
        "id": "follow_up",
        "title": "Section Eight: Follow up actions",
        "description": "Please detail any follow up actions required in the box below.",
        "fields": [
          { "key": "follow_up_actions", "type": "long_text", "label": "Follow up actions required", "required": true }
        ]
      },
      {
        "id": "declaration",
        "title": "Declaration",
        "description": "I confirm that this spot check record is an accurate and true record of the employee's care visit.",
        "fields": [
          { "key": "declaration_date", "type": "date", "label": "Date", "required": true, "help": "Select the date from the calendar." }
        ]
      }
    ]
  }
  $j$::jsonb;
  v_form uuid;
  v_def uuid;
  v_sort int;
begin
  -- Mentoring form (People population).
  insert into public.forms (company_id, key, name, population, description, status, current_version)
  values (v_company, 'mentoring', 'Mentoring', 'people', v_desc, 'active', 1)
  returning id into v_form;
  insert into public.form_versions (form_id, version, schema, status)
  values (v_form, 1, v_schema, 'published');

  -- Ad-hoc Mentoring check + backfill active people (blank due, completed on demand).
  select coalesce(max(sort_order), 0) + 1 into v_sort
    from public.check_definitions where company_id = v_company and population = 'people';
  insert into public.check_definitions
    (company_id, population, key, name, description, form_id, recurring, frequency, "interval", anchor, active, sort_order, schedule_mode)
  values (v_company, 'people', 'mentoring', 'Mentoring', 'Ad-hoc mentoring and support record, completed on demand.', v_form, false, null, null, 'completion', true, v_sort, 'ad_hoc')
  returning id into v_def;
  insert into public.check_instances
    (company_id, branch_id, definition_id, record_type, person_id, due_date)
  select pe.company_id, pe.branch_id, v_def, 'person', pe.id, null
  from public.people pe
  where pe.company_id = v_company and pe.employment_status = 'active' and pe.archived_at is null
  on conflict (definition_id, person_id) do nothing;
end
$mig$;
