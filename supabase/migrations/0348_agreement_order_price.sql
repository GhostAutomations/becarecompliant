-- 0348_agreement_order_price
-- Phil approved the revised contract text on 2026-09-30, after running both drafts past a second
-- review. The Order now records what was bought, not only which Plan: the price (monthly or annual),
-- what the Plan includes (users, branches, AI credits, texts) and the date of the Price List that
-- applies (lib/billing/allowances.ts). Written by the server from the same constants the Billing
-- page shows, so the Order and Billing cannot disagree. Nullable only because a row made before
-- this change would have none; no acceptance exists yet, and every new one fills all three.
--
-- Applied to the becarecompliant Supabase project ONLY (bgrtcvyjuwopunpnudeu).

alter table public.agreement_acceptances
  add column if not exists price_text text,
  add column if not exists included_text text,
  add column if not exists price_list_date text;
