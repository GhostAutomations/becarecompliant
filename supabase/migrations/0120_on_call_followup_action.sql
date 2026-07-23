-- 0120_on_call_followup_action
-- An urgent follow-up is resolved by a manager AFTER the shift (often after the
-- shift itself has been finalised/locked). Add action notes + completion stamp,
-- resolved through a dedicated path that is NOT blocked by the shift lock. Once
-- follow_up_done is set it drops off the manager dashboard.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

alter table public.on_call_logs add column if not exists follow_up_action text;
alter table public.on_call_logs add column if not exists follow_up_done_at timestamptz;
alter table public.on_call_logs add column if not exists follow_up_done_by uuid references auth.users(id) on delete set null;
