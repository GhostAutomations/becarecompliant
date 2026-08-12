-- 0180_planner_no_double_booking
--
-- Phil, 2026-08-12: "look at akrams planner he is tripple booked on the 13th of august at
-- 10am, that shouldnt be allowed". Three 30 minute bookings, same conductor, same minute,
-- accepted without a murmur. Nothing anywhere checked whether anyone was already busy.
--
-- THREE clashes are refused, not one. Phil's steer: "it also needs to check if the person /
-- service user is booked as well so another person can book something at the same time" -
-- the obvious hole being that a SECOND manager could book the same carer at the same time,
-- and a conductor-only rule would wave that through.
--
--   conductor            one person cannot carry out two tasks at once
--   subject_person       a carer cannot be supervised by two people at once
--   subject_service_user a service user cannot be visited twice at once
--
-- ANY OVERLAP counts, not just an identical start (Phil's choice), so a 90 minute audit at
-- 10:00 blocks a supervision at 10:30. The windows are half open: 10:00 for 30 minutes and
-- 10:30 for 30 minutes are back to back, not a clash. Getting that wrong would refuse an
-- ordinary morning of visits.
--
-- NOT enforced for:
--   * untimed bookings   - they have no window, so they cannot overlap anything. Many
--                          bookings are deliberately untimed and forcing a time here would
--                          make people invent one.
--   * cancelled bookings - a cancelled visit is not occupying anybody.
--
-- Same belt and braces as the time rule (0179): lib/planner/actions.ts gives a sentence
-- naming who is already busy, and these constraints make it impossible whatever route the
-- write takes. Proven after applying: same conductor refused, DIFFERENT conductor with the
-- same carer refused, a 10:15 partial overlap refused, and 10:30 back to back plus an
-- untimed booking both still accepted.

create extension if not exists btree_gist;

-- The existing clash is the three test bookings Phil made at 13:36 today. Two are cancelled
-- rather than deleted, so the record of what happened survives and the constraints' WHERE
-- clause ignores them.
update public.planner_bookings
set status = 'cancelled',
    notes = coalesce(notes || E'\n', '') ||
            'Cancelled 2026-08-12: duplicate of another 10:00 booking, cleared so the no double booking rule could be applied.'
where id in ('8597f15b-b305-4731-8a5f-91222528e9ca', '6942e04e-9e8c-4dd0-985a-aec3a4911cf3');

alter table public.planner_bookings
  add constraint planner_bookings_conductor_not_double_booked
  exclude using gist (
    conductor_profile_id with =,
    tsrange(
      scheduled_date + start_time,
      scheduled_date + start_time + make_interval(mins => duration_minutes)
    ) with &&
  )
  where (
    start_time is not null
    and duration_minutes is not null
    and conductor_profile_id is not null
    and status <> 'cancelled'
  );

alter table public.planner_bookings
  add constraint planner_bookings_person_not_double_booked
  exclude using gist (
    subject_person_id with =,
    tsrange(
      scheduled_date + start_time,
      scheduled_date + start_time + make_interval(mins => duration_minutes)
    ) with &&
  )
  where (
    start_time is not null
    and duration_minutes is not null
    and subject_person_id is not null
    and status <> 'cancelled'
  );

alter table public.planner_bookings
  add constraint planner_bookings_service_user_not_double_booked
  exclude using gist (
    subject_service_user_id with =,
    tsrange(
      scheduled_date + start_time,
      scheduled_date + start_time + make_interval(mins => duration_minutes)
    ) with &&
  )
  where (
    start_time is not null
    and duration_minutes is not null
    and subject_service_user_id is not null
    and status <> 'cancelled'
  );
