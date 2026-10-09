-- 0438_holiday_changes.sql
--
-- Thistle asked, Phil passed it on 2026-10-09: carers change or cancel their own holiday from the
-- portal, the office's changes carry a reason, and the portal tells the carer what the office did.
--
-- Decided by popup, 2026-10-09:
--   * A carer changes an APPROVED holiday: it goes back to PENDING on the new dates, shown to the
--     office as a "Change of holiday". Declined: the dates first agreed come back, approved.
--   * A carer asks to cancel an APPROVED holiday: it goes to PENDING as a "Cancellation request".
--     Approved: cancelled. Declined: back to approved.
--   * A carer changes or cancels only BEFORE the holiday starts. From its first day, only the office.
--   * A reason is required for every change and every cancel, by anyone.
--   * The office's changes (edit, cancel, and its decision on a change or cancellation request) show
--     at the top of the carer's portal until they press Got it, as well as the email.
--
-- Carers now go through request_holiday_change / request_holiday_cancel / withdraw_holiday_change,
-- which hold their rules. amend_holiday_request and cancel_holiday_request become the office's only:
-- the requester clause they carried would otherwise be a second way round "before it starts".
--
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

-- ---------------------------------------------------------------------------------------------
-- 1. A change in flight lives on the holiday itself.
-- ---------------------------------------------------------------------------------------------
alter table public.holiday_requests
  add column if not exists change_kind text,
  add column if not exists change_reason text,
  add column if not exists change_requested_at timestamptz,
  add column if not exists change_requested_by uuid references public.profiles(id) on delete set null,
  add column if not exists previous_start_date date,
  add column if not exists previous_end_date date,
  add column if not exists previous_decided_by uuid references public.profiles(id) on delete set null,
  add column if not exists previous_decided_at timestamptz;

alter table public.holiday_requests drop constraint if exists holiday_requests_change_kind_check;
alter table public.holiday_requests add constraint holiday_requests_change_kind_check check (
  change_kind is null
  or (change_kind in ('amend', 'cancel')
      and status = 'pending'
      and previous_start_date is not null
      and previous_end_date is not null)
);

create index if not exists holiday_requests_change_requested_by_idx
  on public.holiday_requests (change_requested_by);
create index if not exists holiday_requests_previous_decided_by_idx
  on public.holiday_requests (previous_decided_by);

-- ---------------------------------------------------------------------------------------------
-- 2. The history of every change, which also carries the portal notices.
-- ---------------------------------------------------------------------------------------------
create table if not exists public.holiday_request_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  request_id uuid not null references public.holiday_requests(id) on delete cascade,
  kind text not null check (kind in (
    'amended', 'cancelled',
    'request_amended', 'request_withdrawn',
    'change_requested', 'cancel_requested', 'change_withdrawn',
    'change_approved', 'change_declined', 'cancel_approved', 'cancel_declined'
  )),
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text,
  old_start_date date,
  old_end_date date,
  new_start_date date,
  new_end_date date,
  reason text,
  -- The office did something to somebody else's holiday: show it in their portal until Got it.
  notify_person boolean not null default false,
  seen_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists holiday_request_events_request_idx
  on public.holiday_request_events (request_id, created_at);
create index if not exists holiday_request_events_company_idx
  on public.holiday_request_events (company_id);
create index if not exists holiday_request_events_actor_idx
  on public.holiday_request_events (actor_id);

alter table public.holiday_request_events enable row level security;
revoke all on public.holiday_request_events from anon, authenticated;
grant select on public.holiday_request_events to authenticated;

-- Whoever may see the holiday may see its history, and nobody else. Rows are written only by the
-- functions below, so there is no insert, update or delete policy at all.
drop policy if exists holiday_request_events_select on public.holiday_request_events;
create policy holiday_request_events_select on public.holiday_request_events
  for select to authenticated
  using (exists (select 1 from public.holiday_requests h where h.id = holiday_request_events.request_id));

-- ---------------------------------------------------------------------------------------------
-- 3. Helpers.
-- ---------------------------------------------------------------------------------------------

-- The signed in user's own holiday: it is for their record, or they asked for it.
create or replace function public.holiday_request_is_mine(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select exists (
    select 1 from public.holiday_requests h
    where h.id = p_id
      and (
        h.requested_by = auth.uid()
        or (h.person_id is not null and exists (
              select 1 from public.people pe
              where pe.id = h.person_id and pe.profile_id = auth.uid()))
      )
  );
$$;

-- Used only inside the functions below, so nobody calls it directly.
revoke all on function public.holiday_request_is_mine(uuid) from public, anon, authenticated;

-- Whose holiday it is, for the portal notice: the login of the person it is for, or (with no record)
-- whoever asked for it. Null when nobody can be told in the portal.
create or replace function public.holiday_request_owner(p_id uuid)
returns uuid
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select case
    when h.person_id is not null then (select pe.profile_id from public.people pe where pe.id = h.person_id)
    else h.requested_by
  end
  from public.holiday_requests h
  where h.id = p_id;
$$;

revoke all on function public.holiday_request_owner(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 4. A carer changes the dates of their own holiday.
-- ---------------------------------------------------------------------------------------------
create or replace function public.request_holiday_change(
  p_id uuid,
  p_start_date date,
  p_end_date date,
  p_reason text
) returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  r public.holiday_requests%rowtype;
  v_today date := (now() at time zone 'Europe/London')::date;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_name text;
  v_kind text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if v_reason is null then raise exception 'Please give a reason for the change.'; end if;
  if p_start_date is null or p_end_date is null then raise exception 'Both dates are needed.'; end if;
  if p_end_date < p_start_date then raise exception 'The end date cannot be before the start date.'; end if;

  select * into r from public.holiday_requests where id = p_id for update;
  if not found then raise exception 'That holiday could not be found.'; end if;
  if not public.holiday_request_is_mine(p_id) then
    raise exception 'You can only change your own holiday.';
  end if;
  if r.status not in ('pending', 'approved') then
    raise exception 'That holiday is no longer active.';
  end if;
  if r.change_kind = 'cancel' then
    raise exception 'You have asked to cancel this holiday. Keep it first if you want to change the dates instead.';
  end if;
  -- Before it starts. With a change waiting, the dates first agreed count too: declining would put
  -- them back on a holiday that had already begun.
  if r.start_date <= v_today or coalesce(r.previous_start_date, r.start_date) <= v_today then
    raise exception 'This holiday has started, so only the office can change it now.';
  end if;
  if p_start_date <= v_today then
    raise exception 'The new dates must start after today.';
  end if;
  if p_start_date = r.start_date and p_end_date = r.end_date then
    raise exception 'Those are the dates it already has.';
  end if;

  select coalesce(nullif(btrim(full_name), ''), email) into v_name
  from public.profiles where id = auth.uid();

  if r.status = 'approved' then
    update public.holiday_requests set
      previous_start_date = r.start_date,
      previous_end_date = r.end_date,
      previous_decided_by = r.decided_by,
      previous_decided_at = r.decided_at,
      start_date = p_start_date,
      end_date = p_end_date,
      status = 'pending',
      change_kind = 'amend',
      change_reason = v_reason,
      change_requested_at = now(),
      change_requested_by = auth.uid(),
      decided_by = null,
      decided_at = null,
      decision_note = null
    where id = p_id;
    v_kind := 'change_requested';
  elsif r.change_kind = 'amend' then
    -- A change is already waiting: these are the dates now asked for; the agreed ones stay remembered.
    update public.holiday_requests set
      start_date = p_start_date,
      end_date = p_end_date,
      change_reason = v_reason,
      change_requested_at = now(),
      change_requested_by = auth.uid()
    where id = p_id;
    v_kind := 'change_requested';
  else
    -- Not decided yet: it simply asks for different dates.
    update public.holiday_requests set start_date = p_start_date, end_date = p_end_date
    where id = p_id;
    v_kind := 'request_amended';
  end if;

  insert into public.holiday_request_events
    (company_id, request_id, kind, actor_id, actor_name,
     old_start_date, old_end_date, new_start_date, new_end_date, reason)
  values
    (r.company_id, p_id, v_kind, auth.uid(), v_name,
     r.start_date, r.end_date, p_start_date, p_end_date, v_reason);

  return v_kind;
end;
$$;

revoke all on function public.request_holiday_change(uuid, date, date, text) from public, anon;
grant execute on function public.request_holiday_change(uuid, date, date, text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 5. A carer cancels their own holiday: withdrawn straight away while undecided, otherwise a
--    cancellation request for the office.
-- ---------------------------------------------------------------------------------------------
create or replace function public.request_holiday_cancel(
  p_id uuid,
  p_reason text
) returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  r public.holiday_requests%rowtype;
  v_today date := (now() at time zone 'Europe/London')::date;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_name text;
  v_kind text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if v_reason is null then raise exception 'Please give a reason for cancelling.'; end if;

  select * into r from public.holiday_requests where id = p_id for update;
  if not found then raise exception 'That holiday could not be found.'; end if;
  if not public.holiday_request_is_mine(p_id) then
    raise exception 'You can only cancel your own holiday.';
  end if;
  if r.status not in ('pending', 'approved') then
    raise exception 'That holiday is no longer active.';
  end if;
  if r.change_kind = 'cancel' then
    raise exception 'You have already asked to cancel this holiday.';
  end if;
  if r.start_date <= v_today or coalesce(r.previous_start_date, r.start_date) <= v_today then
    raise exception 'This holiday has started, so only the office can cancel it now.';
  end if;

  select coalesce(nullif(btrim(full_name), ''), email) into v_name
  from public.profiles where id = auth.uid();

  if r.status = 'pending' and r.change_kind is null then
    update public.holiday_requests set
      status = 'cancelled',
      cancelled_by = auth.uid(),
      cancelled_at = now(),
      cancel_reason = v_reason
    where id = p_id;
    v_kind := 'request_withdrawn';
    insert into public.holiday_request_events
      (company_id, request_id, kind, actor_id, actor_name, old_start_date, old_end_date, reason)
    values (r.company_id, p_id, v_kind, auth.uid(), v_name, r.start_date, r.end_date, v_reason);
  elsif r.change_kind = 'amend' then
    -- A change is waiting: cancelling asks to cancel the holiday as it was agreed.
    update public.holiday_requests set
      start_date = r.previous_start_date,
      end_date = r.previous_end_date,
      change_kind = 'cancel',
      change_reason = v_reason,
      change_requested_at = now(),
      change_requested_by = auth.uid()
    where id = p_id;
    v_kind := 'cancel_requested';
    insert into public.holiday_request_events
      (company_id, request_id, kind, actor_id, actor_name, old_start_date, old_end_date, reason)
    values (r.company_id, p_id, v_kind, auth.uid(), v_name, r.previous_start_date, r.previous_end_date, v_reason);
  else
    update public.holiday_requests set
      previous_start_date = r.start_date,
      previous_end_date = r.end_date,
      previous_decided_by = r.decided_by,
      previous_decided_at = r.decided_at,
      status = 'pending',
      change_kind = 'cancel',
      change_reason = v_reason,
      change_requested_at = now(),
      change_requested_by = auth.uid(),
      decided_by = null,
      decided_at = null,
      decision_note = null
    where id = p_id;
    v_kind := 'cancel_requested';
    insert into public.holiday_request_events
      (company_id, request_id, kind, actor_id, actor_name, old_start_date, old_end_date, reason)
    values (r.company_id, p_id, v_kind, auth.uid(), v_name, r.start_date, r.end_date, v_reason);
  end if;

  return v_kind;
end;
$$;

revoke all on function public.request_holiday_cancel(uuid, text) from public, anon;
grant execute on function public.request_holiday_cancel(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 6. A carer takes back their change or cancellation request: the agreed holiday stands again.
-- ---------------------------------------------------------------------------------------------
create or replace function public.withdraw_holiday_change(
  p_id uuid,
  p_reason text
) returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  r public.holiday_requests%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_name text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if v_reason is null then raise exception 'Please give a reason.'; end if;

  select * into r from public.holiday_requests where id = p_id for update;
  if not found then raise exception 'That holiday could not be found.'; end if;
  if not public.holiday_request_is_mine(p_id) then
    raise exception 'You can only change your own holiday.';
  end if;
  if r.status <> 'pending' or r.change_kind is null then
    raise exception 'There is no change waiting on this holiday.';
  end if;

  select coalesce(nullif(btrim(full_name), ''), email) into v_name
  from public.profiles where id = auth.uid();

  update public.holiday_requests set
    start_date = r.previous_start_date,
    end_date = r.previous_end_date,
    status = 'approved',
    decided_by = r.previous_decided_by,
    decided_at = r.previous_decided_at,
    change_kind = null,
    change_reason = null,
    change_requested_at = null,
    change_requested_by = null,
    previous_start_date = null,
    previous_end_date = null,
    previous_decided_by = null,
    previous_decided_at = null
  where id = p_id;

  insert into public.holiday_request_events
    (company_id, request_id, kind, actor_id, actor_name,
     old_start_date, old_end_date, new_start_date, new_end_date, reason)
  values
    (r.company_id, p_id, 'change_withdrawn', auth.uid(), v_name,
     r.start_date, r.end_date, r.previous_start_date, r.previous_end_date, v_reason);
end;
$$;

revoke all on function public.withdraw_holiday_change(uuid, text) from public, anon;
grant execute on function public.withdraw_holiday_change(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 7. The office decides. An ordinary request is decided exactly as before; a change or a
--    cancellation request is applied, or undone back to the holiday as agreed.
-- ---------------------------------------------------------------------------------------------
create or replace function public.decide_holiday_request(
  p_id uuid,
  p_status text,
  p_evidence_id uuid default null,
  p_note text default null
) returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  r public.holiday_requests%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_owner uuid;
  v_notify boolean;
  v_name text;
begin
  if p_status not in ('approved', 'declined') then
    raise exception 'decide_holiday_request: invalid status %', p_status;
  end if;

  select * into r from public.holiday_requests where id = p_id for update;
  if not found then raise exception 'That request could not be found.'; end if;

  if not public.can_manage_holiday(r.company_id, r.branch_id) then
    raise exception 'You do not have permission to decide this holiday.';
  end if;

  if r.status is distinct from 'pending' then
    raise exception 'That request has already been %.', r.status
      using errcode = 'check_violation';
  end if;

  if r.change_kind is null then
    update public.holiday_requests
      set status = p_status,
          decision_evidence_id = coalesce(p_evidence_id, decision_evidence_id),
          decided_by = auth.uid(), decided_at = now(), decision_note = p_note
      where id = p_id;
    return;
  end if;

  if p_status = 'declined' and v_note is null then
    raise exception 'Please give a reason for declining.';
  end if;

  select coalesce(nullif(btrim(full_name), ''), email) into v_name
  from public.profiles where id = auth.uid();
  v_owner := public.holiday_request_owner(p_id);
  v_notify := v_owner is not null and v_owner is distinct from auth.uid();

  if r.change_kind = 'amend' and p_status = 'approved' then
    update public.holiday_requests set
      status = 'approved', decided_by = auth.uid(), decided_at = now(), decision_note = v_note,
      change_kind = null, change_reason = null, change_requested_at = null, change_requested_by = null,
      previous_start_date = null, previous_end_date = null,
      previous_decided_by = null, previous_decided_at = null
    where id = p_id;
    insert into public.holiday_request_events
      (company_id, request_id, kind, actor_id, actor_name,
       old_start_date, old_end_date, new_start_date, new_end_date, reason, notify_person)
    values
      (r.company_id, p_id, 'change_approved', auth.uid(), v_name,
       r.previous_start_date, r.previous_end_date, r.start_date, r.end_date, v_note, v_notify);

  elsif r.change_kind = 'amend' then
    update public.holiday_requests set
      start_date = r.previous_start_date, end_date = r.previous_end_date,
      status = 'approved', decided_by = r.previous_decided_by, decided_at = r.previous_decided_at,
      decision_note = null,
      change_kind = null, change_reason = null, change_requested_at = null, change_requested_by = null,
      previous_start_date = null, previous_end_date = null,
      previous_decided_by = null, previous_decided_at = null
    where id = p_id;
    insert into public.holiday_request_events
      (company_id, request_id, kind, actor_id, actor_name,
       old_start_date, old_end_date, new_start_date, new_end_date, reason, notify_person)
    values
      (r.company_id, p_id, 'change_declined', auth.uid(), v_name,
       r.start_date, r.end_date, r.previous_start_date, r.previous_end_date, v_note, v_notify);

  elsif p_status = 'approved' then
    update public.holiday_requests set
      status = 'cancelled', cancelled_by = auth.uid(), cancelled_at = now(),
      cancel_reason = r.change_reason,
      change_kind = null, change_reason = null, change_requested_at = null, change_requested_by = null,
      previous_start_date = null, previous_end_date = null,
      previous_decided_by = null, previous_decided_at = null
    where id = p_id;
    insert into public.holiday_request_events
      (company_id, request_id, kind, actor_id, actor_name,
       old_start_date, old_end_date, reason, notify_person)
    values
      (r.company_id, p_id, 'cancel_approved', auth.uid(), v_name,
       r.start_date, r.end_date, v_note, v_notify);

  else
    update public.holiday_requests set
      status = 'approved', decided_by = r.previous_decided_by, decided_at = r.previous_decided_at,
      decision_note = null,
      change_kind = null, change_reason = null, change_requested_at = null, change_requested_by = null,
      previous_start_date = null, previous_end_date = null,
      previous_decided_by = null, previous_decided_at = null
    where id = p_id;
    insert into public.holiday_request_events
      (company_id, request_id, kind, actor_id, actor_name,
       old_start_date, old_end_date, new_start_date, new_end_date, reason, notify_person)
    values
      (r.company_id, p_id, 'cancel_declined', auth.uid(), v_name,
       r.start_date, r.end_date, r.start_date, r.end_date, v_note, v_notify);
  end if;
end;
$$;

revoke all on function public.decide_holiday_request(uuid, text, uuid, text) from public, anon;
grant execute on function public.decide_holiday_request(uuid, text, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 8. The office edits the dates: a reason now, and the carer's portal is told.
-- ---------------------------------------------------------------------------------------------
drop function if exists public.amend_holiday_request(uuid, date, date);

create or replace function public.amend_holiday_request(
  p_id uuid,
  p_start_date date,
  p_end_date date,
  p_reason text default null
) returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  r public.holiday_requests%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_owner uuid;
  v_name text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_start_date is null or p_end_date is null then
    raise exception 'Both dates are needed';
  end if;
  if p_end_date < p_start_date then
    raise exception 'The end date cannot be before the start date';
  end if;
  if v_reason is null then raise exception 'Please give a reason for the change.'; end if;

  select * into r from public.holiday_requests where id = p_id for update;
  if not found then raise exception 'That holiday could not be found'; end if;
  if r.status in ('declined', 'cancelled') then
    raise exception 'That holiday is no longer active';
  end if;
  if not public.can_manage_holiday_request(p_id) then
    raise exception 'You do not have permission to change these dates';
  end if;
  if p_start_date = r.start_date and p_end_date = r.end_date then
    return;
  end if;

  update public.holiday_requests
  set start_date = p_start_date, end_date = p_end_date
  where id = p_id;

  select coalesce(nullif(btrim(full_name), ''), email) into v_name
  from public.profiles where id = auth.uid();
  v_owner := public.holiday_request_owner(p_id);

  insert into public.holiday_request_events
    (company_id, request_id, kind, actor_id, actor_name,
     old_start_date, old_end_date, new_start_date, new_end_date, reason, notify_person)
  values
    (r.company_id, p_id, 'amended', auth.uid(), v_name,
     r.start_date, r.end_date, p_start_date, p_end_date, v_reason,
     v_owner is not null and v_owner is distinct from auth.uid());
end;
$$;

revoke all on function public.amend_holiday_request(uuid, date, date, text) from public, anon;
grant execute on function public.amend_holiday_request(uuid, date, date, text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 9. The office cancels: a reason, and the carer's portal is told. A change in flight goes with
--    it, and the holiday is left showing the dates that had been agreed.
-- ---------------------------------------------------------------------------------------------
create or replace function public.cancel_holiday_request(
  p_id uuid,
  p_reason text default null
) returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  r public.holiday_requests%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_owner uuid;
  v_name text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if v_reason is null then raise exception 'Please give a reason for cancelling.'; end if;

  select * into r from public.holiday_requests where id = p_id for update;
  if not found then raise exception 'That holiday could not be found'; end if;
  if r.status = 'cancelled' then raise exception 'That holiday is already cancelled'; end if;
  if r.status = 'declined' then raise exception 'A declined request cannot be cancelled'; end if;
  if not public.can_manage_holiday_request(p_id) then
    raise exception 'You do not have permission to cancel this holiday';
  end if;

  update public.holiday_requests set
    status = 'cancelled',
    cancelled_by = auth.uid(),
    cancelled_at = now(),
    cancel_reason = v_reason,
    start_date = coalesce(r.previous_start_date, r.start_date),
    end_date = coalesce(r.previous_end_date, r.end_date),
    change_kind = null, change_reason = null, change_requested_at = null, change_requested_by = null,
    previous_start_date = null, previous_end_date = null,
    previous_decided_by = null, previous_decided_at = null
  where id = p_id;

  select coalesce(nullif(btrim(full_name), ''), email) into v_name
  from public.profiles where id = auth.uid();
  v_owner := public.holiday_request_owner(p_id);

  insert into public.holiday_request_events
    (company_id, request_id, kind, actor_id, actor_name, old_start_date, old_end_date, reason, notify_person)
  values
    (r.company_id, p_id, 'cancelled', auth.uid(), v_name,
     coalesce(r.previous_start_date, r.start_date), coalesce(r.previous_end_date, r.end_date), v_reason,
     v_owner is not null and v_owner is distinct from auth.uid());
end;
$$;

revoke all on function public.cancel_holiday_request(uuid, text) from public, anon;
grant execute on function public.cancel_holiday_request(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 10. The carer presses Got it on a portal notice.
-- ---------------------------------------------------------------------------------------------
create or replace function public.mark_holiday_notice_seen(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  update public.holiday_request_events e
  set seen_at = now()
  where e.id = p_event_id
    and e.notify_person
    and e.seen_at is null
    and public.holiday_request_owner(e.request_id) = auth.uid();
end;
$$;

revoke all on function public.mark_holiday_notice_seen(uuid) from public, anon;
grant execute on function public.mark_holiday_notice_seen(uuid) to authenticated;
