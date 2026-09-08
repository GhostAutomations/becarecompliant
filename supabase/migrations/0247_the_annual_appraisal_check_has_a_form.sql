-- 0247_the_annual_appraisal_check_has_a_form
-- The Annual Appraisal check could not be completed. At all. By anybody.
--
-- Clicking Complete on the Annual Appraisal tile bounced straight back to the record with
-- no message, because the completion page does exactly this:
--     if (!def.form_id) redirect(`/people/${id}`);
-- and the Annual Appraisal check definition had form_id NULL in BOTH companies.
--
-- WHY IT WAS NULL: seed_company_people_checks looks the form up by key --
--     (select f.id from public.forms f where f.company_id = cid and f.key = v.form_key)
-- -- and the key it asks for is 'annual_appraisal_thistle', which does not exist and has
-- not existed since the template was renamed. A subselect that finds nothing returns null
-- rather than failing, so every company seeded since has quietly had an appraisal check
-- wired to no form. Nothing complained. The tile showed a due date, the register showed a
-- due date, the matrix showed a due date, and the button did nothing.
--
-- IT IS WORSE THAN A DEAD BUTTON. The supervision cycle reads appraisal completions
-- through this same form_id (getAppraisalCompDates(id, appraisalDef?.form_id ?? null, ...)),
-- so with no form attached an appraisal could never be recorded, the three-supervisions-
-- then-an-appraisal cycle could never roll over, and Supervision 1 of the next year could
-- never fall due.
--
-- FIXED IN BOTH DIRECTIONS, for every company current and future:
--   * the seed function now asks for the key that exists, 'annual_appraisal_acme';
--   * existing appraisal checks with no form are attached to their own company's copy.
-- Only rows where form_id IS NULL are touched, so any company that has deliberately
-- pointed its appraisal at something else keeps it.
-- Applied to the becarecompliant project ONLY (ref bgrtcvyjuwopunpnudeu).

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
    ('manual_handling','Manual Handling','Annual moving and handling refresher.','manual_handling_ca',
       true,'day',365,'completion',0,null,null,null,70)
  ) as v(key,name,description,form_key,recurring,frequency,"interval",anchor,lead_days,
         expiry_field_key,amber_days,reporting_days,sort_order)
  on conflict (company_id, population, key) do nothing;

  get diagnostics seeded = row_count;
  return seeded;
end;
$$;

update public.check_definitions cd
   set form_id = f.id,
       updated_at = now()
  from public.forms f
 where cd.population = 'people'
   and cd.key = 'appraisal'
   and cd.form_id is null
   and f.company_id = cd.company_id
   and f.key = 'annual_appraisal_acme';
