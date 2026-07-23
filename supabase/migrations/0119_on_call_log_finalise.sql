-- 0119_on_call_log_finalise
-- A shift log can be "finalised" by the on-call person once the shift is over.
-- After finalising it is locked: no more edits, and the Save button disappears.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

alter table public.on_call_logs add column if not exists finalised boolean not null default false;
alter table public.on_call_logs add column if not exists finalised_at timestamptz;
alter table public.on_call_logs add column if not exists finalised_by uuid references auth.users(id) on delete set null;
