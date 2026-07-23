-- 0116_on_call_log_draft
-- An out-of-hours call is often built up across a shift. Persist the in-progress
-- "Log a call" form per user so it survives logout / a device change and is
-- restored when they come back. One draft per user; self-expires after 12 hours
-- (reads ignore anything older, and the single row is overwritten on next save).
-- Cleared automatically when the call is submitted.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

create table if not exists public.on_call_log_drafts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.on_call_log_drafts enable row level security;

-- A user only ever sees and writes their own draft.
create policy on_call_log_drafts_select on public.on_call_log_drafts
  for select to authenticated using (user_id = auth.uid());
create policy on_call_log_drafts_insert on public.on_call_log_drafts
  for insert to authenticated with check (user_id = auth.uid());
create policy on_call_log_drafts_update on public.on_call_log_drafts
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy on_call_log_drafts_delete on public.on_call_log_drafts
  for delete to authenticated using (user_id = auth.uid());
