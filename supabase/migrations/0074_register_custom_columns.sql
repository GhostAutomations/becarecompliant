-- 0074_register_custom_columns
-- Item 4 (Phase 10 Additions): custom check types can appear as their own columns
-- on the People / Service User register matrix. Two per-check settings drive it:
--   show_on_register  — whether the check gets a column (default true, so a newly
--                       created custom check appears straight away).
--   register_position — the Admin-controlled left-to-right order (nulls sort last,
--                       falling back to sort_order then name).
-- The curated fixed columns (Supervision, DBS, Care Plan Review, etc.) are rendered
-- by the matrix directly and are excluded from this mechanism in code, so these two
-- columns only affect the non-curated (custom / extra) checks.
-- Applied to ref bgrtcvyjuwopunpnudeu only.

alter table public.check_definitions
  add column if not exists show_on_register boolean not null default true,
  add column if not exists register_position integer;
