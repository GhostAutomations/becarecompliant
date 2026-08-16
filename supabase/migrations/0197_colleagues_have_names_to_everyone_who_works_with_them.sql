/*
 * ONE DEFECT, EIGHTEEN PLACES (swept 2026-08-16, after it caused three live faults in one day).
 *
 * profiles_select is:
 *
 *   (id = auth.uid()) OR is_platform_admin() OR (company_id is not null and is_company_admin(company_id))
 *
 * and is_company_admin matches role 'company_admin' ALONE. So a Manager, Supervisor, On Call,
 * Viewer, Registered Individual, Registered Manager, Team Member or staff login can read exactly
 * ONE row of profiles: their own. Every screen that names a colleague, and every picker that
 * offers one, has been quietly reading nothing for everybody but admins.
 *
 * What that actually looked like, all of it live:
 *
 *   - The On Call rota, whose entire purpose is saying who is on call, read "Unassigned" on all
 *     nine shifts to the very roles that use it.
 *   - The Absence meeting conductor dropdown was empty for a Supervisor, so a Stage meeting
 *     could not be booked at all, and bookAbsenceMeeting then refused a genuine Manager with
 *     "The meeting must be held by a Manager or Admin in your company."
 *   - WORST: the Line manager picker on a person's record collapsed to the viewer alone, and a
 *     select whose stored value is not among its options falls back to "None". A Manager opening
 *     a colleague's record and saving ANY unrelated field wrote manager_id = null. Silent data
 *     loss, on every save.
 *   - Complaint responses were attributed to "Unknown" on a regulator facing record.
 *   - Meeting invitation, rearrangement and cancellation letters were silently never sent to
 *     carers whose only address is on their login.
 *
 * TWO FUNCTIONS, because there are two questions. Both are SECURITY DEFINER, both are confined
 * to the caller's OWN company, and neither is a public directory: you must already be an active
 * member of the company to ask anything at all.
 *
 * Note what is deliberately NOT filtered in the first one: status. A booking made last month, a
 * meeting held in June and a complaint answered in March all still have to say who did them, and
 * the person may have left since. Pickers use the second, which is active only.
 */

/** Names, emails and roles for ids the caller ALREADY HOLDS, inside their own company.
 *  Replaces planner_conductor_names, which was the same idea scoped to one feature. */
create or replace function public.company_profiles_by_id(ids uuid[])
returns table (id uuid, name text, email text, role text)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_company uuid;
begin
  select me.company_id into v_company from public.profiles me where me.id = auth.uid();
  if v_company is null then
    -- The founder has no company of his own and can already read every profile directly.
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

/**
 * The colleagues a picker may offer.
 *
 * The caller passes the roles the screen wants, so one function serves the line manager picker,
 * the On Call rota, the Absence conductor list and the Reg 73 signatories without any of them
 * having to agree with each other about who counts.
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
  -- A member of that company, or the founder looking at it. Nobody else asks anything.
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
      and p.status = 'active'
      and (roles is null or p.role = any(roles))
    order by 2;
end;
$$;

drop function if exists public.planner_conductor_names(uuid[]);

revoke all on function public.company_profiles_by_id(uuid[]) from public, anon;
revoke all on function public.list_company_staff(uuid, text[]) from public, anon;
grant execute on function public.company_profiles_by_id(uuid[]) to authenticated, service_role;
grant execute on function public.list_company_staff(uuid, text[]) to authenticated, service_role;
