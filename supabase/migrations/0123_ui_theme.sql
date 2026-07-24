-- 0123_ui_theme
-- Per-company UI theme flag. 'classic' = the current navy/gold glass look (default,
-- every existing company). 'board_dark' = the Monday-style dark board theme, applied
-- only to companies opted in. Read in app/(app)/layout.tsx to add a .theme-board class
-- on the app shell; the whole restyle lives in a scoped CSS block in globals.css, so
-- reverting a company is just setting this back to 'classic' (no deploy needed).
-- Seeded for Acme Care Company (9d7d082b) only. Applied to becarecompliant
-- (ref bgrtcvyjuwopunpnudeu) ONLY.

alter table public.companies add column if not exists ui_theme text not null default 'classic';
alter table public.companies drop constraint if exists companies_ui_theme_check;
alter table public.companies add constraint companies_ui_theme_check
  check (ui_theme in ('classic', 'board_dark'));

update public.companies set ui_theme = 'board_dark'
where id = '9d7d082b-89d8-44f6-83b8-71b5155c7d51';
