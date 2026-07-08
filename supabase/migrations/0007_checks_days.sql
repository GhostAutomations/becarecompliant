-- 0007_checks_days
-- Phase 3 change (Phil, 2026-07-08): People checks are configured as "every X days"
-- with a simple day count, set in Settings > People. Convert the seeded catalogue
-- to day-based recurrence, rename Competency Assessment to Medication Competency
-- Assessment, and make Right to Work flag a number of days before the recorded
-- expiry (anchor=expiry, due = expiry, amber_days = days-before-expiry to flag).
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

-- Seed function: day-based defaults + renamed competency.
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
    ('appraisal','Appraisal','Annual appraisal.','appraisal',
       true,'day',365,'completion',0,null,null,20),
    ('spot_check','Spot Check','Unannounced observation of practice.','spot_check',
       true,'day',90,'completion',0,null,null,30),
    ('competency','Medication Competency Assessment','Medication competency reassessment.','competency_assessment',
       true,'day',365,'completion',0,null,null,40),
    ('dbs_renewal','DBS Renewal','Enhanced DBS review, typically every three years.','dbs_renewal',
       true,'day',1095,'completion',0,null,90,50),
    ('right_to_work','Right to Work','Flag before a time limited permission expires.','right_to_work',
       true,'day',365,'expiry',0,'rtw_expiry',30,60),
    ('manual_handling','Manual Handling Refresher','Annual moving and handling refresher.','manual_handling_refresher',
       true,'day',365,'completion',0,null,null,70),
    ('probation_review','Probation Review','One off review at the end of probation.','probation_review',
       false,'day',90,'completion',0,null,14,80)
  ) as v(key,name,description,form_key,recurring,frequency,"interval",anchor,lead_days,expiry_field_key,amber_days,sort_order)
  on conflict (company_id, population, key) do nothing;

  get diagnostics seeded = row_count;
  return seeded;
end;
$$;

-- Convert existing definitions (all companies) to day-based + rename competency.
update public.check_definitions set frequency='day', "interval"=90
  where population='people' and key in ('supervision','spot_check');
update public.check_definitions set frequency='day', "interval"=365
  where population='people' and key in ('appraisal','manual_handling');
update public.check_definitions set frequency='day', "interval"=365, name='Medication Competency Assessment'
  where population='people' and key='competency';
update public.check_definitions set frequency='day', "interval"=1095
  where population='people' and key='dbs_renewal';
update public.check_definitions set frequency='day', "interval"=90
  where population='people' and key='probation_review';
update public.check_definitions set frequency='day', "interval"=365, anchor='expiry', lead_days=0, amber_days=30
  where population='people' and key='right_to_work';

-- Rename the competency form for display everywhere (per-company copies + master).
update public.forms set name='Medication Competency Assessment' where key='competency_assessment';
update public.form_templates set name='Medication Competency Assessment' where key='competency_assessment';
