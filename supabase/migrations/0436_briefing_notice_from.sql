-- 0436: who a memo or message is FROM, when it is sent on someone else's behalf (Phil, 2026-10-08:
-- "the memo came from me but i was sending it on behalf of someone else"). Frozen as text at send
-- time, so the PDF always says what was sent even if that person later changes role or leaves.
-- created_by still records who actually pressed Send. Null = from the sender.
alter table public.briefing_notices add column if not exists from_profile_id uuid references public.profiles(id) on delete set null;
alter table public.briefing_notices add column if not exists from_name text check (from_name is null or char_length(from_name) between 1 and 120);
alter table public.briefing_notices add column if not exists from_role text check (from_role is null or char_length(from_role) <= 120);
create index if not exists briefing_notices_from_profile_idx on public.briefing_notices (from_profile_id);
