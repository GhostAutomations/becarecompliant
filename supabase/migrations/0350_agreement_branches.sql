-- 0350: the Order asks how many branches (Phil, 2026-09-30, testing the accept screen on his phone).
-- branches_ordered is the number asked for (null on a Black account, which is not asked);
-- branches_text is the line as it read on the day, with any extra branch price, so the record keeps
-- the price of the day. The founder sets the branches up; billing follows the branches set up.
alter table public.agreement_acceptances
  add column if not exists branches_ordered integer
    check (branches_ordered is null or (branches_ordered >= 1 and branches_ordered <= 50)),
  add column if not exists branches_text text
    check (branches_text is null or length(branches_text) <= 300);
