-- 0016_check_schedule_mode
-- A check can be scheduled either on its own interval ('interval', default) or, for
-- the Annual Appraisal, aligned to after Supervision 3 ('after_sup3'): the first due
-- is start + 3 supervision periods, then it recurs on its interval (annual).
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).
alter table public.check_definitions
  add column if not exists schedule_mode text not null default 'interval'
  check (schedule_mode in ('interval', 'after_sup3'));
