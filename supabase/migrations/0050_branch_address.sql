-- 0050_branch_address
-- Phase 6 (Phil, 2026-07-12): the meeting Location becomes a dropdown, Office
-- or Teams. Office must print the FULL address in the formal letters, so each
-- branch carries its office address (multi-branch ready), edited in
-- Settings > Branches. Teams stores "Microsoft Teams" and the letters say a
-- Teams invite will follow shortly.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

alter table public.branches
  add column if not exists address text;
