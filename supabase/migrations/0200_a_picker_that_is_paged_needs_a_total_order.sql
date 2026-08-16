/*
 * 0200. `order by 2` is not a total order.
 *
 * The staff list is read a page at a time, because PostgREST truncates at 1000 rows and says
 * nothing about it. The sort key was the display name, coalesce(nullif(trim(full_name),''),
 * email), which is not unique: two colleagues called the same thing either side of a page
 * boundary can be served twice or skipped entirely. Ties break on the primary key now.
 */
create or replace function public.list_company_staff(cid uuid default null, roles text[] default null)
returns table (id uuid, name text, email text, role text)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_own uuid;
  v_company uuid;
begin
  select me.company_id into v_own
  from public.profiles me
  where me.id = auth.uid() and me.status = 'active';

  if cid is not null and (public.is_platform_admin() or public.is_company_member(cid)) then
    v_company := cid;
  else
    v_company := v_own;
  end if;
  if v_company is null then
    return;
  end if;

  -- Only the roles with a picker to fill. A carer's login has no business holding the list.
  if not (public.is_platform_admin()
          or public.is_company_wide(v_company)
          or public.is_company_planner(v_company)
          or public.is_company_on_call(v_company)) then
    return;
  end if;

  return query
    select p.id,
           coalesce(nullif(trim(p.full_name), ''), p.email),
           p.email,
           p.role
    from public.profiles p
    where p.company_id = v_company
      and p.status = 'active'
      and (roles is null or p.role = any(roles))
    order by 2, 1;
end;
$$;
