-- 0064_complaints_realtime
-- Live updates for the Complaints register. RLS-protected tables need REPLICA
-- IDENTITY FULL for UPDATE/DELETE events to reach subscribers, and membership of
-- the supabase_realtime publication. The RealtimeRefresh helper subscribes
-- unfiltered (RLS scopes the events) with a 10s poll fallback. Applied to ref
-- bgrtcvyjuwopunpnudeu only.

alter table public.complaints replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'complaints'
  ) then
    alter publication supabase_realtime add table public.complaints;
  end if;
end $$;
