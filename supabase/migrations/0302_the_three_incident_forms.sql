-- 0302_the_three_incident_forms
--
-- The Incident Report, Incident Investigation and Incident Outcome forms, for every company
-- and in the form_templates master so a company set up tomorrow starts with them. Structure
-- is 0301.
--
-- THE REPORT is read off Thistle's own 123FormBuilder "Incident and Accident Form", which is
-- what they actually use, plus what our record already knew to ask. What it gains over the old
-- typed-in record: the type of event, POTENTIAL and ACTUAL harm, whether it was reported to the
-- office and when, treatment, next of kin, and the two cause questions -- the environment, and
-- whether the way the service is arranged played a part. Those are the questions an inspector
-- or an insurer asks and the record could not answer.
--
-- What was dropped from the 123 version: the name, address and signature block at the end (we
-- stamp who filed it), and the safeguarding, CIW and RIDDOR decisions, which are not the
-- reporter's to make. RIDDOR is asked on the OUTCOME; safeguarding and notifiable live on the
-- record where they already did.
--
-- THE INVESTIGATION carries "Is further action required?". Answering No finishes the case: no
-- outcome form, and a reason recorded for why not. THE OUTCOME is the finding, the
-- recommendations, and what has to follow.
--
-- The Branch dropdown on the report is built from each company's OWN branches, the way the
-- complaint form does it, so one form has a different list inside each company's copy.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

do $mig$
declare
  c record;
  v_key text; v_name text; v_desc text;
  v_schema jsonb; v_company_schema jsonb;
  v_tpl uuid; v_form uuid;
begin

  -- Incident Report
  v_key := 'incident_report';
  v_name := 'Incident Report';
  v_desc := $d$What happened, when, where, who was there and how bad it was. Completed by whoever saw it, including a carer from the team portal. Filing it opens the case.$d$;
  v_schema := $j${"schemaVersion":1,"sections":[{"id":"event","title":"The event","fields":[{"key":"branch","type":"single_select","label":"Branch","required":true,"options":[]},{"key":"event_type","type":"single_select","label":"Type of event","required":true,"options":[{"value":"accident","label":"Accident"},{"value":"near_miss","label":"Near miss"},{"value":"incident","label":"Incident"},{"value":"dangerous_occurrence","label":"Dangerous occurrence"}]},{"key":"category","type":"single_select","label":"What kind of event was it?","required":true,"options":[{"value":"Abuse or allegation of abuse","label":"Abuse or allegation of abuse"},{"value":"Allegation of misconduct by a member of staff","label":"Allegation of misconduct by a member of staff"},{"value":"Serious accident or injury","label":"Serious accident or injury"},{"value":"Pressure damage, category 3, 4 or unstageable","label":"Pressure damage, category 3, 4 or unstageable"},{"value":"Infection or outbreak","label":"Infection or outbreak"},{"value":"Reported to the police","label":"Reported to the police"},{"value":"Death of a service user","label":"Death of a service user"},{"value":"Deprivation of Liberty request or authorisation","label":"Deprivation of Liberty request or authorisation"},{"value":"Something that stops us running the service safely","label":"Something that stops us running the service safely"},{"value":"Fall","label":"Fall"},{"value":"Medication error","label":"Medication error"},{"value":"Choking or swallowing difficulty","label":"Choking or swallowing difficulty"},{"value":"Behaviour that challenges","label":"Behaviour that challenges"},{"value":"Missing person or unexplained absence","label":"Missing person or unexplained absence"},{"value":"Missed or late call","label":"Missed or late call"},{"value":"Medical emergency or hospital admission","label":"Medical emergency or hospital admission"},{"value":"Injury to a member of staff","label":"Injury to a member of staff"},{"value":"Fire, flood or utility failure","label":"Fire, flood or utility failure"},{"value":"Vehicle or road traffic incident","label":"Vehicle or road traffic incident"},{"value":"Property damage, loss or theft","label":"Property damage, loss or theft"},{"value":"Data or confidentiality breach","label":"Data or confidentiality breach"},{"value":"Near miss","label":"Near miss"},{"value":"Other","label":"Other"}]},{"key":"occurred_on","type":"date","label":"Date it happened","required":true,"completionDate":true},{"key":"occurred_at","type":"time","label":"Time it happened"},{"key":"location","type":"long_text","label":"Where it happened","required":true,"validation":{"maxLength":500}},{"key":"description","type":"long_text","label":"What happened","required":true,"validation":{"maxLength":4000},"help":"What you saw, in the order it happened. Facts rather than conclusions."}]},{"id":"who","title":"Who was involved","fields":[{"key":"service_user_name","type":"short_text","label":"Service user involved","help":"Leave blank if none."},{"key":"staff_name","type":"short_text","label":"Member of staff involved","help":"Leave blank if none."},{"key":"others_involved","type":"long_text","label":"Anyone else involved","validation":{"maxLength":2000},"help":"Name, address, telephone number and occupation of each person."}]},{"id":"harm","title":"Harm","fields":[{"key":"potential_harm","type":"single_select","label":"Potential harm","required":true,"options":[{"value":"none","label":"None"},{"value":"minor","label":"Minor"},{"value":"serious","label":"Serious"},{"value":"major","label":"Major"}],"help":"How bad it could have been."},{"key":"actual_harm","type":"single_select","label":"Actual harm","required":true,"options":[{"value":"none","label":"None"},{"value":"minor","label":"Minor"},{"value":"serious","label":"Serious"},{"value":"major","label":"Major"}],"help":"How bad it actually was."},{"key":"injuries","type":"yes_no","label":"Did any injury or ill health occur?","required":true},{"key":"injuries_detail","type":"long_text","label":"What injury or ill health","required":true,"validation":{"maxLength":2000},"visibleWhen":{"field":"injuries","in":["yes"]}},{"key":"treatment","type":"yes_no","label":"Was treatment received?","required":true},{"key":"treatment_detail","type":"long_text","label":"What treatment was given, and by whom","required":true,"validation":{"maxLength":2000},"visibleWhen":{"field":"treatment","in":["yes"]}},{"key":"treatment_none_reason","type":"long_text","label":"Why no treatment was received","required":true,"validation":{"maxLength":2000},"visibleWhen":{"field":"treatment","in":["no"]}}]},{"id":"reporting","title":"Telling people","fields":[{"key":"reported_to_office","type":"yes_no","label":"Was it reported to the branch office or on call?","required":true},{"key":"reported_on","type":"date","label":"Date it was reported","required":true,"visibleWhen":{"field":"reported_to_office","in":["yes"]}},{"key":"reported_at","type":"time","label":"Time it was reported","visibleWhen":{"field":"reported_to_office","in":["yes"]}},{"key":"next_of_kin","type":"yes_no","label":"Has the next of kin or emergency contact been told?","required":true},{"key":"next_of_kin_why_not","type":"long_text","label":"Why they have not been told","required":true,"validation":{"maxLength":2000},"visibleWhen":{"field":"next_of_kin","in":["no"]}}]},{"id":"circumstances","title":"Circumstances","fields":[{"key":"environment_unusual","type":"yes_no","label":"Was there anything unusual about the environment?","required":true},{"key":"environment_detail","type":"long_text","label":"What was unusual","required":true,"validation":{"maxLength":2000},"visibleWhen":{"field":"environment_unusual","in":["yes"]}},{"key":"arrangements_influenced","type":"yes_no","label":"Did the way the service is arranged or delivered play a part?","required":true,"help":"Staffing, rotas, training, equipment, instructions."},{"key":"arrangements_detail","type":"long_text","label":"How, and why","required":true,"validation":{"maxLength":2000},"visibleWhen":{"field":"arrangements_influenced","in":["yes"]}}]},{"id":"sign_off","title":"Sign off","fields":[{"key":"document","type":"file_upload","label":"Anything to attach","help":"A photograph, a body map, a statement. Optional."},{"key":"reporter_signature","type":"signature","label":"Declaration","required":true,"help":"I confirm this is an accurate and factual account to the best of my knowledge."}]}]}$j$::jsonb;

  select id into v_tpl from public.form_templates where key = v_key;
  if v_tpl is null then
    insert into public.form_templates (key, name, population, description, schema, status, version)
    values (v_key, v_name, 'incidents', v_desc, v_schema, 'active', 1);
  else
    update public.form_templates set name = v_name, description = v_desc, schema = v_schema,
           status = 'active', version = version + 1, updated_at = now()
     where id = v_tpl;
  end if;

  for c in select id, name from public.companies where deleted_at is null loop
    -- The branch dropdown is built from THIS company's own branches, the way the complaint
    -- form does it: one form, a different list of branches inside each company's copy.
    v_company_schema := jsonb_set(v_schema, '{sections}', (
      select jsonb_agg(
        jsonb_set(sec, '{fields}', coalesce((
          select jsonb_agg(
            case when fld->>'key' = 'branch'
              then jsonb_set(fld, '{options}', coalesce((
                     select jsonb_agg(jsonb_build_object('value', b.id::text, 'label', b.name) order by b.name)
                     from public.branches b
                     where b.company_id = c.id and b.kind in ('branch','team')), '[]'::jsonb))
              else fld end
            order by fo)
          from jsonb_array_elements(sec->'fields') with ordinality as ff(fld, fo)
        ), '[]'::jsonb))
        order by so)
      from jsonb_array_elements(v_schema->'sections') with ordinality as ss(sec, so)));

    select id into v_form from public.forms where company_id = c.id and key = v_key;
    if v_form is null then
      insert into public.forms (company_id, key, name, population, description, status, current_version)
      values (c.id, v_key, v_name, 'incidents', v_desc, 'active', 1)
      returning id into v_form;
      insert into public.form_versions (form_id, version, schema, status)
      values (v_form, 1, v_company_schema, 'published');
    else
      update public.forms set name = v_name, description = v_desc, status = 'active' where id = v_form;
      update public.form_versions set schema = v_company_schema
       where form_id = v_form and version = (select current_version from public.forms where id = v_form);
    end if;
    v_form := null;
  end loop;


  -- Incident Investigation
  v_key := 'incident_investigation';
  v_name := 'Incident Investigation';
  v_desc := $d$What the branch established after the report: the lines of enquiry, what they found, and whether anything further is required. Answering No to further action finishes the case here.$d$;
  v_schema := $j${"schemaVersion":1,"sections":[{"id":"enquiry","title":"The investigation","fields":[{"key":"investigation_date","type":"date","label":"Date of the investigation","required":true,"completionDate":true},{"key":"lines_of_enquiry","type":"long_text","label":"Lines of enquiry","validation":{"maxLength":8000},"help":"What was asked, and what came back. Draft it for me writes the questions to work through from the report."},{"key":"findings","type":"long_text","label":"What the investigation established","required":true,"validation":{"maxLength":4000},"help":"What is known now that was not known from the report alone."}]},{"id":"next","title":"Where it goes next","fields":[{"key":"further_action_required","type":"yes_no","label":"Is further action required?","required":true,"help":"Answer No to finish here. No outcome is needed and the case can be closed."},{"key":"no_action_reason","type":"long_text","label":"Why no further action is required","required":true,"validation":{"maxLength":2000},"visibleWhen":{"field":"further_action_required","in":["no"]}}]},{"id":"sign_off","title":"Sign off","fields":[{"key":"investigation_document","type":"file_upload","label":"Anything to attach","help":"Statements, photographs, records. Optional."},{"key":"investigator_signature","type":"signature","label":"Declaration","required":true,"help":"I confirm this is an accurate record of the investigation."}]}]}$j$::jsonb;

  select id into v_tpl from public.form_templates where key = v_key;
  if v_tpl is null then
    insert into public.form_templates (key, name, population, description, schema, status, version)
    values (v_key, v_name, 'incidents', v_desc, v_schema, 'active', 1);
  else
    update public.form_templates set name = v_name, description = v_desc, schema = v_schema,
           status = 'active', version = version + 1, updated_at = now()
     where id = v_tpl;
  end if;

  for c in select id, name from public.companies where deleted_at is null loop
    -- The branch dropdown is built from THIS company's own branches, the way the complaint
    -- form does it: one form, a different list of branches inside each company's copy.
    v_company_schema := jsonb_set(v_schema, '{sections}', (
      select jsonb_agg(
        jsonb_set(sec, '{fields}', coalesce((
          select jsonb_agg(
            case when fld->>'key' = 'branch'
              then jsonb_set(fld, '{options}', coalesce((
                     select jsonb_agg(jsonb_build_object('value', b.id::text, 'label', b.name) order by b.name)
                     from public.branches b
                     where b.company_id = c.id and b.kind in ('branch','team')), '[]'::jsonb))
              else fld end
            order by fo)
          from jsonb_array_elements(sec->'fields') with ordinality as ff(fld, fo)
        ), '[]'::jsonb))
        order by so)
      from jsonb_array_elements(v_schema->'sections') with ordinality as ss(sec, so)));

    select id into v_form from public.forms where company_id = c.id and key = v_key;
    if v_form is null then
      insert into public.forms (company_id, key, name, population, description, status, current_version)
      values (c.id, v_key, v_name, 'incidents', v_desc, 'active', 1)
      returning id into v_form;
      insert into public.form_versions (form_id, version, schema, status)
      values (v_form, 1, v_company_schema, 'published');
    else
      update public.forms set name = v_name, description = v_desc, status = 'active' where id = v_form;
      update public.form_versions set schema = v_company_schema
       where form_id = v_form and version = (select current_version from public.forms where id = v_form);
    end if;
    v_form := null;
  end loop;


  -- Incident Outcome
  v_key := 'incident_outcome';
  v_name := 'Incident Outcome';
  v_desc := $d$The finding, the recommendations and what has to follow: risk assessment, RIDDOR, and whether disciplinary action should be considered.$d$;
  v_schema := $j${"schemaVersion":1,"sections":[{"id":"finding","title":"The outcome","fields":[{"key":"outcome_date","type":"date","label":"Date of the outcome","required":true,"completionDate":true},{"key":"finding","type":"long_text","label":"The finding","required":true,"validation":{"maxLength":4000},"help":"What the company concludes happened, and why."},{"key":"recommendations","type":"long_text","label":"Recommendations","required":true,"validation":{"maxLength":4000},"help":"What should change. Training, risk assessment, equipment, process, supervision."},{"key":"actions_taken","type":"long_text","label":"Action already taken","validation":{"maxLength":2000}},{"key":"lessons_learnt","type":"long_text","label":"Lessons learnt","required":true,"validation":{"maxLength":2000},"help":"Goes on the record, and into the Reg 80 return."}]},{"id":"follow","title":"What has to follow","fields":[{"key":"risk_assessment_required","type":"yes_no","label":"Is a new risk assessment required?","required":true},{"key":"risk_assessment_date","type":"date","label":"Date it will be, or was, done","visibleWhen":{"field":"risk_assessment_required","in":["yes"]},"help":"Remember to update the matrix once it is complete."},{"key":"riddor","type":"yes_no","label":"Is this reportable under RIDDOR?","required":true},{"key":"riddor_date","type":"date","label":"Date reported to RIDDOR","visibleWhen":{"field":"riddor","in":["yes"]},"help":"Forward a copy of the RIDDOR referral to the Branch Manager for filing."},{"key":"disciplinary","type":"single_select","label":"Should disciplinary action or investigation be considered?","required":true,"options":[{"value":"yes","label":"Yes"},{"value":"no","label":"No"},{"value":"na","label":"Not applicable"}],"help":"Recorded here only. Anything that follows is an HR matter and is kept off anything shared outside the company."}]},{"id":"sign_off","title":"Sign off","fields":[{"key":"outcome_signature","type":"signature","label":"Declaration","required":true,"help":"I confirm this is an accurate record of the outcome."}]}]}$j$::jsonb;

  select id into v_tpl from public.form_templates where key = v_key;
  if v_tpl is null then
    insert into public.form_templates (key, name, population, description, schema, status, version)
    values (v_key, v_name, 'incidents', v_desc, v_schema, 'active', 1);
  else
    update public.form_templates set name = v_name, description = v_desc, schema = v_schema,
           status = 'active', version = version + 1, updated_at = now()
     where id = v_tpl;
  end if;

  for c in select id, name from public.companies where deleted_at is null loop
    -- The branch dropdown is built from THIS company's own branches, the way the complaint
    -- form does it: one form, a different list of branches inside each company's copy.
    v_company_schema := jsonb_set(v_schema, '{sections}', (
      select jsonb_agg(
        jsonb_set(sec, '{fields}', coalesce((
          select jsonb_agg(
            case when fld->>'key' = 'branch'
              then jsonb_set(fld, '{options}', coalesce((
                     select jsonb_agg(jsonb_build_object('value', b.id::text, 'label', b.name) order by b.name)
                     from public.branches b
                     where b.company_id = c.id and b.kind in ('branch','team')), '[]'::jsonb))
              else fld end
            order by fo)
          from jsonb_array_elements(sec->'fields') with ordinality as ff(fld, fo)
        ), '[]'::jsonb))
        order by so)
      from jsonb_array_elements(v_schema->'sections') with ordinality as ss(sec, so)));

    select id into v_form from public.forms where company_id = c.id and key = v_key;
    if v_form is null then
      insert into public.forms (company_id, key, name, population, description, status, current_version)
      values (c.id, v_key, v_name, 'incidents', v_desc, 'active', 1)
      returning id into v_form;
      insert into public.form_versions (form_id, version, schema, status)
      values (v_form, 1, v_company_schema, 'published');
    else
      update public.forms set name = v_name, description = v_desc, status = 'active' where id = v_form;
      update public.form_versions set schema = v_company_schema
       where form_id = v_form and version = (select current_version from public.forms where id = v_form);
    end if;
    v_form := null;
  end loop;

end
$mig$;
