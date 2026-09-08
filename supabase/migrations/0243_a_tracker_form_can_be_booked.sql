-- 0243_a_tracker_form_can_be_booked
-- Phil, 2026-09-08, of Probation on the planner's Check dropdown: "i want it in the drop
-- down".
--
-- Book a task offered only CHECKS, because the list is built from check_instances. The
-- three TRACKER forms -- Probation Review, DBS and Right to Work -- have no check
-- definition and no instance, so none of them could ever appear, and the work they record
-- is exactly the kind a manager schedules: Thistle reviews probation monthly.
--
-- A booking now points at either a check instance or a tracker form. The constraint below
-- makes that an either/or rather than a suggestion: a booking carrying both would be a
-- task with two different forms behind it and no way to say which one clicking it opens.
-- Ad-hoc bookings carry neither, as they always have.
-- Applied to the becarecompliant project ONLY (ref bgrtcvyjuwopunpnudeu).

alter table public.planner_bookings
  add column if not exists tracker_form_key text;

alter table public.planner_bookings
  drop constraint if exists planner_bookings_one_target;

alter table public.planner_bookings
  add constraint planner_bookings_one_target
  check (check_instance_id is null or tracker_form_key is null);

comment on column public.planner_bookings.tracker_form_key is
  'The tracker form this task is for (probation_review, dbs_renewal, right_to_work), when it is not a check. Mutually exclusive with check_instance_id.';
