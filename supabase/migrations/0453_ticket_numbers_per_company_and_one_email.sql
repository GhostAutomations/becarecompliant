-- 0453: ticket numbers per company with no gaps, and one save for a reply and a status
-- (Phil, 2026-10-13; docs/decisions/tickets.md).
--
-- NUMBERS. A ticket's number came from one identity shared by every company, so Thistle's tickets
-- are 3, 4, 5, 6, 7 and 14: numbers were used by other companies' tests and by saves that failed
-- (an identity is never given back). Each company now has its own counter, taken inside the same
-- transaction as the insert. A ticket that fails to save, or a test that is rolled back, rolls the
-- counter back with it, so no number is ever skipped. The counter row is locked while it is taken,
-- so two tickets raised at the same moment queue for it and never share a number.
-- Existing tickets keep their numbers here; Thistle's are renumbered separately, on Phil's go.
--
-- ONE SAVE. The founder's reply and the status are saved together (founder_update_support_ticket),
-- so the app sends one email that says both. A customer's reply on a Resolved ticket reopens it to
-- In progress (Phil, popup).
--
-- Safe to run twice.

-- ---------------------------------------------------------------------------------------------
-- 1. The counter.
-- ---------------------------------------------------------------------------------------------
create table if not exists public.support_ticket_counters (
  company_id uuid primary key references public.companies(id) on delete cascade,
  last_number bigint not null check (last_number >= 0)
);
alter table public.support_ticket_counters enable row level security;
-- No policies: only the definer functions below read or write it.

-- Every company with tickets starts from the highest number it already has.
insert into public.support_ticket_counters (company_id, last_number)
select company_id, max(ticket_number) from public.support_tickets group by company_id
on conflict (company_id) do update set last_number = greatest(public.support_ticket_counters.last_number, excluded.last_number);

-- ---------------------------------------------------------------------------------------------
-- 2. The number is per company now, not one shared identity.
-- ---------------------------------------------------------------------------------------------
alter table public.support_tickets alter column ticket_number drop identity if exists;
alter table public.support_tickets alter column ticket_number set not null;
alter table public.support_tickets drop constraint if exists support_tickets_ticket_number_key;
do $$ begin
  alter table public.support_tickets add constraint support_tickets_company_number_key unique (company_id, ticket_number);
exception when duplicate_object then null; when duplicate_table then null; end $$;

-- ---------------------------------------------------------------------------------------------
-- 3. Raising a ticket takes the next number in the same transaction.
-- ---------------------------------------------------------------------------------------------
create or replace function public.raise_support_ticket(
  p_kind text, p_department text, p_area text, p_subject text, p_description text,
  p_rag text, p_chargeable_ack boolean
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  me public.profiles%rowtype;
  v_id uuid;
  v_number bigint;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into me from public.profiles where id = auth.uid();
  if me.id is null or me.status <> 'active' or me.company_id is null
     or me.role not in ('company_admin', 'registered_individual', 'registered_manager', 'manager',
                        'supervisor', 'recruiter', 'on_call') then
    raise exception 'Your role cannot raise a ticket';
  end if;
  if p_kind not in ('problem', 'feature') then raise exception 'Choose what the ticket is for'; end if;
  if p_kind = 'problem' and nullif(btrim(coalesce(p_department, '')), '') is null then
    raise exception 'Choose where the problem is';
  end if;
  if p_kind = 'feature' and not coalesce(p_chargeable_ack, false) then
    raise exception 'Tick to say you understand a new feature may be chargeable';
  end if;

  -- The next number for this company. Taken AFTER every check above, and in this transaction, so
  -- a refused or rolled back ticket gives it back.
  insert into public.support_ticket_counters (company_id, last_number)
  values (me.company_id, 1)
  on conflict (company_id) do update set last_number = public.support_ticket_counters.last_number + 1
  returning last_number into v_number;

  insert into public.support_tickets (
    company_id, ticket_number, raised_by, raised_by_name, raised_by_email, raised_by_role,
    kind, department, area, subject, description, rag, chargeable_ack
  ) values (
    me.company_id, v_number, me.id, coalesce(nullif(btrim(me.full_name), ''), me.email), me.email, me.role,
    p_kind,
    case when p_kind = 'problem' then nullif(btrim(p_department), '') end,
    case when p_kind = 'problem' then nullif(btrim(coalesce(p_area, '')), '') end,
    btrim(p_subject), btrim(p_description), p_rag,
    p_kind = 'feature' and coalesce(p_chargeable_ack, false)
  ) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.raise_support_ticket(text, text, text, text, text, text, boolean) from public, anon;
grant execute on function public.raise_support_ticket(text, text, text, text, text, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 4. A customer's reply on a Resolved ticket reopens it to In progress (Phil, popup).
-- ---------------------------------------------------------------------------------------------
create or replace function public.reply_support_ticket(p_ticket uuid, p_body text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  t public.support_tickets%rowtype;
  me public.profiles%rowtype;
  v_id uuid;
  v_founder boolean := public.is_platform_admin();
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into t from public.support_tickets where id = p_ticket;
  if t.id is null or not public.can_see_support_ticket(t.company_id, t.raised_by) then
    raise exception 'That ticket could not be found';
  end if;
  if nullif(btrim(coalesce(p_body, '')), '') is null then raise exception 'Write a reply first'; end if;
  select * into me from public.profiles where id = auth.uid();
  insert into public.support_ticket_messages (ticket_id, company_id, author_id, author_name, from_founder, body)
  values (t.id, t.company_id, me.id, coalesce(nullif(btrim(me.full_name), ''), me.email),
          v_founder, btrim(p_body))
  returning id into v_id;
  update public.support_tickets
     set updated_at = now(),
         status = case when not v_founder and t.status = 'resolved' then 'in_progress' else status end,
         resolved_at = case when not v_founder and t.status = 'resolved' then null else resolved_at end
   where id = t.id;
  return v_id;
end;
$$;
revoke all on function public.reply_support_ticket(uuid, text) from public, anon;
grant execute on function public.reply_support_ticket(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 5. The founder's reply and status, saved together in one transaction. Either may be left out
--    (no words: a status change only; same status: a reply only), but not both.
-- ---------------------------------------------------------------------------------------------
create or replace function public.founder_update_support_ticket(p_ticket uuid, p_body text, p_status text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  t public.support_tickets%rowtype;
  me public.profiles%rowtype;
  v_body text := nullif(btrim(coalesce(p_body, '')), '');
  v_status text := coalesce(nullif(btrim(coalesce(p_status, '')), ''), null);
  v_msg uuid;
  v_changed boolean;
begin
  if not public.is_platform_admin() then raise exception 'Only the founder answers a ticket here'; end if;
  select * into t from public.support_tickets where id = p_ticket for update;
  if t.id is null then raise exception 'That ticket could not be found'; end if;
  if v_status is null then v_status := t.status; end if;
  if v_status not in ('open', 'in_progress', 'resolved') then raise exception 'Unknown status'; end if;
  if v_body is not null and char_length(v_body) > 5000 then raise exception 'Keep a reply under 5,000 characters'; end if;
  v_changed := v_status <> t.status;
  if v_body is null and not v_changed then raise exception 'Write a reply or choose a new status'; end if;

  if v_body is not null then
    select * into me from public.profiles where id = auth.uid();
    insert into public.support_ticket_messages (ticket_id, company_id, author_id, author_name, from_founder, body)
    values (t.id, t.company_id, me.id, coalesce(nullif(btrim(me.full_name), ''), me.email), true, v_body)
    returning id into v_msg;
  end if;

  update public.support_tickets
     set status = v_status,
         resolved_at = case when v_changed then (case when v_status = 'resolved' then now() else null end) else resolved_at end,
         updated_at = now()
   where id = t.id;

  return jsonb_build_object('message_id', v_msg, 'status_from', t.status, 'status_to', v_status, 'status_changed', v_changed);
end;
$$;
revoke all on function public.founder_update_support_ticket(uuid, text, text) from public, anon;
grant execute on function public.founder_update_support_ticket(uuid, text, text) to authenticated;

select public.install_company_link_triggers();
