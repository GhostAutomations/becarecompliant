-- 0253_a_check_can_belong_to_certain_job_titles
-- Lead the Leader is supervision for the people who supervise, and Phil, 2026-09-08: it
-- "will only sit on the name card of supervisor and above". Nothing in the product could
-- express that. Every check applied to everybody, so the choice was a leadership form on a
-- care assistant's record or no leadership form at all.
--
-- check_definitions.job_titles: NULL or empty means everybody, which is what every existing
-- check is and stays. THE RULE LIVES IN apply_person_checks, not in the callers. Three
-- places build the list of definitions to apply -- adding a person, the CSV import, and the
-- Apply missing checks button -- and a rule written in three places is a rule that will be
-- right twice. Written once in the function they all go through, a caller that forgets it
-- cannot get it wrong.
--
-- WHICH TITLES (Phil, 2026-09-08): Supervisor, Senior Supervisor, Deputy Manager, Registered
-- Manager and Senior Care Assistant. Matched case insensitively and trimmed, because a job
-- title is typed by a person.
--
-- AD HOC, LIKE MENTORING. Held when it is needed, so no due date, no RAG and no column on
-- the matrix -- a form that cannot be late must never make a company look non-compliant.
-- Say the word and it becomes a scheduled check instead; nothing else would have to change.
--
-- DROPPED as givens: Employee Name, Job Title, Manager Name, Branch and Email. The record
-- knows all five and the Evidence stamps who submitted it. Next Supervision Date is KEPT,
-- unlike on the competency assessments, because nothing schedules an ad hoc form: there it
-- was a hand-typed copy of a date the system already worked out, here it is the only record
-- of what the two of them agreed.
--
-- Applied to the becarecompliant project ONLY (ref bgrtcvyjuwopunpnudeu).

alter table public.check_definitions
  add column if not exists job_titles text[];

comment on column public.check_definitions.job_titles is
  'Job titles this check applies to. NULL or empty means everybody, which is what every check was before Lead the Leader. Enforced in apply_person_checks so no caller can bypass it.';

create or replace function public.apply_person_checks(p_person_id uuid, p_rows jsonb)
returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_company uuid;
  v_branch uuid;
  v_title text;
  r jsonb;
  n int := 0;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.can_manage_person(p_person_id) then
    raise exception 'Not allowed to manage this record';
  end if;

  select company_id, branch_id, btrim(coalesce(job_title, ''))
    into v_company, v_branch, v_title
    from public.people where id = p_person_id;
  if v_company is null then raise exception 'Unknown record'; end if;

  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
  loop
    /* A check restricted to job titles is applied ONLY to those job titles. */
    insert into public.check_instances
      (company_id, branch_id, definition_id, record_type, person_id, due_date, expiry_date)
    select v_company, v_branch, (r->>'definition_id')::uuid, 'person', p_person_id,
           nullif(r->>'due_date','')::date, nullif(r->>'expiry_date','')::date
    where exists (
      select 1 from public.check_definitions cd
      where cd.id = (r->>'definition_id')::uuid
        and cd.company_id = v_company
        and (
          cd.job_titles is null
          or cardinality(cd.job_titles) = 0
          or exists (
            select 1 from unnest(cd.job_titles) jt
            where lower(btrim(jt)) = lower(v_title)
          )
        )
    )
    on conflict (definition_id, person_id) do nothing;
    if found then n := n + 1; end if;
  end loop;

  return n;
end;
$$;

do $mig$
declare
  v_schema jsonb := '{"schemaVersion": 1, "sections": [{"id": "supervision", "title": "The supervision", "fields": [{"key": "supervision_date", "type": "date", "label": "Date of supervision", "required": true}, {"key": "next_supervision_date", "type": "date", "label": "Next supervision planned for", "help": "When you have agreed to sit down again. Optional."}]}, {"id": "since_last", "title": "Since the last supervision", "fields": [{"key": "actions_agreed_last", "type": "long_text", "label": "Actions agreed at the last supervision", "validation": {"maxLength": 2000}}, {"key": "progress_outcome", "type": "long_text", "label": "Progress and outcome", "validation": {"maxLength": 2000}}]}, {"id": "the_role", "title": "Their own role", "fields": [{"key": "managing_workload", "type": "long_text", "label": "How are you managing your workload?", "validation": {"maxLength": 2000}}, {"key": "challenges_pressures", "type": "long_text", "label": "Any challenges or pressures in your current role?", "validation": {"maxLength": 2000}}, {"key": "performance_discussion", "type": "long_text", "label": "Performance against objectives and service standards", "validation": {"maxLength": 2000}}, {"key": "good_practice_achievements", "type": "long_text", "label": "Examples of good practice or achievements since the last supervision", "validation": {"maxLength": 2000}}]}, {"id": "the_team", "title": "The team they lead", "description": "This is the part a carer''s supervision does not have: how the people under them are doing.", "fields": [{"key": "team_performing", "type": "long_text", "label": "How is your team performing overall?", "validation": {"maxLength": 2000}}, {"key": "staffing_concerns", "type": "long_text", "label": "Any staffing, disciplinary or performance concerns?", "validation": {"maxLength": 2000}}, {"key": "supporting_wellbeing_dev", "type": "long_text", "label": "How are you supporting staff wellbeing and professional development?", "validation": {"maxLength": 2000}}, {"key": "promoting_person_centred", "type": "long_text", "label": "How are you promoting person centred and values based care in your team?", "validation": {"maxLength": 2000}}, {"key": "modelled_values_examples", "type": "long_text", "label": "Examples of how you have modelled the organisation''s values", "validation": {"maxLength": 2000}}]}, {"id": "development", "title": "Learning and development", "fields": [{"key": "training_completed", "type": "long_text", "label": "Training completed since the last supervision", "validation": {"maxLength": 2000}}, {"key": "training_needs", "type": "long_text", "label": "Training or development needs identified", "validation": {"maxLength": 2000}}, {"key": "leadership_dev_opportunities", "type": "long_text", "label": "Opportunities for leadership development or mentoring", "validation": {"maxLength": 2000}}]}, {"id": "wellbeing", "title": "Wellbeing", "fields": [{"key": "feeling_in_role", "type": "long_text", "label": "How are you feeling in your role at the moment?", "validation": {"maxLength": 2000}}, {"key": "stress_balance_concerns", "type": "long_text", "label": "Any concerns about stress, workload or work life balance?", "validation": {"maxLength": 2000}}, {"key": "support_needed", "type": "long_text", "label": "What support do you need from your line manager or the organisation?", "validation": {"maxLength": 2000}}]}, {"id": "actions", "title": "Actions and sign off", "fields": [{"key": "actions_employee", "type": "long_text", "label": "Actions for the employee, with timescales", "validation": {"maxLength": 2000}}, {"key": "actions_manager", "type": "long_text", "label": "Actions for the manager, with timescales", "validation": {"maxLength": 2000}}, {"key": "employee_comments", "type": "long_text", "label": "Employee comments", "validation": {"maxLength": 2000}}, {"key": "manager_comments", "type": "long_text", "label": "Manager comments", "validation": {"maxLength": 2000}, "required": true}, {"key": "manager_signature", "type": "signature", "label": "Manager''s declaration", "required": true, "help": "I confirm that this is an accurate and true record of the supervision."}, {"key": "employee_signature", "type": "signature", "label": "Employee signature"}]}]}'::jsonb;
  v_desc text := 'Supervision for the people who supervise: their own role, the team they lead, their development and their wellbeing. Held when it is needed, so it has no due date and never appears on the compliance matrix.';
  v_titles text[] := array['Supervisor','Senior Supervisor','Deputy Manager','Registered Manager','Senior Care Assistant'];
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
   where f.key = 'lead_the_leader';

  if v_blocked > 0 then
    raise exception 'Lead the Leader has % pieces of evidence against it; delete the test evidence or publish a new version', v_blocked;
  end if;

  insert into public.form_templates (key, name, population, description, schema, status)
  values ('lead_the_leader', 'Lead the Leader', 'people', v_desc, v_schema, 'active')
  on conflict (key) do update
     set name = excluded.name, population = excluded.population,
         description = excluded.description, schema = excluded.schema,
         status = 'active', updated_at = now();

  for v_company in select id from public.companies where deleted_at is null loop
    insert into public.forms (company_id, key, name, population, description, source_template_key, status, current_version)
    values (v_company.id, 'lead_the_leader', 'Lead the Leader', 'people', v_desc, 'lead_the_leader', 'active', 1)
    on conflict (company_id, key) do nothing
    returning id into v_form;
    if v_form is null then
      select id into v_form from public.forms where company_id = v_company.id and key = 'lead_the_leader';
      update public.form_versions set schema = v_schema where form_id = v_form and version = 1;
    else
      insert into public.form_versions (form_id, version, schema, status)
      values (v_form, 1, v_schema, 'published');
    end if;

    select coalesce(max(sort_order), 0) + 1 into v_sort
      from public.check_definitions where company_id = v_company.id and population = 'people';
    insert into public.check_definitions
      (company_id, population, key, name, description, form_id, recurring, anchor,
       lead_days, active, schedule_mode, job_titles, sort_order)
    values (v_company.id, 'people', 'lead_the_leader', 'Lead the Leader', v_desc, v_form, false,
            'completion', 0, true, 'ad_hoc', v_titles, v_sort)
    on conflict (company_id, population, key) do update
       set job_titles = excluded.job_titles, form_id = excluded.form_id,
           description = excluded.description, updated_at = now()
    returning id into v_def;

    if v_def is not null then
      insert into public.check_instances
        (company_id, branch_id, definition_id, record_type, person_id, due_date)
      select pe.company_id, pe.branch_id, v_def, 'person', pe.id, null
        from public.people pe
       where pe.company_id = v_company.id
         and pe.employment_status = 'active'
         and pe.archived_at is null
         and exists (
           select 1 from unnest(v_titles) jt
           where lower(btrim(jt)) = lower(btrim(coalesce(pe.job_title, '')))
         )
      on conflict (definition_id, person_id) do nothing;
    end if;
    v_form := null; v_def := null;
  end loop;
end
$mig$;
