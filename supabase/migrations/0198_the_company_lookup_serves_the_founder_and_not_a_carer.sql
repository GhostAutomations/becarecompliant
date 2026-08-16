/*
 * Three corrections to 0197.
 *
 * 1. THE FOUNDER GOT NOTHING, so managing as a company reproduced five of the six faults the
 *    sweep was written to fix. A platform_admin has company_id NULL by constraint, the function
 *    took no company argument, and applyManageAs shadows the profile in JavaScript only — the
 *    database still sees his own auth.uid(). The comment said he "can already read every profile
 *    directly", which is true of the TABLE and false of this FUNCTION, and the helper no longer
 *    falls back to the table. Third time this exact mistake has been made: list_company_conductors
 *    had it (fixed in 0193), list_company_staff was built with the fix, this one was not.
 *
 * 2. list_company_staff WAS A COLLEAGUE DIRECTORY FOR EVERY LOGIN. The gate was
 *    is_company_member, which is any active profile of any role, and the function returns name,
 *    email and role. So a carer whose whole app surface is /my could call it and enumerate every
 *    colleague with their email address. profiles_select gives that role one row on purpose.
 *    Gated now to the roles that actually have a picker to fill.
 *
 * 3. company_profiles_by_id HAD NO MEMBERSHIP CHECK AT ALL, only "is your company_id non null",
 *    which 0197's own text claimed otherwise about. setUserStatus disables a profile without
 *    revoking the Supabase session, so a departed user's refresh token kept working against it.
 */
create or replace function public.company_profiles_by_id(ids uuid[], cid uuid default null)
returns table (id uuid, name text, email text, role text)
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
  -- An ACTIVE member of that company, or the founder looking at it.
  if not (public.is_platform_admin() or public.is_company_member(v_company)) then
    return;
  end if;
  return query
    select p.id,
           coalesce(nullif(trim(p.full_name), ''), p.email),
           p.email,
           p.role
    from public.profiles p
    where p.company_id = v_company
      and p.id = any(ids);
end;
$$;

drop function if exists public.company_profiles_by_id(uuid[]);

/*
 * The pickers this fills belong to people who arrange work: Admins and the Registered roles, a
 * Manager or Supervisor, and On Call, who rosters the rota. A Team Member or a carer's login has
 * no picker to fill and no business holding the list.
 */
create or replace function public.list_company_staff(cid uuid default null, roles text[] default null)
returns table (id uuid, name text, email text, role text)
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
    order by 2;
end;
$$;

revoke all on function public.company_profiles_by_id(uuid[], uuid) from public, anon;
grant execute on function public.company_profiles_by_id(uuid[], uuid) to authenticated, service_role;
