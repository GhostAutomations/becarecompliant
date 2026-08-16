/*
 * "UNASSIGNED" ON THE WHITEBOARD WAS A LIE (Phil, 2026-08-16).
 *
 * planner_bookings.conductor_profile_id is NOT NULL and every one of the 44 live bookings has
 * one, so a booking without somebody to carry it out cannot exist. What could not be read was
 * the NAME: the booking query fetches it through an embedded join, `conductor:profiles(full_name)`,
 * and profiles_select deliberately hands a Manager or a Supervisor only their own row. Proved as
 * Tim Mingle: `select count(*) from profiles` returns 1. So every booking belonging to a
 * colleague came back with a null name, and the chip printed "Unassigned" over a task that was
 * assigned perfectly well.
 *
 * The same lesson as 0191 and 0192, for the third time: anything that reads profiles on behalf
 * of somebody who is not an admin has to go through a SECURITY DEFINER function.
 *
 * DELIBERATELY NOT A DIRECTORY. It answers only about ids the caller already holds, only within
 * their own company, and it includes people who have since left or changed role, because a
 * booking made last month still has to say who it was for.
 */
create or replace function public.planner_conductor_names(ids uuid[])
returns table (id uuid, name text)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_company uuid;
begin
  select me.company_id into v_company from public.profiles me where me.id = auth.uid();
  if v_company is null then
    -- The founder has no company of his own. He can already read every profile, so the
    -- embedded join works for him and there is nothing to resolve here.
    return;
  end if;
  return query
    select p.id, coalesce(nullif(trim(p.full_name), ''), p.email)
    from public.profiles p
    where p.company_id = v_company
      and p.id = any(ids);
end;
$$;

revoke all on function public.planner_conductor_names(uuid[]) from public, anon;
grant execute on function public.planner_conductor_names(uuid[]) to authenticated, service_role;
