-- 0217_supervisor_roles_ship_with_every_company
-- Supervisor and Senior Supervisor are standard domiciliary roles and were missing
-- from the seeded job-title list, so every company had to type them in by hand.
-- They now ship with the product:
--   1. seed_company_job_titles seeds eleven titles, with the two new roles sitting
--      after Field Care Supervisor and the management roles shifted down. Every
--      provisioning path (0152/0153/0154/0161) calls this one function, so this
--      covers founder-created and trial-provisioned companies alike.
--   2. Existing companies get the two new titles, and the seeded list is renumbered
--      into the new order. The renumber is scoped to rows still carrying BOTH the
--      seeded title AND its original seeded position, so a list an admin has
--      already reordered or rebuilt is left exactly as they left it. Nothing is
--      ever deleted: a company that removed a title does not get it back, and a
--      company that added its own keeps it.
-- A person's job title is stored as free text on the record, so no existing person
-- is affected by any of this.
-- Applied to the becarecompliant project ONLY (ref bgrtcvyjuwopunpnudeu).

create or replace function public.seed_company_job_titles(cid uuid)
returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_count integer;
begin
  if not public.is_platform_admin() and not public.is_company_admin(cid) then
    raise exception 'seed_company_job_titles: not authorised for company %', cid;
  end if;

  insert into public.company_job_titles (company_id, title, sort_order)
  select cid, t.title, t.ord
  from (values
    ('Care Assistant', 1),
    ('Senior Care Assistant', 2),
    ('Care Coordinator', 3),
    ('Field Care Supervisor', 4),
    ('Supervisor', 5),
    ('Senior Supervisor', 6),
    ('Team Leader', 7),
    ('Deputy Manager', 8),
    ('Registered Manager', 9),
    ('Registered Nurse', 10),
    ('Administrator', 11)
  ) as t(title, ord)
  where not exists (
    select 1 from public.company_job_titles c
    where c.company_id = cid and c.title = t.title
  );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Renumber first, while the old positions are still there to match on. Only rows
-- that are still exactly as seeded move.
update public.company_job_titles c
   set sort_order = m.new_ord
  from (values
    ('Team Leader', 5, 7),
    ('Deputy Manager', 6, 8),
    ('Registered Manager', 7, 9),
    ('Registered Nurse', 8, 10),
    ('Administrator', 9, 11)
  ) as m(title, old_ord, new_ord)
 where c.title = m.title
   and c.sort_order = m.old_ord;

-- Then add the two new roles to every existing company that does not have them.
insert into public.company_job_titles (company_id, title, sort_order)
select c.id, t.title, t.ord
from public.companies c
cross join (values
  ('Supervisor', 5),
  ('Senior Supervisor', 6)
) as t(title, ord)
on conflict (company_id, title) do nothing;
