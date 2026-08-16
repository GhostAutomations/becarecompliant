/*
 * CORRECTING 0187, WHICH OPENED TWO HOLES OF THE EXACT KIND 0183 WAS WRITTEN TO CLOSE.
 * Both found in review before the code shipped. Keeping 0187 in place and correcting it here
 * rather than editing it, because it is already applied and the history should say what happened.
 *
 * HOLE 1: THE GUARD RAN TOO EARLY.
 *
 * 0187's trigger was BEFORE UPDATE, and BEFORE ROW triggers fire in NAME order. 0183's
 * planner_bookings_branch_follows_subject rewrites branch_id to the new subject's branch, and it
 * sorted AFTER the new guard. So the guard tested is_branch_manager(new.branch_id) while
 * new.branch_id was still the OLD branch, waved the statement through, and only then did the
 * branch move. The new permissive policy then admitted the rewritten row on
 * conductor_profile_id = auth.uid().
 *
 * The result: a manager booked to conduct anything could repoint that booking at ANY record in
 * the company from the browser console, and is_booked_conductor_for_person would then hand him
 * that person's record and their checks. That is precisely the attack 0183 Part 1 exists to stop,
 * reopened from the UPDATE side by the fix meant to be a convenience.
 *
 * THE FIX IS TO STOP DEPENDING ON TRIGGER ORDER AT ALL. An AFTER ROW trigger runs once every
 * BEFORE trigger has had its say, so branch_id is final and the question "may this person act in
 * this branch" has a true answer. Raising in an AFTER trigger aborts the statement just as well.
 *
 * HOLE 2: A CONDUCTOR COULD RESURRECT A DEAD BOOKING.
 *
 * status was not in the blocked list, and planner_bookings_select has no status filter, so a
 * conductor keeps the row for ever. 0183 states its own termination condition: "status =
 * 'planned' is the whole of 'while the booking is live'; completing or cancelling it takes the
 * visibility away again." Setting status back to 'planned' therefore restored the grant, over and
 * over, at the grantee's discretion. A grant designed to expire could no longer be revoked.
 *
 * So a conductor may only touch a booking that is LIVE, and the only status change they may make
 * is the one that ends it.
 */

drop trigger if exists planner_booking_conductor_may_only_move on public.planner_bookings;

create or replace function public.planner_booking_conductor_may_only_move()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  -- No session: service-role work, which bypasses RLS anyway. No policy on this table admits an
  -- anonymous caller, so this branch is unreachable from the outside.
  if auth.uid() is null then
    return new;
  end if;

  /*
   * Anyone who could already update this row through the ORIGINAL policy may change anything.
   * Evaluated here, after every before-trigger, so new.branch_id is the branch the row actually
   * ends up in and not the one it started with.
   */
  if public.is_platform_admin()
     or public.is_company_admin(new.company_id)
     or public.is_branch_manager(new.branch_id)
     or public.is_branch_supervisor(new.branch_id) then
    return new;
  end if;

  -- Everyone else is here only as the conductor, and only to move their own live booking.
  if old.status is distinct from 'planned' then
    raise exception 'That booking is no longer live, so it cannot be changed.';
  end if;
  if old.status is distinct from new.status and new.status not in ('completed', 'cancelled') then
    raise exception 'You can complete or cancel a booking you are carrying out, but not reopen it.';
  end if;

  if old.company_id is distinct from new.company_id
     or old.branch_id is distinct from new.branch_id
     or old.population is distinct from new.population
     or old.subject_person_id is distinct from new.subject_person_id
     or old.subject_service_user_id is distinct from new.subject_service_user_id
     or old.check_instance_id is distinct from new.check_instance_id
     or old.check_kind is distinct from new.check_kind
     or old.conductor_profile_id is distinct from new.conductor_profile_id
     or old.created_by is distinct from new.created_by then
    raise exception 'You can move or cancel a booking you are carrying out, but not change who or what it is for.';
  end if;
  return new;
end;
$$;

create trigger planner_booking_conductor_may_only_move
  after update on public.planner_bookings
  for each row execute function public.planner_booking_conductor_may_only_move();
