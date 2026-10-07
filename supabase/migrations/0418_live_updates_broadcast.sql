-- 0418: live updates move from Realtime "postgres changes" to Broadcast (speed plan push 2,
-- Phil, 2026-10-07).
--
-- WHY. Measured 2026-10-07: the postgres changes poller cost 130ms of database time per poll,
-- about 20% of a CPU core, with ZERO subscribers, and every change was checked against every
-- open tab. Supabase recommends Broadcast for this. Instead of streaming row changes, each
-- watched table now sends ONE tiny message per statement per company: {"table": "<name>"} on the
-- private channel "company:<company id>". No personal data is in the message; the screens use it
-- only as a nudge to refresh themselves through the normal, permission checked page load.
--
-- WHO MAY LISTEN. A private channel is joined only if this rule on realtime.messages allows it:
-- an active member of that company, or the founder (any company channel, and "founder").
--
-- SAFE. realtime.send swallows its own errors, so a Realtime problem can never fail a save.
-- Statement level, so a bulk change of 500 rows sends one message, not 500.

create or replace function public.bcc_broadcast_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cid uuid;
begin
  if tg_table_name = 'founder_emails' then
    perform realtime.send(jsonb_build_object('table', tg_table_name), 'changed', 'founder', true);
    return null;
  end if;
  if tg_op = 'INSERT' then
    for cid in select distinct n.company_id from new_rows n where n.company_id is not null loop
      perform realtime.send(jsonb_build_object('table', tg_table_name), 'changed', 'company:' || cid, true);
    end loop;
  elsif tg_op = 'UPDATE' then
    for cid in
      select distinct x.company_id from (
        select n.company_id from new_rows n union select o.company_id from old_rows o
      ) x where x.company_id is not null
    loop
      perform realtime.send(jsonb_build_object('table', tg_table_name), 'changed', 'company:' || cid, true);
    end loop;
  else
    for cid in select distinct o.company_id from old_rows o where o.company_id is not null loop
      perform realtime.send(jsonb_build_object('table', tg_table_name), 'changed', 'company:' || cid, true);
    end loop;
  end if;
  return null;
end;
$$;

revoke all on function public.bcc_broadcast_change() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'people', 'check_instances', 'person_trackers', 'service_users', 'service_user_trackers',
    'rtw_questionnaires', 'absence_events', 'absence_meetings', 'invites', 'profiles', 'complaints',
    'assignments', 'on_call_logs', 'on_call_shifts', 'holiday_requests', 'person_training',
    'training_courses', 'public_form_submissions', 'incidents', 'founder_emails'
  ] loop
    execute format('drop trigger if exists bcc_live_ins on public.%I', t);
    execute format('drop trigger if exists bcc_live_upd on public.%I', t);
    execute format('drop trigger if exists bcc_live_del on public.%I', t);
    execute format('create trigger bcc_live_ins after insert on public.%I referencing new table as new_rows for each statement execute function public.bcc_broadcast_change()', t);
    execute format('create trigger bcc_live_upd after update on public.%I referencing old table as old_rows new table as new_rows for each statement execute function public.bcc_broadcast_change()', t);
    execute format('create trigger bcc_live_del after delete on public.%I referencing old table as old_rows for each statement execute function public.bcc_broadcast_change()', t);
  end loop;
end $$;

-- Who may join a private live channel.
create policy bcc_live_channel_read on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and (
      (select realtime.topic()) = 'company:' || (select public.my_company_id())::text
      or (
        (select public.is_platform_admin())
        and ((select realtime.topic()) like 'company:%' or (select realtime.topic()) = 'founder')
      )
    )
  );
