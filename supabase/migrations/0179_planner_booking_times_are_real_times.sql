-- 0179_planner_booking_times_are_real_times
--
-- Phil's dashboard on 2026-08-12: "THU 13 Aug 01:54 Care Plan Review". Nobody books a care
-- plan review for two in the morning.
--
-- ROOT CAUSE: the Planner's time picker has only ever offered a sensible grid, but it is a
-- CLIENT-side dropdown, and createBooking / updateBooking took start_time straight off the
-- form and wrote it:
--
--     const startTime = String(formData.get("start_time") ?? "").trim();
--     ...
--     start_time: startTime || null,
--
-- A dropdown is not a validator, in the same way a hidden nav item is not a permission. Nine
-- rows from 22 July, typed before the picker existed, hold 01:54, 02:53, 00:51, 23:52,
-- 01:53, 17:02, 16:02, 17:03, 19:03 and 19:01.
--
-- THE WINDOW IS 06:00 TO 22:00 (Phil, 2026-08-12), widened from the picker's old 08:00 to
-- 20:00 so an early medication call or a spot check on a night carer can be planned. Quarter
-- hours only: people book on the quarter, and 01:54 is the shape of a mistake.
--
-- The nine legacy times are CLEARED, not rounded (Phil's choice). We do not know what 01:54
-- was meant to be, and inventing 08:00 on a record that says a named person is being visited
-- is worse than admitting we do not know. The bookings survive; the Planner already renders
-- an untimed booking on its day, which many rows legitimately are.
--
-- The same rule lives in lib/planner/booking-time.ts, which the picker AND both server
-- actions use, so the dropdown, the action and the database now agree. Proven after
-- applying: an insert of 01:54 raises check_violation.

update public.planner_bookings
set start_time = null
where start_time is not null
  and (
    extract(minute from start_time) not in (0, 15, 30, 45)
    or extract(second from start_time) <> 0
    or start_time < time '06:00'
    or start_time > time '22:00'
  );

-- The rule, enforced where it cannot be bypassed by a stale form, a script, or the next
-- component somebody writes. NULL stays allowed: an untimed booking is a real thing.
alter table public.planner_bookings
  add constraint planner_bookings_start_time_is_bookable
  check (
    start_time is null
    or (
      extract(minute from start_time) in (0, 15, 30, 45)
      and extract(second from start_time) = 0
      and start_time >= time '06:00'
      and start_time <= time '22:00'
    )
  );
