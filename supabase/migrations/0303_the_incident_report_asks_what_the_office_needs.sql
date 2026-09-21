-- 0303_the_incident_report_asks_what_the_office_needs
--
-- Phil's first run through the Incident Report (2026-09-19), fixed for every company:
--
--  - TYPE AND KIND COULD CONTRADICT EACH OTHER. "Accident" and "Abuse or allegation of abuse" could
--    both be chosen. The one "What kind of event" list becomes four, one per type of event, each
--    shown only for its type, so the kinds on offer are the kinds that fit. The record still
--    stores the kind in incidents.category; the type is now stored too (incidents.event_type).
--  - SERVICE USER and STAFF were free text. They are now type-ahead lookups: the service user
--    from the branch chosen on the form, and staff from the whole company, as many as were
--    involved. Every member of staff named is linked to the case in incident_people.
--  - IMMEDIATE ACTION was on the record but not on the form. It is now asked, and required.
--  - NOTIFIABLE and SAFEGUARDING were ticks on the record that nobody was asked about. They are
--    now on the form in a "For the office" section. The office answers them; the team portal
--    never shows them (Phil: "the office staff need to decide"). The server enforces both halves.
--
-- VERSIONING. A company whose current version already has Evidence against it gets a NEW
-- version, so a filed report keeps the questions it was asked. One that has none is updated in
-- place. The same rule the library push uses (0267).
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

alter table public.incidents add column if not exists event_type text;

create table if not exists public.incident_people (
  incident_id uuid not null references public.incidents(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (incident_id, person_id)
);
create index if not exists incident_people_person_idx on public.incident_people(person_id);

alter table public.incident_people enable row level security;

-- Readable by whoever can read the case: the same test incidents_select applies, through the case.
drop policy if exists incident_people_select on public.incident_people;
create policy incident_people_select on public.incident_people for select using (
  exists (select 1 from public.incidents i where i.id = incident_id)
);

-- Written by the office. The reporter's own links are written by the server when the report is
-- filed, after it has checked every person belongs to the company (a carer cannot see the staff
-- list under RLS, so an insert under their own session could not check that for itself).
drop policy if exists incident_people_insert on public.incident_people;
create policy incident_people_insert on public.incident_people for insert with check (
  exists (select 1 from public.incidents i
          where i.id = incident_id and i.company_id = incident_people.company_id
            and (public.is_platform_admin() or public.is_company_admin(i.company_id)
                 or public.is_branch_manager(i.branch_id) or public.is_branch_supervisor(i.branch_id)))
);

drop policy if exists incident_people_delete on public.incident_people;
create policy incident_people_delete on public.incident_people for delete using (
  exists (select 1 from public.incidents i
          where i.id = incident_id
            and (public.is_platform_admin() or public.is_company_admin(i.company_id)
                 or public.is_branch_manager(i.branch_id) or public.is_branch_supervisor(i.branch_id)))
);

do $mig$
declare
  c record;
  v_key text := 'incident_report';
  v_schema jsonb; v_company_schema jsonb;
  v_form uuid; v_version integer; v_used boolean;
begin
  v_schema := $j${"schemaVersion":1,"sections":[{"id":"event","title":"The event","fields":[{"key":"branch","type":"single_select","label":"Branch","required":true,"options":[]},{"key":"event_type","type":"single_select","label":"Type of event","required":true,"options":[{"value":"accident","label":"Accident"},{"value":"near_miss","label":"Near miss"},{"value":"incident","label":"Incident"},{"value":"dangerous_occurrence","label":"Dangerous occurrence"}]},{"key":"category_accident","type":"single_select","label":"What kind of event was it?","required":true,"options":[{"value":"Fall","label":"Fall"},{"value":"Serious accident or injury","label":"Serious accident or injury"},{"value":"Injury to a member of staff","label":"Injury to a member of staff"},{"value":"Choking or swallowing difficulty","label":"Choking or swallowing difficulty"},{"value":"Vehicle or road traffic incident","label":"Vehicle or road traffic incident"},{"value":"Pressure damage, category 3, 4 or unstageable","label":"Pressure damage, category 3, 4 or unstageable"},{"value":"Medical emergency or hospital admission","label":"Medical emergency or hospital admission"},{"value":"Other","label":"Other"}],"visibleWhen":{"field":"event_type","in":["accident"]}},{"key":"category_near_miss","type":"single_select","label":"What nearly happened?","required":true,"options":[{"value":"Fall","label":"Fall"},{"value":"Medication error","label":"Medication error"},{"value":"Choking or swallowing difficulty","label":"Choking or swallowing difficulty"},{"value":"Missed or late call","label":"Missed or late call"},{"value":"Fire, flood or utility failure","label":"Fire, flood or utility failure"},{"value":"Vehicle or road traffic incident","label":"Vehicle or road traffic incident"},{"value":"Data or confidentiality breach","label":"Data or confidentiality breach"},{"value":"Other","label":"Other"}],"visibleWhen":{"field":"event_type","in":["near_miss"]}},{"key":"category_incident","type":"single_select","label":"What kind of event was it?","required":true,"options":[{"value":"Abuse or allegation of abuse","label":"Abuse or allegation of abuse"},{"value":"Allegation of misconduct by a member of staff","label":"Allegation of misconduct by a member of staff"},{"value":"Medication error","label":"Medication error"},{"value":"Behaviour that challenges","label":"Behaviour that challenges"},{"value":"Missing person or unexplained absence","label":"Missing person or unexplained absence"},{"value":"Missed or late call","label":"Missed or late call"},{"value":"Infection or outbreak","label":"Infection or outbreak"},{"value":"Reported to the police","label":"Reported to the police"},{"value":"Death of a service user","label":"Death of a service user"},{"value":"Deprivation of Liberty request or authorisation","label":"Deprivation of Liberty request or authorisation"},{"value":"Medical emergency or hospital admission","label":"Medical emergency or hospital admission"},{"value":"Pressure damage, category 3, 4 or unstageable","label":"Pressure damage, category 3, 4 or unstageable"},{"value":"Property damage, loss or theft","label":"Property damage, loss or theft"},{"value":"Data or confidentiality breach","label":"Data or confidentiality breach"},{"value":"Other","label":"Other"}],"visibleWhen":{"field":"event_type","in":["incident"]}},{"key":"category_dangerous_occurrence","type":"single_select","label":"What kind of event was it?","required":true,"options":[{"value":"Fire, flood or utility failure","label":"Fire, flood or utility failure"},{"value":"Something that stops us running the service safely","label":"Something that stops us running the service safely"},{"value":"Vehicle or road traffic incident","label":"Vehicle or road traffic incident"},{"value":"Infection or outbreak","label":"Infection or outbreak"},{"value":"Other","label":"Other"}],"visibleWhen":{"field":"event_type","in":["dangerous_occurrence"]}},{"key":"occurred_on","type":"date","label":"Date it happened","required":true,"completionDate":true},{"key":"occurred_at","type":"time","label":"Time it happened"},{"key":"location","type":"long_text","label":"Where it happened","required":true,"validation":{"maxLength":500}},{"key":"description","type":"long_text","label":"What happened","required":true,"validation":{"maxLength":4000},"help":"What you saw, in the order it happened. Facts rather than conclusions."},{"key":"immediate_action","type":"long_text","label":"What was done straight away","required":true,"validation":{"maxLength":2000},"help":"What was done to make the person and the situation safe, and by whom."}]},{"id":"who","title":"Who was involved","fields":[{"key":"service_user","type":"record_lookup","lookup":"service_user","scopeField":"branch","label":"Service user involved","help":"Start typing their name. Only service users in the branch chosen above are shown. Leave blank if none."},{"key":"staff","type":"record_lookup","lookup":"person","multiple":true,"label":"Staff involved","help":"Start typing a name and pick it. Add everyone who was involved. Leave blank if none."},{"key":"others_involved","type":"long_text","label":"Anyone else involved","validation":{"maxLength":2000},"help":"Name, address, telephone number and occupation of each person."}]},{"id":"harm","title":"Harm","fields":[{"key":"potential_harm","type":"single_select","label":"Potential harm","required":true,"options":[{"value":"none","label":"None"},{"value":"minor","label":"Minor"},{"value":"serious","label":"Serious"},{"value":"major","label":"Major"}],"help":"How bad it could have been."},{"key":"actual_harm","type":"single_select","label":"Actual harm","required":true,"options":[{"value":"none","label":"None"},{"value":"minor","label":"Minor"},{"value":"serious","label":"Serious"},{"value":"major","label":"Major"}],"help":"How bad it actually was."},{"key":"injuries","type":"yes_no","label":"Did any injury or ill health occur?","required":true},{"key":"injuries_detail","type":"long_text","label":"What injury or ill health","required":true,"validation":{"maxLength":2000},"visibleWhen":{"field":"injuries","in":["yes"]}},{"key":"treatment","type":"yes_no","label":"Was treatment received?","required":true},{"key":"treatment_detail","type":"long_text","label":"What treatment was given, and by whom","required":true,"validation":{"maxLength":2000},"visibleWhen":{"field":"treatment","in":["yes"]}},{"key":"treatment_none_reason","type":"long_text","label":"Why no treatment was received","required":true,"validation":{"maxLength":2000},"visibleWhen":{"field":"treatment","in":["no"]}}]},{"id":"reporting","title":"Telling people","fields":[{"key":"reported_to_office","type":"yes_no","label":"Was it reported to the branch office or on call?","required":true},{"key":"reported_on","type":"date","label":"Date it was reported","required":true,"visibleWhen":{"field":"reported_to_office","in":["yes"]}},{"key":"reported_at","type":"time","label":"Time it was reported","visibleWhen":{"field":"reported_to_office","in":["yes"]}},{"key":"next_of_kin","type":"yes_no","label":"Has the next of kin or emergency contact been told?","required":true},{"key":"next_of_kin_why_not","type":"long_text","label":"Why they have not been told","required":true,"validation":{"maxLength":2000},"visibleWhen":{"field":"next_of_kin","in":["no"]}}]},{"id":"circumstances","title":"Circumstances","fields":[{"key":"environment_unusual","type":"yes_no","label":"Was there anything unusual about the environment?","required":true},{"key":"environment_detail","type":"long_text","label":"What was unusual","required":true,"validation":{"maxLength":2000},"visibleWhen":{"field":"environment_unusual","in":["yes"]}},{"key":"arrangements_influenced","type":"yes_no","label":"Did the way the service is arranged or delivered play a part?","required":true,"help":"Staffing, rotas, training, equipment, instructions."},{"key":"arrangements_detail","type":"long_text","label":"How, and why","required":true,"validation":{"maxLength":2000},"visibleWhen":{"field":"arrangements_influenced","in":["yes"]}}]},{"id":"office","title":"For the office","description":"Decided by the office, not the person reporting. Not shown on the team portal.","fields":[{"key":"notifiable","type":"yes_no","label":"Is this notifiable to the regulator?","help":"If Yes, record the notification date and reference on the case."},{"key":"safeguarding","type":"yes_no","label":"Is this a safeguarding matter?","help":"If Yes, record the referral to the local authority on the case."}]},{"id":"sign_off","title":"Sign off","fields":[{"key":"document","type":"file_upload","label":"Anything to attach","help":"A photograph, a body map, a statement. Optional."},{"key":"reporter_signature","type":"signature","label":"Declaration","required":true,"help":"I confirm this is an accurate and factual account to the best of my knowledge."}]}]}$j$::jsonb;

  update public.form_templates set schema = v_schema, version = version + 1, updated_at = now()
   where key = v_key;

  for c in select id from public.companies where deleted_at is null loop
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

    select id, current_version into v_form, v_version
      from public.forms where company_id = c.id and key = v_key;
    if v_form is null then continue; end if;

    select exists (
      select 1 from public.evidence e
      join public.form_versions fv on fv.id = e.form_version_id
      where fv.form_id = v_form and fv.version = v_version
    ) into v_used;

    if v_used then
      select coalesce(max(version), 0) + 1 into v_version
        from public.form_versions where form_id = v_form;
      insert into public.form_versions (form_id, version, schema, status)
      values (v_form, v_version, v_company_schema, 'published');
      update public.forms set current_version = v_version, updated_at = now() where id = v_form;
    else
      update public.form_versions set schema = v_company_schema
       where form_id = v_form and version = v_version;
    end if;
  end loop;
end
$mig$;
