-- 0481: Speed plan, Push 2 (Phil, 2026-10-15): the old Realtime publication emptied.
--
-- Live updates moved to Broadcast on 2026-10-07 (0418, lib/realtime/live-bus.ts): the database
-- sends {"table": ...} on each company's private channel, read through the
-- supabase_realtime_messages publication and its replication slot, which this leaves alone. Nothing
-- in the code subscribes to database changes (postgres_changes) any more, and no replication slot
-- reads supabase_realtime. Measured 2026-10-15: no Realtime poller calls in 60 seconds.
--
-- The 18 tables are taken out so the old, per subscriber change polling (2.6 million calls before
-- 0418) can never come back by accident. The publication itself is kept, empty, because Supabase
-- expects it to exist. Tables, rows, policies and replica identity are not touched.
--
-- To undo: alter publication supabase_realtime add table <the 18 tables below>;

do $empty$
declare
  t record;
begin
  for t in
    select schemaname, tablename from pg_publication_tables where pubname = 'supabase_realtime'
  loop
    execute format('alter publication supabase_realtime drop table %I.%I', t.schemaname, t.tablename);
  end loop;
end;
$empty$;

-- At the time of writing these were: check_instances, complaints, founder_emails, incidents,
-- invites, on_call_logs, on_call_shifts, people, person_trackers, person_training,
-- planner_bookings, profiles, public_form_submissions, rtw_questionnaires,
-- service_user_assignments, service_user_trackers, service_users, training_courses.
