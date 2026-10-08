-- 0432_support_tickets
-- Tickets (Phil, 2026-10-08): office users (Supervisor and up) raise a ticket to the founder, to
-- report a problem or request a new feature, with a RAG rating (red urgent, amber can wait over
-- 24 hours, green up to five days) and up to three screenshots. The founder is texted when one is
-- raised, sees them on a Tickets tile in the Founder console, replies and sets the status (Open,
-- In progress, Resolved). The company follows the status and the replies.
-- Who sees which (Phil, popup): Admin, Responsible Individual, Registered Manager and Branch
-- Manager see every ticket from their company; everyone else sees only the tickets they raised.
-- Every write goes through the definer functions below; the tables have SELECT policies only.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_number bigint generated always as identity unique,
  company_id uuid not null references public.companies(id) on delete cascade,
  raised_by uuid references public.profiles(id) on delete set null,
  raised_by_name text not null,
  raised_by_email text,
  raised_by_role text,
  kind text not null check (kind in ('problem', 'feature')),
  department text,
  area text,
  subject text not null check (char_length(btrim(subject)) between 1 and 200),
  description text not null check (char_length(btrim(description)) between 1 and 10000),
  rag text not null check (rag in ('red', 'amber', 'green')),
  chargeable_ack boolean not null default false,
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  screenshots jsonb not null default '[]'::jsonb,
  founder_texted_at timestamptz,
  founder_text_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint support_tickets_feature_ack check (kind <> 'feature' or chargeable_ack),
  constraint support_tickets_problem_department check (kind <> 'problem' or department is not null)
);
create index if not exists support_tickets_company_idx on public.support_tickets (company_id, created_at desc);
create index if not exists support_tickets_status_idx on public.support_tickets (status, created_at desc);

create table if not exists public.support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  author_name text not null,
  from_founder boolean not null default false,
  body text not null check (char_length(btrim(body)) between 1 and 5000),
  created_at timestamptz not null default now()
);
create index if not exists support_ticket_messages_ticket_idx on public.support_ticket_messages (ticket_id, created_at);

alter table public.support_tickets enable row level security;
alter table public.support_ticket_messages enable row level security;

-- May the caller see this company's ticket raised by this person?
create or replace function public.can_see_support_ticket(p_company uuid, p_raised_by uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.is_platform_admin()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.status = 'active'
        and p.company_id = p_company
        and ( p.id = p_raised_by
           or p.role in ('company_admin', 'registered_individual', 'registered_manager', 'manager') )
    );
$$;
revoke all on function public.can_see_support_ticket(uuid, uuid) from public, anon;
grant execute on function public.can_see_support_ticket(uuid, uuid) to authenticated;

drop policy if exists support_tickets_select on public.support_tickets;
create policy support_tickets_select on public.support_tickets for select
  using (public.can_see_support_ticket(company_id, raised_by));

drop policy if exists support_ticket_messages_select on public.support_ticket_messages;
create policy support_ticket_messages_select on public.support_ticket_messages for select
  using (exists (
    select 1 from public.support_tickets t
    where t.id = support_ticket_messages.ticket_id
      and public.can_see_support_ticket(t.company_id, t.raised_by)
  ));

-- Raise a ticket. Office roles only (Supervisor and up, Recruiter and On Call); the founder does
-- not raise tickets to himself.
create or replace function public.raise_support_ticket(
  p_kind text, p_department text, p_area text, p_subject text, p_description text,
  p_rag text, p_chargeable_ack boolean
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  me public.profiles%rowtype;
  v_id uuid;
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

  insert into public.support_tickets (
    company_id, raised_by, raised_by_name, raised_by_email, raised_by_role,
    kind, department, area, subject, description, rag, chargeable_ack
  ) values (
    me.company_id, me.id, coalesce(nullif(btrim(me.full_name), ''), me.email), me.email, me.role,
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

-- The screenshots, once uploaded. Only by whoever raised it, only once.
create or replace function public.attach_support_ticket_screenshots(p_ticket uuid, p_files jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if jsonb_typeof(p_files) <> 'array' or jsonb_array_length(p_files) > 3 then
    raise exception 'Up to three screenshots';
  end if;
  update public.support_tickets
  set screenshots = p_files, updated_at = now()
  where id = p_ticket and raised_by = auth.uid() and screenshots = '[]'::jsonb;
  if not found then raise exception 'That ticket could not be found'; end if;
end;
$$;
revoke all on function public.attach_support_ticket_screenshots(uuid, jsonb) from public, anon;
grant execute on function public.attach_support_ticket_screenshots(uuid, jsonb) to authenticated;

-- A reply, from the company (anyone who can see the ticket) or from the founder.
create or replace function public.reply_support_ticket(p_ticket uuid, p_body text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  t public.support_tickets%rowtype;
  me public.profiles%rowtype;
  v_id uuid;
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
          public.is_platform_admin(), btrim(p_body))
  returning id into v_id;
  update public.support_tickets set updated_at = now() where id = t.id;
  return v_id;
end;
$$;
revoke all on function public.reply_support_ticket(uuid, text) from public, anon;
grant execute on function public.reply_support_ticket(uuid, text) to authenticated;

-- The status, founder only.
create or replace function public.set_support_ticket_status(p_ticket uuid, p_status text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_platform_admin() then raise exception 'Only the founder sets a ticket status'; end if;
  if p_status not in ('open', 'in_progress', 'resolved') then raise exception 'Unknown status'; end if;
  update public.support_tickets
  set status = p_status,
      resolved_at = case when p_status = 'resolved' then now() else null end,
      updated_at = now()
  where id = p_ticket;
  if not found then raise exception 'That ticket could not be found'; end if;
end;
$$;
revoke all on function public.set_support_ticket_status(uuid, text) from public, anon;
grant execute on function public.set_support_ticket_status(uuid, text) to authenticated;

-- Reading only; every write is through the functions above.
grant select on public.support_tickets, public.support_ticket_messages to authenticated;
