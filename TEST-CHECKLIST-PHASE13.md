# Test checklist, Phase 13 (Operation Thistle)

Browser tests run in Chrome on 2026-09-22 against the deployed build (DEF-042, dpl_BLgcjyRiTmNjwiNdKNqgFNpGm2LP).
Read only checks on Thistle Care Ltd. Anything that wrote data ran on Bevan Care Ltd (Phil's test company,
admin ppdavies+cob), using a throwaway record "ZZ TEST Delete Me" with a non sendable email (no login, nothing
sent). The record was deleted at the end; Bevan is back to 0 people and Thistle is untouched at 14.

## Item 1, DEF-039: DBS renewal colours and chasing

| # | Check | Result |
|---|---|---|
| 1.1 | Register: DBS certificate date drawn plain, Enhanced DBS coloured (Thistle, all green) | PASS |
| 1.2 | Register: Enhanced DBS 45 days out draws amber (Bevan, ZZ TEST) | PASS (rag-cell-amber) |
| 1.3 | DBS renewal section appears in the daily People email when amber or red | OUTSTANDING, set up for the 7am run on 23/09/2026: ZZ TEST DBS Amber (renewal 06/11/2026) and ZZ TEST DBS Red (01/09/2026) on Bevan; the People report goes to ppdavies+cob. |

## Item 2, DEF-042: both DBS dates on the carer card

| # | Check | Result |
|---|---|---|
| 2.1 | Every card shows "DBS" (plain) and "DBS renewal" (coloured) | PASS |
| 2.2 | DBS renewal 45 days out draws amber on the card | PASS |
| 2.3 | In date count excludes the certificate date (Taiye 6/7, overdue spot check the only miss) | PASS |
| 2.4 | "14 days" filter narrows: 11 of 14 on Thistle; Asim excluded though his DBS certificate is in the past | PASS |
| 2.5 | No dashes in the Add a person document hints | PASS |

## Item 5, DEF-041: training completed on a date that has not happened

| # | Check | Result |
|---|---|---|
| 5.1 | Cell dialog, completion tomorrow: refused, names the date | PASS |
| 5.2 | Cell dialog, renewal only 31/01/2028 on a 12 month course: refused, names the derived completion 31/01/2027 | PASS |
| 5.3 | Cell dialog, completed 01/03/2026 with a 3 year renewal on a 12 month course: ALLOWED (override survives) | PASS (row written 2026-03-01 / 2029-03-01) |
| 5.4 | Refusals wrote nothing (only the 5.3 row existed afterwards) | PASS |
| 5.5 | Bulk "Record training" with a future date: refused | PASS |
| 5.6 | Import preview: a recurring renewal too far out AND a one off future date both refused on the row; "Import 0 training records" | PASS |
| 5.7 | Cancel a booking by clearing the date on a record with no dates: still works | PASS (booked_for cleared) |

## Item 3, DEF-040: Delete person

| # | Check | Result |
|---|---|---|
| 3.1 | Refused while training exists, with a sentence naming what is in the way | PASS |
| 3.2 | Allowed once training is cleared; person, tracker, training and migrated history gone; audited; redirected to People | PASS |
| 3.3 | The button does nothing until the name is typed | FAIL: focus the button with the keyboard and press Enter, the confirmation opens with the name untyped. The arming is a CSS pointer-events style only, the button is not disabled, and the server never checks the typed name. FIXED as DEF-043, retest after deploy. |
| 3.4 | A non Admin cannot delete | PASS (2026-09-23, Bevan, signed in as ZZ Test Supervisor, ppdavies+bccsup): Manage record opens with details, transfer and working status, and NO Delete this record section. A hand built delete request carrying the correct name was refused: Vercel logged POST 303 from the serverless action (the Admin guard's redirect to the dashboard), the record is still there, and no person.deleted is in the audit log. |

## Found while testing, queued to fix after these tests (Phil, 2026-09-22)

- Card RAG colours (the "soft" shades) are too pale: an overdue date reads as white at a glance.
- 3.3 above: the type the name guard is bypassable.
- A cancelled booking leaves an empty not_done training row, which then counts as a training record and blocks Delete person ("2 training records ... evidence") although it holds nothing.
- Dashes in customer copy: Add a person intro, the hold login checkbox, the Delete this record explanation, the import page ("Every check is a pair - the date it was due").
- Bulk training dialog says "1 records".

## Retest after DEF-043 to DEF-046 (deployed dpl_H1U2RHfoPPi2JDUoTjFxnxJ1DVxy), 2026-09-22, Bevan

| # | Check | Result |
|---|---|---|
| D1 | Name box empty: Delete this record is disabled and cannot take keyboard focus | PASS |
| D2 | Name box empty: Tab and Enter do nothing | PASS |
| D3 | A hand built submit with no name is refused by the server ("Type ZZ TEST Delete Me in the box...") | PASS |
| D4 | Typing the name (in lower case) arms the button red, and the delete goes through | PASS |
| A1 | Card dates and chips use the register colours: red rgb(241,129,150), amber rgb(245,189,106), green rgb(67,217,154) | PASS, with one follow up: red measured 4.4:1 on the lightest part of the card, just under AA. Lightened to #f4909f (4.7 to 5.4). Retested live: rgb(244,144,159). PASS |
| B1 | Book a course, cancel the booking (empty row left behind), then Delete person: goes through, the empty row cascades | PASS |
| C1 | Add a person intro and the hold login tickbox have no dashes | PASS |
| C2 | Delete this record explanation has no dashes | PASS |
| C3 | Import page "Every check is a pair" line has no dashes | PASS |
| C4 | Bulk training says "1 record" | PASS: one course reads "1 carer ticked, 1 record.", two read "2 records." (nothing submitted) |

Bevan back to 0 people after the tests. Thistle untouched at 14.

## Standing rule from 2026-09-22

Final Testing (Phase 11) is passed. Nothing untested is logged there any more: it is tested now,
in the same piece of work (Phil: "we are passed final testing so it needs to be tested now").

## Found while setting up 3.4, not yet fixed (2026-09-23)

- The user popup in Settings, Roles, users and access goes stale after "Enable this login" or "Disable this login": the database changes, the popup still shows the old status and the old button. Close and reopen shows the truth. A manager would press it again.
- BCC has no "Forgot password" on the sign in page, and an Admin cannot send a reset to an active user. A manager who forgets their password can only get back in through the Founder in Supabase.

## Password reset, sign out and email, 2026-09-23 (Phil stopped testing here)

| # | Check | Result |
|---|---|---|
| R1 | Admin "Send password reset" sends the branded email; audited | PASS |
| R2 | Reset from the email sets a password and signs out other devices (iPhone reset, Mac signed out) | PASS (database: only the iPhone slot left) |
| R3 | Expired or fake reset link lands on "That reset link has expired" | PASS |
| R4 | Forgot form gives the same answer for an address with no account, sends nothing | PASS |
| R5 | One computer plus one phone at the same time (Mac 07:42, iPhone 07:43) | PASS (database) |
| R6 | Sign out on the iPhone leaves the Mac signed in (DEF-052) | NOT TESTED after the fix. Phil stopped testing. |
| R7 | A reset link only opens the reset form; Back to sign in shows sign in; saving signs out everywhere and lands on the password changed message (DEF-053) | NOT TESTED. Phil stopped testing. |
| R8 | Two minute wait with countdown on the forgot page, no wait for Admins (DEF-054) | NOT TESTED. |
| R9 | /login/reset opened directly on a normal session says expired (DEF-051) | NOT TESTED in the browser; logic covered by tests. |
| 1.3 | Bevan 7am People email carries the DBS sections and one line rows | SENT at 07:00 (notification_log, "2 overdue, 0 due in 14 days"); the email itself not yet looked at. |
| 1.4 | Bevan People email at 7am: DBS sections and one line rows | PASS (Phil's screenshots) |
| D1 | Supervisor digest matches the People report: wide card, Name, Task, Date, Planned on one line, grey branch headings (DEF-055) | Preview PASS from Thistle's live checks (not sent). Real email: next 7am run to a Thistle Supervisor, Phil to screenshot. |

## Paper upload, 2026-09-23 (DEF-056), tested live on Bevan

| # | Check | Result |
|---|---|---|
| P1 | Registered Manager, Supervisor and another company's Admin refused by the database (submit_paper_evidence), Thistle untouched (rolled back) | PASS |
| P2 | Future date and a page from outside the upload's own folder refused by the database | PASS |
| P3 | Complete page shows "Done on paper? Upload it instead" to an Admin; swaps to date, supervision number, files | PASS |
| P4 | Screen refuses no date and a .docx; lists pages with sizes and Remove | PASS |
| P5 | Paper Supervision 1 dated 10/02/2026 (photo + PDF): tile Done 10 Feb, Supervision 2 due 01 May (80 days), both pages stored with size and fingerprint | PASS |
| P6 | Evidence screen: "Completed on paper on 10 February 2026", Uploaded by / Uploaded at, photo drawn, PDF listed | PASS |
| P7 | Evidence PDF: Completed on paper section, Uploaded by / at, photo embedded | PASS |
| P8 | Spot check 01/06/2026 moves the check (next due 01 Jul); older one 01/03/2026 goes to history and moves nothing, with its own banner | PASS |
| P9 | Evidence history on the record: three rows, Paper copy pill, newest first by the paper date | PASS |
| P10 | Service User: Care Plan Review 1 by paper dated 15/04/2026, Review 2 due 04 Jul (80 days) | PASS |
| P11 | Setup Visit offers no paper upload | PASS |
| P12 | Abandoned upload (save cut off on purpose after the page was uploaded) is removed by the retention run | PASS: Phil ran /api/cron/retention 09:49 (200). The pending row and the abandoned page are gone; the 5 pages of the 4 filed uploads are untouched. |
| P13 | Clean up | Test person made a leaver and archived, test Service User cancelled and archived, the Team Member invite to ppdavies+papertest revoked (login disabled). The 4 test uploads stay as evidence on the archived records. |

## Older completion never moves a check back, 2026-09-23 (DEF-057), tested live on Bevan

| # | Check | Result |
|---|---|---|
| B1 | Database: complete_check with a date before the one on file leaves the check alone; a later date moves it (rolled back) | PASS (01/06, due 01/07 unchanged by 01/02; moved to 01/09 by 01/09) |
| B2 | One to One filled in on screen dated 01/08/2026: check completed 01/08, green banner | PASS |
| B3 | Second One to One dated 01/05/2026: Evidence stored (2 rows), check still 01/08, "added to the history" banner, audit check.completed_history | PASS |
| D1 | Supervisor digest in the new layout, real 7am email | Scheduled check 07:20 24/09, then Phil's screenshot |

## Item 6, future Safeguarding dates on Thistle, 2026-09-23

| # | Check | Result |
|---|---|---|
| S1 | Phil corrected both in the app (Training, cell dialog): Asim Riaz completed 21/12/2025, renews 21/12/2026; Mohammad Mahbubul Islam completed 29/01/2026, renews 29/01/2027 | PASS (database checked) |
| S2 | No training on Thistle left with a completion date in the future | PASS (0 rows) |

## Leaving, 2026-09-23 (DEF-058), tested live on Bevan (ZZ TEST Leaver A)

| # | Check | Result |
|---|---|---|
| L1 | Choosing Leaver opens every question, all required; button reads Save leaver | PASS |
| L2 | Saving with answers missing is refused by the server ("Choose the reason for leaving.") | PASS |
| L3 | Past date 20/09/2026 with Other and a competitor: leaver at once, left 20/09, answers shown on the record, invite revoked, login disabled, audit "login closed" | PASS |
| L4 | Back to Active: 9 checks live again, old login unlinked, leaving row marked rejoined; Send login re-invited them (new invite pending) | PASS |
| L5 | Future date 10/10/2026: stays active, amber "Leaving on 10 October 2026" note; setting Active calls it off (row cancelled) | PASS |
| L6 | Today's date: stays active, row planned. Date moved to 22/09 on the test row, Phil ran the retention job: leaver dated 22/09, invite revoked, login disabled, audit "Became a leaver at the end of 2026-09-22, as planned; login closed" | PASS |
| L7 | Who can read the answers: the leaver's own login 0 rows, another company's Admin 0 rows, Bevan's Admin all 3 (rolled back) | PASS |
| L8 | Leaver's login card offers no invite; "Send it again" only while an invite is waiting | PASS after deploy: leaver card "Closed, their login closed when they left", no button; back to Active shows "Invite them", not "Send it again". Test person left as a leaver (22/09). |

## DBS date warnings, 2026-09-23 (DEF-059), tested live on Bevan

| # | Check | Result |
|---|---|---|
| W1 | DBS form on ZZ TEST Leaver A (start 05/01/2026), certificate 01/02/2026, renewal 01/02/2032: "Are these DBS dates right?" lists the more than 3 years reason | PASS |
| W2 | Save anyway on the DBS form saves the dates as entered (tracker 2026-02-01 / 2032-02-01) | PASS |
| W3 | Add person, "They already work here", start 01/01/2025, certificate 01/06/2025, renewal 01/06/2031: both reasons shown, nothing saved | PASS |
| W4 | Go back and check closes the panel; submitting again shows it again | PASS |
| W5 | Save anyway on Add person creates the record with the dates as entered (ZZ TEST DBS Warn, logins held, tracker 2025-06-01 / 2031-06-01) | PASS |
| W6 | Import preview with the same bad dates shows amber "Check DBS:" with both reasons; preview cleared, nothing imported | PASS |
| W7 | Unit tests: 5 in dbs-check.test.ts, including the real Thistle rows | PASS |

## Checks with no due date, 2026-09-23 (DEF-060, DEF-061)

| # | Check | Result |
|---|---|---|
| U1 | Readiness roll-up on Thistle (database, read only): 1 no due date, 5 waiting for Supervision 3, 1 for an appraisal, 2 for probation, 105 scored as before | PASS |
| U2 | Unit tests: waiting sentence (4), dated from start (2), interval unit (3) | PASS |
| U3 | Settings, People, Audit card on Bevan reads "Every (months)" 3; Save keeps it every 3 months | |
| U4 | That Save dates ZZ TEST DBS Warn's never done Audit from their start date (01/01/2025 to 01/04/2025) | |
| U5 | Add a new starter on Bevan: Audit due start date plus 3 months | |
| U6 | Readiness page on Thistle shows 1 no due date and the waiting line | |
