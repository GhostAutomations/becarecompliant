-- THE AUDIT IS QUARTERLY, NOT MONTHLY.
--
-- Phil, 2026-09-16, after the first real import: eleven of Thistle's thirteen Cardiff carers
-- landed showing Audit overdue, because the audit date carried over from their Monday board
-- was 5 July and the seeded rule said every month. The office audits quarterly. A monthly
-- rule turns a normal quarter into a register full of red.
--
-- Three things, because a default that only applies to companies that do not exist yet is
-- not a default anybody feels:
--   1. the seeds, so every company created from here is quarterly;
--   2. the audit definitions already out there, where they are still on the untouched
--      monthly default, so Thistle and Bevan move too;
--   3. the OPEN INSTANCES those definitions schedule. due_date is stored, not derived, so
--      changing a rule on its own leaves every existing due date exactly where it was and
--      the artefact keeps disagreeing with the setting. Recomputed as completion plus one
--      interval, which is what nextDueDate does, and Postgres clamps the day at a month
--      boundary the same way addMonths does.
--
-- A company that has deliberately set its own audit cadence is left alone: only rows still
-- reading 'month' / 1 are moved.

-- 1. The seeds. Unchanged rows are reproduced verbatim so this reads as one whole function
--    rather than a diff nobody can check.
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
    ('audit','Audit','A quarterly audit of the care notes, and of call attendance where the period is being audited from ECM.','audit',
       true,'month',3,'completion',0,null,null,null,50),
    ('manual_handling','Manual Handling','Annual moving and handling refresher.','manual_handling_ca',
       true,'day',365,'completion',0,null,null,null,70)
  ) as v(key,name,description,form_key,recurring,frequency,"interval",anchor,lead_days,
         expiry_field_key,amber_days,reporting_days,sort_order)
  on conflict (company_id, population, key) do nothing;

  get diagnostics seeded = row_count;
  return seeded;
end;
$$;

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
     "interval", anchor, lead_days, expiry_field_key, amber_days, reporting_interval_days,
     sort_order)
  select cid, 'service_users', v.key, v.name, v.description,
         (select f.id from public.forms f where f.company_id = cid and f.key = v.form_key),
         v.recurring, v.frequency, v."interval", v.anchor, v.lead_days,
         v.expiry_field_key, v.amber_days::int, v.reporting_days::int, v.sort_order
  from (values
    ('setup','Setup Visit','The visit where the office team collects everything needed to start care. Due before the package starts.','setup',
       false,'day',-1,'completion',0,null,null,null,5),
    ('care_plan_review','Care Plan Review','Recurring review of the care plan, covering risk, medication and consent. Planned every 80 days against a 90 day reporting deadline, and sooner on change of need.','care_plan_review',
       true,'day',80,'completion',0,null,null,90,10),
    ('audit','Audit','A quarterly audit of the care notes, and of call attendance where the period is being audited from ECM.','audit_su',
       true,'month',3,'completion',0,null,null,null,20)
  ) as v(key,name,description,form_key,recurring,frequency,"interval",anchor,lead_days,
         expiry_field_key,amber_days,reporting_days,sort_order)
  on conflict (company_id, population, key) do nothing;

  get diagnostics seeded = row_count;
  return seeded;
end;
$$;

-- 2 and 3. The companies already here, and the due dates their definitions schedule.
do $mig$
declare
  v_defs uuid[];
begin
  -- The ids are taken BEFORE the update, so only definitions this migration actually moves
  -- are rescheduled. A company already on a quarterly audit is not touched at all.
  select array_agg(id) into v_defs
    from public.check_definitions
   where key = 'audit' and recurring and frequency = 'month' and "interval" = 1;

  if v_defs is null then return; end if;

  update public.check_definitions
     set "interval" = 3,
         description = replace(description, 'A monthly audit', 'A quarterly audit')
   where id = any(v_defs);

  update public.check_instances ci
     set due_date = (ci.last_completed_on + interval '3 months')::date,
         updated_at = now()
   where ci.definition_id = any(v_defs)
     and ci.active
     and ci.last_completed_on is not null;
end
$mig$;