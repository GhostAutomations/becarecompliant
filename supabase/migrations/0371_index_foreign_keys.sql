-- 0371: index every single column foreign key in public that has no index leading with it.
--
-- WHY (DEF-107, 2 Oct 2026). Deleting the demo company "Demo Test Ltd" from Founder, Demos
-- failed: "Could not delete the company: canceling statement due to statement timeout."
-- EXPLAIN ANALYZE of the company delete (rolled back) took 13.6s against the 8s limit the API
-- runs under. Almost all of it was Postgres checking foreign keys that point at a deleted row by
-- scanning the whole referencing table, because the referencing column had no index:
-- check_instances.last_evidence_id alone cost 2.2s for 1,432 evidence rows, and eleven more
-- columns pointing at evidence (holiday_requests, absence_events, absence_meetings, assignments,
-- rtw_questionnaires ...) about 0.5s each. The Supabase performance advisor flags the same thing
-- as "unindexed foreign keys". About 150 columns were affected, most of them created_by /
-- updated_by style user columns, which also slow down deleting a login.
--
-- Idempotent: a column that already has an index leading with it is skipped, and the names are
-- fixed, so running this twice creates nothing the second time.
do $$
declare
  r record;
  v_name text;
begin
  for r in
    select c.conrelid::regclass as tbl, cl.relname as tblname, a.attname as col
    from pg_constraint c
    join pg_class cl on cl.oid = c.conrelid
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f'
      and c.connamespace = 'public'::regnamespace
      and array_length(c.conkey, 1) = 1
      and not exists (
        select 1 from pg_index i
        where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1]
      )
  loop
    v_name := left(r.tblname || '_' || r.col, 50) || '_fk_' || substr(md5(r.tblname || '.' || r.col), 1, 6);
    execute format('create index if not exists %I on %s (%I)', v_name, r.tbl, r.col);
  end loop;
end
$$;
