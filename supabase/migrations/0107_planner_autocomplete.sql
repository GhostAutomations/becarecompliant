-- 0107_planner_autocomplete
-- Wire the Planner into the compliance loop. When a check_instance is completed
-- (last_completed_on set), any planner_booking linked to that instance and still
-- 'planned' is marked 'completed' automatically. Done at the DB so it fires no
-- matter which path completes the check (People action, Service User action, bulk
-- import). Also add the standard updated_at trigger to planner_bookings.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

create trigger planner_bookings_set_updated_at
  before update on public.planner_bookings
  for each row execute function public.set_updated_at();

create or replace function public.planner_complete_on_check()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.last_completed_on is distinct from old.last_completed_on
     and new.last_completed_on is not null then
    update public.planner_bookings
      set status = 'completed', updated_at = now()
      where check_instance_id = new.id
        and status = 'planned';
  end if;
  return new;
end;
$$;

create trigger check_instances_planner_complete
  after update of last_completed_on on public.check_instances
  for each row execute function public.planner_complete_on_check();
