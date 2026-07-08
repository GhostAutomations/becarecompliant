-- 0015_people_column_labels
-- Per-company shorthand labels for the People register columns (set in Settings >
-- People > Column names), so admins can shorten headers and fit more on screen.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).
alter table public.companies
  add column if not exists people_column_labels jsonb not null default '{}'::jsonb;
