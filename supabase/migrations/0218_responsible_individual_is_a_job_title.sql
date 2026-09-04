-- 0218_responsible_individual_is_a_job_title
-- The Responsible Individual is a statutory role (RISCA in Wales, the equivalent
-- registered person in England) and the product already has an RI login role and
-- an RI report, but nobody could pick it as a job title without typing it in. It
-- now ships seeded, above Registered Manager. A company that does not use it can
-- delete it in Settings, People, Job titles.
-- Same rule as 0216 and 0217: the SEED changes so no future company is missing it,
-- and existing companies are moved by a scoped update that cannot overwrite a list
-- an admin has already reordered or rebuilt, and never deletes anything.
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
    ('Responsible Individual', 10),
    ('Registered Nurse', 11),
    ('Administrator', 12)
  ) as t(title, ord)
  where not exists (
    select 1 from public.company_job_titles c
    where c.company_id = cid and c.title = t.title
  );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Renumber first, while the 0217 positions are still there to match on.
update public.company_job_titles c
   set sort_order = m.new_ord
  from (values
    ('Registered Nurse', 10, 11),
    ('Administrator', 11, 12)
  ) as m(title, old_ord, new_ord)
 where c.title = m.title
   and c.sort_order = m.old_ord;

insert into public.company_job_titles (company_id, title, sort_order)
select c.id, 'Responsible Individual', 10
from public.companies c
on conflict (company_id, title) do nothing;
