# Test checklist: draft invoice Preview, 2026-10-13

Phil's job (all companies). No migration. Decision: `docs/decisions/invoicing.md` (Draft invoice
preview). Bevan test client: a Bevan test service user set to private invoicing by post, so nothing
is ever emailed.

Run one at a time.

| # | Check | Result |
|---|-------|--------|
| V0 | Unit tests: blank dates stamped as Send stamps them, dates kept, VAT number only with VAT on, never a number or a status change, month end, leap day, the clock change, the file name without dashes, the inline header | PASS (lib/invoicing/preview.test.ts, 7) |
| V1 | Bevan, a draft invoice page: the top bar reads Edit, Preview, Send, Delete. Press Preview: a new tab opens at once saying "Preparing your preview", then the PDF; the invoice page stays where it was | Not tested |
| V2 | The PDF: "Draft" where the number goes, no status line under it, no watermark; everything else as a sent invoice; the file is called "Draft invoice for [bill to].pdf" | Not tested |
| V3 | Edit page: change a line, do not save, press Preview: the PDF shows the change and the draft is saved (it is still a draft) | Not tested |
| V4 | Edit page: empty the only line's quantity, press Preview: the tab closes, the page says "Add at least one line to the invoice.", and everything typed is still there | Not tested |
| V5 | After several previews: the invoice has no number, is still a draft, has no sent date, and Bevan's numbering has not moved; one audit line per preview | Not tested |
| V6 | Send the Bevan draft: it gets the next number as before; its Download PDF matches the last preview except the number and the status line | Not tested |
| V7 | Another company's invoice preview address, typed in: "Invoice not found" | Not tested |
| V8 | Opens in a new tab, not blocked, in Chrome and Edge; on a phone | Not tested |
| V9 | Phil: Thistle, Invoicing, open each of the two drafts and press Preview. Each opens in a new tab with "Draft" at the top; check the figures, the bill to and the dates. Nothing is sent | Not tested |
