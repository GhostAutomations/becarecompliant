# Invoice unit price

> Invoice line maths (list item 7). SETTLED RULE: a line is quantity x the printed unit price, both rounded to the penny. Migration 0164 dropped 0163's unit_price_exact. Read before touching invoice line maths or the invoice/PDF line table.

## THE RULE, settled 2026-08-01 after three attempts

**A line is charged at QUANTITY x THE PRINTED UNIT PRICE, both rounded to the penny.**
`lineAmountPence` delegates to `unitPricePence`, one maths path, in
`lib/service-users/care-plan-consts.ts`. Seven 15m visits of a £25.50 hourly rate bill at
7 x £6.38 = **£44.66**. 30m (£12.75) and 1hr (£25.50) divide exactly and never moved.

**The invoice PRINTS a Unit price column**, on the page and the PDF, but only when EVERY line on
that invoice multiplies out. See `showsUnitPrice` and `lineAddsUp` in `lib/invoicing/types.ts`.

## The answer to list item 7

**£44.63 was correct** under the old rule: seven 15m visits is 1.75 hours, at £25.50 an hour that
is £44.625. Acme's rate is `invoicing_config.rate_care_pence = 2550`. Under the new rule the same
line bills £44.66.

**The £790.52 in the list item does not exist.** The draft carrying that line totals £293.26
(`123803ab-8c76-47fc-8f51-7618cab4ff70`).

## Two answers that were built and thrown out. Do not propose them again.

1. **Exact rate, rounded once at the end** (the original). £44.63, arithmetically purer, and a
   client cannot check it because the printed price is £6.38 and 7 x £6.38 is £44.66.
2. **Print £6.375** (migration 0163, `unit_price_exact numeric(12,4)`). Phil: "I dont want 3
   decimal places." It reads as a spreadsheet artefact on a care invoice. **Migration 0164
   dropped the column** one day later; only one row had ever carried a value.

## MY MISTAKES, worth remembering

- **I offered three options built on a document I had not read.** I claimed a client sees the
  unit price and multiplies it out. At that point **no client facing document printed one** — the
  PDF and the page were Service, Unit, Handed, Qty, Amount. Phil chose on that premise, I built
  it, and it had to be reverted. **Read the rendered document before reasoning about what a
  customer sees.**
- **I hid the column when NO line multiplied out (`some`), not when every one did.** An invoice
  from before the change containing a single 30m or 1hr line — the ordinary case — would have
  grown a half filled column it was never sent with, and the PDF renders live on every Resend, so
  the client would receive a different document from the one they hold. It is `every`.

## How it is decided, and why there is no flag

`lineAddsUp(line)` is `Math.round(quantity * unit_price_pence) === line_total_pence`. Pure
arithmetic on the row, so no invoice can ever print a price that argues with its own amount,
whatever wrote the row and whenever. That is what replaced the 0163 column. Lines written before
2026-08-01 fail it (except the exactly dividing ones), so those invoices render as they were sent.

## Standing points

- **Nothing recomputes a raised invoice's amounts.** Stored `line_total_pence` and
  `subtotal_pence` are printed verbatim. But the page and the PDF are rendered LIVE, not
  snapshots, so a DISPLAY change reaches invoices already sent. Weigh that every time.
- `repriceLines` in `invoice-actions.ts` re-derives the unit price SERVER SIDE from
  `invoicing_config` on create and edit. The browser's price is not trusted: an admin can change
  a rate mid-edit, and a crafted POST could name any price. Free text lines with no service or
  unit keep their submitted price, since there is no rate to look up.
- `parseLines` rounds quantity to 2dp BEFORE deriving the amount, because
  `invoice_lines.quantity` is `numeric(12,2)`. Deriving from 1.005 and storing 1.01 puts the row
  permanently at odds with its own arithmetic.
- **`computeTotals` is deleted.** A second, uncalled implementation of the line maths in a money
  module is how the recurring cron came to bill £89.32 where the builder billed £89.25.
- **No PDF of a draft.** Hidden on the page and refused at the route (redirect back to the
  invoice). `emailInvoiceOnSend` also refuses a draft, which is where the real hole was: a
  `resendInvoiceEmail` POST could otherwise have emailed a client `Invoice-null.pdf`.
- `buildCarePlanLines` has NO unit tests: it has runtime imports of `./types` and a `@/` alias,
  and the harness is `node --experimental-strip-types --test` with no path aliases. The
  arithmetic it delegates to is pinned instead.

Related: [invoicing](invoicing.md) [recurring-invoicing-diagnosis](recurring-invoicing-diagnosis.md) [the-list](the-list.md)
