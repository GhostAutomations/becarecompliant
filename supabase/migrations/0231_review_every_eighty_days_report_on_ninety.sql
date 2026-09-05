-- 0231_review_every_eighty_days_report_on_ninety
-- Phil, 2026-09-05: "they are 90 days for reporting but the reviews are set to be
-- completed every 80 days."
--
-- Two different numbers doing two different jobs, which is exactly what
-- reporting_interval_days was added for (0059, the Cardiff PQS return):
--   * "interval" is the OPERATIONAL cadence - when the office plans to do the review.
--   * reporting_interval_days is the REGULATORY deadline the on time report grades
--     against. It does not touch the register or the scheduling.
-- Reviewing every 80 days against a 90 day deadline is the ten days of slack that keeps
-- a late visit from becoming a late RETURN. Setting one number to 90 would have made
-- every review that slipped by a day count as late.
--
-- This also explains the 80 that 0230 removed: it was the operational cadence hiding in
-- the wrong place (a company column, Complex branches only) rather than a wrong number.
-- It now sits on the check itself, where both views read it.
--
-- The seed changes so no future company starts on one number, and existing companies
-- move only where the review is still on the untouched 90 with no reporting deadline
-- set. A company that has chosen either number keeps both.
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
       true,'day',80,'completion',0,null,null,90,10)
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
       description = 'Recurring review of the care plan, covering risk, medication and consent. Planned every 80 days against a 90 day reporting deadline, and sooner on change of need.'
 where population = 'service_users'
   and key = 'care_plan_review'
   and "interval" = 90
   and reporting_interval_days is null;
