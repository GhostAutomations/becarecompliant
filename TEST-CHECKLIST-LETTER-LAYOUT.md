# Test checklist: letter layout and wording (Job 2 Part C, 2026-10-12)

Phil's decisions: `docs/decisions/letter-layout-wording.md`. No migration. No company had its own
templates, so the tidied standard wording reaches every company's next letters; letters already sent
never change.

## What was wrong (found 12 Oct by drawing real Bevan letters and reading every template)

Layout: 10pt text; paragraph gaps smaller than a line, so paragraphs ran together; 1.2cm top margin;
one line between Yours sincerely and the name, no room to sign by hand; Private and confidential in
grey small print in the footer; tiny bullets; the system role ("Admin") printed as a job title.
Wording: "This is a Stage 2 meeting and its outcome could be up to and including..."; the closing
paragraph repeated the details table, and online meetings read "held at Microsoft Teams" (in the
chairing copy too); a comma splice in the rearranged note; "if you will be accompanied" without
"and by whom"; "Acme Care Company" in the examples. Numbers: "4 absences, 4 days in all... 6 months".
Dates: one outcome letter mixed 01/10/2026, 21 July 2026 and 21st July 2026. AI: "could result in up
to and including a written warning" (our own instruction); every absence paragraph opened the same
way. And the appeal could be "heard by" the person who held the meeting while the letter said they
were not involved.

## Before deploying

Drawn locally through the new rules with real Bevan details: a Stage 2 rearranged invitation with
four absences fits on one page with room to sign; a Stage 1 outcome letter runs to two pages with
its last paragraph and the sign off together on page 2; dates all "1st October 2026" style; small
numbers in words. A first try put the sign off alone on page 2; fixed so it always goes with the
last paragraph, and the spacing trimmed so a typical invitation fits on one page.

| # | Check | Result |
|---|-------|--------|
| C1 | Book meeting preview (Bevan): 11pt, a clear gap between paragraphs, Private and confidential in bold above the address, Held by without a system role, four absences in words, the new standard wording, on one page | Not tested |
| C2 | An online (Teams) booking: the letter and the chairing copy say "on Microsoft Teams" | Not tested |
| C3 | Rearranged letter: "This invitation replaces the earlier one. Please update your calendar." | Not tested |
| C4 | Outcome letter final look: the new layout; a letter over a page keeps its last paragraph with the sign off | Not tested |
| C5 | Unsigned letter: room to sign by hand above the name; signed letter: the signature as before | Not tested |
| C6 | Appeal heard by the person who held the meeting: "who was not involved in this meeting" left out | Not tested |
| C7 | The editor and Settings, Letters show the new sizes and spacing to match the PDF | Not tested |
| C8 | Letters kept before today unchanged | Not tested |
