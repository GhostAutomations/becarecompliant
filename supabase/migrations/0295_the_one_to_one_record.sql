-- 0295_the_one_to_one_record
--
-- Phil, 2026-09-18: "I need to add a new form, this will be a form for all comapnies, this form
-- will not have a column on the matrix, it will be in the accessed in the employees record."
-- Read off his Monday form "One To One's".
--
-- SHAPED LIKE MENTORING (0122/0251): a people check that is ad hoc, not recurring, and not on the
-- register. Nothing falls due and nothing goes red, because a one to one happens when something
-- has prompted it. It lives in the Checks section of the employee's record and files Evidence
-- there.
--
-- WHAT WAS DROPPED, and why nothing is lost with it (Phil's own review of the fields):
--   Employees Name   -- the record it sits in IS the employee.
--   Supervisors Name -- the Evidence is stamped with whoever completed it.
--   The signature's own Name and Date -- the signature block already captures both.
-- Both names still appear on the record and on the PDF; they are simply not typed in again.
--
-- The unlabelled "Multi select" becomes "Reason for meeting", and "Concern form a Service User"
-- loses its typo.
--
-- Date of the meeting is marked completionDate (0292), so the record shows the day the meeting
-- happened rather than the day somebody typed it up.
--
-- The one_to_ones TEMPLATE already existed, archived: a bulk import that had truncated the field
-- keys at 35 characters and lost the reason and the upload entirely. It is replaced rather than
-- given a second key, so there is one One to One and not two.
--
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

do $mig$
declare
  v_desc text := $d$A follow up to a failed spot check, or to a general concern about a member of staff raised by a colleague or by a service user. This is not a disciplinary meeting. It is to identify why the meeting has been brought, and what the company can do to support the employee in their performance.$d$;
  v_schema jsonb := $j$
  {
    "schemaVersion": 1,
    "sections": [
      {
        "id": "meeting",
        "title": "The meeting",
        "fields": [
          { "key": "meeting_date", "type": "date", "label": "Date of the meeting", "required": true, "completionDate": true,
            "help": "The day the meeting took place. This is the date the record shows." },
          { "key": "reason", "type": "multi_select", "label": "Reason for meeting", "required": true,
            "options": [
              { "value": "failed_spot_check", "label": "Failed Spot Check" },
              { "value": "concern_colleague", "label": "Concern from a colleague" },
              { "value": "concern_service_user", "label": "Concern from a Service User" },
              { "value": "drs_mar_auditing", "label": "DRS / MAR Auditing" },
              { "value": "call_monitoring", "label": "Call Monitoring" },
              { "value": "training", "label": "Training" },
              { "value": "failure_to_attend", "label": "Failure to attend Supervision / Appraisal" },
              { "value": "sickness", "label": "Sickness" },
              { "value": "other", "label": "Other" }
            ] }
        ]
      },
      {
        "id": "discussion",
        "title": "The discussion",
        "fields": [
          { "key": "why_brought", "type": "long_text", "label": "Supervisor to provide details of why the meeting has been brought", "required": true },
          { "key": "points_discussed", "type": "long_text", "label": "What points were discussed with the employee", "required": true },
          { "key": "employee_response", "type": "long_text", "label": "Supervisor to detail response from employee", "required": true }
        ]
      },
      {
        "id": "outcome",
        "title": "Outcome",
        "fields": [
          { "key": "follow_up_actions", "type": "long_text", "label": "Supervisor to provide details of the follow up actions", "required": true },
          { "key": "escalate_to_rm", "type": "long_text", "label": "Do the concerns require escalation to the Registered Manager? Please explain your answer below", "required": true },
          { "key": "attachment", "type": "file_upload", "label": "File or image upload",
            "help": "Anything that supports this record. Optional." },
          { "key": "signature", "type": "signature", "label": "Signature", "required": true }
        ]
      }
    ]
  }
  $j$::jsonb;
  c record;
  v_form uuid;
  v_def uuid;
  v_sort int;
begin
  update public.form_templates
     set name = 'One to One',
         population = 'people',
         description = v_desc,
         schema = v_schema,
         version = 2,
         status = 'active',
         updated_at = now()
   where key = 'one_to_ones';

  if not found then
    insert into public.form_templates (key, name, population, description, schema, version, status)
    values ('one_to_ones', 'One to One', 'people', v_desc, v_schema, 1, 'active');
  end if;

  for c in select id from public.companies where deleted_at is null loop
    select id into v_form from public.forms where company_id = c.id and key = 'one_to_ones';

    if v_form is null then
      insert into public.forms (company_id, key, name, population, description, status, current_version)
      values (c.id, 'one_to_ones', 'One to One', 'people', v_desc, 'active', 1)
      returning id into v_form;
      insert into public.form_versions (form_id, version, schema, status)
      values (v_form, 1, v_schema, 'published');
    else
      update public.form_versions set schema = v_schema
       where form_id = v_form and version = (select current_version from public.forms where id = v_form);
    end if;

    select id into v_def from public.check_definitions
     where company_id = c.id and population = 'people' and key = 'one_to_one';

    if v_def is null then
      select coalesce(max(sort_order), 0) + 1 into v_sort
        from public.check_definitions where company_id = c.id and population = 'people';
      insert into public.check_definitions
        (company_id, population, key, name, description, form_id, recurring, frequency, "interval",
         anchor, active, sort_order, schedule_mode, show_on_register)
      values
        (c.id, 'people', 'one_to_one', 'One to One',
         'A one to one meeting record, completed when something has prompted it.',
         v_form, false, null, null, 'completion', true, v_sort, 'ad_hoc', false)
      returning id into v_def;
    else
      update public.check_definitions set form_id = v_form, active = true where id = v_def;
    end if;

    insert into public.check_instances
      (company_id, branch_id, definition_id, record_type, person_id, due_date)
    select pe.company_id, pe.branch_id, v_def, 'person', pe.id, null
    from public.people pe
    where pe.company_id = c.id and pe.employment_status = 'active' and pe.archived_at is null
    on conflict (definition_id, person_id) do nothing;

    v_form := null;
    v_def := null;
  end loop;
end
$mig$;
