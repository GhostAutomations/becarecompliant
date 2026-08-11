-- A per-company switch for the "holiday request submitted" approver email.
-- Defaults TRUE so no existing customer changes behaviour; set FALSE to silence
-- the approver notification (the request itself, its approval flow and the
-- decision email to the requester are unaffected).
alter table companies
  add column if not exists holiday_request_emails_enabled boolean not null default true;

comment on column companies.holiday_request_emails_enabled is
  'When false, notifyHolidayRequested sends no approver email for this company. Default true.';
