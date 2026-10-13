-- 0458: a held absence meeting can be marked as dealing with a stage reached after it (Phil,
-- 2026-10-13; docs/decisions/absence-stage-history.md).
--
-- WHY. A Thistle carer's Stage 1 meeting (verbal warning) was held before her third absence took
-- her to Stage 1, so the stage history (0457) showed Stage 1 Due although the company had dealt
-- with it. Phil: mark that real meeting as the one that dealt with the stage, rather than record a
-- second meeting on a date it did not happen.
--
-- WHAT. One column, false for every meeting. When true, lib/absence/stage-history.ts lets that
-- held meeting deal with its stage reached later, but only inside the rolling window that reached
-- the stage; a meeting on or after the date is always preferred. Nothing reads it with the switch
-- off. Set per meeting by Be Care Compliant on a company's request, audit logged; no screen sets it.
--
-- Safe to run twice.

alter table public.absence_meetings
  add column if not exists deals_with_later boolean not null default false;

comment on column public.absence_meetings.deals_with_later is
  'Held before its stage was reached but dealt with it (0458). Counts only inside the window that reached the stage.';
