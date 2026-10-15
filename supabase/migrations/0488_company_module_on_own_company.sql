-- 0488 Rota and Visits (beta): company_module_on answers only about the caller's own company
-- (or any company for the Founder). 0487's version would tell any signed in user whether another
-- company had a module switched on: only a yes or no, but tenant isolation says no. Same
-- signature, so nothing that calls it changes. Only 0487's own new function is touched.

create or replace function public.company_module_on(p_company uuid, p_module text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select m.enabled from public.company_modules m
      where m.company_id = p_company and m.module = p_module
        and (p_company = public.my_company_id() or public.is_platform_admin())),
    false);
$$;

revoke all on function public.company_module_on(uuid, text) from public, anon;
grant execute on function public.company_module_on(uuid, text) to authenticated;
