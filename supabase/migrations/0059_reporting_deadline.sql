-- 0059_reporting_deadline.sql
-- On time reporting deadline, separate from the operational recurrence interval.
--
-- A check's `interval` drives the register: when it goes amber and red, and when
-- the next cycle is due. Operators often set that interval tighter than the real
-- regulatory deadline to build in a buffer (e.g. Supervision on an 80 day interval
-- as a 10 day early warning against a three monthly, 90 day, regulatory deadline).
--
-- The on time report (local authority monitoring like the Cardiff PQS) should grade
-- each cycle against the REAL regulatory deadline, not the tighter operational one,
-- otherwise completions that fell inside the operator's own buffer are wrongly
-- counted as late and the score is understated. This column holds that regulatory
-- deadline in days. When null, the on time report falls back to the operational
-- interval, so nothing changes for checks without a stated regulatory deadline.

alter table public.check_definitions
  add column if not exists reporting_interval_days integer;

comment on column public.check_definitions.reporting_interval_days is
  'Regulatory deadline in days used by the on time (PQS) report. Null = grade against the operational interval. Does not affect the register, amber/red, or due date scheduling.';
