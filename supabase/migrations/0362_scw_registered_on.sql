-- 0362 SOCIAL CARE WALES: THE ISSUE DATE (Phil, 2026-10-01, popup).
--
-- Staff enter the date the registration was granted or last renewed; the renewal date (0361) is
-- worked out three years later (Registration Rules 2024, rule 25(2)), like a training renewal,
-- and can still be changed by hand when SCWonline shows something different.
alter table public.people add column if not exists scw_registered_on date;
comment on column public.people.scw_registered_on is
  'Date the Social Care Wales registration was granted or last renewed. The renewal date (scw_renewal_date) is three years later unless changed by hand.';
