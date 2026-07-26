-- 0130_holiday_cancel_and_amend.sql
-- Plans change. Until now a holiday decision was final: nobody could withdraw a
-- pending request, cancel an approved one, or fix a wrong date without leaving a
-- ghost in the calendar.
--
--   cancel_holiday_request : a Branch Manager and above cancels a pending or
--     approved holiday with a reason; the person who submitted it in the app can
--     withdraw their own while it is still pending. A public form submitter has
--     no login, so a Manager cancels on their behalf.
--   amend_holiday_request  : a Branch Manager and above corrects the dates.
--
-- A cancelled holiday keeps its row (and its Evidence) so the history stays
-- readable; it simply leaves the calendar and the pending strip.
--
-- Clash detection is deliberately NOT a function here: the Holiday page already
-- holds every request the user may see, so overlaps are worked out in the page
-- rather than one round trip per pending request.

alter table public.holiday_requests
  drop constraint if exists holiday_requests_status_check;

alter table public.holiday_requests
  add constraint holiday_requests_status_check
  check (status in ('pending', 'approved', 'declined', 'cancelled'));

alter table public.holiday_requests
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references public.profiles(id) on delete set null,
  add column if not exists cancel_reason text;

-- Who may decide on / manage this request: platform admin, company admin, or a
-- manager of its branch (is_branch_manager already covers the company-wide
-- Registered roles). One place, so cancel and amend cannot drift from decide.
create or replace function public.can_manage_holiday_request(p_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_company uuid; v_branch uuid;
begin
  select company_id, branch_id into v_company, v_branch
  from public.holiday_requests where id = p_id;
  if v_company is null then return false; end if;
  return public.is_platform_admin()
      or public.is_company_admin(v_company)
      or (v_branch is not null and public.is_branch_manager(v_branch));
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
  v_status text;
  v_requested_by uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select status, requested_by into v_status, v_requested_by
  from public.holiday_requests where id = p_id;
  if v_status is null then raise exception 'That holiday could not be found'; end if;
  if v_status = 'cancelled' then raise exception 'That holiday is already cancelled'; end if;
  if v_status = 'declined' then raise exception 'A declined request cannot be cancelled'; end if;

  -- A Manager may cancel any of their branch's holidays, pending or approved.
  -- The person who submitted it may withdraw their own, but only while pending:
  -- once it is approved the rota depends on it, so a Manager handles it.
  if not (
    public.can_manage_holiday_request(p_id)
    or (v_requested_by = auth.uid() and v_status = 'pending')
  ) then
    raise exception 'You do not have permission to cancel this holiday';
  end if;

  update public.holiday_requests
  set status = 'cancelled',
      cancelled_by = auth.uid(),
      cancelled_at = now(),
      cancel_reason = nullif(btrim(coalesce(p_reason, '')), '')
  where id = p_id;
end;
$$;

revoke all on function public.cancel_holiday_request(uuid, text) from public, anon;
grant execute on function public.cancel_holiday_request(uuid, text) to authenticated;

create or replace function public.amend_holiday_request(
  p_id uuid,
  p_start_date date,
  p_end_date date
) returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_status text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_start_date is null or p_end_date is null then
    raise exception 'Both dates are needed';
  end if;
  if p_end_date < p_start_date then
    raise exception 'The end date cannot be before the start date';
  end if;

  select status into v_status from public.holiday_requests where id = p_id;
  if v_status is null then raise exception 'That holiday could not be found'; end if;
  if v_status in ('declined', 'cancelled') then
    raise exception 'That holiday is no longer active';
  end if;
  if not public.can_manage_holiday_request(p_id) then
    raise exception 'You do not have permission to change these dates';
  end if;

  update public.holiday_requests
  set start_date = p_start_date, end_date = p_end_date
  where id = p_id;
end;
$$;

revoke all on function public.amend_holiday_request(uuid, date, date) from public, anon;
grant execute on function public.amend_holiday_request(uuid, date, date) to authenticated;
