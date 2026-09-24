# Test checklist: Return to Work on the dashboard

| # | Check | Result |
|---|-------|--------|
| R1 | Bev (Company Admin) dashboard: "Return to Work due" lists ZZ TEST DBS Warn three times, overdue first, with dates and a red Overdue pill | PASS 2026-09-24 (three rows, Overdue 06/08, 23/08, 13/09, branch Swansea; panel level with its three neighbours at 333px) |
| R2 | Pressing a row opens the Absence page with that Return to Work form already open, and the address no longer carries ?rtw= | PASS 2026-09-24 ("Return to Work for ZZ TEST DBS Warn" open on the 03/08 absence; address /people/absence) |
| R3 | Closing the form and refreshing does not open it again | PASS 2026-09-24 |
| R4 | Thistle (Phil) dashboard: Janet Oladunni, Due 24/09/2026 (Overdue from 25/09) | PASS on the data read as Thistle's Admin (Janet Oladunni, due 24/09, the only one). Not seen on Thistle's screen, Chrome is signed in as Bev |
| R5 | Empty state: a company with none reads "No Return to Work interviews are waiting." | By trace only: no company with none has been opened |
| R6 | Supervisor sees only their branch; Team Member and Viewer see no panel | PASS on the data (Swansea Supervisor reads the 3 Swansea ones) and by trace (the panel is drawn only for the listed roles). SEEN 2026-09-24 signed in as ZZ Test Supervisor: the panel lists the three Swansea Return to Works. PASS |
