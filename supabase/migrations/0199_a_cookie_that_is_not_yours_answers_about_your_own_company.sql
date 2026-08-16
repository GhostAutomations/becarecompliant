/*
 * 0199. Two holes left by 0198, both of which end in the failure this whole sweep exists to
 * remove: a lookup that returns NOTHING and looks like data.
 *
 * 1. A WRONG cid EMPTIED THE ANSWER. The helper defaults cid from the manage-as cookie, which is
 *    a signed token with a 30 minute life that nothing clears on sign out or sign in. On a shared
 *    browser the founder signs out, a Manager signs in inside that window, and every name lookup
 *    in the app now asks about the founder's last tenant. is_company_member says no, the function
 *    returns zero rows, and the rota says nobody is on call. So: a cid the caller has no claim to
 *    is IGNORED, not obeyed and not fatal, and the answer is about their own company. There is no
 *    escalation in that: their own company is all they could ever read.
 *
 * 2. THE FOUNDER'S OWN NAME CAME BACK EMPTY. platform_admin_has_no_company means his company_id
 *    is NULL, so `p.company_id = v_company` never matched him and a complaint response he wrote
 *    while managing as a tenant read "Unknown" on a regulator-facing record. Anyone may resolve
 *    their own id.
 *
 * Also: the caller's own company is now read with status = 'active'. setUserStatus disables a
 * profile without revoking the Supabase session, so a departed user's refresh token was still
 * good against these two functions.
 */
create or replace function public.company_profiles_by_id(ids uuid[], cid uuid default null)
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

  return query
    select p.id,
           coalesce(nullif(trim(p.full_name), ''), p.email),
           p.email,
           p.role
    from public.profiles p
    where p.id = any(ids)
      and (p.company_id = v_company or p.id = auth.uid());
end;
$$;

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
    order by 2;
end;
$$;
