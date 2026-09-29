# Test checklist: Senior role (0338, 0339, 0340)

Tested on Bevan Care Ltd with a ZZ TEST carer login moved to Senior.

| # | Check | Result |
|---|-------|--------|
| SR1 | Settings, Users, Role access: a Senior tile with People and Service users, and the company's Checks listed under each, all ticked | Pass 2026-09-29 (Claude in Chrome): On Call, Senior, Viewer order; all three tiles 382px |
| SR2 | Unticking People greys its Checks; ticking it again ticks them all | Pass 2026-09-29 (Claude in Chrome) |
| SR3 | Untick one Check, Save, reload: it stays unticked, the rest stay ticked | Pass 2026-09-29 (Phil) after two fixes: the boxes now keep the saved ticks after Save, with no flash |
| SR4 | Change a ZZ TEST carer login to Senior: not counted as a paid user | Pass 2026-09-29: ZZ TEST Senior changed to Senior in Users; Billing shows 2 seats (Bev Admin, ZZ Test Supervisor) |
| SR5 | As the Senior: menu shows My area, People, Service Users only | Pass 2026-09-29 (Claude in Chrome as ZZ TEST Senior): menu is My area and People (Service users unticked); /dashboard sends them to /my |
| SR6 | People list: names by branch, ticked Checks under each with status, due date, Complete; no Checks against their own name | Pass 2026-09-29 after redesign: names as gold buttons, only records with a ticked form, own name left off (first version rejected by Phil as a wall of rows) |
| SR7 | The unticked Check is not on the list, and its Complete link typed by hand goes back to the list | Pass 2026-09-29: the unticked Supervision's Complete link typed by hand lands back on /people |
| SR8 | Complete a Spot Check as the Senior: service user choice offered, Evidence stored, back to the list with the green banner, next due date moved | Pass 2026-09-29: ZZ TEST Carer One opened the Spot Check straight away, service users offered, Evidence authored by ZZ TEST Senior, next due 29 Oct 2026, audit check.completed by senior, back on the list with the green banner |
| SR9 | A record page link typed by hand (/people/id) goes back to the list | Pass 2026-09-29: /people/<id> lands back on /people |
| SR10 | Service Users list and a Care Plan Review completed as the Senior (care plan shown on the form) | Pass 2026-09-29: Care Plan Review on ZZ TEST Service User One as the Senior; address and phone prefilled, review number asked, Evidence by ZZ TEST Senior, next due 18 Dec 2026, reads audited as service_user.viewed by senior |
| SR11 | Untick People on the tile: the People menu entry goes and /people redirects | Pass 2026-09-29: Phil unticked People; menu is My area and Service Users, /people sends them to /my |
| SR12 | Forms I have sent in shows only the Senior's own forms, never a Check they completed on a Person or Service User, and that Evidence cannot be opened by link | Pass 2026-09-29 after 0341: list shows 0, Spot Check Evidence page and PDF both refuse; own-record Evidence still readable (checked in the database) |
