/*
 * Two corrections to 0193, both the same mistake in opposite directions: a guard that fires on
 * things nobody touched, and a guard that does not fire at all.
 *
 * 1. VALIDATING A VALUE NOBODY CHANGED.
 *
 * planner_booking_is_coherent had no column list, so every update re-asked whether the EXISTING
 * conductor is still a conductor. They stop being one the moment they leave: setUserStatus
 * disables a departed user, changeUserRole can demote to on_call or team_member, and neither
 * cancels or reassigns their live bookings. From then on that booking could not be moved,
 * cancelled or completed by anybody, and worse:
 *
 *   check_instances_planner_complete settles the booking when the check is completed, so
 *   COMPLETING A SUPERVISION WOULD HAVE FAILED, aborting a compliance write with a message
 *   about who a task may be given to.
 *
 * There is no reassign path in the product, and this trigger had no bypass, so the only ways out
 * were re-enabling a leaver's login or hand-written SQL. Exactly the failure 0189 was written to
 * remove, reintroduced by its neighbour a few migrations later.
 *
 * The invariant that matters is about the moment a conductor or a branch is SET. Validate then.
 *
 * 2. created_by WAS ONLY PINNED ON INSERT.
 *
 * 0193 says created_by is whoever is signed in rather than whatever the request said, and three
 * policies now key on it, but the trigger was BEFORE INSERT only. A branch manager updating a
 * booking in her own branch takes 0189's bypass, so she could hand the row to any auth user,
 * including one in another tenant, who would then be able to see and cancel it.
 *
 * created_by is a fact about the past. It is set once and never changes.
 */
create or replace function public.planner_booking_creator_is_the_caller()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if tg_op = 'INSERT' then
    -- Service-role work (seeding, the cron) has no session and sets this itself.
    if auth.uid() is not null then
      new.created_by := auth.uid();
    end if;
  else
    new.created_by := old.created_by;
  end if;
  return new;
end;
$$;

drop trigger if exists planner_booking_creator_is_the_caller on public.planner_bookings;
create trigger planner_booking_creator_is_the_caller
  before insert or update on public.planner_bookings
  for each row execute function public.planner_booking_creator_is_the_caller();

create or replace function public.planner_booking_is_coherent()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  -- Only when the branch was actually set or moved. A branch corrected underneath the row by
  -- planner_bookings_branch_follows_subject after a staff transfer is not somebody changing it.
  if tg_op = 'INSERT' or new.branch_id is distinct from old.branch_id then
    if not public.is_company_branch(new.company_id, new.branch_id) then
      raise exception 'That booking names a branch that does not belong to that company.';
    end if;
  end if;

  -- Only when a conductor is being CHOSEN. A booking whose conductor has since left the company
  -- is a booking to reassign, not a row to freeze: it must still be completable and cancellable.
  if new.conductor_profile_id is not null
     and (tg_op = 'INSERT' or new.conductor_profile_id is distinct from old.conductor_profile_id)
     and not public.is_company_conductor(new.company_id, new.conductor_profile_id) then
    raise exception 'A task can only be given to somebody who carries checks out: an Admin, a Registered role, a Manager or a Supervisor.';
  end if;
  return new;
end;
$$;
