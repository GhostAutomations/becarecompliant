-- 0142_return_to_work
-- Phase 10 Additions (Phil, popup 2026-07-27): a Return to Work happens after EVERY
-- absence at EVERY stage (his standing rule from 2026-07-11), so the SYSTEM raises it
-- rather than relying on a manager remembering. Kept on absence_events rather than in a
-- new table because it is exactly one per absence.
--
-- rtw_due_date is set by a trigger the moment an absence has a return or end date, so it
-- fires for the bulk importer and any future write path too, not just the action that
-- happens to set the date today. Outstanding = rtw_due_date set and rtw_evidence_id null.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

alter table public.absence_events
  add column if not exists rtw_due_date date,
  add column if not exists rtw_evidence_id uuid references public.evidence(id) on delete set null;

create index if not exists absence_events_rtw_outstanding_idx
  on public.absence_events (company_id, rtw_due_date)
  where rtw_evidence_id is null and rtw_due_date is not null;

create or replace function public.set_rtw_due()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.return_date, new.end_date) is not null and new.rtw_due_date is null then
    new.rtw_due_date := coalesce(new.return_date, new.end_date) + 3;
  end if;
  return new;
end;
$$;

drop trigger if exists absence_events_set_rtw_due on public.absence_events;
create trigger absence_events_set_rtw_due
  before insert or update of end_date, return_date on public.absence_events
  for each row execute function public.set_rtw_due();

-- Backfill absences that already ended, so the list is honest from day one.
update public.absence_events
set rtw_due_date = coalesce(return_date, end_date) + 3
where rtw_due_date is null
  and rtw_evidence_id is null
  and coalesce(return_date, end_date) is not null;
