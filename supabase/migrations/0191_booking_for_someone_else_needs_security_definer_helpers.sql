/*
 * 0190's policy could never pass, and it failed CLOSED, which is the only reason it was harmless.
 *
 * A policy expression is evaluated AS THE CALLER, so its subqueries are themselves subject to
 * RLS. Both of 0190's EXISTS clauses read public.profiles directly, and profiles_select does not
 * hand a manager everybody's row, so the checks came back false and every cross-branch booking
 * was refused. That is why every predicate in this schema is a SECURITY DEFINER helper rather
 * than an inline subquery: is_branch_manager, is_company_wide, is_company_on_call and the rest.
 * Written the same way here.
 */

/** Is the caller a Manager or Supervisor of this company, in any branch of it? */
create or replace function public.is_company_planner(cid uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.company_id = cid
      and p.status = 'active'
      and p.role in ('manager', 'supervisor')
  );
$$;

/** Is this profile an active member of this company? Used to check a chosen conductor is real,
 *  so a booking cannot be attached to somebody from another tenant. */
create or replace function public.is_active_company_profile(cid uuid, pid uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = pid and p.company_id = cid and p.status = 'active'
  );
$$;

drop policy if exists planner_bookings_insert_for_someone_else on public.planner_bookings;

/*
 * PEOPLE BOOK TASKS FOR EACH OTHER (Phil, 2026-08-15).
 *
 *   YOU MAY BOOK ANYONE IN YOUR COMPANY.
 *   YOU MAY NOT BOOK YOURSELF onto somebody outside the branches you run.
 *
 * That keeps the whole of 0183's argument. Being the conductor of a live booking is what grants
 * sight of that one carer's record; what 0183 Part 1 stopped was a manager GRANTING THAT TO
 * HIMSELF. Booking a colleague grants the booker nothing, and the person who does gain it had it
 * chosen for them by somebody else, which is the sentence 0183 is built on.
 *
 * Additive, so a manager booking inside her own branches, herself included, is untouched.
 *
 * The obvious follow-up is already shut: having booked a colleague onto a carer outside his
 * branches, the booker cannot then become the conductor. conductor_profile_id is in 0189's
 * blocked column list, planner_bookings_update needs is_branch_manager on that branch, and
 * planner_bookings_update_own_conductor does not apply to somebody who is not the conductor.
 */
create policy planner_bookings_insert_for_someone_else on public.planner_bookings
  for insert
  with check (
    public.is_company_planner(company_id)
    and conductor_profile_id is not null
    and conductor_profile_id <> auth.uid()
    and public.is_active_company_profile(company_id, conductor_profile_id)
  );
