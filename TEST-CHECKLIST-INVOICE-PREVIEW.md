# Test checklist: draft invoice Preview, 2026-10-13

Phil's job (all companies). No migration. Decision: `docs/decisions/invoicing.md` (Draft invoice
preview). Bevan test client: a Bevan test service user set to private invoicing by post, so nothing
is ever emailed.

Run one at a time.

| # | Check | Result |
|---|-------|--------|
| V0 | Unit tests: blank dates stamped as Send stamps them, dates kept, VAT number only with VAT on, never a number or a status change, month end, leap day, the clock change, the file name without dashes, the inline header | PASS (lib/invoicing/preview.test.ts, 7) |
| V1 | Bevan, a draft invoice page: the top bar reads Edit, Preview, Send, Delete. Press Preview: a new tab opens at once saying "Preparing your preview", then the PDF; the invoice page stays where it was | PASS (Chrome as Founder in support mode on Bevan: Edit, Preview, Send, Delete; the PDF opened in a new tab titled "Draft invoice"; the invoice page stayed put) |
| V2 | The PDF: "Draft" where the number goes, no status line under it, no watermark; everything else as a sent invoice; the file is called "Draft invoice for [bill to].pdf" | PASS ("INVOICE", "Draft" once, no status line, no watermark; issued 13 Oct, due 27 Oct (today + 14 days, as Send stamps it); file "Draft invoice for ZZ TEST Service User Two.pdf", inline, Cache-Control no-store) |
| V3 | Edit page: change a line, do not save, press Preview: the PDF shows the change and the draft is saved (it is still a draft) | PASS (quantity 4 to 5, unsaved; Preview showed "Saving…" and "Preparing…", the PDF showed 5 and £127.50, the draft saved it, still a draft. With nothing changed, Preview opened the PDF without saving again) |
| V4 | Edit page: empty the only line's quantity, press Preview: the tab closes, the page says "Add at least one line to the invoice.", and everything typed is still there | PASS (tab closed; "Add at least one line to the invoice."; the typed note and the emptied quantity still there; nothing saved) |
| V5 | After several previews: the invoice has no number, is still a draft, has no sent date, and Bevan's numbering has not moved; one audit line per preview | PASS (6 previews: no number, number_seq empty, still draft, no sent date; one audit line each, "Previewed draft invoice for ZZ TEST Service User Two as PDF") |
| V6 | Send the Bevan draft: it gets the next number as before; its Download PDF matches the last preview except the number and the status line | PASS (sent as INV-00001, Bevan's first number as before; its PDF matches the last preview except "INV-00001" and "Sent" where the preview said "Draft"; the preview address of a sent invoice hands over to its real PDF) |
| V7 | Another company's invoice preview address, typed in: "Invoice not found" | PASS (a Thistle invoice id, a made up id and a junk id all "Invoice not found", 404; nothing written to Thistle) |
| V8 | Opens in a new tab, not blocked, in Chrome and Edge; on a phone | Chrome PASS (new tab every time, never blocked). Edge and a phone: Not tested (Phil) |
| V9 | Phil: Thistle, Invoicing, open each of the two drafts and press Preview. Each opens in a new tab with "Draft" at the top; check the figures, the bill to and the dates. Nothing is sent | Not tested |

## Line Date column, 0463 (Phil, 2026-10-13)

| # | Check | Result |
|---|-------|--------|
| D0 | Unit tests: the Date column only when a line has a date, "Mon 05/10/2026" (month end, leap day, clock change, blanks), both PDF width sets with a date total 100%, page headings and colSpan match | PASS (lib/invoicing/invoice-table.test.ts, 7) |
| D1 | Bevan, New invoice: each line has a Date box first, then Service, Unit, Handed, Qty; a line can be saved with or without a date | PASS (Chrome as Founder on Bevan: Date box first on each line; saved with two dated lines and one without) |
| D2 | A draft with dated lines: the invoice page shows a Date column left of Service reading "Mon 05/10/2026"; the Preview PDF shows the same | PASS (invoice page: Date column first, "Mon 05/10/2026", "Tue 06/10/2026", blank for the undated line; Preview PDF the same, widths fit) |
| D3 | Edit page: change a date, Preview: the PDF shows the new date and the draft is saved | PASS (third line set to 30/09/2026 unsaved, Preview: PDF reads "Wed 30/09/2026", the widest day, and fits; the draft saved it, still a draft) |
| D4 | An invoice with no dates (INV-00001 on Bevan): no Date column on the page or the PDF; it prints exactly as before | PASS (INV-00001: no Date heading on the page; its PDF has no Date column and reads exactly as before) |
| D5 | Fill lines from care plan: filled lines keep their week heading, with the Date box empty | PASS (care plan fill on a new, unsaved invoice: "Week: 09/10/2026 to 11/10/2026" heading, Date box empty, date not set) |
| D6 | Phil: Thistle, edit each draft, give each Sleep line its night, save, Preview: the Date column reads each night | Not tested |
