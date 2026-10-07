-- 0424 — the Recruiter gets the staff list her pickers need (Phil, 2026-10-07).
--
-- Thistle's Recruiter (Lucy) opened Add a person and saw "There is nobody to report to yet" and
-- "No supervisors in this company yet": list_company_staff only answered company wide roles,
-- Managers, Supervisors and On Call, so the Line manager and Supervisors pickers came back empty
-- for the one role whose job is adding people. The Recruiter already reaches every branch of her
-- company (lib/auth/manage-scope.ts), so she is added to the gate. Nothing else changes: same
-- columns (name, email, role), same company scoping, active profiles only.

create or replace function public.list_company_staff(cid uuid default null, roles text[] default null)
returns table(id uuid, name text, email text, role text)
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
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
          or public.is_company_on_call(v_company)
          or exists (
            select 1 from public.profiles r
            where r.id = auth.uid()
              and r.company_id = v_company
              and r.role = 'recruiter'
              and r.status = 'active'
          )) then
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
$function$;
