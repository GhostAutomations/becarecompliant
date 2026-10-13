# Service users in hospital or on respite: checks paused

> While a service user is in hospital or on respite their checks are paused (grey, no chasing, out of
> every count and score), and they fall due 7 days after they come back to Active. All companies.
> Phil, 2026-10-13, from a Thistle ticket (a service user in hospital showing red and staff chased);
> respite added the same day ("Let's do the same for respite", 0462). Read before touching service
> user check status, rollups, readiness or the status control.

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
  paused (superseded the same day, see Respite below). Nothing changes for People.
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

## Respite (0462, Phil 2026-10-13: "Let's do the same for respite")

- [stated] Every rule above applies to respite exactly as to hospital: paused while on respite
  ("Paused: in respite since [date]"), out of every count, score, chaser and digest; included in the
  exports and the Reg 80 list as paused; the date asked for on coming back to Active ("Date they
  came back from respite"), then due 7 days after it.
- [stated] Popup "Stay paused, date restarts": moving straight between hospital and respite keeps the
  pause without a break; the wording follows the new place and its "since" date restarts on the day
  of the move. No return date is asked for and nothing moves until they go back to Active.
- The 0461 column names stay (hospital_since, hospital_returned_on); they hold the dates for either
  place. service_status is added to the end of the status views so the pill can name the place.
- Nobody was on respite at any company when this went in, so no record changed colour.

## Found while testing (Phil, 2026-10-13, popup "Fix it now")

- [stated] The register and compliance exports listed completed one off checks (Setup Visits) as
  Overdue for every company (18 on Bevan, 66 on Thistle). They now use the same done is done rule
  as the Dashboard and the daily report (lib/notifications/reportable.ts reportableCheck).
