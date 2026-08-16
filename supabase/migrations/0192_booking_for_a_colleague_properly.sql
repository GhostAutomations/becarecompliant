/*
 * 0191 let a manager book a colleague, and got four things wrong doing it. All found in review.
 *
 * 1. ANY active profile could be nominated as the conductor, including A CARER'S OWN LOGIN.
 *    is_booked_conductor_for_person does not check a role, so "active member of the company" was
 *    enough to be handed 0183's grant. A manager could have pointed a booking at a Caerphilly
 *    carer and named a Newport carer's staff login as the conductor, and that carer would have
 *    gained read access to somebody else's record in a branch neither of them belongs to.
 *
 * 2. company_id WAS CALLER SUPPLIED AND TIED TO NOTHING. Every other write policy on this table
 *    keys off branch_id, deliberately: planner_bookings_branch_follows_subject derives it from
 *    the subject, so it is the one column that cannot be lied about. 0191 tested company_id
 *    instead, and nothing relates the two, so a booking could be written in company A pointing
 *    at a person in company B.
 *
 * 3. THE BOOKING WAS WRITE ONLY. Having booked a colleague in a branch he does not run, the
 *    booker could not see the row, move it or cancel it: select needs branch membership or being
 *    the conductor, update and delete need branch manager. A typo meant ringing an admin, which
 *    is the complaint 0187 was written to remove, reappearing on the other side of the feature.
 *
 * 4. THE HELPERS WERE EXECUTABLE BY anon. 0183 revokes its helpers from public and anon and
 *    grants them to authenticated; 0191 added no grant block, so is_active_company_profile was
 *    an unauthenticated membership oracle over /rpc/: two UUIDs in, "is that profile an active
 *    member of that company" out, across tenants, with no session.
 */

-- A conductor has to be somebody who could actually carry a check out. The same list the app
-- uses (CONDUCTOR_ROLES in lib/planner/data.ts), now enforced where it counts.
create or replace function public.is_company_conductor(cid uuid, pid uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = pid
      and p.company_id = cid
      and p.status = 'active'
      and p.role in ('company_admin', 'registered_individual', 'registered_manager', 'manager', 'supervisor')
  );
$$;

/** Does this branch belong to this company? Ties the caller-supplied company_id to the branch,
 *  which the subject trigger derives and a caller cannot forge. */
create or replace function public.is_company_branch(cid uuid, bid uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select exists (select 1 from public.branches b where b.id = bid and b.company_id = cid);
$$;

/** The people who may be nominated to carry a task out, for the Book a task form.
 *  profiles_select hands a Manager only her own row, so the form could offer nobody but herself
 *  and the whole "book it for a colleague" feature was unusable through the screen. */
create or replace function public.list_company_conductors()
returns table (id uuid, name text)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select p.id, coalesce(nullif(trim(p.full_name), ''), p.email) as name
  from public.profiles p
  where p.company_id = (select company_id from public.profiles where id = auth.uid())
    and p.status = 'active'
    and p.role in ('company_admin', 'registered_individual', 'registered_manager', 'manager', 'supervisor')
  order by 2;
$$;

drop policy if exists planner_bookings_insert_for_someone_else on public.planner_bookings;
drop function if exists public.is_active_company_profile(uuid, uuid);

create policy planner_bookings_insert_for_someone_else on public.planner_bookings
  for insert
  with check (
    public.is_company_planner(company_id)
    and public.is_company_branch(company_id, branch_id)
    and conductor_profile_id is not null
    and conductor_profile_id <> auth.uid()
    and public.is_company_conductor(company_id, conductor_profile_id)
  );

/*
 * AND YOU CAN LOOK AFTER WHAT YOU BOOKED. Additive, keyed on created_by, so the person who
 * arranged a task can see it, move it and cancel it even in a branch they do not run.
 *
 * This grants nothing extra to read a RECORD: is_booked_conductor_for_person keys on the
 * CONDUCTOR, not the creator, so the booker still cannot see the carer. They can see the booking
 * they made, which is the thing they are responsible for.
 *
 * 0189's guard still applies to them: not a branch manager, not the conductor, so every identity
 * column including conductor_profile_id is blocked. They cannot quietly become the conductor.
 */
create policy planner_bookings_select_own_creation on public.planner_bookings
  for select using (created_by = auth.uid());

create policy planner_bookings_update_own_creation on public.planner_bookings
  for update using (created_by = auth.uid()) with check (created_by = auth.uid());

create policy planner_bookings_delete_own_creation on public.planner_bookings
  for delete using (created_by = auth.uid());

-- 0183's posture, which 0191 forgot: nothing here is anonymous business.
revoke all on function public.is_company_planner(uuid) from public, anon;
revoke all on function public.is_company_conductor(uuid, uuid) from public, anon;
revoke all on function public.is_company_branch(uuid, uuid) from public, anon;
revoke all on function public.list_company_conductors() from public, anon;
grant execute on function public.is_company_planner(uuid) to authenticated, service_role;
grant execute on function public.is_company_conductor(uuid, uuid) to authenticated, service_role;
grant execute on function public.is_company_branch(uuid, uuid) to authenticated, service_role;
grant execute on function public.list_company_conductors() to authenticated, service_role;
