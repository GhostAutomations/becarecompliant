# Custom register columns

> Custom register columns (Additions item 6): parked July, BUILT 2026-08-03 with the display picker; the six review findings, the default-hidden migration, and the manage-as-expiry silent-write gotcha

## BUILT AND UN-PARKED 2026-08-03

Phil: "lets build it but lets do it properly and needs to be simple for the end user." His three calls in the design popup: the setting lives in the register's **Columns panel** (not Settings, overriding his own earlier steer), **every tier** gets it (no gate), and **at most 6** columns may be shown.

**THE WHOLE FEATURE IS ONE SENTENCE: the colour always comes from the check, and you choose what the text says.** A column shows the check's next due date by default, or the latest answer to one question on that check's own form. Only date, single_select, radio and yes_no questions are offerable. Free text (Phil's rule), numbers, ratings, signatures, uploads and multi_select are deliberately not: none reads at a glance in a matrix cell.

`CUSTOM_COLUMNS_ENABLED` is DELETED from both registers, and `CreateCheckTypeForm` is un-hidden in Settings > People and Settings > Service Users (it was behind an anonymous `{false && (...)}`, which is worse than a flag because nobody finds it). A custom check is what a custom column shows, so both had to come back together.

Migrations **0167** (`check_definitions.register_display_field_key`, null = next due date) and **0168** (see below). Files: `lib/register/{custom-columns,data,actions}.ts` + `custom-columns.test.ts`, `components/register/{columns-panel,extra-check-cell}.tsx`, both registers, both register pages, both settings pages.

`lib/register/custom-columns.ts` is IMPORTLESS on purpose (types only, erased) so it is the unit test target AND safe to value-import (`cellText`) from client components.

### The six findings across three review rounds, worth not re-learning

1. **Deleting the flag would have added columns nobody asked for, to every register, on deploy.** `show_on_register` defaulted to TRUE from 0074, harmless only while the feature was hidden. On live data that is a Mentoring column showing an em dash for all 42 carers (Mentoring is ad_hoc, no due date by design), plus a column per new check type forever, uncapped. **0168 flips the default to false and resets every row.** A column appears because an Admin turned it on.
2. **The cap counted the payload, not the register.** A panel opened before two check types existed sends only what it knew about; omitted columns stay shown. Six became seven, and a crafted call walked it up one at a time. Now counts DB state merged with the payload, and both registers `.slice(0, MAX_REGISTER_COLUMNS)` on read.
3. **Reading a form answer pulled the whole frozen schema_snapshot per evidence row.** Several KB each; 6 columns x 1000 records is hundreds of MB to look up one label. Wording now comes from the column's own `choices` (which carry `type` and `options`). Chunks 100 not 200 (200 uuids in `id=in.(...)` is within a few hundred bytes of the 8 KB header buffer) and six at a time, not sixty at once.
4. **A cell that could not be read said "nothing recorded".** Migrated history has no `last_evidence_id`, RLS hides evidence from some viewers, and a failed page skipped silently. All three painted a red column of em dashes reading as "nobody has done this", so a manager chases carers who are in date. Those cases now fall back to the DUE DATE (`cellText` returns `undefined`). An empty string means one thing only: the evidence WAS read and that question was blank.
5. **A republished form locked the panel.** Point a column at a question, then remove the question, and every future save was refused naming a question no longer in any dropdown. A stale key is now nulled to "when it is next due" on read.
6. **The panel wiped itself every ten seconds.** Both registers mount RealtimeRefresh, which polls and re-renders, and the sync effect threw away a half finished reorder each time. Guarded by a `dirty` ref, and because a dirty ref with no exit is worse than the bug, closing now DISCARDS: outside click, Escape, the toggle, and a new Cancel button. None fire mid save (a `pendingRef` guard), so a failure can never be dropped into a panel that is no longer on screen.

Also: ownership validated BEFORE the cap (a phantom id gets "no longer on this register", not a false cap error); a partial write names what did not land instead of opening a red box with the word "Saved"; amber days bounded 0..365 server side now the create form is exposed; an answer whose question changed type can no longer render "[object Object]".

## Original build, 2026-07-16

Custom check types (any active check_definition whose key is NOT curated) appear as extra columns on both registers, Admin-controlled via a "Columns" panel (show/hide + drag reorder), company-wide. Migration 0074 added `show_on_register` + `register_position`. Curated keys excluded via `CURATED_CHECK_KEYS` in `lib/register/custom-columns.ts`: people = supervision/appraisal/spot_check/competency/manual_handling/audit; service_users = setup/care_plan_review/audit. Cell shows the RAG and links to the check's Complete route.

BUG fixed during that build: the panel `<li>` was `draggable`, which SWALLOWED the toggle/arrow button clicks inside it. Fix = only the drag-handle span is draggable, the li stays the drop target. **Standing lesson: never put clickable buttons inside a `draggable` element; put draggable on a handle only.**

GOTCHA that cost about an hour of testing (standing): in a manage-as-company support session the cookie expires after 30 min. When it lapses, server ACTIONS silently no-op — `requireCompany()` returns the founder profile (company_id null), the guarded action returns `{error:"No company context."}` with HTTP 200, so the write just does not happen and the UI shows no change. Page GETs may still render if the cookie was valid at load. During long Chrome test sessions, RE-ENTER manage-as before testing writes, and if a write "does not persist" while manage-as, suspect an expired session first. (Browser devtools also showed spurious 503s on /people RSC/POST while Vercel logged the same requests as 200 — red herring.)

Related: [the-list](the-list.md) [phase10-round1](phase10-round1.md) [training-dept](training-dept.md) [save-button-behaviour](save-button-behaviour.md)
