-- Be Care Compliant: a company can let Managers, Registered Managers and Registered Individuals
-- write and approve policies like an Admin (Phil, 2026-10-06: "In the roles and access can we
-- have so if needed we can set it so managers and RIs have the same access as admins?" ...
-- Policies only, set by Company Admins).
--
-- companies.policy_writer_roles holds the roles ticked "Can write and approve" on the Policies
-- line of their Role access tile. Empty, the default, means Admins only, exactly as before.
-- can_write_policies() is the one rule: the policy tables' write policies and the server
-- actions both ask it, so the screen and the database cannot disagree.

alter table public.companies
  add column if not exists policy_writer_roles text[] not null default '{}';

do $$ begin
  alter table public.companies add constraint companies_policy_writer_roles_allowed
    check (policy_writer_roles <@ array['manager', 'registered_manager', 'registered_individual']::text[]);
exception when duplicate_object then null; end $$;

create or replace function public.can_write_policies(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_platform_admin()
      or public.is_company_admin(cid)
      or exists (
        select 1
          from public.profiles p
          join public.companies c on c.id = p.company_id
         where p.id = auth.uid()
           and p.company_id = cid
           and p.status = 'active'
           and p.role = any (c.policy_writer_roles)
      );
$$;
revoke all on function public.can_write_policies(uuid) from public;
grant execute on function public.can_write_policies(uuid) to authenticated;

-- Set one role on or off. Company Admins only, for their own company.
create or replace function public.set_policy_writer_role(p_role text, p_on boolean)
returns text[]
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  cid uuid;
  result text[];
begin
  select company_id into cid from public.profiles where id = auth.uid();
  if cid is null or not (public.is_company_admin(cid) or public.is_platform_admin()) then
    raise exception 'Only a Company Admin can change who writes policies';
  end if;
  if p_role not in ('manager', 'registered_manager', 'registered_individual') then
    raise exception 'That role cannot be given policy writing';
  end if;
  update public.companies
     set policy_writer_roles = case
           when p_on then (select array_agg(distinct r) from unnest(policy_writer_roles || p_role) r)
           else array_remove(policy_writer_roles, p_role) end
   where id = cid
  returning policy_writer_roles into result;
  return result;
end $$;
revoke all on function public.set_policy_writer_role(text, boolean) from public;
grant execute on function public.set_policy_writer_role(text, boolean) to authenticated;

-- The write policies ask the one rule.
drop policy if exists company_policies_write on public.company_policies;
create policy company_policies_write on public.company_policies
  for all using (public.can_write_policies(company_id)) with check (public.can_write_policies(company_id));

drop policy if exists company_policy_versions_write on public.company_policy_versions;
create policy company_policy_versions_write on public.company_policy_versions
  for all
  using (exists (select 1 from public.company_policies p
                  where p.id = company_policy_versions.policy_id and public.can_write_policies(p.company_id)))
  with check (exists (select 1 from public.company_policies p
                  where p.id = company_policy_versions.policy_id and public.can_write_policies(p.company_id)));

drop policy if exists policy_config_write on public.policy_config;
create policy policy_config_write on public.policy_config
  for all using (public.can_write_policies(company_id)) with check (public.can_write_policies(company_id));
