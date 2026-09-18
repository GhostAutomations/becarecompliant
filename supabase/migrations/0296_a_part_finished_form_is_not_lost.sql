-- 0296_a_part_finished_form_is_not_lost
-- A carer completing a Check in someone's front room is interrupted: the visit ends,
-- the phone locks, the battery goes. Every Form in the product is rendered by the one
-- shared renderer, so every Form now keeps a draft of what has been typed, exactly as
-- the On Call Handover has since 0116 (on_call_log_drafts).
--
-- The difference from the Handover, and the reason this table is keyed differently:
-- the Handover is one per user, because nobody has two handovers on the go. A carer
-- DOES have two forms on the go -- a spot check on a Service User and a supervision on
-- a colleague -- so the key is the user AND which form. One row per user would mean
-- opening the second form silently destroyed the first.
--
-- Self-expiring: reads ignore anything older than 12 hours and the row is overwritten
-- by the next save, so nothing has to sweep up after it.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

create table if not exists public.form_drafts (
  user_id uuid not null references auth.users(id) on delete cascade,
  draft_key text not null,
  company_id uuid not null references public.companies(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, draft_key)
);

alter table public.form_drafts enable row level security;

-- A user only ever sees and writes their own drafts. Nobody reads anybody else's
-- half-written answers about a person -- not a manager, not an admin.
create policy form_drafts_select on public.form_drafts
  for select to authenticated using (user_id = auth.uid());
create policy form_drafts_insert on public.form_drafts
  for insert to authenticated with check (user_id = auth.uid());
create policy form_drafts_update on public.form_drafts
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy form_drafts_delete on public.form_drafts
  for delete to authenticated using (user_id = auth.uid());
