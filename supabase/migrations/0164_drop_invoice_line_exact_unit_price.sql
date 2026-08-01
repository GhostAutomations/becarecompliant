-- 0164_drop_invoice_line_exact_unit_price
--
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).
--
-- 0163 added unit_price_exact so an invoice could print £6.375 for a quarter hour of a £25.50
-- hourly rate and still charge the true £44.63 for seven of them. Phil looked at it the same day
-- and said no to three decimal places on a care invoice, which is right: it reads as a
-- spreadsheet artefact, not as a price.
--
-- SO THE RULE CHANGED, and the column stopped being needed. A line is now charged at QUANTITY x
-- THE PRINTED UNIT PRICE, rounded to the penny. Seven quarter hours of £25.50 are billed as
-- 7 x £6.38 = £44.66. A few pence a line more than the exact £44.63, in the provider's favour,
-- and every figure on the document is one a client can reproduce with a calculator. 30m (£12.75)
-- and 1hr (£25.50) divide exactly out of an hourly rate and do not move at all.
--
-- WHAT REPLACES THE COLUMN IS ARITHMETIC, not a flag. The invoice prints a unit price when
-- Math.round(quantity x unit_price_pence) equals line_total_pence, and an em dash when it does
-- not. That is decided from the row itself, so no invoice can ever print a price that argues
-- with its own amount, whatever wrote the row and whenever. It also prints the pre-2026-08-01
-- lines that DO hold: the 30m and 1hr ones, which were never wrong.
--
-- SAFE TO DROP. The column lived for one day. Exactly ONE row in invoice_lines carried a value
-- (a draft, Care 1hr, 2550.0000, identical to its unit_price_pence) and none in
-- invoice_schedule_lines, checked before writing this. No stored amount changes here: raised
-- invoices keep the figures they were sent with, and only how they are DISPLAYED is decided by
-- the rule above.

alter table public.invoice_lines drop column if exists unit_price_exact;
alter table public.invoice_schedule_lines drop column if exists unit_price_exact;
