-- 0031_service_user_setup_check
-- New Service User "Setup" check (Phil, 2026-07-10): a one-off setup completed at
-- the start of a care package, shown on the register as Setup Due + Setup Completed
-- and counting towards the compliance RAG. It is a form-completion check like the
-- others (completing the Setup form stores immutable evidence and stamps Setup
-- Completed). Setup Due anchors on the package start date plus a configurable day
-- offset held on the check definition (interval, in days). Default -1 = one day
-- before the package starts. Non-recurring, so completing it clears the due date.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

-- 0. Allow a negative interval so a non-recurring check can be DUE before its anchor
-- (Setup due one day before the package start = interval -1). Zero is still forbidden.
-- Recurring intervals stay positive (guarded in the UI + the recurrence engine).
alter table public.check_definitions drop constraint if exists check_definitions_interval_check;
alter table public.check_definitions
  add constraint check_definitions_interval_check check ("interval" is null or "interval" <> 0);

-- 1. Master template (founder-curated), so new companies seed it automatically.
insert into public.form_templates (key, name, population, description, schema) values
(
  'setup', 'Setup', 'service_users',
  'Initial setup of a care package: care plan, risk assessments and consent in place at the start of care.',
  $sch$
  {
    "schemaVersion": 1,
    "sections": [
      {
        "id": "setup",
        "title": "Care setup",
        "fields": [
          { "key": "setup_date", "type": "date", "label": "Date setup completed", "required": true },
          { "key": "setup_by", "type": "short_text", "label": "Completed by", "required": true },
          { "key": "care_plan_in_place", "type": "radio", "label": "Care plan in place", "required": true,
            "options": [ { "value": "yes", "label": "Yes" }, { "value": "no", "label": "No" } ] },
          { "key": "risk_assessments_in_place", "type": "radio", "label": "Risk assessments in place", "required": true,
            "options": [ { "value": "yes", "label": "Yes" }, { "value": "no", "label": "No" } ] },
          { "key": "consent_obtained", "type": "radio", "label": "Consent obtained", "required": true,
            "options": [ { "value": "yes", "label": "Yes" }, { "value": "no", "label": "No" } ] },
          { "key": "notes", "type": "long_text", "label": "Notes" },
          { "key": "signature", "type": "signature", "label": "Signature" }
        ]
      }
    ]
  }
  $sch$
)
on conflict (key) do nothing;

-- 2. Backfill the Setup form (+ published version) for existing companies that
-- already have the SU starter forms.
insert into public.forms (company_id, key, name, population, description, source_template_key, current_version)
select c.id, 'setup', t.name, 'service_users', t.description, 'setup', 1
from public.companies c
cross join (select name, description from public.form_templates where key = 'setup') t
where exists (select 1 from public.forms f where f.company_id = c.id and f.key = 'care_plan_review')
on conflict (company_id, key) do nothing;

insert into public.form_versions (form_id, version, schema, status)
select f.id, 1, t.schema, 'published'
from public.forms f
cross join (select schema from public.form_templates where key = 'setup') t
where f.key = 'setup'
  and not exists (select 1 from public.form_versions fv where fv.form_id = f.id);

-- 3. Add the Setup check definition to the SU seed (sort_order 5, before Care Plan
-- Review at 10), non-recurring, day offset default -1, linked to the Setup form.
create or replace function public.seed_company_service_user_checks(cid uuid)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare
  seeded int;
begin
  if not (public.is_platform_admin() or public.is_company_admin(cid)) then
    raise exception 'Not allowed to seed checks for this company';
  end if;

  insert into public.check_definitions
    (company_id, population, key, name, description, form_id, recurring, frequency,
     "interval", anchor, lead_days, expiry_field_key, amber_days, sort_order)
  select cid, 'service_users', v.key, v.name, v.description,
         (select f.id from public.forms f where f.company_id = cid and f.key = v.form_key),
         v.recurring, v.frequency, v."interval", v.anchor, v.lead_days,
         v.expiry_field_key, v.amber_days::int, v.sort_order
  from (values
    ('setup','Setup','One off setup completed at the start of a care package.','setup',
       false,'day',-1,'completion',0,null,null,5),
    ('care_plan_review','Care Plan Review','Recurring review of the care plan, at least annually and sooner on change of need.','care_plan_review',
       true,'day',365,'completion',0,null,null,10),
    ('risk_assessment','Risk Assessment','Recurring review of the service user risk assessments.','risk_assessment',
       true,'day',365,'completion',0,null,null,20),
    ('mar_audit','MAR Audit','Medication administration record audit.','mar_audit',
       true,'day',30,'completion',0,null,null,30),
    ('consent_review','Consent Review','Review of consent and capacity to the care and support provided.','consent_review',
       true,'day',365,'completion',0,null,null,40)
  ) as v(key,name,description,form_key,recurring,frequency,"interval",anchor,lead_days,expiry_field_key,amber_days,sort_order)
  on conflict (company_id, population, key) do nothing;

  get diagnostics seeded = row_count;
  return seeded;
end;
$$;

-- Backfill the Setup definition for existing companies (linked to their Setup form).
insert into public.check_definitions
  (company_id, population, key, name, description, form_id, recurring, frequency,
   "interval", anchor, lead_days, expiry_field_key, amber_days, sort_order)
select c.id, 'service_users', 'setup', 'Setup',
       'One off setup completed at the start of a care package.',
       (select f.id from public.forms f where f.company_id = c.id and f.key = 'setup'),
       false, 'day', -1, 'completion', 0, null, null, 5
from public.companies c
where exists (select 1 from public.forms f where f.company_id = c.id and f.key = 'setup')
on conflict (company_id, population, key) do nothing;

-- 4. Backfill the Setup check instance for existing Service Users: due = package
-- start date + the day offset (default -1 = the day before).
insert into public.check_instances
  (company_id, branch_id, definition_id, record_type, service_user_id, due_date)
select su.company_id, su.branch_id, cd.id, 'service_user', su.id,
  case when su.package_start_date is not null
       then (su.package_start_date + make_interval(days => cd.interval))::date
       else null end
from public.service_users su
join public.check_definitions cd
  on cd.company_id = su.company_id and cd.population = 'service_users' and cd.key = 'setup'
where not exists (
  select 1 from public.check_instances ci
  where ci.service_user_id = su.id and ci.definition_id = cd.id
)
on conflict (definition_id, service_user_id) where service_user_id is not null do nothing;
