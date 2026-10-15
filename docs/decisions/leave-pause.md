# Staff on Parental Leave or Long Term Sick: checks and training paused

> While a person is on Parental Leave (stored as `mat_leave`) or Long Term Sick (`lts`) their
> checks and training are paused (grey, no chasing, out of every count and score), and fall due 7
> days after they come back to Active. Their Right to Work and DBS are never paused. All companies.
> Phil, 2026-10-15 (job "Pause checks for staff on maternity leave or long term sick"), mirroring
> the service user hospital and respite pause (hospital-pause.md, 0461, 0462). Migration 0484.
> Read before touching People check status, rollups, Readiness, the People register or training.

## The rules

- [stated] While employment_status is 'mat_leave' or 'lts', every check still to do is PAUSED: rag
  'paused', a grey "Paused" cell, the pill "Paused: on parental leave since [date]" (or "on long
  term sick"); left out of overdue and due soon counts, every rollup (record, register, branch,
  company Dashboard), Readiness, the daily report, reminders and chasers. A check can still be
  completed while paused and counts as normal. A one off already done keeps its colour; a check
  with no due date stays none.
- [stated] Popup "Pause training too": training is paused the same way (grey "Paused" on the
  Training matrix, counted in no percentage, tile, PQS training measure or reminder). A one off
  course already done stays done.
- [stated] Popup "Yes, Right to Work and DBS": the legal expiries (Right to Work expiry, DBS and
  enhanced DBS dates on person_trackers, and the "Not recorded" gaps) are never paused. They keep
  their colour on the Matrix at full strength, stay on the Dashboard and keep being chased.
- [stated] Coming back to Active asks "Date they came back from parental leave" (or "from long
  term sick"): required, today or earlier, not before the leave began. Any check due before that
  date + 7 days becomes due on that date + 7; later ones keep their dates. Stored beside the due
  date (check_instances.resume_due_date), cleared by the next completion. Training the same: a
  renewal before return + 7 counts as return + 7, and a course never done is amber "Due [return +
  7]" until then. The worked out supervision, LTL and appraisal slots on the Matrix and the record
  follow the same rule (lib/people/leave-pause.ts leaveSlot).
- [stated] Moving straight between Parental Leave and Long Term Sick keeps the pause; the "since"
  date restarts on the day of the move (as hospital and respite). Becoming a Leaver ends it.
- [stated] Popup "Today": the four people already on leave when 0484 went in (three at Thistle,
  one at Demo) have leave_since = 15 October 2026.
- [stated] They stay on the MAIN People Matrix, dimmed, with a badge beside the name: "PL" for
  Parental Leave, "LTS" for Long Term Sick. The name, status and the legal expiry cells are not
  dimmed. The "LTS & Mat Leave" view is removed (a saved link opens the Matrix); Leavers stays.
- [stated] Wording (Phil: "change mat leave the Parental Leave so it is for both male and female
  and have the bade PL, LTS will have the badge LTS"): the label everywhere is "Parental Leave";
  the stored value stays mat_leave (no identifier renamed).
- Leavers and archived records are excluded as now. The People register and compliance exports
  already list active staff only, so people on leave are not in them (no Overdue line).

## Where it lives (0484)

- One place in the database: person_check_paused and check_effective_due (0461), used by
  person_check_status(_all) (rag 'paused'; scheduled_due_date, paused, leave_since and
  employment_status added at the end), person_rollup(_all) ('paused' after amber, paused_count),
  register_person_status (0479, the same rows as the view), get_framework_check_readiness and
  readiness_check_counts, and senior_register (the resumed date). Triggers on people
  (people_leave_dates, people_leave_resume) keep the dates and set resume_due_date whatever changes
  the status; check_instances_clear_resume (0461) clears it on completion.
- lib/people/leave-pause.ts mirrors the rules for TypeScript: the badge and words, the return date
  checks, the training rule (lib/training/data.ts cellFor, lib/notifications/training.ts) and the
  worked out cycle slots (register matrix and record page). Readiness drill down and the Reg 80
  prefill list paused People checks as paused.
- Not changed: the PQS on time measures (as hospital, not in the brief); probation dates and the
  Social Care Wales renewal (tracker dates, not checks); the Office matrix tick.
