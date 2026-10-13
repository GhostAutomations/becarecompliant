# Service users in hospital: checks paused

> While a service user is in hospital their checks are paused (grey, no chasing, out of every count
> and score), and they fall due 7 days after they come back. All companies. Phil, 2026-10-13, from
> a Thistle ticket (a service user in hospital showing red and staff chased). Read before touching
> service user check status, rollups, readiness or the status control.

## The rules

- [stated] While service_status is 'hospital', every service user check still to do is PAUSED: a
  grey "Paused: in hospital" pill; left out of overdue and due soon counts, the Dashboard, the
  register and rollups, inspection readiness scores, reminders, chasers and digests. A check can
  still be completed while paused, exactly as now.
- [stated] Popup: a one off already done (a Setup Visit) stays green, done; it is not paused. A check
  with no due date stays none.
- [stated] Coming back (popup: "When it is moved from the hospital view into the main compliance
  view ask for a date they came out of hospital"): the status control asks for the date they came
  out (required, today or earlier, not before they went in). Any check due before that date + 7 days
  becomes due on that date + 7, so it shows amber; later ones keep their dates. The check's own due
  date is kept in the record (check_instances.resume_due_date sits beside it); the next completion
  clears it and the recurrence works as before. Idempotent.
- Going in records hospital_since (that day). Status changes stay audit logged, now with the previous
  status and the return date.
- [stated] Discharged (cancelled) and archived service users stay excluded as now. Respite is not
  paused. Nothing changes for People.
- [stated] Popup: the register and compliance exports include service users in hospital, their checks
  written "Paused: in hospital since [date]" (or "Paused: in hospital"), never "Compliant"; a "Paused:
  in hospital" table lists them; the footer says so. The Reg 80 late checks list shows them as paused,
  not late.
- [stated] Thistle's two service users in hospital (2026-10-13) have no known date: left blank until
  Phil supplies them ("Leave those hospital dates blank for now and I will get you the information").
- Not changed: the Cardiff PQS on time measures (not in the brief).

## Where it lives (0461)

- One place: su_check_paused and check_effective_due, used by service_user_check_status(_all), the
  rollups (rag 'paused', paused_count), get_framework_check_readiness and senior_register. Triggers on
  service_users record the dates and set resume_due_date whatever changes the status; a trigger on
  check_instances clears it on completion. lib/service-users/hospital-pause.ts mirrors the rules for
  the code that reads check_instances directly (readiness drill down, Planner) and words the pill.
