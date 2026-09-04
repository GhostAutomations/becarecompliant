-- 0227_the_care_plan_review_is_the_service_user_check
-- Service Users shipped with four recurring checks: Care Plan Review, Risk Assessment,
-- MAR Audit and Consent Review. Three of them have no column on the Service User
-- register (Phil, 2026-09-04) -- SU_REGISTER_COLUMNS carries Setup and the reviews and
-- nothing else -- so they were checks that could go overdue where nobody would see it.
-- Risk, medication and consent are reviewed AS PART OF the care plan review, which is
-- how the service actually works, so the review is the check.
--
--   * Risk Assessment, MAR Audit and Consent Review stop being seeded.
--   * Care Plan Review moves from 365 days to 90: quarterly, not the annual minimum.
--
-- Existing companies: a definition with NO history at all (no check instance, no
-- migrated completion, no framework mapping) is DELETED, because it never happened.
-- One with any history is DEACTIVATED instead -- active = false keeps the record of what
-- was completed against it, and check_instances cascades on delete, so deleting one
-- with history would erase the evidence trail with it. Care Plan Review moves to 90 only
-- where it is still on the untouched 365.
--
-- The three FORMS are untouched and stay in the library. Nothing is destroyed: a company
-- that wants any of them back adds a check type pointing at the same published form
-- from Settings, Service users.
--
-- Consequence worth knowing: seed_requirement_map maps check keys to CQC/CIW themes, so
-- a framework-enabled company no longer gets those three as separate contributors. No
-- company has the framework enabled today and no map rows exist.
-- Applied to the becarecompliant project ONLY (ref bgrtcvyjuwopunpnudeu).

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
     "interval", anchor, lead_days, expiry_field_key, amber_days, sort_order)
  select cid, 'service_users', v.key, v.name, v.description,
         (select f.id from public.forms f where f.company_id = cid and f.key = v.form_key),
         v.recurring, v.frequency, v."interval", v.anchor, v.lead_days,
         v.expiry_field_key, v.amber_days::int, v.sort_order
  from (values
    ('setup','Setup','One off setup completed at the start of a care package.','setup',
       false,'day',-1,'completion',0,null,null,5),
    ('care_plan_review','Care Plan Review','Recurring review of the care plan, covering risk, medication and consent, at least quarterly and sooner on change of need.','care_plan_review',
       true,'day',90,'completion',0,null,null,10)
  ) as v(key,name,description,form_key,recurring,frequency,"interval",anchor,lead_days,expiry_field_key,amber_days,sort_order)
  on conflict (company_id, population, key) do nothing;

  get diagnostics seeded = row_count;
  return seeded;
end;
$$;

-- Deactivate the ones that carry history: their evidence must survive.
update public.check_definitions d
   set active = false
 where d.population = 'service_users'
   and d.key in ('risk_assessment', 'mar_audit', 'consent_review')
   and (
     exists (select 1 from public.check_instances i where i.definition_id = d.id)
     or exists (select 1 from public.migrated_completions m where m.definition_id = d.id)
     or exists (select 1 from public.requirement_evidence_map r where r.check_definition_id = d.id)
   );

-- Remove the ones that never happened.
delete from public.check_definitions d
 where d.population = 'service_users'
   and d.key in ('risk_assessment', 'mar_audit', 'consent_review')
   and not exists (select 1 from public.check_instances i where i.definition_id = d.id)
   and not exists (select 1 from public.migrated_completions m where m.definition_id = d.id)
   and not exists (select 1 from public.requirement_evidence_map r where r.check_definition_id = d.id);

-- Quarterly, where the annual default was never changed.
update public.check_definitions
   set "interval" = 90,
       description = 'Recurring review of the care plan, covering risk, medication and consent, at least quarterly and sooner on change of need.'
 where population = 'service_users'
   and key = 'care_plan_review'
   and "interval" = 365;
