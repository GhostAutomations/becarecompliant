-- 0216_a_spot_check_is_monthly_by_default
-- Spot Check shipped with a 90 day default, copied from Supervision. It is an
-- unannounced observation of practice and is expected monthly, so the product
-- default is wrong for every company, not just ours. Two changes:
--   1. seed_company_people_checks seeds Spot Check at 30 days for new companies.
--      Only the spot_check interval changes; every other value is byte for byte
--      what 0085 seeded.
--   2. Existing companies still sitting on the old 90 day default are moved to 30.
--      Scoped so it cannot overwrite a deliberate setting or disturb live work:
--      only rows still at exactly 90, and only where no Spot Check has ever been
--      completed. A company that has already chosen its own interval keeps it.
-- Due dates are not touched: at the time of writing no Spot Check instance exists
-- on any company, and an interval change is applied to the next cycle by design
-- (the same as changing it in Settings, People checks).
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
     "interval", anchor, lead_days, expiry_field_key, amber_days, sort_order)
  select cid, 'people', v.key, v.name, v.description,
         (select f.id from public.forms f where f.company_id = cid and f.key = v.form_key),
         v.recurring, v.frequency, v."interval", v.anchor, v.lead_days,
         v.expiry_field_key, v.amber_days::int, v.sort_order
  from (values
    ('supervision','Supervision','Recurring one to one supervision.','supervision',
       true,'day',90,'completion',0,null,null,10),
    ('spot_check','Spot Check','Unannounced observation of practice.','spot_check',
       true,'day',30,'completion',0,null,null,30),
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

update public.check_definitions d
   set "interval" = 30
 where d.population = 'people'
   and d.key = 'spot_check'
   and d."interval" = 90
   and not exists (
     select 1
       from public.check_instances i
      where i.definition_id = d.id
        and i.last_completed_on is not null
   );
