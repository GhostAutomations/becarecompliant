/*
 * 1. A CONDUCTOR CAN MOVE OR CANCEL THE BOOKING THEY ARE BOOKED FOR.
 *
 * Found by signing in as Tim Mingle, a manager of Cardiff1 and Newport1, and looking at his own
 * Planner (2026-08-15). Migration 0183 lets him SEE the Caerphilly carer he is booked to conduct
 * a supervision on, which is the whole point of it. His Planner then showed him three buttons on
 * that card: Complete check, Reschedule and Cancel. Only the first worked. The other two are
 * UPDATEs, and planner_bookings_update requires is_branch_manager(branch_id), which is false for
 * a branch he does not run. So the app booked him a job in another branch, showed him the
 * controls to manage it, and refused both. To move his own appointment he had to ring an Admin.
 *
 * ADDITIVE, the 0079 pattern: permissive policies are OR'd, so this grants without touching the
 * existing clause and without the risk of rewriting one and losing part of it.
 */
create policy planner_bookings_update_own_conductor on public.planner_bookings
  for update
  using (conductor_profile_id = auth.uid())
  with check (conductor_profile_id = auth.uid());

/*
 * ...BUT ONLY TO MOVE IT. A conductor may change WHEN, HOW LONG, ITS STATUS and the NOTES.
 * They may not change WHO or WHAT it is for, which branch it belongs to, or hand it to somebody
 * else. That last one matters most: without it, "I cannot do Tuesday" becomes "this is now
 * Sarah's problem", decided by the person who wanted rid of it.
 *
 * The with check above already stops them removing themselves as conductor. This stops the rest.
 *
 * RLS WITH CHECK is evaluated AFTER before-triggers, so this cannot be used to reach a row the
 * policies would otherwise refuse.
 */
create or replace function public.planner_booking_conductor_may_only_move()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  -- No session at all: the daily cron and other service-role work. Not a conductor, not limited.
  if auth.uid() is null then
    return new;
  end if;

  -- Anyone who could already update this row through the original policy may change anything.
  if public.is_platform_admin()
     or public.is_company_admin(new.company_id)
     or public.is_branch_manager(new.branch_id)
     or public.is_branch_supervisor(new.branch_id) then
    return new;
  end if;

  if old.company_id is distinct from new.company_id
     or old.branch_id is distinct from new.branch_id
     or old.population is distinct from new.population
     or old.subject_person_id is distinct from new.subject_person_id
     or old.subject_service_user_id is distinct from new.subject_service_user_id
     or old.check_instance_id is distinct from new.check_instance_id
     or old.check_kind is distinct from new.check_kind
     or old.conductor_profile_id is distinct from new.conductor_profile_id then
    raise exception 'You can move or cancel a booking you are carrying out, but not change who or what it is for.';
  end if;
  return new;
end;
$$;

drop trigger if exists planner_booking_conductor_may_only_move on public.planner_bookings;
create trigger planner_booking_conductor_may_only_move
  before update on public.planner_bookings
  for each row execute function public.planner_booking_conductor_may_only_move();

/*
 * 2. THE PLANNER REMEMBERS A WEEK AS WELL AS A MONTH (Phil, 2026-08-15).
 *
 * A month grid answers "how busy is August". The question somebody actually opens the Planner
 * with is "where am I going today", and a week is the shape of that question. 'calendar' becomes
 * 'month', so the saved preference keeps working and now has three states rather than two.
 */
alter table public.profiles drop constraint if exists profiles_planner_view_check;
update public.profiles set planner_view = 'month' where planner_view = 'calendar';
alter table public.profiles
  add constraint profiles_planner_view_check
  check (planner_view = any (array['month'::text, 'week'::text, 'list'::text]));
alter table public.profiles alter column planner_view set default 'month';

create or replace function public.set_planner_view(v text)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if v not in ('month', 'week', 'list') then
    raise exception 'invalid planner view';
  end if;
  update public.profiles set planner_view = v where id = auth.uid();
end;
$$;
