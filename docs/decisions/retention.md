# Retention

> Item 18, evidence retention actually enforced (built 2026-08-11): the clock, the nightly cron, the hold, the settings page, and the FOUR bugs live testing found in it

Built 2026-08-11. THE LIST item 18. Migrations 0171 plus two `create or replace` follow-ups.

## Why it existed at all

`lib/evidence/retention.ts` held the eight year rule, a backfill and an anonymise function
since Phase 2, and **nothing called any of it**. All 345 evidence rows had `retention_until`
null and nothing had ever been anonymised: evidence was kept for ever. The privacy notice had
already been re-worded DOWN once to stop promising a process nobody ran.

The reason it was never wired up is worth keeping: **`anonymise_evidence` cannot be used by a
cron.** It authorises with `auth.uid()` and demands an admin, so a service role call raises.
The schedule was not the missing piece; the callable function was.

## What it does now

- **The clock starts** in `applyRetentionForRecord`, called when a Person is marked a leaver
  (`leaver_date`) or a Service User cancelled (`discharge_date`). It also **CLEARS** the date
  when that status is undone, so a returning employee does not keep counting down.
  `addYearsIso` in lib/dates.ts does the arithmetic: string in, string out, no Date objects
  (a civil date built in one timezone and read in another can slide a day, and this day
  decides when records are destroyed), clamping 29 Feb to 28 Feb.
- **The rule runs** in `/api/cron/retention`, daily 02:30, batched at 200, calling
  `expire_evidence_retention()` (0171): SECURITY DEFINER, **service_role only** — anon and
  authenticated explicitly revoked, verified in the database. It selects, checks holds and
  anonymises in ONE statement, so the caller cannot act on a different set than was emptied.
- **A hold stops it.** `people.retention_hold` / `service_users.retention_hold` + reason +
  set_at/by. Admin only, reason required, offered on the record once the person is a leaver
  or discharged (and always while a hold is on, so it can be lifted).
- **Settings > Data retention** shows the rule, counting down / due within 90 days / already
  anonymised, and the hold list. The customer is the controller, so the customer must be able
  to answer an ICO question.
- **An anonymised record says so** on screen (banner + no PDF button), and the PDF route
  refuses. Before that it still read "stored unchanged" and "immutable" with every answer
  "Not answered", which looks like a badly completed check rather than a deliberate erasure.
- The privacy notice now states this truthfully, with a comment telling the next person to
  check the cron still exists before editing that sentence.

## FOUR bugs live testing found, all in my own work, none visible in the code

1. **`column reference "evidence_id" is ambiguous`.** The function's OUT parameter and
   `evidence_files.evidence_id` share a name; one unqualified WHERE made the whole
   RETURN QUERY raise at runtime. The function had NEVER worked. Only real rows expose this.
2. **The cron returned 200 on a completely failed run.** The error went into a JSON field and
   the route still answered success, so Vercel showed a healthy green cron while nothing was
   anonymised. **"Nothing was due today" and "this has been broken for months" must never
   look the same from outside.** The route now returns 500 and logs.
3. **The cached `render/evidence.pdf` was left in the bucket.** Every evidence owns TWO kinds
   of object: uploaded files, and the on-demand rendered PDF, which is a complete copy of the
   record. The purge deleted the files and left the PDF, so an "anonymised" record kept a
   full PDF of its own answers in storage for ever. The same gap was in the manual SAR
   erasure path. Found by listing `storage.objects`, not by reading code. `evidenceRenderPath`
   now lives in storage.ts so anything purging an evidence can name every object it owns.
4. **Clearing the clock silently failed.** The clear also set `retention_min_years` to null,
   and that column is NOT NULL, so the database rejected every clear and the code swallowed
   the error and reported "0 rows updated". A returning employee's records kept counting down
   towards destruction. Found by checking the rows AFTER the screen said "Saved".
   `applyRetentionForRecord` now RETURNS its error and the callers write it into the audit row.

**The pattern across all four (and the photo-evidence blank page the same day): none were
visible in the code, and every one came from looking at the actual artefact** — the rendered
page, the database row, the bucket listing, the HTTP status.

## How it was verified

Live on Acme as the test Company Admin: leaver → all 10 evidence rows got 2034-08-11 (exactly 8 years);
hold set with a reason → a backdated row past its date was **untouched** (0 rows, answers and
author intact); hold lifted; cron Run by Phil → anonymised, answers emptied, author gone,
file row purged, **storage objects 2 → 0**, one audit row with actor `retention`; back to
Active → all 8 remaining clocks cleared. Settings page and the anonymised-record banner both
checked on screen.

**Test data note:** two Supervision evidence records on **a test carer record**, both created by
Claude on 2026-08-11 for this test, were deliberately anonymised. No original Acme record was
touched. `8ED837D1` was restored to a qualifying state so the 02:30 cron would purge its two
orphaned storage objects (they were orphaned because the DB function was run directly, and
object deletion is the route's job) — **worth confirming that bucket is empty afterwards.**

Related: [the-list](the-list.md) [photo-evidence-pdf](photo-evidence-pdf.md) [phase2-decisions](phase2-decisions.md)
