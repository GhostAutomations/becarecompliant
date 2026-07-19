-- 0085_seed_people_checks_align_forms
-- Realign seed_company_people_checks so new companies link the appraisal, medication
-- and manual-handling checks to the SAME forms Thistle uses (the detailed Annual
-- Appraisal template + the Competency Assessment variants), not the generic templates
-- that are now archived in the founder library. Only the three form_key values change
-- (appraisal: appraisal -> annual_appraisal_thistle; competency: competency_assessment
-- -> medication_ca; manual_handling: manual_handling_refresher -> manual_handling_ca);
-- everything else is unchanged. Applied to the becarecompliant project ONLY
-- (ref bgrtcvyjuwopunpnudeu).
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
     "interval", anchor, lead_days, expiry_field_key, amber_days, sort_order)
  select cid, 'people', v.key, v.name, v.description,
         (select f.id from public.forms f where f.company_id = cid and f.key = v.form_key),
         v.recurring, v.frequency, v."interval", v.anchor, v.lead_days,
         v.expiry_field_key, v.amber_days::int, v.sort_order
  from (values
    ('supervision','Supervision','Recurring one to one supervision.','supervision',
       true,'day',90,'completion',0,null,null,10),
    ('spot_check','Spot Check','Unannounced observation of practice.','spot_check',
       true,'day',90,'completion',0,null,null,30),
    ('appraisal','Annual Appraisal','Annual appraisal.','annual_appraisal_thistle',
       true,'day',365,'completion',0,null,null,20),
    ('competency','Medication Competency','Medication competency reassessment.','medication_ca',
       true,'day',365,'completion',0,null,null,40),
    ('manual_handling','Manual Handling','Annual moving and handling refresher.','manual_handling_ca',
       true,'day',365,'completion',0,null,null,70)
  ) as v(key,name,description,form_key,recurring,frequency,"interval",anchor,lead_days,expiry_field_key,amber_days,sort_order)
  on conflict (company_id, population, key) do nothing;

  get diagnostics seeded = row_count;
  return seeded;
end;
$$;
