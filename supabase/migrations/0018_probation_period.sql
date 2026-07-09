-- 0018_probation_period
-- Company Probationary Period (days). On adding a carer, probation end due = start
-- date + this period. Changing it does NOT recompute existing carers (would break
-- employment contracts). Default 180 days (~6 months).
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).
alter table public.companies
  add column if not exists probation_period_days int not null default 180;
