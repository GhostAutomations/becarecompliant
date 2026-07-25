-- Per-company UI theme flag. Drives the Acme-only crisp "navy" theme in
-- app/(app)/layout.tsx (adds the .theme-navy class). Every other company
-- defaults to 'classic' and is unaffected.
alter table companies add column if not exists ui_theme text not null default 'classic';

-- Acme Care Company opts into the navy theme.
update companies set ui_theme = 'navy' where name = 'Acme Care Company';
