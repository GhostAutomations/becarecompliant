-- 0440_holiday_back_at_work.sql
--
-- Found testing the holiday calendar popup, 2026-10-09: changing a holiday's dates (the office's
-- Edit dates, or a carer's change from the portal) left its "Back at work" date as it was, so a
-- holiday moved to end on the 23rd still said back at work on the 23rd.
--
-- Phil, by popup: ask for it with the new dates. Edit dates and Change dates now carry a Back at
-- work date, filled in as the day after the new end date and changeable. It must fall after the
-- last day of the holiday. When a change is declined, withdrawn or cancelled, the agreed Back at
-- work date comes back with the agreed dates (previous_return_to_work_date, like 0438's
-- previous_start_date). A caller that sends no date gets the day after the end date.
--
-- The functions are 0438's, unchanged apart from the Back at work date.
--
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

-- THE BACK AT WORK DATE HAD NO COLUMN: it was read from the answers of the request's form (its
-- Evidence, which never changes). return_to_work_date is now the date agreed since, and when it is
-- null the form's answer still stands, so every holiday booked before today reads as it did.
-- previous_return_to_work_date holds the agreed one while a carer's change waits (null again
-- meaning "the form's answer").
alter table public.holiday_requests
  add column if not exists return_to_work_date date,
  add column if not exists previous_return_to_work_date date;

drop function if exists public.request_holiday_change(uuid, date, date, text);
drop function if exists public.amend_holiday_request(uuid, date, date, text);

create or replace function public.request_holiday_change(
  p_id uuid,
  p_start_date date,
  p_end_date date,
  p_reason text,
  p_return_to_work date default null
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
  v_rtw date := coalesce(p_return_to_work, p_end_date + 1);
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if v_reason is null then raise exception 'Please give a reason for the change.'; end if;
  if p_start_date is null or p_end_date is null then raise exception 'Both dates are needed.'; end if;
  if p_end_date < p_start_date then raise exception 'The end date cannot be before the start date.'; end if;
  if v_rtw <= p_end_date then raise exception 'The back at work date must be after the last day of the holiday.'; end if;

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
  if p_start_date = r.start_date and p_end_date = r.end_date and v_rtw is not distinct from r.return_to_work_date then
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
      previous_return_to_work_date = r.return_to_work_date,
      start_date = p_start_date,
      end_date = p_end_date,
      return_to_work_date = v_rtw,
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
      return_to_work_date = v_rtw,
      change_reason = v_reason,
      change_requested_at = now(),
      change_requested_by = auth.uid()
    where id = p_id;
    v_kind := 'change_requested';
  else
    -- Not decided yet: it simply asks for different dates.
    update public.holiday_requests set start_date = p_start_date, end_date = p_end_date, return_to_work_date = v_rtw
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
      return_to_work_date = r.previous_return_to_work_date,
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
      previous_return_to_work_date = r.return_to_work_date,
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
    return_to_work_date = r.previous_return_to_work_date,
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
    previous_decided_at = null,
    previous_return_to_work_date = null
  where id = p_id;

  insert into public.holiday_request_events
    (company_id, request_id, kind, actor_id, actor_name,
     old_start_date, old_end_date, new_start_date, new_end_date, reason)
  values
    (r.company_id, p_id, 'change_withdrawn', auth.uid(), v_name,
     r.start_date, r.end_date, r.previous_start_date, r.previous_end_date, v_reason);
end;
$$;

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
      previous_decided_by = null, previous_decided_at = null,
      previous_return_to_work_date = null
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
      return_to_work_date = r.previous_return_to_work_date,
      status = 'approved', decided_by = r.previous_decided_by, decided_at = r.previous_decided_at,
      decision_note = null,
      change_kind = null, change_reason = null, change_requested_at = null, change_requested_by = null,
      previous_start_date = null, previous_end_date = null,
      previous_decided_by = null, previous_decided_at = null,
      previous_return_to_work_date = null
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
      previous_decided_by = null, previous_decided_at = null,
      previous_return_to_work_date = null
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
      previous_decided_by = null, previous_decided_at = null,
      previous_return_to_work_date = null
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

create or replace function public.amend_holiday_request(
  p_id uuid,
  p_start_date date,
  p_end_date date,
  p_reason text default null,
  p_return_to_work date default null
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
  v_rtw date := coalesce(p_return_to_work, p_end_date + 1);
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_start_date is null or p_end_date is null then
    raise exception 'Both dates are needed';
  end if;
  if p_end_date < p_start_date then
    raise exception 'The end date cannot be before the start date';
  end if;
  if v_reason is null then raise exception 'Please give a reason for the change.'; end if;
  if v_rtw <= p_end_date then raise exception 'The back at work date must be after the last day of the holiday.'; end if;

  select * into r from public.holiday_requests where id = p_id for update;
  if not found then raise exception 'That holiday could not be found'; end if;
  if r.status in ('declined', 'cancelled') then
    raise exception 'That holiday is no longer active';
  end if;
  if not public.can_manage_holiday_request(p_id) then
    raise exception 'You do not have permission to change these dates';
  end if;
  if p_start_date = r.start_date and p_end_date = r.end_date and v_rtw is not distinct from r.return_to_work_date then
    return;
  end if;

  update public.holiday_requests
  set start_date = p_start_date, end_date = p_end_date, return_to_work_date = v_rtw
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
    return_to_work_date = case when r.change_kind is not null then r.previous_return_to_work_date else r.return_to_work_date end,
    change_kind = null, change_reason = null, change_requested_at = null, change_requested_by = null,
    previous_start_date = null, previous_end_date = null,
    previous_decided_by = null, previous_decided_at = null,
    previous_return_to_work_date = null
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

revoke all on function public.request_holiday_change(uuid, date, date, text, date) from public, anon;
grant execute on function public.request_holiday_change(uuid, date, date, text, date) to authenticated;
revoke all on function public.request_holiday_cancel(uuid, text) from public, anon;
grant execute on function public.request_holiday_cancel(uuid, text) to authenticated;
revoke all on function public.withdraw_holiday_change(uuid, text) from public, anon;
grant execute on function public.withdraw_holiday_change(uuid, text) to authenticated;
revoke all on function public.decide_holiday_request(uuid, text, uuid, text) from public, anon;
grant execute on function public.decide_holiday_request(uuid, text, uuid, text) to authenticated;
revoke all on function public.amend_holiday_request(uuid, date, date, text, date) from public, anon;
grant execute on function public.amend_holiday_request(uuid, date, date, text, date) to authenticated;
revoke all on function public.cancel_holiday_request(uuid, text) from public, anon;
grant execute on function public.cancel_holiday_request(uuid, text) to authenticated;
