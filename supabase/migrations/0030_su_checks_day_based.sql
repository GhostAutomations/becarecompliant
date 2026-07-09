-- 0030_su_checks_day_based
-- The Settings > checks screen (shared with People) edits intervals in DAYS and the
-- People checks are stored day-based (frequency='day'). The SU seed stored them
-- month-based (frequency='month', interval 12/1), so the "Every (days)" field showed
-- 12 / 1 (looked tiny, and saving it would reinterpret 12 as 12 DAYS). Bring the SU
-- checks onto the same day-based convention as People: Care Plan Review / Risk
-- Assessment / Consent Review = 365 days (annual), MAR Audit = 30 days (monthly).
-- Applies to every company's SU definitions, and updates the seed function so new
-- companies are day-based too. Existing due dates are left as-is (they were within a
-- day or two of the day-based value); future completions schedule off the day value.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

update public.check_definitions set frequency = 'day', "interval" = 365
  where population = 'service_users' and key in ('care_plan_review', 'risk_assessment', 'consent_review');

update public.check_definitions set frequency = 'day', "interval" = 30
  where population = 'service_users' and key = 'mar_audit';

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
