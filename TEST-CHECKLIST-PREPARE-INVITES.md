# Test checklist: get invites ready for people with an email and no login (2026-10-05)

Phil: the Newport team (34, all with real email addresses) did not appear anywhere in Settings, Users. Cardiff's import had created each login held back, so Send all had something to send; Newport's import created none (Phil sends Newport invites himself). New: Settings, Users, Pending invites shows "Have an email, no login yet" by branch with a "Get N invites ready" button (with an Are you sure). It creates each Team Member login WITHOUT emailing; they then show under Pending invites as Not sent yet, and the existing Send all sends them. Sample addresses (example.com, *.invalid) are never offered. Bevan's test people all have sample addresses, so the real run is Newport; nothing is emailed until Send all.

Checked before building: Newport 34 people, 34 real addresses (gmail, hotmail, icloud, yahoo, outlook, live), no duplicates, none clash with an existing login, no email domain restriction on Thistle, and every Cardiff invite has already been sent, so Send all will only email Newport.

| # | Check | Result |
|---|-------|--------|
| P1 | Bevan, Settings, Users: no "Have an email, no login yet" box (all sample addresses) | NOT TESTED |
| P2 | Thistle: the Pending invites summary mentions 34 with an email and no login; opening it shows Newport: 34 | NOT TESTED |
| P3 | Get 34 invites ready, Yes: message "34 invites ready, not sent yet"; the box disappears; 34 Newport rows under Pending invites marked Not sent yet; Send all 34 appears | NOT TESTED |
| P4 | Database: 34 staff invites for Newport with no email sent, each Person linked to its login; no email went out | NOT TESTED |
| P5 | Pressing again (or a second tab) prepares nobody twice | NOT TESTED |
| P6 | Send all 34 (Phil, when ready): each gets the branded invite email | NOT TESTED |
