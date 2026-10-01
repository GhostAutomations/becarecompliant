-- 0365 — The creation tick list (Phil, 2026-09-26 spec, built 2026-10-01).
--
-- Thistle's set up is the default every new company gets: its forms and its checks (the
-- register columns follow the checks). The founder can untick what a customer will not use when
-- creating the company. What stays fixed, with the reason shown on the tick list:
--   * forms that power a department or tracker (holiday, absence, Return to Work, complaints,
--     incidents, DBS, right to work, probation, policy signing, money records), and
--   * the four checks the registers and the PQS report are built around (Supervision, Annual
--     Appraisal, Setup Visit, Care Plan Review).
-- Timings (intervals, amber days, schedule mode) are per company settings, not defaults
-- (Phil, 2026-10-01), so the six existing checks keep exactly the values they were seeded with.
--
-- Also: Thistle's four ad hoc People checks (Mentoring, Lead the Leader, One to One, Health
-- Check) become part of the default for ALL companies (Phil, 2026-10-01), so the Health Check
-- form joins the founder library, and existing companies missing them are topped up.

-- 1. Locked forms say why, in the library itself.
alter table public.form_templates add column if not exists locked_reason text;

update public.form_templates set locked_reason = v.reason
from (values
  ('holiday_requests', 'Powers the Holiday department.'),
  ('absence_back_office', 'Powers the Absence department.'),
  ('absence_management_meeting', 'Powers the Absence department.'),
  ('return_to_work', 'Powers Return to Work in the Absence department.'),
  ('complaints_concerns', 'Powers the Complaints department.'),
  ('complaint_response', 'Powers the Complaints department.'),
  ('incident_report', 'Powers the Incidents department.'),
  ('incident_investigation', 'Powers the Incidents department.'),
  ('incident_outcome', 'Powers the Incidents department.'),
  ('dbs_renewal', 'Powers the DBS columns on the People register.'),
  ('right_to_work', 'Powers the Right to Work columns on the People register.'),
  ('probation_review', 'Powers the Probation columns on the People register.'),
  ('policy_acknowledgement', 'Powers policy signing in Briefings.'),
  ('financial_transaction', 'Powers money records in the Team Member area.')
) as v(key, reason)
where form_templates.key = v.key;

-- 2. The Health Check form joins the library (Thistle's version 1, exactly).
insert into public.form_templates (key, name, population, description, schema, version, status)
values (
  'health_check', 'Health Check', 'people',
  'A check on a new member of staff at week 4 and week 8 of probation: that the availability on file is still right, how the balance of their work and their life is, and what went well and badly for them. It is NOT a probation meeting. It exists to find what the company can do better as much as what the employee can.',
  '{"sections":[{"id":"check","title":"The check","fields":[{"key":"week","help":"Which of the two probation health checks this is.","type":"single_select","label":"Week check completed","options":[{"label":"Week 4","value":"4"},{"label":"Week 8","value":"8"}],"required":true},{"key":"date_of_conversation","help":"The day the conversation happened.","type":"date","label":"Date of conversation","required":true,"completionDate":true}]},{"id":"availability","title":"Availability and balance","fields":[{"key":"availability","help":"If it has changed, update the system, tell the planner, and say that any further change needs a month''s notice to take effect.","type":"long_text","label":"Their current availability, in their own words","required":true,"validation":{"maxLength":2000}},{"key":"work_life_balance","type":"single_select","label":"Are they happy with their current work life balance?","options":[{"label":"Yes","value":"yes"},{"label":"No","value":"no"}],"required":true},{"key":"work_life_detail","type":"long_text","label":"What is not working, and what would help","required":true,"validation":{"maxLength":2000},"visibleWhen":{"in":["no"],"field":"work_life_balance"}}]},{"id":"feedback","title":"Feedback","fields":[{"key":"went_well","type":"long_text","label":"What went well for you in the last few weeks?","required":true,"validation":{"maxLength":2000}},{"key":"company_better","type":"long_text","label":"What could we as a company have done better for you?","required":true,"validation":{"maxLength":2000}},{"key":"own_improvement","help":"Optional.","type":"long_text","label":"One area you feel you may need to improve","validation":{"maxLength":2000}},{"key":"company_improvement","help":"Optional.","type":"long_text","label":"One area the company could improve, or any suggestion overall","validation":{"maxLength":2000}},{"key":"training_needed","help":"Optional.","type":"long_text","label":"Would you benefit from further training? If so, what?","validation":{"maxLength":2000}}],"description":"Open questions. The answers are the point of the check: they say what to change, for this person and for the company."},{"id":"sign_off","title":"Sign off","fields":[{"key":"conductor_signature","help":"I confirm this is an accurate record of the conversation.","type":"signature","label":"Declaration","required":true}]}],"schemaVersion":1}'::jsonb, 1, 'active'
)
on conflict (key) do nothing;

-- 3. The default checks, as a table: one source for the seed AND the tick list.
create table if not exists public.default_check_definitions (
  population text not null check (population in ('people', 'service_users')),
  key text not null,
  name text not null,
  description text not null default '',
  form_key text,
  recurring boolean not null,
  frequency text,
  "interval" integer,
  anchor text not null default 'completion',
  lead_days integer not null default 0,
  expiry_field_key text,
  amber_days integer,
  reporting_interval_days integer,
  schedule_mode text not null default 'interval',
  sort_order integer not null default 0,
  locked_reason text,
  primary key (population, key)
);

alter table public.default_check_definitions enable row level security;
create policy default_check_definitions_select on public.default_check_definitions
  for select to authenticated using (public.is_platform_admin());

insert into public.default_check_definitions
  (population, key, name, description, form_key, recurring, frequency, "interval", anchor,
   lead_days, expiry_field_key, amber_days, reporting_interval_days, schedule_mode, sort_order,
   locked_reason)
values
  ('people','supervision','Supervision','Recurring one to one supervision. Planned every 80 days against a 90 day reporting deadline.','supervision',
     true,'day',80,'completion',0,null,null,90,'interval',10,
     'Drives the supervision cycle, the Supervision columns and the PQS report.'),
  ('people','spot_check','Spot Check','Unannounced observation of practice.','spot_check',
     true,'day',30,'completion',0,null,null,null,'interval',30, null),
  ('people','appraisal','Annual Appraisal','Annual appraisal.','annual_appraisal_acme',
     true,'day',365,'completion',0,null,null,null,'interval',20,
     'Part of the supervision cycle: the Annual Appraisal columns and the PQS report.'),
  ('people','competency','Medication Competency','Medication competency reassessment.','medication_ca',
     true,'day',365,'completion',0,null,null,null,'interval',40, null),
  ('people','audit','Audit','A quarterly audit of the care notes, and of call attendance where the period is being audited from ECM.','audit',
     true,'month',3,'completion',0,null,null,null,'interval',50, null),
  ('people','manual_handling','Manual Handling','Annual moving and handling refresher.','manual_handling_ca',
     true,'day',365,'completion',0,null,null,null,'interval',70, null),
  ('people','mentoring','Mentoring','A mentoring visit: shadowing a care visit and recording what was seen, what was said and what support was agreed. Completed whenever mentoring is needed, so it has no due date and never appears on the compliance matrix.','mentoring',
     false,null,null,'completion',0,null,null,null,'ad_hoc',72, null),
  ('people','lead_the_leader','Lead the Leader','Supervision for the people who supervise: their own role, the team they lead, their development and their wellbeing. Held when it is needed, so it has no due date and never appears on the compliance matrix.','lead_the_leader',
     false,null,null,'completion',0,null,null,null,'ad_hoc',73, null),
  ('people','one_to_one','One to One','A one to one meeting record, completed when something has prompted it.','one_to_ones',
     false,null,null,'completion',0,null,null,null,'ad_hoc',74, null),
  ('people','health_check','Health Check','A check on a new starter at week 4 and week 8 of probation.','health_check',
     false,null,null,'completion',0,null,null,null,'ad_hoc',75, null),
  ('service_users','setup','Setup Visit','The visit where the office team collects everything needed to start care. Due before the package starts.','setup',
     false,'day',-1,'completion',0,null,null,null,'interval',5,
     'Starts every Service User''s care: the Setup Visit columns and the first review date come from it.'),
  ('service_users','care_plan_review','Care Plan Review','Recurring review of the care plan, covering risk, medication and consent. Planned every 80 days against a 90 day reporting deadline, and sooner on change of need.','care_plan_review',
     true,'day',80,'completion',0,null,null,90,'interval',10,
     'Drives the Review columns and the PQS report.'),
  ('service_users','audit','Audit','A quarterly audit of the care notes, and of call attendance where the period is being audited from ECM.','audit_su',
     true,'month',3,'completion',0,null,null,null,'interval',20, null)
on conflict (population, key) do nothing;

-- 4. The seed functions read the table and accept what the founder unticked. The existing
-- single argument seeds keep their signatures (trial provisioning, demos and the template import
-- call them) and now route through the same list, so every path seeds the same defaults.

-- p_skip: form keys to leave out. A locked form, or the form of a locked check, is never left out.
create or replace function public.seed_company_forms_except(cid uuid, p_skip text[])
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  t record;
  new_form_id uuid;
  seeded int := 0;
begin
  if not (public.is_platform_admin() or public.is_company_admin(cid)) then
    raise exception 'Not allowed to seed templates for this company';
  end if;

  for t in
    select ft.* from public.form_templates ft
    where ft.status = 'active'
      and (
        p_skip is null
        or not (ft.key = any (p_skip))
        or ft.locked_reason is not null
        or exists (select 1 from public.default_check_definitions d
                   where d.form_key = ft.key and d.locked_reason is not null)
      )
    order by ft.key
  loop
    insert into public.forms
      (company_id, key, name, population, description, source_template_key, current_version,
       library_version, library_schema)
    values
      (cid, t.key, t.name, t.population, t.description, t.key, 1, t.version, t.schema)
    on conflict (company_id, key) do nothing
    returning id into new_form_id;

    if new_form_id is not null then
      insert into public.form_versions (form_id, version, schema, status)
      values (new_form_id, 1, t.schema, 'published');
      seeded := seeded + 1;
    end if;
  end loop;

  return seeded;
end;
$$;

-- p_skip: check keys to leave out; locked checks are always kept.
create or replace function public.seed_company_checks_for(cid uuid, p_population text, p_skip text[])
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  seeded int;
begin
  if not (public.is_platform_admin() or public.is_company_admin(cid)) then
    raise exception 'Not allowed to seed checks for this company';
  end if;

  insert into public.check_definitions
    (company_id, population, key, name, description, form_id, recurring, frequency,
     "interval", anchor, lead_days, expiry_field_key, amber_days, reporting_interval_days,
     schedule_mode, sort_order)
  select cid, d.population, d.key, d.name, d.description,
         (select f.id from public.forms f where f.company_id = cid and f.key = d.form_key),
         d.recurring, d.frequency, d."interval", d.anchor, d.lead_days, d.expiry_field_key,
         d.amber_days, d.reporting_interval_days, d.schedule_mode, d.sort_order
  from public.default_check_definitions d
  where d.population = p_population
    and (p_skip is null or not (d.key = any (p_skip)) or d.locked_reason is not null)
  on conflict (company_id, population, key) do nothing;

  get diagnostics seeded = row_count;
  return seeded;
end;
$$;

-- p_skip: training_course_templates ids to leave out.
create or replace function public.seed_company_courses_except(cid uuid, p_skip uuid[])
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_count integer;
begin
  if not public.is_platform_admin() and not public.is_company_admin(cid) then
    raise exception 'seed_company_training_courses: not authorised for company %', cid;
  end if;

  insert into public.training_courses
    (company_id, name, renewal_months, mandatory, is_safeguarding, amber_days, sort_order)
  select cid, t.name, t.renewal_months, t.mandatory, t.is_safeguarding, t.amber_days, t.sort_order
  from public.training_course_templates t
  where t.active
    and (p_skip is null or not (t.id = any (p_skip)))
    and not exists (
      select 1 from public.training_courses c
      where c.company_id = cid and c.name = t.name
    );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.seed_company_form_templates(cid uuid)
returns integer language sql security definer set search_path to 'public', 'pg_temp'
as $$ select public.seed_company_forms_except(cid, null) $$;

create or replace function public.seed_company_people_checks(cid uuid)
returns integer language sql security definer set search_path to 'public', 'pg_temp'
as $$ select public.seed_company_checks_for(cid, 'people', null) $$;

create or replace function public.seed_company_service_user_checks(cid uuid)
returns integer language sql security definer set search_path to 'public', 'pg_temp'
as $$ select public.seed_company_checks_for(cid, 'service_users', null) $$;

create or replace function public.seed_company_training_courses(cid uuid)
returns integer language sql security definer set search_path to 'public', 'pg_temp'
as $$ select public.seed_company_courses_except(cid, null) $$;

-- 5. The founder's one call at creation. Unticked checks take their forms with them (unless the
-- form is locked or shared with a kept check), so a form and its check are never ticked apart.
create or replace function public.seed_company_defaults(
  cid uuid,
  p_skip_people_checks text[] default null,
  p_skip_su_checks text[] default null,
  p_skip_courses uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_skip_forms text[];
  v_forms int;
  v_people int;
  v_su int;
  v_courses int;
begin
  if not public.is_platform_admin() then
    raise exception 'Only the founder can set up a new company';
  end if;

  select array_agg(d.form_key) into v_skip_forms
  from public.default_check_definitions d
  where d.locked_reason is null
    and d.form_key is not null
    and ((d.population = 'people' and d.key = any (coalesce(p_skip_people_checks, '{}')))
      or (d.population = 'service_users' and d.key = any (coalesce(p_skip_su_checks, '{}'))))
    and not exists (
      select 1 from public.default_check_definitions k
      where k.form_key = d.form_key
        and not ((k.population = 'people' and k.key = any (coalesce(p_skip_people_checks, '{}')))
              or (k.population = 'service_users' and k.key = any (coalesce(p_skip_su_checks, '{}'))))
    );

  v_forms := public.seed_company_forms_except(cid, v_skip_forms);
  v_people := public.seed_company_checks_for(cid, 'people', p_skip_people_checks);
  v_su := public.seed_company_checks_for(cid, 'service_users', p_skip_su_checks);
  v_courses := public.seed_company_courses_except(cid, p_skip_courses);

  return jsonb_build_object('forms', v_forms, 'people_checks', v_people,
                            'su_checks', v_su, 'courses', v_courses);
end;
$$;

revoke execute on function public.seed_company_defaults(uuid, text[], text[], uuid[]),
  public.seed_company_forms_except(uuid, text[]), public.seed_company_checks_for(uuid, text, text[]),
  public.seed_company_courses_except(uuid, uuid[]) from public, anon;
grant execute on function public.seed_company_defaults(uuid, text[], text[], uuid[]),
  public.seed_company_forms_except(uuid, text[]), public.seed_company_checks_for(uuid, text, text[]),
  public.seed_company_courses_except(uuid, uuid[]) to authenticated, service_role;

-- 6. Existing companies: top up the Health Check form and the four ad hoc checks where missing.
-- Only rows that do not exist are added; nothing a company already has is touched.
with ins as (
  insert into public.forms
    (company_id, key, name, population, description, source_template_key, current_version,
     library_version, library_schema)
  select c.id, t.key, t.name, t.population, t.description, t.key, 1, t.version, t.schema
  from public.companies c
  cross join public.form_templates t
  where t.key in ('health_check', 'mentoring', 'lead_the_leader', 'one_to_ones')
    and t.status = 'active'
    and c.status <> 'deleted'
    and not exists (select 1 from public.forms f where f.company_id = c.id and f.key = t.key)
  returning id, library_schema
)
insert into public.form_versions (form_id, version, schema, status)
select id, 1, library_schema, 'published' from ins;

insert into public.check_definitions
  (company_id, population, key, name, description, form_id, recurring, frequency,
   "interval", anchor, lead_days, expiry_field_key, amber_days, reporting_interval_days,
   schedule_mode, sort_order)
select c.id, d.population, d.key, d.name, d.description,
       (select f.id from public.forms f where f.company_id = c.id and f.key = d.form_key),
       d.recurring, d.frequency, d."interval", d.anchor, d.lead_days, d.expiry_field_key,
       d.amber_days, d.reporting_interval_days, d.schedule_mode, d.sort_order
from public.companies c
cross join public.default_check_definitions d
where c.status <> 'deleted'
  and d.population = 'people'
  and d.key in ('mentoring', 'lead_the_leader', 'one_to_one', 'health_check')
on conflict (company_id, population, key) do nothing;
