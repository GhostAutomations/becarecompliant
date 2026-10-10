# Marketing 4b in progress

> Item 4b marketing pass — COMPLETE 2026-07-29 except one thing needing Phil (a real testimonial quote). What was changed, and the two review findings that turned out to be wrong.

## Status

**Item 4b is done**, in two commits plus a follow up, apart from one open item that needs Phil.
None of it has been seen live. Test lists are in PHASES.md under "MARKETING PASS PART ONE" and
"MARKETING PASS PART TWO".

**Still open, needs Phil:** the social proof band on the homepage is a placeholder ("ready to
fill" in the source). An empty testimonial section reads worse than none. One real quote, even
from his own service, or remove the section.

**Optional, not done:** a skip link. `<main id="content">` exists on all four marketing pages
now but nothing links to `#content` yet.

## Part one

- **NEW `app/privacy/page.tsx`**, `/privacy` added to PUBLIC_PATHS, linked from the footer and
  under the trial form. **Phil must still settle two things before launch:** the controller
  identity (the company is not incorporated, so no registered name, number or address is
  stated) and the AI supplier position, since that is the one transfer leaving the UK and
  Europe. Not legal advice, not seen by a solicitor.
- **The tab title said the brand twice** on Pricing and Start trial. The root template is
  `%s · Be Care Compliant` and a template applies to CHILD segments only, which is why the
  homepage escaped it.
- **"Start" versus "Request".** The start trial h1 now says Request, matching the button. Nav
  and homepage buttons still say Start free trial: invitation versus transaction.
- **The trial form** cut back to the three required fields it promises, with the rest inside a
  `<details>` that opens itself when `?tier=` arrived from pricing. Placeholders everywhere,
  and "Work email" became "Email".

## Part two

- **Trust row above the product preview.** It was under a tall screenshot, off the first screen.
- **The spreadsheet argument is made once**, by the comparison table. The three "Built for care"
  cards were KEPT, only their intro reworded. Deleting the section outright is still on the
  table and is Phil's call.
- **The reveal no longer shows ghost text.** It waited until 12 percent of a section was 8
  percent inside the screen then faded 0.6s from transparent. Now threshold 0, positive bottom
  rootMargin (arms a fifth of a screen early), 0.4s fade.
- **An "If you ever leave" card on pricing**, answering the objection every compliance buyer
  has. That section now shows FIVE cards, not four, which changes an older test line.

## The accessibility pass, and TWO FINDINGS OF MINE THAT WERE WRONG

Recorded because the wrong version is more memorable than the right one:

- **The muted body text passes AA.** Measured against the real palette (navy-950 #081231,
  navy-900 #0d1d4b, navy-800 #14306b): white/55 scores 4.91 to 6.08, white/75 scores 7.75 to
  10.55, gold #f59e0b on navy is 5.87 to 7.55, navy on the gold button is 8.57. I had said it
  was around or under the threshold. It is not. **Do not "fix" the white/5x scale.**
- **The comparison table was already accessible**, with `role="img"` and Yes/No labels plus
  column and row header scoping. Reduced motion was already handled in globals.css too.

What was genuinely wrong and is now fixed:

- **white/40 and white/45 in the two decorative mockups** (product-preview, pqs-report-preview)
  scored 3.31 to 4.48. Raised to white/55. These were the only real contrast failures.
- **No `<main>` landmark on any marketing page**, so a screen reader user could not jump past
  the navigation. All four pages now wrap content in `<main id="content">`.
- **No visible focus ring on links.** Buttons and inputs had a gold ring, links fell back to the
  browser default, which is easy to lose on this navy, and the marketing site is navigated
  almost entirely by link. Added `a:focus-visible` with the same gold ring, in globals.css, so
  it applies app wide.

Verified before commit: the repo's own TypeScript ran clean (`tsc --noEmit`, exit 0) and the JSX
of all four pages was walked independently to confirm the inserted `<main>` tags open and close
at the same depth.

## Gotchas worth keeping

- `device_bash` **cannot delete** `.git/index.lock`, and `rm -f` on an existing lock fails with
  "Operation not permitted", which aborts a whole `&&` chain before the real work runs. Move it
  instead: `mv .git/index.lock .git/index.lock.stale`. Phil's own Terminal can delete it, so the
  `rm -f` at the start of his copy paste blocks is still right.
- After the desktop app is restarted the device workspace boots lazily: the first `device_bash`
  call can time out at 45s. Retry once with something trivial like `echo alive` before
  concluding the bridge is broken. `device_list_dir` works while the shell is still booting.

## Also parked

**Item 15, photo evidence on the Evidence PDF.** Nothing written. Uploaded files live in
`evidence_files` (field_key, kind, storage_path, file_name, mime_type, bytes) in the private
bucket, while the ANSWER holds only the file name, which is why the PDF prints a name and no
picture. Signatures draw because they ARE in the answer as a PNG data URL. Plan: a shared
`lib/evidence/images.ts` used by BOTH `renderEvidenceBytes` and the evidence pack, a mime
allowlist of png and jpeg only, hard caps on count and bytes with a VISIBLE note when something
is skipped, and no new dependency (downscaling would need sharp, which needs Phil's agreement).

Related: [the-list](the-list.md) [stripe-prices](stripe-prices.md) [self-serve-trial](self-serve-trial.md) `cowork-sandbox-limits` (not carried over)
