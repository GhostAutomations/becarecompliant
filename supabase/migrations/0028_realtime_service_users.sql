-- 0028_realtime_service_users
-- Phase 4 realtime + backfill. The Service User register must update LIVE like the
-- People register (Phil, 2026-07-09): add the SU record + tracker + assignment
-- tables to the supabase_realtime publication (REPLICA IDENTITY FULL was set in
-- 0027). check_instances is already published (Phase 3), so a completion touching a
-- SU check reaches subscribers. Also backfills the default SU check catalogue for
-- any existing tenant that already has the seeded SU Forms, so the register shows
-- an accurate RAG picture without re-running founder seeding.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

alter publication supabase_realtime add table public.service_users;
alter publication supabase_realtime add table public.service_user_trackers;
alter publication supabase_realtime add table public.service_user_assignments;

-- Correct the SU check seed function: amber_days is all-null in the VALUES list, so
-- it must be cast to int explicitly (an all-null literal column is inferred as text).
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
    ('care_plan_review','Care Plan Review','Recurring review of the care plan, at least annually and sooner on change of need.','care_plan_review',
       true,'month',12,'completion',0,null,null,10),
    ('risk_assessment','Risk Assessment','Recurring review of the service user risk assessments.','risk_assessment',
       true,'month',12,'completion',0,null,null,20),
    ('mar_audit','MAR Audit','Medication administration record audit.','mar_audit',
       true,'month',1,'completion',0,null,null,30),
    ('consent_review','Consent Review','Review of consent and capacity to the care and support provided.','consent_review',
       true,'month',12,'completion',0,null,null,40)
  ) as v(key,name,description,form_key,recurring,frequency,"interval",anchor,lead_days,expiry_field_key,amber_days,sort_order)
  on conflict (company_id, population, key) do nothing;

  get diagnostics seeded = row_count;
  return seeded;
end;
$$;

-- Idempotent backfill of the SU check catalogue for existing companies (matches the
-- seed_company_service_user_checks defaults). Only inserts where the company already
-- has the matching Form; on conflict does nothing.
insert into public.check_definitions
  (company_id, population, key, name, description, form_id, recurring, frequency,
   "interval", anchor, lead_days, expiry_field_key, amber_days, sort_order)
select c.id, 'service_users', v.key, v.name, v.description,
       (select f.id from public.forms f where f.company_id = c.id and f.key = v.form_key),
       v.recurring, v.frequency, v."interval", v.anchor, v.lead_days,
       v.expiry_field_key, v.amber_days::int, v.sort_order
from public.companies c
cross join (values
  ('care_plan_review','Care Plan Review','Recurring review of the care plan, at least annually and sooner on change of need.','care_plan_review',
     true,'month',12,'completion',0,null,null,10),
  ('risk_assessment','Risk Assessment','Recurring review of the service user risk assessments.','risk_assessment',
     true,'month',12,'completion',0,null,null,20),
  ('mar_audit','MAR Audit','Medication administration record audit.','mar_audit',
     true,'month',1,'completion',0,null,null,30),
  ('consent_review','Consent Review','Review of consent and capacity to the care and support provided.','consent_review',
     true,'month',12,'completion',0,null,null,40)
) as v(key,name,description,form_key,recurring,frequency,"interval",anchor,lead_days,expiry_field_key,amber_days,sort_order)
where exists (
  select 1 from public.forms f where f.company_id = c.id and f.key = v.form_key
)
on conflict (company_id, population, key) do nothing;
