-- 0010_rename_manual_handling
-- Match Phil's card label: "Manual Handling Refresher" -> "Manual Handling".
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

update public.check_definitions set name = 'Manual Handling'
  where population = 'people' and key = 'manual_handling';

create or replace function public.seed_company_people_checks(cid uuid)
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
  select cid, 'people', v.key, v.name, v.description,
         (select f.id from public.forms f where f.company_id = cid and f.key = v.form_key),
         v.recurring, v.frequency, v."interval", v.anchor, v.lead_days,
         v.expiry_field_key, v.amber_days, v.sort_order
  from (values
    ('supervision','Supervision','Recurring one to one supervision.','supervision',
       true,'day',90,'completion',0,null,null,10),
    ('spot_check','Spot Check','Unannounced observation of practice.','spot_check',
       true,'day',90,'completion',0,null,null,30),
    ('appraisal','Appraisal','Annual appraisal.','appraisal',
       true,'day',365,'completion',0,null,null,20),
    ('competency','Medication Competency','Medication competency reassessment.','competency_assessment',
       true,'day',365,'completion',0,null,null,40),
    ('manual_handling','Manual Handling','Annual moving and handling refresher.','manual_handling_refresher',
       true,'day',365,'completion',0,null,null,70)
  ) as v(key,name,description,form_key,recurring,frequency,"interval",anchor,lead_days,expiry_field_key,amber_days,sort_order)
  on conflict (company_id, population, key) do nothing;

  get diagnostics seeded = row_count;
  return seeded;
end;
$$;
