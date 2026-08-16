/*
 * 0192 PUT ITS GUARDS ON THE NEW POLICY AND LEFT THE OLD ONE ALONE, which is the path every
 * booking in the product actually takes. Permissive policies are OR'd, so a rule added to one of
 * them is a rule you can walk around by using the other. Found in review; live and reachable.
 *
 *   A manager books inside her OWN branch, which satisfies planner_bookings_insert on
 *   is_branch_manager alone, and names A CARER'S OWN STAFF LOGIN as the conductor.
 *   is_booked_conductor_for_person checks no role, so that carer gains read access to a
 *   colleague's whole compliance record.
 *
 * THE RULE MOVES OUT OF THE POLICIES AND INTO TRIGGERS. A policy can be OR'd around; a trigger
 * cannot. These two say what is true of a planner booking on EVERY path, whichever policy
 * admitted it, and they will still be true of the next policy somebody adds:
 *
 *   - the conductor must be somebody who could actually carry a check out;
 *   - the branch must belong to the company the row claims;
 *   - created_by is whoever is signed in, not whatever the request said.
 *
 * The last one matters because 0192 made created_by an AUTHORISATION column (select, update and
 * delete all key on it) while leaving it caller-writable, so a booking could be handed to any
 * auth user, in any tenant, by putting their id in the request.
 */

-- Whoever is signed in is the creator. Not a request field.
create or replace function public.planner_booking_creator_is_the_caller()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  -- Service-role work (seeding, the cron) has no session and sets this itself.
  if auth.uid() is not null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists planner_booking_creator_is_the_caller on public.planner_bookings;
create trigger planner_booking_creator_is_the_caller
  before insert on public.planner_bookings
  for each row execute function public.planner_booking_creator_is_the_caller();

/*
 * AFTER, so branch_id has been settled by planner_bookings_branch_follows_subject before this
 * asks whether it belongs to the company. The same lesson as 0188: never depend on trigger name
 * order for a security check.
 */
create or replace function public.planner_booking_is_coherent()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if not public.is_company_branch(new.company_id, new.branch_id) then
    raise exception 'That booking names a branch that does not belong to that company.';
  end if;
  if new.conductor_profile_id is not null
     and not public.is_company_conductor(new.company_id, new.conductor_profile_id) then
    raise exception 'A task can only be given to somebody who carries checks out: an Admin, a Registered role, a Manager or a Supervisor.';
  end if;
  return new;
end;
$$;

drop trigger if exists planner_booking_is_coherent on public.planner_bookings;
create trigger planner_booking_is_coherent
  after insert or update on public.planner_bookings
  for each row execute function public.planner_booking_is_coherent();

/*
 * The conductor list has to work for the founder managing as a company, and must not be a staff
 * directory for everybody else.
 *
 * A platform_admin has company_id NULL by constraint, so 0192's version returned ZERO rows for
 * him: the founder managing as a company opened Book a task to an empty required dropdown and
 * could not submit. applyManageAs shadows the profile in JavaScript only; the database still
 * sees his own auth.uid(), so the function has to take the company as an argument the way every
 * other loader does.
 *
 * And it is gated. profiles_select deliberately shows a non-admin only their own row; without a
 * gate this SECURITY DEFINER function handed any signed-in carer the name and email of every
 * manager, supervisor and admin in the company.
 */
drop function if exists public.list_company_conductors();

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
