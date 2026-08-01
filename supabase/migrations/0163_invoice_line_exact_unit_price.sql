-- 0163_invoice_line_exact_unit_price
--
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).
--
-- THE PROBLEM, found 2026-08-01. Phil asked why an invoice line read 7 x 15m = £44.63 when the
-- unit price beside it said £6.38. Seven times £6.38 is £44.66. The AMOUNT was right: seven
-- quarter hours is 1.75 hours, and at £25.50 an hour that is £44.625. The £6.38 was the lie, a
-- display rounding of £6.375 forced by unit_price_pence being an integer.
--
-- The first instinct was to charge the extra three pence so the rounded figure became true.
-- That is money taken from a care client to tidy up a rounding, so instead we print the figure
-- that IS true, and this column is where it is kept.
--
-- 30m (£12.75) and 1hr (£25.50) divide exactly out of an hourly rate, which is why this hid.
-- It is quarter and three quarter hours that do not.
--
-- NUMERIC, not integer, and in PENCE to match every other money column in the schema. Four
-- decimal places is far more than a rate needs: a third of an hour of an odd rate is the worst
-- real case and that is three.
--
-- NULLABLE, and no backfill, deliberately. An invoice already raised must print exactly what it
-- printed the day it was sent. Lines written before today have no exact price and the invoice
-- goes on showing them as it always did; only lines written from now on carry one. The renderer
-- falls back to unit_price_pence when this is null.

alter table public.invoice_lines
  add column if not exists unit_price_exact numeric(12, 4);

comment on column public.invoice_lines.unit_price_exact is
  'Unrounded price of one unit, in pence (a 15m of a £25.50 hourly rate is 637.5). What the '
  'invoice prints, so quantity x unit price equals the amount. Null on lines written before '
  '2026-08-01, which print the rounded unit_price_pence instead.';

-- The schedule record screen prints "quantity x unit price" from its own copy of the lines, so
-- it needs the same figure or it is the next place to show a price that does not multiply out.
alter table public.invoice_schedule_lines
  add column if not exists unit_price_exact numeric(12, 4);

-- RLS: none needed. Both tables already carry their policies and a new column inherits them.
