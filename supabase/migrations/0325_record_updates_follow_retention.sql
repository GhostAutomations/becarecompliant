-- 0325 — Updates are erased on the same retention clock as the record's evidence (Phil, 2026-09-24:
-- "Build it next", after the Updates build left them outside retention).
--
-- THE RULE IS THE EVIDENCE RULE (lib/evidence/retention.ts, item 18): a record's personal data is
-- kept for eight years from its end of care, then goes, unless the record is on a retention hold.
-- End of care is a Person's leaving date once they are a leaver, and a Service User's discharge
-- date once they are cancelled. A record put back to active has no end of care, so nothing of it
-- expires: the same "the clock stops when the leaving is undone" rule evidence follows.
--
-- READ FROM THE RECORD, NOT STAMPED ON EACH UPDATE. Evidence carries retention_until per row
-- because evidence is kept (anonymised) for ever; an update written on a leaver's record the
-- week after they left would otherwise need its own date setting, and a stamped date can drift
-- from the record it belongs to. Asking the record at expiry time cannot.
--
-- UPDATES ARE DELETED, NOT ANONYMISED. Evidence keeps an empty shell because "a check was done on
-- this date" is compliance history. An update is a note; with its words gone there is nothing
-- left worth keeping. Deleting the update deletes its replies, files rows, mentions and the old
-- wording kept for Admins (all on delete cascade), and each file row's path goes to
-- record_update_file_trash as it goes, so the same nightly run removes the files themselves.
--
-- Service role only: the nightly retention run is the one caller.

create or replace function public.expire_record_update_retention(p_limit integer default 200)
returns table (company_id uuid, person_id uuid, service_user_id uuid, removed integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  with due_people as (
    select pe.id, pe.company_id
      from public.people pe
     where pe.employment_status = 'leaver'
       and pe.leaver_date is not null
       and (pe.leaver_date + interval '8 years')::date <= current_date
       and coalesce(pe.retention_hold, false) = false
       and exists (select 1 from public.record_updates u where u.person_id = pe.id)
     limit greatest(coalesce(p_limit, 200), 1)
  ),
  due_sus as (
    select su.id, su.company_id
      from public.service_users su
     where su.service_status = 'cancelled'
       and su.discharge_date is not null
       and (su.discharge_date + interval '8 years')::date <= current_date
       and coalesce(su.retention_hold, false) = false
       and exists (select 1 from public.record_updates u where u.service_user_id = su.id)
     limit greatest(coalesce(p_limit, 200), 1)
  ),
  gone_people as (
    delete from public.record_updates u
     using due_people d
     where u.person_id = d.id
    returning u.person_id as pid, d.company_id as cid
  ),
  gone_sus as (
    delete from public.record_updates u
     using due_sus d
     where u.service_user_id = d.id
    returning u.service_user_id as sid, d.company_id as cid
  )
  select g.cid, g.pid, null::uuid, count(*)::int from gone_people g group by g.cid, g.pid
  union all
  select g.cid, null::uuid, g.sid, count(*)::int from gone_sus g group by g.cid, g.sid;
end;
$$;

revoke all on function public.expire_record_update_retention(integer) from public, anon, authenticated;
