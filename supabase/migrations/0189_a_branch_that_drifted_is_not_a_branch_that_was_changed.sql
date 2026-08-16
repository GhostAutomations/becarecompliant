/*
 * 0188's guard refused a legitimate reschedule, and could roll back a check completion.
 * Found in review; latent in production today, but the control that causes it is live.
 *
 * planner_bookings_branch_follows_subject recomputes branch_id from the SUBJECT on every update,
 * with no column list and no WHEN clause. Nothing keeps planner_bookings.branch_id in step with a
 * person transfer in the meantime: sync_check_instance_branch follows check_instances,
 * person_trackers and person_training, and not this table. So after a transfer a live booking
 * carries a STALE branch, and the next update of any kind quietly corrects it.
 *
 * The guard read that correction as an attempt to move the booking:
 *
 *   A carer Tim is booked to supervise transfers from Cardiff1 to Caerphilly. Tim changes the
 *   TIME of his own appointment. The branch is corrected to Caerphilly underneath him, the guard
 *   sees branch_id change, and refuses with "you cannot change who or what it is for".
 *
 * Worse, check_instances_planner_complete settles the booking when the check is completed, and
 * that update triggers the same rewrite. A conductor completing a check on a transferred carer
 * would have had the WHOLE COMPLETION rolled back: a compliance write refused with a message
 * about bookings.
 *
 * THE CLAUSE ONLY EVER PROTECTED AD-HOC BOOKINGS. Where there is a subject, the subject columns
 * are already blocked below and the branch is DERIVED from that unchanged subject, so branch_id
 * cannot move anywhere except to where it should have been. An ad-hoc booking has no subject to
 * derive from and grants no 0183 visibility, but it should still stay in the branch it was made
 * in, so the clause is kept exactly there.
 */
create or replace function public.planner_booking_conductor_may_only_move()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if public.is_platform_admin()
     or public.is_company_admin(new.company_id)
     or public.is_branch_manager(new.branch_id)
     or public.is_branch_supervisor(new.branch_id) then
    return new;
  end if;

  if old.status is distinct from 'planned' then
    raise exception 'That booking is no longer live, so it cannot be changed.';
  end if;
  if old.status is distinct from new.status and new.status not in ('completed', 'cancelled') then
    raise exception 'You can complete or cancel a booking you are carrying out, but not reopen it.';
  end if;

  if old.company_id is distinct from new.company_id
     -- Ad-hoc only. See the header: where there is a subject the branch is derived from it, and
     -- the subject is blocked on the next line.
     or (old.subject_person_id is null
         and old.subject_service_user_id is null
         and old.branch_id is distinct from new.branch_id)
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
