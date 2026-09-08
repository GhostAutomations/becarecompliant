-- 0250_the_audit_is_a_check_every_company_has
-- The Audit existed once, for a company that no longer exists. Migration 0121 built it for
-- Acme -- the test company deleted in August -- and its master template was left archived,
-- so no company launching today gets an Audit at all, and neither Thistle nor Bevan has one.
-- Thistle audits its carers' paperwork every month; it is not an optional extra.
--
-- BOTH REGISTERS (Phil, 2026-09-08). The form is Thistle's "Staff or Service User Audit
-- Form" and it goes on both, as it did on Acme: key 'audit' on People, 'audit_su' on
-- Service Users, one schema behind both. Monthly, anchored on completion.
--
-- WHAT IS BEING AUDITED IS ASKED FIRST (Phil, 2026-09-08: "ask the audit type first").
-- Six call statistics sit in the middle of Thistle's form under the heading "Only for Staff
-- ECM Audits", and four of the six are REQUIRED on every submission -- so an auditor
-- reading someone's care notes had to invent an average call duration to save the form. The
-- first question now decides: care notes only, or ECM and care notes. Choose care notes and
-- the period and the statistics are not asked at all; choose ECM and they are asked and
-- required, which is what the heading was trying to say.
--
-- EVERY "NO" IS ASKED WHY. Food and fluid, tasks completed, mood and well-being: on the
-- paper each has an optional box underneath which is there whatever the answer was. They
-- now appear only on No and are required when they appear. An audit that records a failing
-- without recording what failed cannot be acted on, and the auditor has the answer in front
-- of them at the moment they tick No, which is the only moment they will ever have it.
--
-- THE ENVIRONMENT QUESTION WAS A QUESTION WITH NO ANSWER. "Has environment been mentioned,
-- or do the notes identify concerns or queries which should have been flagged (e.g.
-- Supervisor Alert)?" was a plain optional text box, so the commonest answer was nothing at
-- all, and nothing at all is indistinguishable from "no concerns" and from "not looked at".
-- It is now Yes or No, with the detail required on Yes.
--
-- DROPPED as givens: Service User/Staff Member Full Name, Region, Auditor Full Name, and
-- the second Date sitting above the signature -- the record knows the first two and the
-- Evidence stamps who submitted it and when. Date of Audit stays, because an audit can be
-- written up after the fact.
--
-- Applied to the becarecompliant project ONLY (ref bgrtcvyjuwopunpnudeu).

do $mig$
declare
  v_schema jsonb := '{"schemaVersion": 1, "sections": [{"id": "audit", "title": "The audit", "fields": [{"key": "audit_type", "type": "single_select", "label": "What is being audited?", "required": true, "options": [{"value": "notes", "label": "Care notes only"}, {"value": "ecm", "label": "ECM and care notes"}], "help": "An ECM audit also covers call attendance over a period. Choose it and the call statistics are asked below."}, {"key": "date_of_audit", "type": "date", "label": "Date of audit", "required": true, "help": "The date the audit was carried out."}]}, {"id": "period", "title": "Audit period", "description": "The weeks the call statistics cover.", "fields": [{"key": "audit_period_start", "type": "date", "label": "Week commencing, start of period", "required": true, "visibleWhen": {"field": "audit_type", "in": ["ecm"]}}, {"key": "audit_period_end", "type": "date", "label": "Week commencing, end of period", "required": true, "visibleWhen": {"field": "audit_type", "in": ["ecm"]}}]}, {"id": "calls", "title": "Call attendance", "fields": [{"key": "calls_attended", "type": "number", "label": "Calls attended", "visibleWhen": {"field": "audit_type", "in": ["ecm"]}, "required": true, "help": "The total number of calls attended within the audit period.", "validation": {"min": 0}}, {"key": "cancelled_calls", "type": "number", "label": "Cancelled calls", "visibleWhen": {"field": "audit_type", "in": ["ecm"]}, "required": true, "help": "Calls or appointments cancelled within the audit period.", "validation": {"min": 0}}, {"key": "calls_attended_pct", "type": "number", "label": "Calls attended (%)", "visibleWhen": {"field": "audit_type", "in": ["ecm"]}, "required": true, "help": "The percentage of allocated calls actually attended.", "validation": {"min": 0, "max": 100}}, {"key": "avg_call_duration_pct", "type": "number", "label": "Average call duration (%)", "visibleWhen": {"field": "audit_type", "in": ["ecm"]}, "required": true, "help": "The percentage of the allocated time spent in calls. This should not fall below 90%.", "validation": {"min": 0, "max": 100}}, {"key": "avg_earliness_mins", "type": "number", "label": "Average earliness (minutes)", "visibleWhen": {"field": "audit_type", "in": ["ecm"]}, "help": "Average minutes early to a call. This should not exceed 15.", "validation": {"min": 0, "max": 60}}, {"key": "avg_lateness_mins", "type": "number", "label": "Average lateness (minutes)", "visibleWhen": {"field": "audit_type", "in": ["ecm"]}, "help": "Average minutes late to a call. This should not exceed 15.", "validation": {"min": 0, "max": 60}}]}, {"id": "notes", "title": "Care notes", "description": "What the notes for this period do and do not record.", "fields": [{"key": "food_fluid", "type": "single_select", "label": "Has food and fluid intake been documented?", "required": true, "options": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}, {"value": "na", "label": "N/A"}], "help": "Notes should name what was given - a ham sandwich, not a sandwich - and what was drunk."}, {"key": "food_fluid_detail", "type": "long_text", "label": "What was missing, and on which date and by whom?", "validation": {"maxLength": 2000}, "visibleWhen": {"field": "food_fluid", "in": ["no"]}, "required": true}, {"key": "bowel_urine", "type": "single_select", "label": "Have bowel movements and urine output been documented?", "required": true, "options": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}, {"value": "na", "label": "N/A"}]}, {"key": "bowel_urine_detail", "type": "long_text", "label": "Anything worth recording about bowel movements or urine output", "validation": {"maxLength": 2000}, "visibleWhen": {"field": "bowel_urine", "in": ["no", "yes"]}, "help": "Optional."}, {"key": "tasks_completed", "type": "single_select", "label": "Have all the required tasks been acknowledged as completed, with the detail required?", "required": true, "options": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}]}, {"key": "tasks_detail", "type": "long_text", "label": "Which task, and why it was not completed or not in the log notes", "validation": {"maxLength": 2000}, "visibleWhen": {"field": "tasks_completed", "in": ["no"]}, "required": true}, {"key": "mood_wellbeing", "type": "single_select", "label": "Is there detail of the person''s general mood and well-being in the care notes?", "required": true, "options": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}]}, {"key": "mood_detail", "type": "long_text", "label": "What is missing about mood and well-being", "validation": {"maxLength": 2000}, "visibleWhen": {"field": "mood_wellbeing", "in": ["no"]}, "required": true}]}, {"id": "follow_up", "title": "Follow up", "fields": [{"key": "environment_flag", "type": "single_select", "label": "Do the notes mention the environment, or raise concerns or queries that should have been flagged?", "required": true, "options": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}], "help": "For example anything that should have gone to a supervisor as an alert."}, {"key": "environment_detail", "type": "long_text", "label": "What was raised, or what should have been flagged and was not", "validation": {"maxLength": 2000}, "visibleWhen": {"field": "environment_flag", "in": ["yes"]}, "required": true}, {"key": "follow_up_actions", "type": "long_text", "label": "Follow up actions and areas for improvement", "validation": {"maxLength": 2000}, "help": "Anything arising from this audit. Optional."}]}, {"id": "sign_off", "title": "Sign off", "fields": [{"key": "auditor_signature", "type": "signature", "label": "Auditor''s declaration", "required": true, "help": "I confirm that this is an accurate and true record of the audit."}, {"key": "approval_comments", "type": "long_text", "label": "Approval - actions and comments", "validation": {"maxLength": 2000}, "help": "For whoever reviews the audit. Optional."}]}]}'::jsonb;
  v_desc text := 'A monthly audit of the care notes, and of call attendance where the period is being audited from ECM.';
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
   where f.key in ('audit', 'audit_su');

  if v_blocked > 0 then
    raise exception 'Audit has % pieces of evidence against it; delete the test evidence or publish a new version', v_blocked;
  end if;

  -- 1. The library. Two templates, one schema, so a company seeded tomorrow gets both.
  insert into public.form_templates (key, name, population, description, schema, status)
  values ('audit', 'Audit', 'people', v_desc, v_schema, 'active')
  on conflict (key) do update
     set name = excluded.name, population = excluded.population,
         description = excluded.description, schema = excluded.schema,
         status = 'active', updated_at = now();

  insert into public.form_templates (key, name, population, description, schema, status)
  values ('audit_su', 'Audit', 'service_users', v_desc, v_schema, 'active')
  on conflict (key) do update
     set name = excluded.name, population = excluded.population,
         description = excluded.description, schema = excluded.schema,
         status = 'active', updated_at = now();

  -- 2. Every existing company gets the forms, the checks and an instance per record.
  for v_company in select id from public.companies where deleted_at is null loop

    -- People form + check.
    insert into public.forms (company_id, key, name, population, description, source_template_key, status, current_version)
    values (v_company.id, 'audit', 'Audit', 'people', v_desc, 'audit', 'active', 1)
    on conflict (company_id, key) do nothing
    returning id into v_form;
    if v_form is null then
      select id into v_form from public.forms where company_id = v_company.id and key = 'audit';
      update public.form_versions set schema = v_schema where form_id = v_form and version = 1;
    else
      insert into public.form_versions (form_id, version, schema, status)
      values (v_form, 1, v_schema, 'published');
    end if;

    select coalesce(max(sort_order), 0) + 1 into v_sort
      from public.check_definitions where company_id = v_company.id and population = 'people';
    insert into public.check_definitions
      (company_id, population, key, name, description, form_id, recurring, frequency,
       "interval", anchor, lead_days, active, sort_order)
    values (v_company.id, 'people', 'audit', 'Audit', v_desc, v_form, true, 'month', 1,
            'completion', 0, true, v_sort)
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

    -- Service User form + check.
    insert into public.forms (company_id, key, name, population, description, source_template_key, status, current_version)
    values (v_company.id, 'audit_su', 'Audit', 'service_users', v_desc, 'audit_su', 'active', 1)
    on conflict (company_id, key) do nothing
    returning id into v_form;
    if v_form is null then
      select id into v_form from public.forms where company_id = v_company.id and key = 'audit_su';
      update public.form_versions set schema = v_schema where form_id = v_form and version = 1;
    else
      insert into public.form_versions (form_id, version, schema, status)
      values (v_form, 1, v_schema, 'published');
    end if;

    select coalesce(max(sort_order), 0) + 1 into v_sort
      from public.check_definitions where company_id = v_company.id and population = 'service_users';
    insert into public.check_definitions
      (company_id, population, key, name, description, form_id, recurring, frequency,
       "interval", anchor, lead_days, active, sort_order)
    values (v_company.id, 'service_users', 'audit', 'Audit', v_desc, v_form, true, 'month', 1,
            'completion', 0, true, v_sort)
    on conflict (company_id, population, key) do nothing
    returning id into v_def;

    if v_def is not null then
      insert into public.check_instances
        (company_id, branch_id, definition_id, record_type, service_user_id, due_date)
      select su.company_id, su.branch_id, v_def, 'service_user', su.id, null
        from public.service_users su
       where su.company_id = v_company.id
         and su.service_status <> 'cancelled'
         and su.archived_at is null
      on conflict (definition_id, service_user_id) where service_user_id is not null do nothing;
    end if;
    v_form := null; v_def := null;
  end loop;
end
$mig$;

-- 3. And every company seeded from tomorrow. seed_company_form_templates already copies
--    every ACTIVE template, so the two forms arrive on their own; only the CHECKS have to
--    be named here. Unchanged rows are reproduced verbatim so this reads as one whole
--    function rather than a diff nobody can check.
create or replace function public.seed_company_people_checks(cid uuid)
returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  seeded int;
begin
  if not (public.is_platform_admin() or public.is_company_admin(cid)) then
    raise exception 'Not allowed to seed checks for this company';
  end if;

  insert into public.check_definitions
    (company_id, population, key, name, description, form_id, recurring, frequency,
     "interval", anchor, lead_days, expiry_field_key, amber_days, reporting_interval_days,
     sort_order)
  select cid, 'people', v.key, v.name, v.description,
         (select f.id from public.forms f where f.company_id = cid and f.key = v.form_key),
         v.recurring, v.frequency, v."interval", v.anchor, v.lead_days,
         v.expiry_field_key, v.amber_days::int, v.reporting_days::int, v.sort_order
  from (values
    ('supervision','Supervision','Recurring one to one supervision. Planned every 80 days against a 90 day reporting deadline.','supervision',
       true,'day',80,'completion',0,null,null,90,10),
    ('spot_check','Spot Check','Unannounced observation of practice.','spot_check',
       true,'day',30,'completion',0,null,null,null,30),
    ('appraisal','Annual Appraisal','Annual appraisal.','annual_appraisal_acme',
       true,'day',365,'completion',0,null,null,null,20),
    ('competency','Medication Competency','Medication competency reassessment.','medication_ca',
       true,'day',365,'completion',0,null,null,null,40),
    ('audit','Audit','A monthly audit of the care notes, and of call attendance where the period is being audited from ECM.','audit',
       true,'month',1,'completion',0,null,null,null,50),
    ('manual_handling','Manual Handling','Annual moving and handling refresher.','manual_handling_ca',
       true,'day',365,'completion',0,null,null,null,70)
  ) as v(key,name,description,form_key,recurring,frequency,"interval",anchor,lead_days,
         expiry_field_key,amber_days,reporting_days,sort_order)
  on conflict (company_id, population, key) do nothing;

  get diagnostics seeded = row_count;
  return seeded;
end;
$$;

create or replace function public.seed_company_service_user_checks(cid uuid)
returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  seeded int;
begin
  if not (public.is_platform_admin() or public.is_company_admin(cid)) then
    raise exception 'Not allowed to seed checks for this company';
  end if;

  insert into public.check_definitions
    (company_id, population, key, name, description, form_id, recurring, frequency,
     "interval", anchor, lead_days, expiry_field_key, amber_days, reporting_interval_days,
     sort_order)
  select cid, 'service_users', v.key, v.name, v.description,
         (select f.id from public.forms f where f.company_id = cid and f.key = v.form_key),
         v.recurring, v.frequency, v."interval", v.anchor, v.lead_days,
         v.expiry_field_key, v.amber_days::int, v.reporting_days::int, v.sort_order
  from (values
    ('setup','Setup Visit','The visit where the office team collects everything needed to start care. Due before the package starts.','setup',
       false,'day',-1,'completion',0,null,null,null,5),
    ('care_plan_review','Care Plan Review','Recurring review of the care plan, covering risk, medication and consent. Planned every 80 days against a 90 day reporting deadline, and sooner on change of need.','care_plan_review',
       true,'day',80,'completion',0,null,null,90,10),
    ('audit','Audit','A monthly audit of the care notes, and of call attendance where the period is being audited from ECM.','audit_su',
       true,'month',1,'completion',0,null,null,null,20)
  ) as v(key,name,description,form_key,recurring,frequency,"interval",anchor,lead_days,
         expiry_field_key,amber_days,reporting_days,sort_order)
  on conflict (company_id, population, key) do nothing;

  get diagnostics seeded = row_count;
  return seeded;
end;
$$;
