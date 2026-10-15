-- Rota and Visits Stage 3 fix (found in the 0493 proof, 2026-10-16): clock in by text runs as the
-- server with nobody signed in, and company_module_on (0488) answers only for a signed in
-- person's own company or the Founder, so every text was "not recognised". The switch is read
-- directly from company_modules instead, as rota_generate_visits does (0491). Only this function
-- changes; it stays service role only.

create or replace function public.rota_clock_by_text(p_from text, p_kind text, p_code text, p_sid text)
returns table (result text, message text, company_id uuid, person_id uuid)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_digits text := public.rota_uk_mobile_digits(p_from);
  pl record; v_person uuid; v_people int; v_visit uuid; v_shift uuid; v_title text; v_starts timestamptz;
  v_event uuid := md5('rota-text:' || coalesce(p_sid, ''))::uuid; r record;
begin
  if p_kind not in ('in', 'out') or v_digits is null or p_sid is null then
    result := 'ignored'; message := null; return next; return;
  end if;
  if exists (select 1 from public.rota_clock_events e where e.event_id = v_event) then
    result := 'duplicate'; message := null; return next; return;
  end if;

  select * into pl from public.rota_places p
   where p.text_code = upper(btrim(p_code)) and exists (select 1 from public.company_modules m where m.company_id = p.company_id and m.module = 'rota_visits' and m.enabled)
     and exists (select 1 from public.people pe
                  where pe.company_id = p.company_id and pe.archived_at is null and pe.employment_status <> 'leaver'
                    and public.rota_uk_mobile_digits(pe.mobile) = v_digits)
   limit 1;
  if pl.id is null then
    result := 'unknown'; message := 'That code was not recognised. Check the code on the sheet at the home, or call the office.';
    return next; return;
  end if;
  company_id := pl.company_id;

  select count(*), (array_agg(pe.id))[1] into v_people, v_person from public.people pe
   where pe.company_id = pl.company_id and pe.archived_at is null and pe.employment_status <> 'leaver'
     and public.rota_uk_mobile_digits(pe.mobile) = v_digits;
  if v_people <> 1 then
    result := 'unknown'; message := 'This mobile is on more than one staff record, so it cannot clock in by text. Call the office.';
    return next; return;
  end if;
  person_id := v_person;

  if pl.for_branch then
    select s.id, coalesce(nullif(s.location, ''), 'your shift'), s.starts_at into v_shift, v_title, v_starts
      from public.rota_assignments a join public.rota_shifts s on s.id = a.shift_id
     where a.person_id = v_person and a.status = 'active' and s.status = 'published' and s.branch_id = pl.branch_id
       and now() between s.starts_at - interval '30 minutes' and s.ends_at + interval '3 hours'
     order by abs(extract(epoch from (s.starts_at - now()))) limit 1;
  else
    select v.id, su.full_name, v.starts_at into v_visit, v_title, v_starts
      from public.rota_visit_assignments a join public.rota_visits v on v.id = a.visit_id
      join public.service_users su on su.id = v.service_user_id
     where a.person_id = v_person and a.status = 'active' and v.status = 'published' and v.service_user_id = pl.service_user_id
       and now() between v.starts_at - interval '30 minutes' and v.ends_at + interval '3 hours'
     order by abs(extract(epoch from (v.starts_at - now()))) limit 1;
  end if;
  if v_visit is null and v_shift is null then
    result := 'no_visit'; message := 'You have no visit or shift there right now, so nothing was recorded. Call the office.';
    return next; return;
  end if;

  select * into r from public.rota_clock_record(
    v_event, v_person, v_visit, v_shift, p_kind, 'text', null, now(), null, null, null, null,
    null, null, null, null, null, null, null, null, '{}');

  result := 'accepted';
  message := case when p_kind = 'in' then 'Clocked in' else 'Clocked out' end
             || ' at ' || to_char(now() at time zone 'Europe/London', 'HH24:MI')
             || ' for the ' || to_char(v_starts at time zone 'Europe/London', 'HH24:MI')
             || case when v_visit is not null then ' visit.' else ' shift.' end;
  return next;
end;
$$;

revoke all on function public.rota_clock_by_text(text, text, text, text) from public, anon, authenticated;
grant execute on function public.rota_clock_by_text(text, text, text, text) to service_role;
