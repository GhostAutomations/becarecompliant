-- 0364 CIW's own status on a notice (Phil, 2026-10-01, after reading Thistle's CIW reports).
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).
--
-- A CIW report's Summary of Non-Compliance gives each notice one of four statuses:
--   new           identified at this inspection
--   reviewed      reviewed and not achieved, the target date is still in the future
--   not_achieved  tested at this inspection and not achieved
--   achieved      tested at this inspection and achieved
-- "achieved" is the one that closes it, so it goes with resolved_on: every other status leaves
-- the notice open and counting against its theme.

alter table public.inspection_notices
  add column if not exists status text not null default 'new'
  check (status in ('new', 'reviewed', 'not_achieved', 'achieved'));

update public.inspection_notices set status = 'achieved' where resolved_on is not null and status <> 'achieved';
