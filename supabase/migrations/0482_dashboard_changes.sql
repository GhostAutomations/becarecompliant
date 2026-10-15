-- 0482: the Dashboard from each person's saved copy, updated by push (Phil, 2026-10-15).
--
-- Phil: "the dashboard updates every 10 minutes ... between every update, whatever is done ... is
-- done as a push ... if someone was to go off the screen and go back at 12 minutes past, unless
-- something has been done, they would see the same dash; if something has been done they would
-- see that change because it's been done as a push to the dashboard data". Popups: when the copy
-- is older than the last ten minute mark, show it and then update; every role.
--
-- Every tile now comes from the person's saved copy (dashboard_snapshots, 0413). To know which
-- tiles something done has made out of date, even for someone who is not looking at the Dashboard,
-- the database notes when each table a tile reads last changed, per company. On the next open, only
-- the tiles that read a changed table are worked out again, before the page is drawn, so something
-- done is never shown as still outstanding.
--
-- One row per company and table, overwritten. No personal data: a company, a table name and a
-- time. Read only by the server (service role). It can never fail a save: any error is swallowed,
-- and the ten minute rebuild covers anything missed. Statement level, so a bulk change of 500 rows
-- writes one row per company, not 500. Existing triggers (the live broadcast, 0418) are untouched.

create table if not exists public.dashboard_changes (
  -- No foreign key: a company being deleted must never be held up by a note about its last change.
  company_id uuid not null,
  table_name text not null,
  changed_at timestamptz not null default now(),
  primary key (company_id, table_name)
);
alter table public.dashboard_changes enable row level security;
revoke all on public.dashboard_changes from anon, authenticated;

create or replace function public.dashboard_note_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.dashboard_changes (company_id, table_name, changed_at)
    select distinct n.company_id, tg_table_name, now() from new_rows n where n.company_id is not null
    on conflict (company_id, table_name) do update set changed_at = excluded.changed_at;
  elsif tg_op = 'UPDATE' then
    insert into public.dashboard_changes (company_id, table_name, changed_at)
    select distinct x.company_id, tg_table_name, now() from (
      select n.company_id from new_rows n union select o.company_id from old_rows o
    ) x where x.company_id is not null
    on conflict (company_id, table_name) do update set changed_at = excluded.changed_at;
  else
    insert into public.dashboard_changes (company_id, table_name, changed_at)
    select distinct o.company_id, tg_table_name, now() from old_rows o where o.company_id is not null
    on conflict (company_id, table_name) do update set changed_at = excluded.changed_at;
  end if;
  return null;
exception when others then
  -- A note for the Dashboard must never fail a save; the copy is rebuilt every ten minutes anyway.
  return null;
end;
$$;
revoke all on function public.dashboard_note_change() from public, anon, authenticated;

-- The tables the Dashboard's tiles read (lib/dashboard/tiles.ts, TILE_TABLES).
do $$
declare
  t text;
begin
  foreach t in array array[
    'people', 'check_instances', 'check_definitions', 'person_trackers', 'service_users',
    'service_user_trackers', 'person_training', 'training_courses', 'company_policies',
    'planner_bookings', 'planner_booking_tasks', 'complaints', 'incidents', 'absence_events',
    'absence_meetings', 'rtw_questionnaires', 'absence_config', 'holiday_requests',
    'user_notifications', 'on_call_logs', 'usage_events', 'ai_credit_ledger',
    'company_ai_credits', 'company_sms_credits'
  ] loop
    execute format('drop trigger if exists bcc_dash_ins on public.%I', t);
    execute format('drop trigger if exists bcc_dash_upd on public.%I', t);
    execute format('drop trigger if exists bcc_dash_del on public.%I', t);
    execute format('create trigger bcc_dash_ins after insert on public.%I referencing new table as new_rows for each statement execute function public.dashboard_note_change()', t);
    execute format('create trigger bcc_dash_upd after update on public.%I referencing old table as old_rows new table as new_rows for each statement execute function public.dashboard_note_change()', t);
    execute format('create trigger bcc_dash_del after delete on public.%I referencing old table as old_rows for each statement execute function public.dashboard_note_change()', t);
  end loop;
end $$;
