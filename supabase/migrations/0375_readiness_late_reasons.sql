-- 0375 Readiness snagging (Phil, 2 Oct 2026, testing on Bevan).
-- S5 "Why is it late?": an Update about a check carries the reason it is late. Every reason but
--    Other is one an inspector may accept (staff on holiday, off sick, service user in hospital, next
--    of kin or attorney unavailable, booked). For a safety gap only a recognised reason, a booking or
--    recorded holiday or absence makes it the inspector's judgement rather than a Priority Action
--    Notice risk (lib/framework/gaps.ts).
-- S6 a DBS renewal action records the date the new application was submitted; it counts only when it
--    went in at least eight weeks before the renewal date.
-- Added beside the nine argument post_record_update (0374) rather than replacing it, so the code live
-- before this deploy keeps working; the older ones can be dropped once this is deployed.

alter table public.record_updates
  add column if not exists late_reason text,
  add column if not exists dbs_submitted_on date;
alter table public.record_updates drop constraint if exists record_updates_late_reason;
alter table public.record_updates add constraint record_updates_late_reason
  check (late_reason is null or late_reason in ('holiday', 'sickness', 'hospital', 'nok_unavailable', 'booked', 'other'));
alter table public.record_updates drop constraint if exists record_updates_reason_needs_about;
alter table public.record_updates add constraint record_updates_reason_needs_about
  check ((late_reason is null and dbs_submitted_on is null) or num_nonnulls(about_check_instance, about_tracker) = 1);
alter table public.record_updates drop constraint if exists record_updates_dbs_date_only_dbs;
alter table public.record_updates add constraint record_updates_dbs_date_only_dbs
  check (dbs_submitted_on is null or about_tracker = 'dbs_renewal');

create or replace function public.post_record_update(
  p_id uuid,
  p_person uuid,
  p_su uuid,
  p_parent uuid,
  p_body text,
  p_mentions uuid[],
  p_files jsonb,
  p_about_instance uuid,
  p_about_tracker text,
  p_late_reason text,
  p_dbs_submitted_on date
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_company uuid;
  v_name text;
  v_body text := btrim(coalesce(p_body, ''));
  v_files jsonb := coalesce(p_files, '[]'::jsonb);
  v_parent public.record_updates%rowtype;
  v_existing public.record_updates%rowtype;
  f jsonb;
begin
  if v_uid is null then raise exception 'Sign in again to post an update.'; end if;
  if p_id is null then raise exception 'That update could not be saved. Try again.'; end if;
  if num_nonnulls(p_person, p_su) <> 1 then raise exception 'An update belongs to one record.'; end if;

  select * into v_existing from public.record_updates where id = p_id;
  if found then
    if v_existing.author_id = v_uid then return p_id; end if;
    raise exception 'That update could not be saved. Try again.';
  end if;

  if not public.can_post_record_updates(p_person, p_su) then
    raise exception 'You cannot post an update on this record.';
  end if;

  if p_person is not null then
    select company_id into v_company from public.people where id = p_person;
  else
    select company_id into v_company from public.service_users where id = p_su;
  end if;
  if v_company is null then raise exception 'That record could not be found.'; end if;

  if p_parent is not null then
    select * into v_parent from public.record_updates where id = p_parent;
    if not found
       or v_parent.parent_id is not null
       or v_parent.person_id is distinct from p_person
       or v_parent.service_user_id is distinct from p_su then
      raise exception 'That reply does not belong to an update on this record.';
    end if;
  end if;

  -- What the update is about: one of THIS record's own checks, or (people only) its DBS renewal
  -- or Right to Work. Guarded by the record, not just the company.
  if p_about_instance is not null and p_about_tracker is not null then
    raise exception 'An update can be about one thing.';
  end if;
  if (p_about_instance is not null or p_about_tracker is not null) and p_parent is not null then
    raise exception 'A reply follows the update it answers.';
  end if;
  if p_about_instance is not null and not exists (
    select 1 from public.check_instances ci
     where ci.id = p_about_instance
       and ci.company_id = v_company
       and ci.person_id is not distinct from p_person
       and ci.service_user_id is not distinct from p_su
  ) then
    raise exception 'That check does not belong to this record.';
  end if;
  if p_about_tracker is not null then
    if p_about_tracker not in ('dbs_renewal', 'right_to_work') then
      raise exception 'Choose what the update is about from the list.';
    end if;
    if p_person is null then
      raise exception 'DBS and Right to Work belong to a person.';
    end if;
  end if;

  -- Why it is late, and for a DBS renewal when the new application went in (0375).
  if (p_late_reason is not null or p_dbs_submitted_on is not null)
     and p_about_instance is null and p_about_tracker is null then
    raise exception 'Say which check the reason is about.';
  end if;
  if p_late_reason is not null and p_late_reason not in ('holiday', 'sickness', 'hospital', 'nok_unavailable', 'booked', 'other') then
    raise exception 'Choose why it is late from the list.';
  end if;
  if p_dbs_submitted_on is not null then
    if p_about_tracker is distinct from 'dbs_renewal' then
      raise exception 'The application date is only for a DBS renewal.';
    end if;
    if p_dbs_submitted_on > (now() at time zone 'Europe/London')::date then
      raise exception 'The DBS application date cannot be in the future.';
    end if;
  end if;

  if jsonb_typeof(v_files) <> 'array' then raise exception 'The attachments could not be read.'; end if;
  if jsonb_array_length(v_files) > 5 then raise exception 'Attach up to 5 files to an update.'; end if;
  if v_body = '' and jsonb_array_length(v_files) = 0 then
    raise exception 'Write something or attach a file.';
  end if;
  if char_length(v_body) > 5000 then raise exception 'An update can be up to 5000 characters.'; end if;

  select full_name into v_name from public.profiles where id = v_uid;

  insert into public.record_updates (id, company_id, person_id, service_user_id, parent_id, author_id, author_name, body,
                                     about_check_instance, about_tracker,
                                     late_reason, dbs_submitted_on)
  values (p_id, v_company, p_person, p_su, p_parent, v_uid, coalesce(v_name, 'Unknown'), v_body,
          p_about_instance, p_about_tracker, p_late_reason, p_dbs_submitted_on);

  for f in select * from jsonb_array_elements(v_files) loop
    if coalesce(f->>'storage_path', '') not like (v_company::text || '/' || p_id::text || '/%') then
      raise exception 'An attachment is not part of this update. Start again.';
    end if;
    insert into public.record_update_files (company_id, update_id, storage_path, file_name, mime_type, bytes, sha256)
    values (v_company, p_id, f->>'storage_path', left(coalesce(f->>'file_name', 'file'), 200),
            coalesce(f->>'mime_type', 'application/octet-stream'), (f->>'bytes')::bigint, coalesce(f->>'sha256', ''));
  end loop;

  insert into public.record_update_mentions (update_id, profile_id, company_id, display_name)
  select p_id, a.profile_id, v_company, a.full_name
    from public.record_update_audience(p_person, p_su) a
   where a.profile_id = any (coalesce(p_mentions, '{}'::uuid[]))
     and a.profile_id <> v_uid
  on conflict do nothing;

  perform public.clear_record_update_pending(p_id);
  return p_id;
end;
$function$;

revoke all on function public.post_record_update(uuid, uuid, uuid, uuid, text, uuid[], jsonb, uuid, text, text, date) from public, anon;
grant execute on function public.post_record_update(uuid, uuid, uuid, uuid, text, uuid[], jsonb, uuid, text, text, date) to authenticated;
