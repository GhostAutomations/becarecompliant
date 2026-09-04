-- 0215 — the founder inbox is pushed, not polled
--
-- Phil, 2026-09-04: "why cant we have it as a push like we have on other things like when forms
-- are submitted?" Quite right, and the answer is that I built a poll when this codebase already
-- had components/realtime-refresh.tsx doing exactly this for People, Service Users, complaints
-- and the dashboard. Reaching for a new mechanism instead of the one already there is how a
-- codebase ends up with two of everything.
--
-- Polling also caused a defect of its own: a refresh every twenty seconds moved the screen under
-- him while he was reading. A push only refreshes when something has genuinely changed, so the
-- screen sits still the rest of the time.
--
-- REPLICA IDENTITY FULL so UPDATE and DELETE events carry their row through — marking as read,
-- deleting and collecting a body are all updates, and without this they arrive empty and the
-- subscriber cannot tell what happened. The same reason people, check_instances and
-- person_trackers have it.

alter table public.founder_emails replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'founder_emails'
  ) then
    execute 'alter publication supabase_realtime add table public.founder_emails';
  end if;
end $$;
