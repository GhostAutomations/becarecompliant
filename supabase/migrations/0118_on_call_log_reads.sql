-- 0118_on_call_log_reads
-- The call log no longer shows the notes in the list (they can be long); people
-- click into a shift to read them. Record who has read each shift so managers can
-- see it was picked up. One row per (log, user); first-read time is kept.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

create table if not exists public.on_call_log_reads (
  log_id uuid not null references public.on_call_logs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reader_name text,
  read_at timestamptz not null default now(),
  primary key (log_id, user_id)
);

alter table public.on_call_log_reads enable row level security;

-- Visible to anyone who can see the parent log (the subquery re-applies the log's
-- own RLS for this user).
create policy on_call_log_reads_select on public.on_call_log_reads
  for select to authenticated
  using (exists (select 1 from public.on_call_logs l where l.id = log_id));

-- A user records only their own read, and only for a log they can see.
create policy on_call_log_reads_insert on public.on_call_log_reads
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.on_call_logs l where l.id = log_id)
  );
