-- 0251_mentoring_is_a_record_not_a_deadline
-- Mentoring existed once, for a company that no longer exists: 0122 built it for Acme,
-- deleted in August, and left the template archived. Neither Thistle nor Bevan has it and
-- no company launching today would get it.
--
-- IT DOES NOT TOUCH THE MATRIX, AND MUST NOT (Phil, 2026-09-08, of this class of form:
-- "this doesnt update the matrix and shouldnt"). Mentoring happens when somebody needs
-- mentoring -- a new starter, a carer coming back from a long absence, something a spot
-- check turned up. There is no interval it is late against, so schedule_mode 'ad_hoc':
-- a Complete button on the record, real Evidence against the person, no due date, no RAG
-- and no column on the compliance matrix. A form that cannot be overdue must never be
-- allowed to make a company look non-compliant.
--
-- THE IMPORT HAD ALL FIFTY SEVEN FIELDS IN ONE BLOCK CALLED "DETAILS", and paired every
-- question with a permanently visible box labelled "If the answer to the previous question
-- is no please input any details or explanation" -- eighteen of them, seventeen of which are
-- silent on any given visit. Each now appears only on the answer that needs it and is
-- required when it appears, so the reason is written down at the one moment the mentor has
-- it: while they are still standing there.
--
-- A COMPANY NAME WAS BAKED INTO A QUESTION. The uniform question read "as per Acme Care
-- Company's Appearance and Wearing of Uniform Policy" -- in the MASTER TEMPLATE, so every
-- company that ever launched would have been asked about the uniform policy of a test
-- company that has been deleted. It now says "the company's".
--
-- THE SERVICE USER'S FEEDBACK IS ASKED ONLY WHEN THEY WILL GIVE IT. "Was the Service User
-- willing to provide feedback?" was followed by two questions put TO the Service User --
-- does your carer respect your privacy, does your carer communicate with you -- asked
-- whatever the answer was, so a No was followed by two questions nobody could ask and two
-- boxes somebody had to fill in anyway.
--
-- WHICH VISIT IT WAS is now recorded: the Service User is picked from the register with the
-- same type-ahead the Spot Check uses. Mentoring happens in somebody's home, and the record
-- of it did not say whose. The two times were free text boxes and are now time fields.
--
-- DROPPED as givens: Carers Name, Supervisors Name, Branch, and the second bare "Date" at
-- the foot -- the record knows the first three and the Evidence stamps who submitted it and
-- when.
--
-- Applied to the becarecompliant project ONLY (ref bgrtcvyjuwopunpnudeu).

do $mig$
declare
  v_schema jsonb := '{"schemaVersion": 1, "sections": [{"id": "visit", "title": "The visit", "fields": [{"key": "mentoring_date", "type": "date", "label": "Date of the mentoring visit", "required": true}, {"key": "service_user", "type": "record_lookup", "lookup": "service_user", "label": "Service User", "required": true, "help": "Whose visit was being mentored."}, {"key": "started_at", "type": "time", "label": "Time mentoring started", "required": true}, {"key": "finished_at", "type": "time", "label": "Time mentoring finished", "required": true}]}, {"id": "arrival", "title": "Arrival", "description": "Where the answer is No, say what happened - that note is the mentoring.", "fields": [{"key": "uniform", "type": "single_select", "label": "Is the employee dressed in line with the company''s Appearance and Wearing of Uniform Policy?", "options": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}], "required": true}, {"key": "uniform_detail", "type": "long_text", "label": "What happened, and what was said about it", "validation": {"maxLength": 2000}, "visibleWhen": {"field": "uniform", "in": ["no"]}, "required": true}, {"key": "preferred_name", "type": "single_select", "label": "On entry, did they address the Service User by the name they wish to be addressed by?", "options": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}], "required": true}, {"key": "preferred_name_detail", "type": "long_text", "label": "What happened, and what was said about it", "validation": {"maxLength": 2000}, "visibleWhen": {"field": "preferred_name", "in": ["no"]}, "required": true}, {"key": "id_badge", "type": "single_select", "label": "Does the employee have a valid, in date ID badge?", "options": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}], "required": true}, {"key": "id_badge_detail", "type": "long_text", "label": "What happened, and what was said about it", "validation": {"maxLength": 2000}, "visibleWhen": {"field": "id_badge", "in": ["no"]}, "required": true}, {"key": "logged_in", "type": "single_select", "label": "Did the employee log into the visit correctly?", "options": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}], "required": true}, {"key": "logged_in_detail", "type": "long_text", "label": "What happened, and what was said about it", "validation": {"maxLength": 2000}, "visibleWhen": {"field": "logged_in", "in": ["no"]}, "required": true}, {"key": "previous_notes", "type": "single_select", "label": "Did the employee check the previous visit notes on arrival?", "options": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}], "required": true}, {"key": "previous_notes_detail", "type": "long_text", "label": "What happened, and what was said about it", "validation": {"maxLength": 2000}, "visibleWhen": {"field": "previous_notes", "in": ["no"]}, "required": true}, {"key": "consent_care", "type": "single_select", "label": "Did the employee seek the Service User''s consent before delivering any aspect of care?", "options": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}], "required": true}, {"key": "consent_care_detail", "type": "long_text", "label": "What happened, and what was said about it", "validation": {"maxLength": 2000}, "visibleWhen": {"field": "consent_care", "in": ["no"]}, "required": true}, {"key": "knows_care", "type": "single_select", "label": "Does the employee know what care the Service User needs?", "options": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}], "required": true}, {"key": "knows_care_detail", "type": "long_text", "label": "What happened, and what was said about it", "validation": {"maxLength": 2000}, "visibleWhen": {"field": "knows_care", "in": ["no"]}, "required": true}]}, {"id": "safe_practice", "title": "Safe practice", "fields": [{"key": "ppe_used", "type": "single_select", "label": "Did the employee use their PPE correctly?", "options": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}], "required": true}, {"key": "ppe_used_detail", "type": "long_text", "label": "What happened, and what was said about it", "validation": {"maxLength": 2000}, "visibleWhen": {"field": "ppe_used", "in": ["no"]}, "required": true}, {"key": "manual_handling", "type": "single_select", "label": "Where the Service User has manual handling equipment and it was used, did the employee use it correctly?", "options": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}, {"value": "na", "label": "N/A"}], "required": true}, {"key": "manual_handling_detail", "type": "long_text", "label": "What happened, and what was said about it", "validation": {"maxLength": 2000}, "visibleWhen": {"field": "manual_handling", "in": ["no"]}, "required": true}, {"key": "food_hygiene", "type": "single_select", "label": "Was any food handled correctly and hygienically?", "options": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}, {"value": "na", "label": "N/A"}], "required": true}, {"key": "food_hygiene_detail", "type": "long_text", "label": "What happened, and what was said about it", "validation": {"maxLength": 2000}, "visibleWhen": {"field": "food_hygiene", "in": ["no"]}, "required": true}, {"key": "working_area", "type": "single_select", "label": "Did the employee keep the working area clean and tidy?", "options": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}], "required": true}, {"key": "working_area_detail", "type": "long_text", "label": "What happened, and what was said about it", "validation": {"maxLength": 2000}, "visibleWhen": {"field": "working_area", "in": ["no"]}, "required": true}, {"key": "ppe_disposal", "type": "single_select", "label": "Did the employee dispose of PPE correctly?", "options": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}], "required": true}, {"key": "ppe_disposal_detail", "type": "long_text", "label": "What happened, and what was said about it", "validation": {"maxLength": 2000}, "visibleWhen": {"field": "ppe_disposal", "in": ["no"]}, "required": true}]}, {"id": "medication", "title": "Medication", "fields": [{"key": "med_consent", "type": "single_select", "label": "Did the employee gain consent prior to administering medication?", "options": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}, {"value": "na", "label": "N/A"}], "required": true}, {"key": "med_consent_detail", "type": "long_text", "label": "What happened, and what was said about it", "validation": {"maxLength": 2000}, "visibleWhen": {"field": "med_consent", "in": ["no"]}, "required": true}, {"key": "six_rights", "type": "single_select", "label": "Did the employee follow the 6 Rights of Medication correctly?", "options": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}, {"value": "na", "label": "N/A"}], "required": true, "help": "Right person, right medication, right dose, right route, right time, right documentation."}, {"key": "six_rights_detail", "type": "long_text", "label": "What happened, and what was said about it", "validation": {"maxLength": 2000}, "visibleWhen": {"field": "six_rights", "in": ["no"]}, "required": true}, {"key": "mar_completed", "type": "single_select", "label": "Did the employee complete the MAR correctly?", "options": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}, {"value": "na", "label": "N/A"}], "required": true}, {"key": "mar_completed_detail", "type": "long_text", "label": "What happened, and what was said about it", "validation": {"maxLength": 2000}, "visibleWhen": {"field": "mar_completed", "in": ["no"]}, "required": true}]}, {"id": "care", "title": "Care and communication", "fields": [{"key": "communication", "type": "single_select", "label": "Did the employee communicate well with the Service User and evidence compassionate care?", "options": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}], "required": true}, {"key": "communication_detail", "type": "long_text", "label": "What happened, and what was said about it", "validation": {"maxLength": 2000}, "visibleWhen": {"field": "communication", "in": ["no"]}, "required": true}, {"key": "dignity", "type": "single_select", "label": "Did the employee respect the dignity of the Service User?", "options": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}], "required": true}, {"key": "dignity_detail", "type": "long_text", "label": "What happened, and what was said about it", "validation": {"maxLength": 2000}, "visibleWhen": {"field": "dignity", "in": ["no"]}, "required": true}, {"key": "enabling", "type": "single_select", "label": "Did the employee work in an enabling way?", "options": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}], "required": true}, {"key": "enabling_detail", "type": "long_text", "label": "What happened, and what was said about it", "validation": {"maxLength": 2000}, "visibleWhen": {"field": "enabling", "in": ["no"]}, "required": true}, {"key": "task_record", "type": "single_select", "label": "Did the employee provide an accurate record of the tasks undertaken?", "options": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}], "required": true}, {"key": "task_record_detail", "type": "long_text", "label": "What happened, and what was said about it", "validation": {"maxLength": 2000}, "visibleWhen": {"field": "task_record", "in": ["no"]}, "required": true}, {"key": "handover_note", "type": "single_select", "label": "Did the employee send in an observation or handover note for this visit?", "options": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}, {"value": "na", "label": "N/A"}], "required": true}, {"key": "handover_note_detail", "type": "long_text", "label": "What the observation or handover note said", "validation": {"maxLength": 2000}, "visibleWhen": {"field": "handover_note", "in": ["yes"]}}, {"key": "prompting", "type": "single_select", "label": "Did you need to prompt the employee at any point, as a reminder to do a specific task?", "options": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}], "required": true}, {"key": "prompting_detail", "type": "long_text", "label": "What you prompted, and why", "validation": {"maxLength": 2000}, "visibleWhen": {"field": "prompting", "in": ["yes"]}, "required": true}]}, {"id": "feedback", "title": "The Service User''s feedback", "description": "Asked of the Service User, in their own words where possible.", "fields": [{"key": "feedback_willing", "type": "single_select", "label": "Was the Service User willing to give feedback?", "options": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}], "required": true}, {"key": "su_dignity", "type": "single_select", "label": "Does your carer respect your privacy and dignity at all times?", "options": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}], "required": true, "help": "Asked of the Service User.", "visibleWhen": {"field": "feedback_willing", "in": ["yes"]}}, {"key": "su_dignity_comments", "type": "long_text", "label": "What the Service User said about privacy and dignity", "validation": {"maxLength": 2000}, "visibleWhen": {"field": "feedback_willing", "in": ["yes"]}}, {"key": "su_communication", "type": "single_select", "label": "Does your carer communicate openly with you?", "options": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}], "required": true, "help": "Asked of the Service User.", "visibleWhen": {"field": "feedback_willing", "in": ["yes"]}}, {"key": "su_communication_comments", "type": "long_text", "label": "What the Service User said about communication", "validation": {"maxLength": 2000}, "visibleWhen": {"field": "feedback_willing", "in": ["yes"]}}]}, {"id": "outcome", "title": "Outcome", "fields": [{"key": "improvement_needed", "type": "single_select", "label": "Are areas of improvement or further support needed?", "options": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}], "required": true}, {"key": "improvement_detail", "type": "long_text", "label": "What support is needed, and what was agreed with the employee", "validation": {"maxLength": 2000}, "visibleWhen": {"field": "improvement_needed", "in": ["yes"]}, "required": true}, {"key": "follow_up_actions", "type": "long_text", "label": "Follow up actions required", "validation": {"maxLength": 2000}, "help": "Optional."}]}]}'::jsonb;
  v_desc text := 'A mentoring visit: shadowing a care visit and recording what was seen, what was said and what support was agreed. Completed whenever mentoring is needed, so it has no due date and never appears on the compliance matrix.';
  v_company record;
  v_form uuid;
  v_def uuid;
  v_sort int;
  v_blocked int;
begin
  select count(*) into v_blocked
    from public.evidence e
    join public.form_versions fv on fv.id = e.form_version_id
    join public.forms f on f.id = fv.form_id
   where f.key = 'mentoring';

  if v_blocked > 0 then
    raise exception 'Mentoring has % pieces of evidence against it; delete the test evidence or publish a new version', v_blocked;
  end if;

  insert into public.form_templates (key, name, population, description, schema, status)
  values ('mentoring', 'Mentoring Support Record', 'people', v_desc, v_schema, 'active')
  on conflict (key) do update
     set name = excluded.name, population = excluded.population,
         description = excluded.description, schema = excluded.schema,
         status = 'active', updated_at = now();

  -- The old raw import stays archived rather than deleted: it is somebody's history.
  update public.form_templates set status = 'archived', updated_at = now()
   where key = 'mentoring_support_record';

  for v_company in select id from public.companies where deleted_at is null loop
    insert into public.forms (company_id, key, name, population, description, source_template_key, status, current_version)
    values (v_company.id, 'mentoring', 'Mentoring Support Record', 'people', v_desc, 'mentoring', 'active', 1)
    on conflict (company_id, key) do nothing
    returning id into v_form;
    if v_form is null then
      select id into v_form from public.forms where company_id = v_company.id and key = 'mentoring';
      update public.form_versions set schema = v_schema where form_id = v_form and version = 1;
    else
      insert into public.form_versions (form_id, version, schema, status)
      values (v_form, 1, v_schema, 'published');
    end if;

    select coalesce(max(sort_order), 0) + 1 into v_sort
      from public.check_definitions where company_id = v_company.id and population = 'people';
    insert into public.check_definitions
      (company_id, population, key, name, description, form_id, recurring, anchor,
       lead_days, active, schedule_mode, sort_order)
    values (v_company.id, 'people', 'mentoring', 'Mentoring', v_desc, v_form, false,
            'completion', 0, true, 'ad_hoc', v_sort)
    on conflict (company_id, population, key) do nothing
    returning id into v_def;

    if v_def is not null then
      insert into public.check_instances
        (company_id, branch_id, definition_id, record_type, person_id, due_date)
      select pe.company_id, pe.branch_id, v_def, 'person', pe.id, null
        from public.people pe
       where pe.company_id = v_company.id
         and pe.employment_status = 'active'
         and pe.archived_at is null
      on conflict (definition_id, person_id) do nothing;
    end if;
    v_form := null; v_def := null;
  end loop;
end
$mig$;
