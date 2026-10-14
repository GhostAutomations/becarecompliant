# Homepage scenes and stories (2026-10-14)

> The homepage refresh: product scenes built in code from the app's own styles, four short scroll
> stories, the new "Everything your service runs on" section, and the decisions Phil made by popup.
> Read before changing the homepage's pictures, its animations or its feature claims.

Branch `homepage-refresh`, previewed before it goes to main. Brand rules still apply
([brand-positioning](brand-positioning.md)): the h1, supporting line, trust row and Security
section stay unless Phil agrees a change.

## What the pictures are

- **Built in code, not screenshots** (`components/marketing/scenes/`). They use the app's own
  classes read only (`.matrix`, `.rag-cell`, `.pill-*`, `.done-on-time`, `.done-late`,
  `.btn-primary`, `.glass-card`, `.page-title`), so they look like the app because they are drawn
  the way the app draws them, and they stay sharp on every screen.
- **Real columns, real labels, real order.** The hero is the People register (Carer, Status, Job
  Title, Enhanced DBS, Spot Check Due, Supervision 1 Due and Done, Supervision 2 Due and Done),
  showing fewer columns on smaller screens, as the app's own Columns panel can. No "Overall"
  column. A due date carries the RAG pill while outstanding and turns plain once done; a done
  date is green on time and AMBER late; a missing date is a grey dash.
- **Invented names and dates only**, aria-hidden, each with a short visually hidden sentence.
- **Removed because no screen draws them:** the North / South / East branch roll-up picture, the
  "Supervision evidence, 12 months, page 3 of 47" document, and the PQS row "Staff registration"
  (the app calls it Social Care Wales registration).

## The four stories (Phil's popup: Evidence, OneDrive, Return to Work, with the loop)

1. **The compliance loop** (lead). Supervision 2 Due red, the form completed, the pill clears,
   the Done date stamps today in **amber because it was late** (Phil's popup: "Overdue, then done
   late in amber", matching the app), Supervision 3 appears in green, Overdue ticks 3 to 2, and
   the branch readiness line goes Action needed to On track.
2. **Evidence for an inspector.** The Evidence page as the app shows it, then the audit trail
   lines the app really writes: evidence.created, evidence.viewed, evidence.downloaded.
3. **The copy lands in OneDrive.** Be Care Compliant > People > branch > person > check folder,
   file named like the app names it ("FR Supervision 2026-10-14.pdf"). Drawn as a plain folder
   list in our own style: no Microsoft logos or imitation of their screens.
4. **Return to Work by text** (Pro). The questions, "Send to Owain by text", the app's own text
   message wording, the portal's own thank you, and "Owain answered these through their portal".

## How they play (the quality bar)

- Drawn server side in the FINAL state. Below the screen they are set to the opening frame and
  play once when half on screen; scrolled away part way they pause; a Replay control appears at
  the end. Already on screen when the page wakes: left finished, Replay showing.
- Reduced motion: never arms, every animation off, the final frame. No script: the final frame.
- Only opacity and transform move. A changing value is two layers stacked in one grid cell, so
  nothing reflows (CLS 0). Steps 260 to 600ms, each story under about 5.2 seconds.
- **Styles are inline in the homepage** (`scenes/styles.ts`, every class `hs-`), not a CSS
  module: a module was a second stylesheet to fetch and pushed first paint from 0.9s to 1.2s.
- **The hero scene is not faded in** (no Reveal): calm, and the largest thing on the first screen
  is not held back until the script has run. That took Lighthouse mobile back to 99.

## Other decisions in this job (popups, 2026-10-14)

- **New section "Everything your service runs on"**, in place of the small "And everything else
  you need" row, with all four groups: staff (absence, Return to Work, holiday, training), cases
  and inspections, policies briefings and forms, running the service. Pro only lines carry a Pro
  chip (lib/billing/tier.ts PRO_FEATURES). Every line checked against the code.
- **Testimonial band hidden until a real quote** (`social-proof.tsx` returns nothing while the
  list is empty; it comes back on its own when a quote is added). Closes the open item in
  [marketing-4b-in-progress](marketing-4b-in-progress.md).
- **Security card "An audit trail nobody can edit"**: "by us" came off. Users cannot alter the
  log, but two past migrations of ours did (0112 test company rename, 0182 whistleblowing
  categories).
- **No animation library** (none was installed). CSS animations and IntersectionObserver only.

## Reported, not fixed (prices are out of scope)

- Homepage, pricing page, code and the agreed decision all say £79 and £129.
- Invoicing, Planner and On Call are Pro in the code but are not listed on the pricing page.
- The header blurb of [stripe-prices](stripe-prices.md) still mentions old prices.

Related: [brand-positioning](brand-positioning.md) [marketing-4b-in-progress](marketing-4b-in-progress.md) [cloud-drive](cloud-drive.md)
