-- 0232_supervision_is_planned_inside_its_deadline
-- Supervision shipped at 90 days with no reporting deadline, so it was graded against
-- its own cadence: a supervision done on day 91 counted as late, with no room at all.
-- It is now planned every 80 days against a 90 day reporting deadline (Phil, 2026-09-05,
-- for all companies), which is ten days of slack before a late visit becomes a late
-- return -- the same split the Care Plan Review got in 0231.
--
-- The buffer is not stored anywhere: it is the gap between the two numbers, worked out
-- and shown on the check tile as they are typed (lib/people/reporting-buffer.ts), so a
-- company that plans at 85 sees five days rather than a stale note saying ten.
--
-- ONLY Supervision. Annual Appraisal, Medication Competency, Manual Handling and Spot
-- Check keep no reporting deadline and stay graded on their own cadence, as they are
-- (Phil, same message).
--
-- The seed changes so no future company starts without the deadline, and existing
-- companies move only where Supervision is still on the untouched 90 with no deadline
-- set. A company that has chosen either number keeps both.
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
    ('appraisal','Annual Appraisal','Annual appraisal.','annual_appraisal_thistle',
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

update public.check_definitions
   set "interval" = 80,
       reporting_interval_days = 90,
       description = 'Recurring one to one supervision. Planned every 80 days against a 90 day reporting deadline.'
 where population = 'people'
   and key = 'supervision'
   and "interval" = 90
   and reporting_interval_days is null;
