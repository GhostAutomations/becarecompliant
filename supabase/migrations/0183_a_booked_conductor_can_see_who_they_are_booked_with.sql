-- =============================================================================
-- 0183 — being booked to conduct a check IS the authorisation to see that one person.
--
-- Phil, 2026-08-14, after Item 14 Phase C. Tim Mingle manages Cardiff1 and Newport1 and was
-- deliberately booked to supervise Bethan Hughes, who is Caerphilly. His Planner showed him
-- "Supervision · Ad-hoc · Caerphilly · Overdue", with no name, and "Complete check" dropped him
-- on a People register of 28 records that does not contain her. No data leaked — and no work
-- could be done either. A manager was handed a job he could not identify or complete, and
-- nothing told him or anybody else why.
--
-- The grant is deliberately NARROW: one named person, while the booking is live, because
-- somebody ELSE asked for it. Not the branch, not the register, and not for ever.
--
-- ---------------------------------------------------------------------------
-- PART 1, AND WITHOUT IT PART 2 IS A PRIVILEGE ESCALATION.
--
-- planner_bookings_insert checks is_branch_manager(branch_id) — the BOOKING's branch — and
-- nothing has ever checked that the SUBJECT belongs to that branch. Proved on 2026-08-14: as
-- Tim, an insert with branch_id = Cardiff1 and subject_person_id = a Caerphilly carer was
-- ACCEPTED. Harmless while a conductor saw nothing; the moment part 2 lands it would mean
-- "book yourself onto anyone in the company, then read their record".
--
-- Closed at the root: the branch now FOLLOWS the subject. A BEFORE trigger overwrites
-- branch_id from the person or service user, and RLS WITH CHECK is evaluated on the resulting
-- row — so an attempt to book a Caerphilly carer is rewritten to Caerphilly and then refused
-- unless the caller really does manage Caerphilly. Deriving beats validating: the two can
-- never disagree again. No existing row disagreed, so there is nothing to backfill.
-- =============================================================================

create or replace function public.planner_booking_branch_follows_subject()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_branch uuid;
begin
  if new.subject_person_id is not null then
    select branch_id into v_branch from public.people where id = new.subject_person_id;
    new.branch_id := v_branch;
  elsif new.subject_service_user_id is not null then
    select branch_id into v_branch from public.service_users where id = new.subject_service_user_id;
    new.branch_id := v_branch;
  end if;
  -- An ad-hoc booking with no subject keeps whatever branch the caller chose: there is no
  -- subject to take one from, and the insert policy already restricts it to their branches.
  return new;
end;
$$;

drop trigger if exists planner_bookings_branch_follows_subject on public.planner_bookings;
create trigger planner_bookings_branch_follows_subject
  before insert or update on public.planner_bookings
  for each row execute function public.planner_booking_branch_follows_subject();

-- ---------------------------------------------------------------------------
-- PART 2: the grant itself.
--
-- `status = 'planned'` is the whole of "while the booking is live": completing or cancelling
-- it takes the visibility away again.
--
-- `created_by is distinct from auth.uid()` is belt and braces on top of part 1. You cannot
-- grant yourself sight of somebody by booking yourself onto them. It costs nothing real:
-- anyone booking their OWN branch's carer can already see them, so they never need this.
-- ---------------------------------------------------------------------------

create or replace function public.is_booked_conductor_for_person(p_person_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select exists (
    select 1 from public.planner_bookings b
    where b.subject_person_id = p_person_id
      and b.conductor_profile_id = auth.uid()
      and b.created_by is distinct from auth.uid()
      and b.status = 'planned'
  );
$$;

create or replace function public.is_booked_conductor_for_service_user(p_service_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select exists (
    select 1 from public.planner_bookings b
    where b.subject_service_user_id = p_service_user_id
      and b.conductor_profile_id = auth.uid()
      and b.created_by is distinct from auth.uid()
      and b.status = 'planned'
  );
$$;

revoke all on function public.is_booked_conductor_for_person(uuid) from public, anon;
revoke all on function public.is_booked_conductor_for_service_user(uuid) from public, anon;
grant execute on function public.is_booked_conductor_for_person(uuid) to authenticated, service_role;
grant execute on function public.is_booked_conductor_for_service_user(uuid) to authenticated, service_role;

-- ADDITIVE policies, the pattern 0079 used: RLS ORs permissive policies together, so the
-- existing ones are not rewritten and cannot lose a clause in transcription.

drop policy if exists people_booked_conductor_select on public.people;
create policy people_booked_conductor_select on public.people
  for select using (public.is_booked_conductor_for_person(id));

drop policy if exists service_users_booked_conductor_select on public.service_users;
create policy service_users_booked_conductor_select on public.service_users
  for select using (public.is_booked_conductor_for_service_user(id));

drop policy if exists check_instances_booked_conductor_select on public.check_instances;
create policy check_instances_booked_conductor_select on public.check_instances
  for select using (
    (person_id is not null and public.is_booked_conductor_for_person(person_id))
    or (service_user_id is not null and public.is_booked_conductor_for_service_user(service_user_id))
  );

-- And they must be able to DO the check they were booked for, or the grant is decoration.

create or replace function public.can_complete_person_check(p_person_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select exists (
    select 1 from public.people pe
    where pe.id = p_person_id
      and ( public.is_platform_admin()
         or public.is_company_admin(pe.company_id)
         or public.is_branch_manager(pe.branch_id)
         or public.is_person_supervisor(pe.id)
         or public.is_booked_conductor_for_person(pe.id)
         or pe.profile_id = auth.uid() )
  );
$$;

create or replace function public.can_complete_service_user_check(p_service_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select exists (
    select 1 from public.service_users su
    where su.id = p_service_user_id
      and ( public.is_platform_admin()
         or public.is_company_admin(su.company_id)
         or public.is_branch_manager(su.branch_id)
         or public.is_service_user_supervisor(su.id)
         or public.is_booked_conductor_for_service_user(su.id) )
  );
$$;
