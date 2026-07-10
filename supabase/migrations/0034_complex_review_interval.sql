-- 0034_complex_review_interval
-- Complex branches run 4 rolling Care Plan Reviews (REV1-4) at an 80 day cadence
-- (Phil, 2026-07-10): REV1 due = package start + interval, each next REV due = the
-- previous REV completion + interval. The interval is a company setting, default 80.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

alter table public.companies
  add column if not exists complex_review_interval_days int not null default 80;
