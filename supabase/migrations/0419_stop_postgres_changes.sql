-- 0419: switch off the old live update route (speed plan push 2, Phil, 2026-10-07). Run ONLY
-- after 0418 is applied and the live push is proven on the new Broadcast route.
--
-- Nothing in the app subscribes to postgres changes any more (lib/realtime/live-bus.ts is the
-- only Realtime user, and it uses Broadcast). Taking every table out of the supabase_realtime
-- publication leaves the old poller nothing to stream. Reversible: add the tables back with
-- "alter publication supabase_realtime add table ...".

do $$
declare
  t record;
begin
  for t in select schemaname, tablename from pg_publication_tables where pubname = 'supabase_realtime' loop
    execute format('alter publication supabase_realtime drop table %I.%I', t.schemaname, t.tablename);
  end loop;
end $$;
