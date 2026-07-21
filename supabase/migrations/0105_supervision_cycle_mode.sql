-- 0105_supervision_cycle_mode
-- Per-company People supervision cycle mode, set by the Founder. 'appraisal' (default,
-- current behaviour) runs Supervision 1-3 then an Annual Appraisal that restarts the
-- cycle. 'four_supervisions' runs four supervisions with no appraisal, the 4th closing
-- and re-dating the cycle. Founder-controlled from the company settings.
alter table public.companies
  add column if not exists supervision_cycle_mode text not null default 'appraisal'
    check (supervision_cycle_mode in ('appraisal', 'four_supervisions'));
