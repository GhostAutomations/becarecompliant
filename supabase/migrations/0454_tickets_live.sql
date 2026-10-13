-- 0454: the Tickets pages update live (Phil, 2026-10-13; docs/decisions/tickets.md).
--
-- HOW. The same Broadcast route every live screen uses (0418): when a ticket or a reply is saved,
-- the database sends one tiny "this table changed" nudge, with no ticket content in it, and the
-- open pages refresh themselves through their normal, permission checked load.
--
-- WHO HEARS IT (Phil: "Only the Founder receives every company's ticket events. A company's users
-- receive only their own company's tickets, and carers none.").
--   * The founder: on "founder", the channel only the founder may join (0418).
--   * A company: on its own channel "tickets:<company id>", NOT the company channel every login
--     (carers included) may join (audit F141). Only an active login of that company in a role that
--     uses Tickets (Supervisor and up, Recruiter, On Call) may join it; the founder may join any.
--   * The rule also checks each message's own channel, not only the channel asked for (audit F142,
--     Phil popup: ticket channel only; the shared rule for other screens is unchanged).
--
-- RIGHTS (audit F146, Phil popup "Yes, as part of this"). The three ticket tables kept Supabase's
-- default rights: anyone, signed in or not, held insert, update, delete and TRUNCATE (TRUNCATE
-- ignores row rules). Every ticket write goes through the definer functions (0432, 0453), so
-- signed in users keep only reading, and signed out users nothing.
--
-- Safe to run twice.

-- ---------------------------------------------------------------------------------------------
-- 1. The nudge.
-- ---------------------------------------------------------------------------------------------
create or replace function public.bcc_broadcast_ticket_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cid uuid;
begin
  for cid in
    select distinct x.company_id from (
      select n.company_id from new_rows n
      union
      select o.company_id from old_rows o
    ) x where x.company_id is not null
  loop
    perform realtime.send(jsonb_build_object('table', tg_table_name), 'changed', 'tickets:' || cid, true);
  end loop;
  perform realtime.send(jsonb_build_object('table', tg_table_name), 'changed', 'founder', true);
  return null;
end;
$$;
revoke all on function public.bcc_broadcast_ticket_change() from public, anon, authenticated;

-- INSERT has no old rows and DELETE no new ones, so each gets an empty stand in of the same shape.
create or replace function public.bcc_broadcast_ticket_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  for cid in select distinct n.company_id from new_rows n where n.company_id is not null loop
    perform realtime.send(jsonb_build_object('table', tg_table_name), 'changed', 'tickets:' || cid, true);
  end loop;
  perform realtime.send(jsonb_build_object('table', tg_table_name), 'changed', 'founder', true);
  return null;
end;
$$;
create or replace function public.bcc_broadcast_ticket_delete()
returns trigger language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  for cid in select distinct o.company_id from old_rows o where o.company_id is not null loop
    perform realtime.send(jsonb_build_object('table', tg_table_name), 'changed', 'tickets:' || cid, true);
  end loop;
  perform realtime.send(jsonb_build_object('table', tg_table_name), 'changed', 'founder', true);
  return null;
end;
$$;
revoke all on function public.bcc_broadcast_ticket_insert() from public, anon, authenticated;
revoke all on function public.bcc_broadcast_ticket_delete() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['support_tickets', 'support_ticket_messages'] loop
    execute format('drop trigger if exists bcc_live_ins on public.%I', t);
    execute format('drop trigger if exists bcc_live_upd on public.%I', t);
    execute format('drop trigger if exists bcc_live_del on public.%I', t);
    execute format('create trigger bcc_live_ins after insert on public.%I referencing new table as new_rows for each statement execute function public.bcc_broadcast_ticket_insert()', t);
    execute format('create trigger bcc_live_upd after update on public.%I referencing old table as old_rows new table as new_rows for each statement execute function public.bcc_broadcast_ticket_change()', t);
    execute format('create trigger bcc_live_del after delete on public.%I referencing old table as old_rows for each statement execute function public.bcc_broadcast_ticket_delete()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------------------------
-- 2. Who may join a company's ticket channel.
-- ---------------------------------------------------------------------------------------------
drop policy if exists bcc_live_tickets_read on realtime.messages;
create policy bcc_live_tickets_read on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and realtime.messages.topic = (select realtime.topic())
    and (select realtime.topic()) like 'tickets:%'
    and (
      (select public.is_platform_admin())
      or exists (
        select 1 from public.profiles p
        where p.id = (select auth.uid())
          and p.status = 'active'
          and p.company_id is not null
          and (select realtime.topic()) = 'tickets:' || p.company_id::text
          and p.role in ('company_admin', 'registered_individual', 'registered_manager', 'manager',
                         'supervisor', 'recruiter', 'on_call')
      )
    )
  );

-- ---------------------------------------------------------------------------------------------
-- 3. Rights on the ticket tables (F146): read only for signed in users, nothing for anyone else.
-- ---------------------------------------------------------------------------------------------
revoke all on public.support_tickets, public.support_ticket_messages, public.support_ticket_counters from anon, authenticated;
grant select on public.support_tickets, public.support_ticket_messages to authenticated;
