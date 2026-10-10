# Brand positioning

> The agreed position ("the operating system for care compliance"), the confidence-not-software frame, the hero rules, and the four parts of Phil's designer brief that were REJECTED and why. Read before changing marketing copy, the hero, the palette, or proposing a Compliance Score.

## The position, agreed 2026-07-29

**"The operating system for care compliance."** It is the homepage h1, with "care compliance."
forced onto its own line by a block span rather than a `<br>`. Phil brought it in a Lead Product
Designer brief and it is a real position, not a slogan: it is defensible because the product
holds both registers, the evidence and the audit trail in one place.

**Sell confidence, not software.** A registered manager is not shopping for features, they are
trying not to be the person who got a Requires Improvement. Two headings were reworded to match:
"Everything a registered manager needs" became "Know where you stand, every day", and "Find out
what is overdue in your service" became "Walk into your next inspection knowing".

The old h1, "See every check that is overdue before your inspector does", was NOT thrown away.
It now opens the supporting paragraph. Position in the h1, promise underneath, which is the
pattern Stripe, Linear and Vanta all use.

## The hero, rebuilt 2026-07-29

- **Top padding was pt-28**, 112px of nothing under a sticky 80px header, so the page opened
  with a gap instead of a claim. Now pt-10 sm:pt-14. Generous top space is a premium signal only
  while there is something above the fold to be generous about.
- **The trust row** reads CQC in England, CIW in Wales, **Live PQS scoring**, Audit trail on
  every record. Phil changed the third from "Local authority PQS returns". True: the measures
  are scored from current data whenever the report is opened.
- **The product preview is no longer just a table.** It was a four by four matrix of names and
  pills, which read as a SPREADSHEET on a site whose central argument is that spreadsheets are
  the enemy, showed only the People register, and showed one screen while the h1 claims an
  operating system. The matrix stayed and the application was put around it: company figures
  across the top (Overdue, Due in 14 days, On the registers), both registers as tabs with People
  active, and the branch the view is scoped to. **Status now visibly rolls up from one check on
  one carer, to a branch, to the company**, which is the thing a spreadsheet cannot do.
- **Everything in it exists in the product.** Same rule as the Security section.
- **It is aria-hidden**, because the names and dates are invented and a screen reader reading
  them as real records is worse than silence.
- **Trap:** the stat figures were first written with `text-rag-red` / `text-rag-amber`. Those
  theme colours (#dc2626, #b45309) are the LIGHT theme pill inks and go muddy on navy. Dark
  surfaces in this app use `text-red-300` and `text-amber-300`.

## Four parts of that brief were REJECTED, and these reasons will come back

1. **"The homepage has one purpose: book demos."** No. Demo led selling costs a hundred pounds
   or more of founder time per demo and the product is £49 to £69 a month, so one demo takes
   most of a year to pay back. Vanta is demo led because Vanta is ten thousand a year; Stripe,
   Linear and Notion, the brief's own reference points, are all self serve. The founder approved
   trial request already IS a qualified lead. Recommended shape if this comes up again: Start
   free trial primary, Book a call secondary for the multi site buyer who will never self serve.
2. **Four regulators: CQC, CIW, Care Inspectorate Scotland, RQIA Northern Ireland.** The product
   is **CQC and CIW only**. Readiness maps to CQC key questions and CIW themes; PQS is Welsh
   local authority. Putting all four on the site would have been the third public claim in one
   day that the code does not keep (after Pro at £69 vs £99, and evidence "is anonymised").
   Say CQC and CIW, and say the others are coming.
3. **"Compliance Score" as the flagship feature.** The app already scores, through Inspection
   Readiness and the PQS score, so this would be two scores with no stated relationship. It is
   also risky in a regulated setting: a provider showing 98 percent who is then rated Requires
   Improvement will hold that number against us, and a score driven by completed tick boxes
   measures paperwork rather than care, which is the exact criticism of the spreadsheets we
   replace. If it is ever built, it must show its working and never claim to predict a rating.
4. **A light theme** (#F8FAFC background, white cards). The site AND the whole application are
   dark navy, so this is a rebuild of every screen, not a polish. The brief also carried two
   slightly wrong hexes: **#0D1B4C against the real #0D1D4B**, and **#F5A623 against the real
   #F59E0B**. Two nearly identical hexes are worse than two obviously different ones, because
   nobody notices the drift until it is everywhere. The real gold matches Join Care Now, which
   is a standing rule ([brand-decisions](brand-decisions.md)).

## The Security section

Added to the homepage immediately before pricing, because it is the last objection a compliance
buyer raises before they look at the number. Four cards, **every line corroborated against the
code before it was written**:

- Separation enforced in the database, not by a filter in the software
- An audit trail with no way to edit or delete it (audit_log has a select policy only)
- Held in the UK, London region, role limited access
- Files served only by links that expire after five minutes, every download recorded

**Standing rule: if any of those stops being true in the code, the card comes off the page the
same day.** It links to the privacy notice for the detail.

## What the brief got right and is still open

- The tone rules needed no work; the existing copy already avoids the clichés it warns about.
- Still missing from the site, and named in the brief: testimonials. There are none, and the
  social proof band is still a placeholder.
- Not adopted, not rejected, just not done: the brief's fuller homepage structure (Platform
  Overview, Feature Grid, Inspection Centre), the Mission Control dashboard direction, and
  mobile specifics.

Related: [marketing-4b-in-progress](marketing-4b-in-progress.md) [brand-decisions](brand-decisions.md) [framework-readiness](framework-readiness.md)
[the-list](the-list.md)

## Rename idea, 2026-09-28 (undecided)
- [stated] Phil is thinking of renaming Be Care Compliant to "Care Prime", so people say "is it on Prime?" the way they say "is it on Monday?"
- Checked 2026-09-28: careprime.co.uk appears unregistered; CAREPRIME GLOBAL LTD (health activities) dissolved Aug 2026; several UK care agencies trade as "Prime Care" (Horsham, Colchester, Salisbury); Amazon holds PRIME trade marks. No UK trade mark search done yet (UKIPO blocks automated lookups). careprime.com is taken (since 2000); careprime.app looks free; CARE PRIME LTD (Bromley, business support) and CAREPRIME SUPPLIES LIMITED are active companies.
- [stated] Phil asked for ten alternative names with available domains (2026-09-28). Offered, .co.uk free per who.is that day, all .com taken: Kinloop, Tendura, Carewren, Oakhand, Tendstone, Carelark, Kinshore, Tendhaven, Kinlight, Tendlight. Not yet checked for trade marks or Companies House. [stated] Phil rejected all ten.
- [stated] Phil then asked for 20 real single words, domains checked before being given, domain style "mix it up". Method that works: dns.google NS lookup (Status 3 = no DNS = very likely free); who.is is UNRELIABLE for .care (reported a random string as registered). Given 2026-09-28, all showing no DNS: tallycare, larkcare, heronapp, wrenapp, cloverapp, sorrelapp, kiteapp, otterapp, bluebellapp, tillerapp, rowanapp, puffinapp, quillapp, meadowapp, harbourapp, acornapp, shepherdapp, finchapp, marigoldapp, thymeapp (.co.uk). Exact-word .co.uk and word.care all taken.
- [stated] Phil suggested "Halo Compliance" (halocompliance.co.uk) on 2026-09-28. Checked: .co.uk has no DNS (likely free); halocompliance.com is a live compliance AI product (mortgage marketing); Halo Connected Health (UK, DXN Design Ltd) sells care records + CQC compliance to UK care providers; HaloCare group, HALO Homecare Systems (US homecare software), Barton Halo Care Ltd also exist.
- [stated] Phil then suggested "Totalhalo" (2026-09-28). Checked: totalhalo.co.uk no DNS (likely free); totalhalo.com registered (DNSPod nameservers, owner unknown); no Total Halo company at Companies House (first page) and no Total Halo business found in search.
