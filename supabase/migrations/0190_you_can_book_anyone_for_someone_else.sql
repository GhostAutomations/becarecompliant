/*
 * PEOPLE BOOK TASKS FOR EACH OTHER (Phil, 2026-08-15). First attempt; see 0191, which is the
 * one that works. Kept because it is applied, and because the reason it failed is worth reading.
 */
create policy planner_bookings_insert_for_someone_else on public.planner_bookings
  for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.company_id = planner_bookings.company_id
        and p.status = 'active'
        and p.role in ('manager', 'supervisor')
    )
    and conductor_profile_id is not null
    and conductor_profile_id <> auth.uid()
    and exists (
      select 1 from public.profiles c
      where c.id = planner_bookings.conductor_profile_id
        and c.company_id = planner_bookings.company_id
        and c.status = 'active'
    )
  );
