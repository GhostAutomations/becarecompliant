-- Rota and Visits Stage 5, after Phil's phone test (2026-10-16; docs/decisions/rota-visits.md,
-- Stage 5 decision 14): a carer's phone shows the notes for the service user from the last 24 hours
-- (was 48), and a pinned note ("Pin Note (48hrs)", the for_next_carer column) for 48 hours (was 3
-- days). Only rota_my_visit_notes changes (a module function); no table, policy or other function.

create or replace function public.rota_my_visit_notes()
returns table (visit_id uuid, notes jsonb, concerns jsonb)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_mine uuid[]; v_today date; r record; v_company uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in.' using errcode = '42501'; end if;
  v_mine := public.rota_my_person_ids();
  if coalesce(array_length(v_mine, 1), 0) = 0 then return; end if;
  v_today := (now() at time zone 'Europe/London')::date;

  -- The audit line: once a day per service user whose notes from others are shown.
  for r in
    select distinct rv.company_id, rv.service_user_id, su.full_name
      from public.rota_visit_assignments a
      join public.rota_visits rv on rv.id = a.visit_id and rv.status = 'published'
      join public.service_users su on su.id = rv.service_user_id
     where a.person_id = any (v_mine) and a.status = 'active'
       and rv.visit_date between v_today - 1 and v_today + 1
       and exists (select 1 from public.rota_care_notes n
                    where n.service_user_id = rv.service_user_id and not (n.person_id = any (v_mine))
                      and (n.happened_at >= now() - interval '24 hours' or (n.for_next_carer and n.happened_at >= now() - interval '48 hours')))
  loop
    insert into public.rota_note_views (company_id, profile_id, service_user_id, viewed_on)
    values (r.company_id, auth.uid(), r.service_user_id, v_today)
    on conflict do nothing;
    if found then
      insert into public.audit_log (company_id, actor_id, actor_role, action, entity_type, entity_id, summary, metadata)
      values (r.company_id, auth.uid(), (select p.role from public.profiles p where p.id = auth.uid()),
              'rota.care_notes_viewed', 'service_user', r.service_user_id::text,
              'Shown recent care notes on the Clock in page', jsonb_build_object('window_hours', 24));
    end if;
  end loop;

  return query
  with mine as (
    select distinct rv.id as visit_id, rv.service_user_id
      from public.rota_visit_assignments a
      join public.rota_visits rv on rv.id = a.visit_id and rv.status = 'published'
     where a.person_id = any (v_mine) and a.status = 'active'
       and rv.visit_date between v_today - 1 and v_today + 1
  )
  select m.visit_id,
         coalesce((select jsonb_agg(jsonb_build_object(
                     'id', n.id, 'event_id', n.event_id, 'visit_id', n.visit_id, 'author', n.author_name,
                     'mine', n.person_id = any (v_mine), 'body', n.body, 'for_next_carer', n.for_next_carer,
                     'corrects_note_id', n.corrects_note_id,
                     'corrected_at', (select min(c.happened_at) from public.rota_care_notes c where c.corrects_note_id = n.id),
                     'at', n.happened_at) order by n.happened_at)
                     from public.rota_care_notes n
                    where n.service_user_id = m.service_user_id
                      and (n.visit_id = m.visit_id and n.person_id = any (v_mine)
                           or n.happened_at >= now() - interval '24 hours'
                           or (n.for_next_carer and n.happened_at >= now() - interval '48 hours'))), '[]'::jsonb),
         coalesce((select jsonb_agg(jsonb_build_object(
                     'id', c.id, 'event_id', c.event_id, 'category', c.category, 'body', c.body, 'at', c.happened_at,
                     'status', c.status) order by c.happened_at)
                     from public.rota_concerns c
                    where c.visit_id = m.visit_id and c.person_id = any (v_mine)), '[]'::jsonb)
    from mine m;
end;
$$;

revoke all on function public.rota_my_visit_notes() from public, anon;
grant execute on function public.rota_my_visit_notes() to authenticated;
