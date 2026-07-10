-- 0033_branch_service_user_type
-- Each branch has a Service User type: Simple or Complex (Phil, 2026-07-10). Set in
-- Settings > Service Users Type. Defaults to Simple. Only the type is editable here;
-- branches are created elsewhere. Company Admins edit it (branches_update RLS).
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

alter table public.branches
  add column if not exists service_user_type text not null default 'simple'
    check (service_user_type in ('simple', 'complex'));
