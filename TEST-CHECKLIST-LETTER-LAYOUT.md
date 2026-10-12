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
| C1 | Book meeting preview (Bevan): 11pt, a clear gap between paragraphs, Private and confidential in bold above the address, Held by without a system role, four absences in words, the new standard wording, on one page | PASS (12 Oct, live deploy dpl_A76b6, Bev Admin in the app's browser, ZZ Stage One, Stage 4, not saved: 11pt with a clear gap between paragraphs, Private and confidential in bold above the address, "Held by: Bev Admin" with no role, "the following absence, one day in all, recorded in the last six months", "anything up to and including dismissal", "and by whom", no repeated details paragraph, one page with the signature) |
| C2 | An online (Teams) booking: the letter and the chairing copy say "on Microsoft Teams" | PASS (same booking switched to Teams: the details read "Microsoft Teams. A Teams invite will follow."; the rearrange check for ZZ Stage One on Teams showed the chairing copy "held on Microsoft Teams"; closed without sending) |
| C3 | Rearranged letter: "This invitation replaces the earlier one. Please update your calendar." | PASS (Cancel / rearrange, check the letters: "This meeting has been rearranged. This invitation replaces the earlier one. Please update your calendar." in both copies; closed without sending, the meeting still 21 Oct at the office) |
| C4 | Outcome letter final look: the new layout; a letter over a page keeps its last paragraph with the sign off | PASS (ZZ TEST Audit Starter's drafted Stage 2 letter, final look on the live site: the new layout, Private and confidential above the name, clear gaps, sign off; not sent. A letter over a page was drawn locally with the same code before the push: its last paragraph and the sign off together on page 2) |
| C5 | Unsigned letter: room to sign by hand above the name; signed letter: the signature as before | PASS (Book meeting with No signature: a clear space above the name to sign by hand; with the uploaded signature it prints as before) |
| C6 | The right of appeal paragraph names whoever was picked in the drop down and never says "who was not involved in this meeting" (Phil, 12 Oct: the drop down stays, the line goes) | Not tested (the change is built, typechecked, tested and built; it goes live with the next push) |
| C7 | The editor and Settings, Letters show the new sizes and spacing to match the PDF | PASS (Settings, Letters, invitation template: the editor sheet measures 11pt text, 44 and 56pt margins and a 12pt gap between paragraphs once scaled to A4, the same as the PDF) |
| C8 | Letters kept before today unchanged | PASS (all 26 invitation PDFs and 18 outcome PDFs kept before 12 Oct are still in storage and none has changed since the Part C deploy) |
