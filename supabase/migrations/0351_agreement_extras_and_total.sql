-- 0351: the Order asks for extra users and extra branches and shows what it all costs (Phil,
-- 2026-09-30, testing on his phone). Each line is stored as it read on the day, so the record keeps
-- the prices of the day. On Annual the Admin chooses whether extras are paid yearly with the plan
-- (ten months' price for twelve) or monthly by card. branches_text (0350) now holds the extra
-- branches line; branches_ordered stays the total asked for (included plus extra).
alter table public.agreement_acceptances
  add column if not exists extra_users integer
    check (extra_users is null or (extra_users >= 0 and extra_users <= 500)),
  add column if not exists extra_branches integer
    check (extra_branches is null or (extra_branches >= 0 and extra_branches <= 50)),
  add column if not exists extra_users_text text
    check (extra_users_text is null or length(extra_users_text) <= 300),
  add column if not exists extras_billing text
    check (extras_billing is null or extras_billing in ('monthly', 'yearly', 'none')),
  add column if not exists extras_paid_text text
    check (extras_paid_text is null or length(extras_paid_text) <= 300),
  add column if not exists total_text text
    check (total_text is null or length(total_text) <= 300);
