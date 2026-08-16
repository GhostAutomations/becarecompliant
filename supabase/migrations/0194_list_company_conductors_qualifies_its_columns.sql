/*
 * RETURNS TABLE (id, name) declares OUT parameters called id and name, and they collide with
 * profiles.id inside the body: "column reference id is ambiguous", raised at the first call.
 * Every column reference is qualified now.
 */
create or replace function public.list_company_conductors(cid uuid default null)
returns table (id uuid, name text)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_company uuid;
begin
  v_company := coalesce(cid, (select me.company_id from public.profiles me where me.id = auth.uid()));
  if v_company is null then
    return;
  end if;
  if not (public.is_platform_admin()
          or public.is_company_wide(v_company)
          or public.is_company_planner(v_company)) then
    return;
  end if;
  return query
    select p.id, coalesce(nullif(trim(p.full_name), ''), p.email)
    from public.profiles p
    where p.company_id = v_company
      and p.status = 'active'
      and p.role in ('company_admin', 'registered_individual', 'registered_manager', 'manager', 'supervisor')
    order by 2;
end;
$$;

revoke all on function public.list_company_conductors(uuid) from public, anon;
grant execute on function public.list_company_conductors(uuid) to authenticated, service_role;
