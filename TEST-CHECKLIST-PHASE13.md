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
| 1.3 | DBS renewal section appears in the daily People email when amber or red | NOT TESTED, logged to Final Testing (needs the cron run) |

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
| 3.4 | A Supervisor cannot delete | NOT TESTED in the browser (proved by live RLS probe when built), logged to Final Testing |

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
| A1 | Card dates and chips use the register colours: red rgb(241,129,150), amber rgb(245,189,106), green rgb(67,217,154) | PASS, with one follow up: red measured 4.4:1 on the lightest part of the card, just under AA. Lightened to #f4909f (4.7 to 5.4). Retest after that deploy. |
| B1 | Book a course, cancel the booking (empty row left behind), then Delete person: goes through, the empty row cascades | PASS |
| C1 | Add a person intro and the hold login tickbox have no dashes | PASS |
| C2 | Delete this record explanation has no dashes | PASS |
| C3 | Import page "Every check is a pair" line has no dashes | PASS |
| C4 | Bulk training says "1 record" | NOT TESTED in the browser (Bevan had no carer to tick at the time); the change is one pluralisation, traced in code |

Bevan back to 0 people after the tests. Thistle untouched at 14.
