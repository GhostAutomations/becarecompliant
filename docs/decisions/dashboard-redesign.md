# Dashboard redesign

> Company dashboard stat-card redesign (2026-07-17) + the completed-one-off due_date gotcha

Company dashboard redesign (Phil, 2026-07-17, BUILT + live-verified): People + Service Users show Overdue / Due in 14 days / Due in 30 days (nested, 30 includes 14), all dashboard roles; Complaints Open/Overdue/Avg-days-to-close (all-time), Holidays Pending, Absence "Meetings to book" + "Meetings in next 7 days" (up to 5 name+stage) = Managers-and-above (MANAGER_PLUS_ROLES = admin+2 registered+manager+platform, NOT supervisor/viewer). Cards clickable. Code: lib/dashboard/data.ts, getComplaintCounts extended (avgDaysToClose), app/(app)/dashboard/page.tsx. See [roles-overhaul](roles-overhaul.md).

STANDING GOTCHA (cost a live-test bug 2026-07-17): a completed NON-recurring check (e.g. "Setup") KEEPS its historical due_date (in the past) but its rag is GREEN. So counting "overdue" by `due_date < today` is WRONG — it counted all 23 Thistle SUs as overdue vs the true 6. Overdue MUST come from the check-status view's `rag='red'`. For fixed "due in N days" windows, only consider checks with `due_date >= today` (future), else these stale completed one-offs pollute the buckets. person_check_status / service_user_check_status carry the correct `rag`; intersect with person_rollup / service_user_rollup for the active (non-leaver/discharged) set.

## Due bands are SEPARATE (Phil, 2026-09-28, standing)
- [stated] "7 needs to show 0-7, 14 needs to show 8-14 and 30 needs to show 15-30" — nested windows made each tile repeat the previous one. Supersedes the nested rule above. Captions: "today to day 7", "days 8 to 14", "days 15 to 30".
- [stated] Kept the hover preview after first saying he disliked it (his objection was the repeated content).
- Built in lib/dashboard/due-preview.ts (buildDuePreview makes both the numbers and the lists), components/dashboard/preview-tile.tsx.

## Tile hover preview (Phil, popup 2026-09-27) — BUILT 2026-09-28
- [stated] Hovering Overdue / Due in 7 / 14 / 30 day tiles shows what is due, so managers don't have to click the tile
- [stated] Panel shows the first 8, soonest first (record name, check, due date or days overdue), names clickable to the record, then "and X more" opening the tile's full list
- [stated] Phones/tablets: first tap shows the panel, second tap opens the list, tap outside closes
- Build note: the panel must use the same queries as the tile counts (rag='red' for overdue, due_date >= today for the windows, active records only, per the gotcha above) so the list always matches the number

## Top row sizing (Phil, 2026-10-02, standing)
- [stated] Top row tiles squashed on his 1920 monitor; he expects the dashboard to adjust to the monitor size
- [stated] Two lines of big tiles were rejected: "tiles are way too big why didnt you make the fonts slightly smaller". Preference: keep one line and make the fonts slightly smaller, rather than wrapping into bigger tiles
- [stated] "the ciw readiness tile is too big" (at two tiles wide); approved one line with Readiness about 1.5 tiles, figures 32px, two figure tiles 28px, labels 11px
- Built as .dash-top-row (globals.css container queries, data-cells), DEF-106
