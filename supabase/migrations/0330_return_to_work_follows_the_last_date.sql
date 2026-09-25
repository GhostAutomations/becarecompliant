-- The Return to Work due date follows the last date of absence (Phil, 2026-09-24: "fix them").
--
-- 0142's trigger set rtw_due_date only while it was still empty, so:
--   * extending an absence (last date 21/09 changed to 25/09) left the interview due on 24/09,
--     three days after a date that was no longer the last day off;
--   * clearing the last date (the absence turned out to be still going) left an interview asked
--     for, for someone who had not come back.
-- Now, until the interview is recorded, the due date is always the last date (or return date)
-- plus three days, and there is none while neither is known. A recorded interview keeps the due
-- date it was done against: that is the Evidence, and moving it afterwards would rewrite history.
create or replace function public.set_rtw_due()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_back date := coalesce(new.return_date, new.end_date);
begin
  if new.rtw_evidence_id is not null then
    return new;
  end if;
  if v_back is null then
    new.rtw_due_date := null;
  else
    new.rtw_due_date := v_back + 3;
  end if;
  return new;
end;
$$;
