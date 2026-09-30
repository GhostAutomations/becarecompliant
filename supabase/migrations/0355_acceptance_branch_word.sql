-- 0355: record the company's word for a branch with each acceptance (Phil, 2026-09-30), so the
-- accepted Order can always be shown exactly as it read ("Extra houses", "House. In this agreement,
-- Branch means a house"), even if the word is changed later. Null means Branch.
alter table public.agreement_acceptances
  add column if not exists branch_word text check (branch_word is null or char_length(branch_word) between 1 and 30),
  add column if not exists branch_word_plural text check (branch_word_plural is null or char_length(branch_word_plural) between 1 and 30);
