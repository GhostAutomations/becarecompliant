# Holiday blackout dates (Phil, 2026-10-15)

People > Holidays > Blackout dates: periods when holidays can't be booked. Migration 0477.

## What Phil decided

1. **Who manages them:** Company Admin, Responsible Individual, Registered Manager and the Founder.
   Nobody else can add, change or remove one; the database refuses (save_holiday_blackout,
   delete_holiday_blackout; no direct writes).
2. **A blackout has** a first and last day (the same day for one day), a reason staff see, and the
   branches it covers (one or more, or All branches). One off dates only, no yearly repeat.
3. **Booking inside one is refused** when any day of the holiday falls in a blackout for that
   person's branch, with the dates and reason: "Holidays can't be booked 20 Dec to 2 Jan 2027:
   Christmas cover." What they typed stays in the form.
4. **Every entry point**, enforced in the database by a trigger on holiday_requests, so none can
   forget it: People > Holidays "Book holiday for"; /my "Request holiday" (and the Request holiday
   button on People > Holidays); an assigned Holiday form in /my; the public no login holiday form;
   linking an unmatched public form to a person; the Demo builder; the office's Edit dates; a
   carer's Change dates; and Approve on a request made before the blackout. The screens ask the
   same check (holiday_blackout_check) before anything is saved, because a booking stores its form
   as Evidence first.
5. **Book anyway:** Company Admin, Responsible Individual and Registered Manager may book, approve or
   change dates inside a blackout by ticking "Book anyway" with a reason. The reason, who and when
   are stamped on the holiday (blackout_override_*), shown on it, and audit logged
   (holiday.blackout_override). A Branch Manager can decline a clashing request but not approve it
   (popup 2026-10-15: "Decline only; Admin, RI or RM can approve").
6. **Existing holidays are never changed.** Approved holidays inside a new blackout stay approved;
   the check never runs on a cancel, a decline, a withdrawal, or putting back agreed dates. While a
   blackout is being made or changed, the people who already have approved or pending holiday in
   it are listed to deal with personally. Pending requests inside a blackout show a red "Clashes
   with blackout" pill.
7. **Seen before booking:** blackout days are shaded red on the holiday calendar with "No holidays"
   and the reason on hover or tap; staff in /my see a short "Holidays can't be booked" list of
   upcoming blackouts for their branch (popup 2026-10-15).
8. Blackouts never touch absences, sickness, training or anything outside holidays. There is no
   holiday allowance calculation anywhere, so no totals change.
9. Every add, change, removal and override is audit logged (holiday.blackout_added,
   holiday.blackout_changed, holiday.blackout_removed, holiday.blackout_override). Dates are London
   dates.

## How it works (0477)

- holiday_blackouts and holiday_blackout_branches (all_branches covers every branch, current and
  future). RLS: the company's people see the blackouts for their branches (their login's branches
  or their People record's branch), All branches ones, and everything for a company wide role.
- holiday_blackout_clash is the one check; holiday_blackout_message words it;
  holiday_blackout_check asks it for the screens.
- holiday_requests_blackout (BEFORE INSERT OR UPDATE OF start_date, end_date, status) runs on a new
  holiday, new dates on a live one, and a pending request's first approval.
- decide_holiday_request_anyway and amend_holiday_request_anyway call the existing functions
  unchanged, with the override reason set for that transaction only.
- Pure helpers and their tests: lib/holidays/blackouts.ts.
