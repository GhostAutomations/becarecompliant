-- 0125: names of the caller's company's active users, for "who did this" dropdowns
-- (first use: the Audit form's Auditor Full Name). SECURITY DEFINER because RLS
-- only lets non-admin roles read their own profile; the function itself guards by
-- the caller's own company and returns display names only (no ids/emails beyond
-- the fallback display value).
create or replace function public.get_company_user_names()
returns table(display_name text)
language sql
security definer
set search_path = public
stable
as $$
  select distinct coalesce(nullif(trim(p.full_name), ''), p.email) as display_name
  from profiles p
  where p.company_id = (select company_id from profiles where id = auth.uid())
    and p.status = 'active'
  order by 1;
$$;

revoke all on function public.get_company_user_names() from public;
grant execute on function public.get_company_user_names() to authenticated;
