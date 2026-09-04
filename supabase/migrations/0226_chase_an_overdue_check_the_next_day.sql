-- 0226_chase_an_overdue_check_the_next_day
-- The escalation timing shipped at 7 days for the first chaser, 14 for the second and
-- 14 for SMS. On a compliance product that is too slow: a check that went overdue on
-- Monday was not chased until the following Monday, and chasing a week late is how a
-- check ends up a month late. First chaser 1 day, second 3, SMS 5 (Phil, 2026-09-04).
--
-- Same rule as every default in this batch: the DEFAULT the product creates changes,
-- so no future company gets the old timing, AND existing companies still on the
-- untouched 7/14/14 move. A company that has set its own timing keeps it -- the update
-- matches all three old values together, so a row where even one was chosen is left
-- exactly as it is.
-- Applied to the becarecompliant project ONLY (ref bgrtcvyjuwopunpnudeu).

alter table public.notification_settings
  alter column chaser_first_days set default 1,
  alter column chaser_second_days set default 3,
  alter column sms_overdue_days set default 5;

update public.notification_settings
   set chaser_first_days = 1,
       chaser_second_days = 3,
       sms_overdue_days = 5
 where chaser_first_days = 7
   and chaser_second_days = 14
   and sms_overdue_days = 14;
