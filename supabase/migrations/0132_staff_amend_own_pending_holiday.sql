-- 0132_staff_amend_own_pending_holiday.sql
-- A Team Member can change their own holiday while it is still pending, which is
-- what Phil asked for ("current holiday bookings to amend or change"). The same
-- rule as withdrawing: your own, and only until it is approved, because after
-- that the rota depends on it and a Manager handles the change.

create or replace function public.amend_holiday_request(
  p_id uuid,
  p_start_date date,
  p_end_date date
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
  if p_start_date is null or p_end_date is null then
    raise exception 'Both dates are needed';
  end if;
  if p_end_date < p_start_date then
    raise exception 'The end date cannot be before the start date';
  end if;

  select status, requested_by into v_status, v_requested_by
  from public.holiday_requests where id = p_id;
  if v_status is null then raise exception 'That holiday could not be found'; end if;
  if v_status in ('declined', 'cancelled') then
    raise exception 'That holiday is no longer active';
  end if;

  if not (
    public.can_manage_holiday_request(p_id)
    or (v_requested_by = auth.uid() and v_status = 'pending')
  ) then
    raise exception 'You do not have permission to change these dates';
  end if;

  update public.holiday_requests
  set start_date = p_start_date, end_date = p_end_date
  where id = p_id;
end;
$$;

revoke all on function public.amend_holiday_request(uuid, date, date) from public, anon;
grant execute on function public.amend_holiday_request(uuid, date, date) to authenticated;
