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
| U3 | Settings, People, Audit card on Bevan reads "Every (months)" 3; Save keeps it every 3 months | PASS (still month / 3 after Save) |
| U4 | That Save dates ZZ TEST DBS Warn's never done Audit from their start date (01/01/2025 to 01/04/2025) | PASS |
| U5 | Add a new starter on Bevan: Audit due start date plus 3 months | PASS (ZZ TEST Audit Starter, start 23/09/2026, Audit 23/12/2026, Spot Check 23/10/2026, logins held) |
| U6 | Readiness page on Thistle shows the waiting line (Bevan has no readiness mapping, so Phil checked it on Thistle) | PASS (Phil's screenshot: "8 checks are waiting on an earlier check ... 5 appraisals, 1 supervision waiting for an appraisal, 2 waiting for probation"; no "no due date" line) |
| U7 | Phil saved Thistle's Audit card: still every 3 months, Damilola's Audit now due 16/12/2026; Thistle roll-up 0 no due date, 8 waiting, 106 scored | PASS (database checked) |

## Item 11, DEF-014 and DEF-015 proven live, 2026-09-23

| # | Check | Result |
|---|---|---|
| I1 | Thistle invite form (looked at only): Responsible Individual shows "All branches, this role sees and manages every branch", no picker | PASS |
| I2 | Thistle invite form: Registered Manager, Branch Manager, Supervisor, Recruiter, On Call, Viewer each open on "Choose a branch" with All branches offered, not preselected | PASS |
| I3 | Thistle Add a person, every branch: Line manager lists Charlotte Davies (RM) and Phil Davies (Admin) only; RI, Supervisors and Recruiter not offered | PASS |
| I4 | Thistle record Edit form (Janet Oladunni, not saved): the same two | PASS |
| I5 | Bevan: Branch Manager on All branches gets both active branches, Swansea primary | PASS |
| I6 | Bevan: Registered Manager on All branches and Responsible Individual get no branch rows | PASS |
| I7 | Bevan: Supervisor on Swansea gets Swansea, primary | PASS |
| I8 | Bevan seat notice, 1 active and 4 invited on 4 included: 1 extra user, £5.00 a month, billing not set up so nothing charged | PASS |
| I9 | Bevan dashboard (Business, no billing): "Billing is not set up for this account yet."; Thistle (Black): no bar | PASS |
| I10 | Settings, Branches states £7.50 per branch per month; no "later phase" copy | PASS |
| I11 | All four test invites held (no email sent) and revoked from Pending invites; profiles disabled | PASS |
| I12 | DEF-062: no dashes in the seat notice or any trial message (unit tests) | PASS |

## Items 13 and 14, DEF-009, DEF-013, DEF-018, 2026-09-23

| # | Check | Result |
|---|---|---|
| E1 | Unit tests: one account per email (4), manage as rules (2) | PASS |
| E2 | DEF-018: every received message since 05/09 has its content, none has body_error (database) | PASS |
| E3 | Founder inbox: the Google DMARC report of 23/09 says the content was collected, subject and attachments only | PASS ("No text on this message. The content was collected, so the sender sent only a subject and attachments." and "1 attachment, not downloaded.") |
| E4 | DEF-009: founder creates a test company whose Admin is an address Bevan holds (ppdavies+dbswarn): refused with the one account message, Bevan's invite untouched | PASS (ZZ Test Three created; "The Admin invite could not be sent: That email address already has an account with another company..."; the account still belongs to Bevan, no invite on ZZ Test Three) |
| E5 | DEF-013: founder manages as the test company, deletes it: back on the founder console, no ghost banner | PASS (banner "Managing as ZZ Test Three" before; after Delete no banner, and /dashboard went to the Founder console) |
| E6 | DEF-013: purge the test company; Manage as on a deleted company is refused | PASS ("This company has been deleted, so it cannot be managed. Restore it first."; ZZ Test Three and ZZ Test Two then erased with Purge now, none left) |
| E7 | DEF-063: Create a company works again (office, first branch, forms, checks, courses) | PASS (ZZ Test Three) |
| E8 | DEF-063: office rows are inserted with uses_office_address false, branches true (rolled back insert) | PASS |

## List 15, the Inspection Readiness Pack, 2026-09-23 (DEF-064)

| # | Check | Result |
|---|---|---|
| K1 | Unit tests: pack lines (5) | PASS |
| K2 | Thistle pack: no "Score" and no "Overall readiness"; cover says each theme is rated separately | PASS (Phil's pack, 24/09) |
| K3 | Thistle pack: the same three themes as the page, each with Summary, Checks, Waiting and signals matching the page | PASS (Well-being On track; Care and Support Action needed, 1 overdue, 11 due soon, 63 on track; Leadership and Management Attention with the waiting line) |
| K4 | Thistle pack: CIW notices section reads "No notices recorded." | PASS |
| K5 | Thistle pack: "Outstanding checks" tables, no dashes in headings, narrative gives no overall score | PASS, but the narrative printed markdown asterisks, ISO dates, "n/a", colours for statuses and its own title block: DEF-066 |
| K6 | Readiness page: "Outstanding checks (n)", and "No data yet" where a signal has no data | PASS after reload (Phil first saw "Outstanding items" on a page loaded before the deploy went live; reloaded 24/09: "Outstanding checks (19)" and "(5)", intro "outstanding checks", three signals "No data yet") |
| K7 | DEF-065: Inspection pack pressed once shows "Preparing the pack…" and the 20 second note, further presses do nothing, one PDF downloads | PASS (Phil, 24/09) |
| K8 | DEF-066: the next pack's narrative has no asterisks or # signs, no title or provider block of its own, dates like 17 September 2026, statuses in words, "no data yet" not "n/a" | |

## Readiness assistant, tested live on Thistle (read only), 2026-09-24 (DEF-067)

| # | Check | Result |
|---|---|---|
| A1 | Empty question: says what to do | PASS on retest: "Type a question first, or pick one of the buttons above." |
| A2 | Biggest risk: names Taiye Emmanuella Aladesuyi's overdue Spot Check (17 September 2026), plain text | PASS (11 seconds) |
| A3 | What needs booking: lists the overdue AND due soon checks by name | PASS on second retest: all 18 names from the page list, overdue first, dates as 17 September 2026, no cut short notice, no Environment, 19 seconds. It said "1 overdue, 18 due soon" where the card says 11: DEF-068 |
| A4 | Theme button (Leadership and Management): status, counts, the waiting line, signals, plain text | PASS (9 seconds) |
| A5 | Typed question the data cannot answer (staff turnover): says it does not have that information | PASS |
| A6 | Draft inspection narrative: "Drafting…", plain text, no title block, editable, note "Draft, edit before you use it" | PASS on retest: 4,451 characters, finished (eleven actions, no cut short notice), "Well-being: On track" on one line, no symbols, 27 seconds |
| A7 | Asking a question after drafting keeps the draft | PASS on retest (draft and its edit still there after What needs booking) |
| A8 | Every use recorded as AI usage for the company | PASS (usage_events, feature framework_narrative and framework_qa) |
| A9 | DEF-068: each theme's Outstanding checks list matches its count (Thistle 24/09: Care and Support 1 overdue and 11 due soon listed, not 18; Leadership and Management 1 due soon, not 5) | |
