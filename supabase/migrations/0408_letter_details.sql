-- 0408_letter_details
-- Phil, 2026-10-06, for the absence meeting invitation letter in Thistle Care's own layout
-- (agreed by popup):
--   * absence_config.meeting_name: what the company calls these meetings. Thistle hold
--     "Disciplinary hearing"s; blank keeps "absence management meeting". Used in every letter,
--     email and calendar invite about a booked meeting.
--   * branches.phone: the office phone number printed on the letterhead with its address.
--   * people.home_address: printed under the date on letters to the employee. Personal data, held
--     for the employment relationship like the rest of the record; read and written under the
--     people table's existing RLS, included in a subject access export with the record.
-- Applied to the becarecompliant Supabase project ONLY (bgrtcvyjuwopunpnudeu).

alter table public.absence_config add column if not exists meeting_name text
  check (meeting_name is null or char_length(meeting_name) between 1 and 60);
alter table public.branches add column if not exists phone text
  check (phone is null or char_length(phone) <= 40);
alter table public.people add column if not exists home_address text
  check (home_address is null or char_length(home_address) <= 400);
