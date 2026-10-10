# Training import

> Training CSV import: how the column model works, the live test on Acme 2026-08-02 with both test files, and the after-import reporting hole that test exposed

Third tab on Settings > Import records, alongside People and Service Users. Built 2026-08-02 after Phil asked "will the download template match column names if a company changes them?". Files: `lib/import/training.ts`, `lib/import/actions.ts` (validateTrainingImportAction + commitTrainingImportAction), `components/settings/import-uploader.tsx`, header helpers in `lib/training/renewal.ts`.

## Column model

One column per course, named from the LIVE catalogue, so a renamed course changes the template.

- Recurring course: `"<name> renewal date"`. The cell holds the RENEWAL date and the completion is worked BACK from it using renewal_months.
- One off course: `"<name> (completed)"`. The cell takes the word Completed, or a date if they have one.
- A blank cell is left alone, so an import can never wipe a date somebody typed. Existing records are read first.
- Training NEVER creates a carer. Not on the register in that branch = refused.
- Two carers with the same name in one branch = refused, no guessing.
- A carer listed twice in one file = the second row refused (one upsert cannot touch the same (person, course) twice).
- Unrecognised and missing columns are both named.

## Live test on Acme, 2026-08-02

`training-import-CLEAN.csv` (36 columns, 5 carers) and `training-import-PROBLEMS.csv` (7 rows) live in the folder root.

CLEAN wrote 31 records for 5 carers, all verified in the database: renewal 31/03/2028 on a 24 month course stored expiry 2028-03-31 with completed 2026-03-31; a one off saying "Completed" stored both dates null and renders GREEN; a one off with a date stored it as completed_on; one carer red for Fire Training (expired 01/06/2026) and amber for Manual Handling (20/08/2026). Right branch, right company, updated_by set.

PROBLEMS wrote 2 and refused 5: stale `Fire Safety` column (real course is Fire Training), a duplicate carer, a carer not on the register, branch "Swansea", and a date reading "next March".

## THE HOLE THAT TEST FOUND, now fixed

The preview named all five refused rows. Pressing Import CLEARED the preview and left one sentence: "Imported 2 training records for 2 carers." The audit row said `records: 2, carers: 2, failures: 0`. Training returned no `flags` at all, while People and Service Users had always returned a Needs attention panel.

Worst of it: the STALE COLUMN WARNING died with the preview, and that is the exact case the import exists for, because a renamed course leaves every row reporting a clean "new" while a whole course is silently dropped.

Fixed 2026-08-02 over three review rounds:
- commitTrainingImportAction returns ImportFlags plus `columnNotes`, so the column warning is repeated in the past tense above the result.
- `TrainingCommitResult.failures` is now `{names, error}[]`: a refused batch NAMES its carers, one panel line each. The raw Postgres message goes to `console.error("[import] ...")`, never to the screen.
- Batches are packed on CARER boundaries, never sliced at 500 by index. A carer straddling two batches could otherwise be counted as imported AND listed as not added.
- Failure names dedupe by person_id, not by name, so two same-name carers in different branches stay two lines.
- One number: the count in the sentence equals the lines in the panel.
- An import that writes nothing still writes an audit row, and does NOT reprint what the still-visible preview already shows.

Related: [training-dept](training-dept.md) [the-list](the-list.md) `cowork-sandbox-limits` (not carried over)
