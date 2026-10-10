# Photo evidence pdf

> Item 15, photo evidence on the Evidence PDF and on screen (built 2026-08-11): what draws, the caps, why the image box is measured not square, and the Supervision 4 dead end found beside it

Built and signed off 2026-08-11. THE LIST item 15. Two commits: the feature, then the fix
for the blank page that live testing found in it.

## What it does

Uploaded files live in the PRIVATE evidence bucket, never in the answers, so before this the
inspector-facing PDF printed only the file name and the photograph was invisible on the
document handed over. (Signatures always drew, because a drawn signature IS in the answers
as a PNG data URL.) Now, at render time, the attachments are fetched and drawn:

- **the standalone Evidence PDF** (`evidenceSignedPdfUrl`, `renderEvidenceBytes`),
- **the inspection Evidence pack** (`renderEvidencePackPdf`),
- **and inline on the on-screen record.** Phil chose "show it inline on screen too" over
  keeping the link only, so screen and paper show the same thing — the rule set after the
  signature divergence. The download link stays underneath for the full size original.
  Both sides gate on the SAME function (`drawableFormat`), so they cannot disagree about
  what counts as a picture.

## The files

- **`lib/evidence/image-format.ts`** — pure, isomorphic, 24 unit tests. Holds the two
  decisions and the attachment TYPES (they live here, not in images.ts, so `pdf.tsx` can
  name them without importing a `server-only` module into a render tree).
- **`lib/evidence/images.ts`** — `server-only`. Rows read through the CALLER's RLS client
  (so a caller who may not see the evidence gets an empty map and no file names leak); only
  the BYTES use the service role, because the bucket is private. **Never throws**: a storage
  outage degrades to "named, not drawn" rather than an evidence record that will not open.
- `lib/evidence/pdf.tsx`, `lib/export/evidence-pack.tsx`, `app/(app)/evidence/[id]/page.tsx`.

## What can be drawn, and how much

@react-pdf/renderer decodes **PNG and JPEG only** — no HEIC, WEBP, GIF, SVG or PDF. Anything
else is NAMED on the document and captioned **"Attached to this evidence, not shown here"**,
so an inspector can tell "nothing was attached" from "something was attached that this page
cannot show". Caps: 8MB per image, 24MB per evidence record, 12 images, 40MB per pack.
Anything over a cap is treated exactly like an undrawable type, so the paper still says the
file exists. A wrong mime is never rescued by a lying extension; a MISSING or generic mime
falls back to the extension.

**Chrome uploads a HEIC as `application/octet-stream`, not `image/heic`** — so the extension
fallback is what actually catches the commonest undrawable case. Do not trust `mime_type`.

## The measured image box (the defect live testing found)

The first version drew every picture into a fixed **200x200 box with objectFit contain**.
Safe, but it reserves the whole square whatever the picture's shape, so a landscape photo
left ~70pt of empty space — and on a real Supervision record that was enough to push the
document past A4 and produce a **COMPLETELY BLANK SECOND PAGE** on a regulator-facing
document. Unit tests passed. Byte counts passed. **Only rendering the pages and looking at
them found it.**

Fix: `imagePixelSize()` reads the real dimensions straight from the PNG IHDR / JPEG SOF
header (header only, no decoding; unreadable returns null and falls back to the safe
square), and `drawnImageBox()` reserves only the shape needed. Width 200pt, height capped at
**280pt on purpose**: a phone's ordinary 3:4 portrait photo is 267pt at full width, so the
commonest shape a manager actually produces — photographing a passport — fits without being
narrowed, and only extreme pictures are capped.

Sections holding a drawn image are allowed to WRAP (the old `wrap={false}` would clip a
section taller than a page). Legacy evidence rows carrying a stored `pdf_path` still serve
that stored PDF: immutable evidence is not regenerated.

## How it was verified

Live on Acme, driven in Chrome as the test Company Admin: a Supervision completed on **a test carer record** with
a photo on the "Supporting documents" field (Right to Work and DBS Renewal also have one),
then a second with a real HEIC. Checked: the picture draws on the PDF with the file name
beneath; inline on screen with the link under it; one page not two; the HEIC named and
captioned on paper and a link-only on screen with no broken-image icon; the photo present in
the 11-page Evidence pack; signatures unchanged.

**Reading the PDF at all needed a rig**: Chrome's PDF viewer is a browser-internal page and
the signed Supabase URL cannot be screenshotted, so the PDF was fetched and painted onto a
canvas over the evidence page with pdf.js from cdnjs. That render is a low-scale bitmap and
looks soft — Phil saw the tab and said "that pdf looks fuzzy". **Say what a rig is doing
before leaving it on screen, and put the page back afterwards.**

## Found beside it: the Supervision 4 dead end

Not part of item 15; see THE LIST item 36 and migration 0170. Short version: the record
offered Supervision 4 while the form only allowed 1 to 3, and because the page hides that
question the refusal arrived as "Please correct the highlighted fields" with nothing
highlighted. Fixed in two halves — the missing option, and (the general guard)
`submitEvidence` now NAMES the answers it refused via
`lib/forms/validation-message.ts` `describeValidationErrors`.

Related: [the-list](the-list.md) [testing-run-2026-08-10](testing-run-2026-08-10.md) [save-button-behaviour](save-button-behaviour.md)
