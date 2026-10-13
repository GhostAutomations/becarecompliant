-- 0466: personal outcomes can close as NOT ACHIEVED, with a reason (Phil, 2026-10-14, all companies;
-- Thistle ticket 8; docs/decisions/historic-outcomes.md).
--
-- An outcome closes Achieved or Not achieved. Not achieved counts in the outcomes figure as closed and
-- not met: in the total, not in the achieved or progressing count (outcome-consts, the one rule).
-- Removed outcomes (archived_at, what "no longer relevant" became in 0103) stay out of every count.
--
-- The close is an update row, as Achieved already is: kind 'not_achieved', its note the reason, and
-- when the past box is ticked its dated_on and entered_later, which the 0449 guard already checks
-- (only while the company's window is open, never in the future, never before the outcome began).
-- The outcome's achieved_at keeps meaning "when it closed", at midday for a past date.
--
-- Constraints only: no policy, function or trigger changes. Every existing row already passes.
-- Safe to run twice.

alter table public.service_user_outcomes drop constraint if exists service_user_outcomes_status_check;
alter table public.service_user_outcomes add constraint service_user_outcomes_status_check
  check (status in ('working_towards', 'progressing', 'no_change', 'regressing', 'achieved', 'not_achieved', 'no_longer_relevant'));

alter table public.service_user_outcome_updates drop constraint if exists service_user_outcome_updates_kind_check;
alter table public.service_user_outcome_updates add constraint service_user_outcome_updates_kind_check
  check (kind in ('progress', 'completed', 'reopened', 'not_achieved'));

-- A Not achieved close always says why.
alter table public.service_user_outcome_updates drop constraint if exists service_user_outcome_updates_not_achieved_reason;
alter table public.service_user_outcome_updates add constraint service_user_outcome_updates_not_achieved_reason
  check (kind <> 'not_achieved' or nullif(btrim(note), '') is not null);
