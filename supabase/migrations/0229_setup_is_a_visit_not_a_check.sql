-- 0229_setup_is_a_visit_not_a_check
-- Phil, 2026-09-04: "Setup is not a 'check' its where a member of the office team goes
-- out and collects all the information to be able to start care."
--
-- The mechanics were already right - a form completed once, due before the package
-- starts, producing Evidence, shown as Setup Due and Setup Completed on the register -
-- so this renames it rather than remodelling it. It is called the Setup Visit, and its
-- description says what it is instead of describing a one off check.
--
-- The seed changes so no future company is given the old name, and existing companies
-- move only where the name is still exactly the seeded "Setup". A company that has
-- renamed it keeps its own word.
--
-- NOTE for whoever renames a check next: the Planner whiteboard matches checks BY NAME
-- (components/planner/whiteboard-board.tsx), so a rename that does not move that list
-- silently drops the check off the board. It has been moved in the same commit.
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
     "interval", anchor, lead_days, expiry_field_key, amber_days, sort_order)
  select cid, 'service_users', v.key, v.name, v.description,
         (select f.id from public.forms f where f.company_id = cid and f.key = v.form_key),
         v.recurring, v.frequency, v."interval", v.anchor, v.lead_days,
         v.expiry_field_key, v.amber_days::int, v.sort_order
  from (values
    ('setup','Setup Visit','The visit where the office team collects everything needed to start care. Due before the package starts.','setup',
       false,'day',-1,'completion',0,null,null,5),
    ('care_plan_review','Care Plan Review','Recurring review of the care plan, covering risk, medication and consent, at least quarterly and sooner on change of need.','care_plan_review',
       true,'day',90,'completion',0,null,null,10)
  ) as v(key,name,description,form_key,recurring,frequency,"interval",anchor,lead_days,expiry_field_key,amber_days,sort_order)
  on conflict (company_id, population, key) do nothing;

  get diagnostics seeded = row_count;
  return seeded;
end;
$$;

update public.check_definitions
   set name = 'Setup Visit',
       description = 'The visit where the office team collects everything needed to start care. Due before the package starts.'
 where population = 'service_users'
   and key = 'setup'
   and name = 'Setup';
