-- 0005_realtime_people
-- Phase 3: add the People tables to the supabase_realtime publication so the
-- shared RealtimeRefresh helper receives live change events for the register and
-- dashboard RAG rollups. REPLICA IDENTITY FULL is already set (migration 0004) so
-- UPDATE/DELETE events carry the full row through RLS. Subscriptions are made
-- unfiltered in the client (RLS scopes which events each user receives).
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

alter publication supabase_realtime add table public.people;
alter publication supabase_realtime add table public.check_instances;
