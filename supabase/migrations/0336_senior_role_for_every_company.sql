-- 0336_senior_role_for_every_company
-- Phil, 2026-09-29: "we need a senior role ... the job title is just senior. Some people might
-- call it senior carer, but let's just call it senior." Popup: it starts from Supervisor, and
-- every company gets it, existing and new.
--
-- A company role (0314) is a NAMED NARROWING of a built-in role: people on it keep
-- profiles.role = 'supervisor', which is what RLS reads, and the Senior role can only switch
-- departments OFF. Which ones Phil will say next; until then a Senior reaches exactly what a
-- Supervisor does.
--
-- seed_company_default_roles(cid) is the default role list, called when a company is created
-- (the founder's Create company and Provision from a trial request both call it) and here for
-- every company that already exists. Idempotent: the unique index on (company_id, lower(name))
-- means a company that already has a Senior, however it is capitalised, keeps its own.
--
-- Applied to the becarecompliant Supabase project ONLY (bgrtcvyjuwopunpnudeu).

create or replace function public.seed_company_default_roles(cid uuid)
returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_count integer;
begin
  if not public.is_platform_admin() and not public.is_company_admin(cid) then
    raise exception 'seed_company_default_roles: not authorised for company %', cid;
  end if;

  insert into public.company_roles (company_id, name, base_role)
  select cid, r.name, r.base_role
  from (values ('Senior', 'supervisor')) as r(name, base_role)
  where not exists (
    select 1 from public.company_roles c
    where c.company_id = cid and lower(btrim(c.name)) = lower(r.name)
  );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.seed_company_default_roles(uuid) from public, anon;
grant execute on function public.seed_company_default_roles(uuid) to authenticated;

-- Every company that exists now (direct insert: the guard only matters for the RPC path).
insert into public.company_roles (company_id, name, base_role)
select c.id, 'Senior', 'supervisor'
from public.companies c
where not exists (
  select 1 from public.company_roles r
  where r.company_id = c.id and lower(btrim(r.name)) = 'senior'
);
