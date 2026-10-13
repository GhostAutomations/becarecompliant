# Absence stage history (the absences popup bracket)

> Absence stages worked out at the date of each absence, every stage kept until its meeting is
> held, and the wider View absence popup with one bracket. Behind a per company switch, on for
> Bevan only to start (Phil, 2026-10-13, from a Thistle ticket). Read before touching absence
> counting, stages, booking stages or the View absence popup.

## Why

- [stated] Thistle raised it: a carer reached Stage 1 on 29 Aug and Stage 2 on 1 Oct (rolling 6
  months, Stage 1 at 3, Stage 2 at 4). The popup called her first two absences "Outside the window"
  because the window was measured back from today, so the stages she had reached disappeared while
  her Stage 1 meeting was booked and not held. "Every stage reached must stay visible with its own
  status until dealt with."
- Note (2026-10-13): during the investigation Thistle discounted two of her absences and cancelled
  the meeting, so on the live data she now reaches no stage. Her original pattern is kept for the
  unit tests and the Bevan test people.

## The switch

- [stated] Behind a per company switch, ON for Bevan only. With it off every screen, count, stage,
  alert, reminder, report and export behaves exactly as before. Turning it on later is one switch,
  no code change.
- Built as `companies.absence_stage_history` (0457), the same pattern as `complaints_v2` (on for
  Bevan first). Founder only (`companies_guard_founder_columns`). Not `framework_enabled`: Thistle
  already has that on. New companies start off.
- To turn it on for a company, in the Supabase SQL editor:
  `update public.companies set absence_stage_history = true where name = 'Thistle Care Ltd';`
- Only the trigger point method. Bradford companies keep the old count.
- One way in: `lib/absence/stage-switch.ts` reads the switch and `lib/absence/logic.ts`
  `resolveAbsenceStatus` works the status out; off, it is `deriveAbsenceStatus` unchanged.

## The rules (switch on)

- [stated] The window is measured back from the date of EACH absence. A stage is reached on the date
  of the absence that brings the count inside the window up to its trigger.
- [stated] Every stage reached is tracked separately with one status: Due (no meeting booked),
  Pending (meeting booked, not held), Dealt with (meeting held and recorded).
- [stated] A stage never expires because time passes. A higher stage does not hide a lower one:
  "Stage 1 Pending · Stage 2 Due".
- [stated] Booking defaults to the lowest Due stage; the manager can change it (to another Due
  stage). With nothing Due, the next stage can still be booked early, as before.
- [stated] Only absences outside the window AND not part of any Due or Pending stage are labelled
  "Outside the window".
- [stated] Discounting rules unchanged: discounted absences never count.
- [stated] 2026-10-13 popup (a): a higher stage meeting does NOT deal with a lower stage. Every stage
  needs its own meeting.
- [stated] 2026-10-13 popup (b): a stage CANNOT be closed without a meeting.
- [stated] 2026-10-13 popup: the count alone decides. The 7 October rule (a new absence after a
  meeting makes the next stage due) does not apply with the switch on.
- [stated] 2026-10-13 popup: once Dealt with, the same stage is reached again only after the count
  has fallen below its trigger and climbs back to it.
- A meeting dealing with a stage must be at that stage and held on or after the day it was reached.
  A declined booking is not a booking (as before). A multi day absence counts when any day of it is
  inside the window; one starting exactly on the window's first day counts.
- The meeting form, the invitation, the outcome letter and the drafted questions list the absences
  that reached the stage, even those that have since left today's window.
- The Absence page also lists a person whose absences have all left today's window while a stage of
  theirs is still open. Archived records and leavers stay out.

## The popup (switch on)

- [stated] About twice as wide on desktop, full width on phones. One line per stage reached at the
  top ("Stage 1 · reached 29 Aug 2026 · [Pending] meeting booked 20 Oct 2026"). One bracket, a bar
  down the left joining every absence counting towards a Due or Pending stage. One card per absence
  on two lines: dates, days and a status pill; then the controls side by side. Pills: "Stage N
  reached" on the absence that reached it, "Counts" on the others that count.
- [stated] Outside the popup (Absence cards, the person's record) every open stage shows compactly:
  "Stage 1 Pending · Stage 2 Due". The Dashboard tile's "Invites to send" counts a person with a Due
  stage even when another stage is booked.
