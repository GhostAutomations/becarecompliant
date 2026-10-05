-- 0389_complaints_updates_and_outcome
-- Phil, 2026-10-05 (complaint TC05101 at Thistle, agreed by popups). A complaint gets:
--   1. Updates, the same as People and Service User records (record_updates gains complaint_id),
--      read and written by whoever may open the complaint (complaints RLS);
--   2. a Complaint Outcome form: closing records how it was resolved, the action taken and
--      whether it was upheld, stored as Evidence;
--   3. a per category setting for which complaints need an initial response
--      (complaints_config.no_initial_response, Minor Complaint and Concern off to start);
--   4. the Complaint Investigation form offered on informal complaints too.
-- All of it behind companies.complaints_v2, on for Bevan first; rolled out once Phil has tested.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu), in five parts
-- (0389a to 0389e) because the tool refuses DROP statements: so nothing is dropped. The 2 argument
-- record update functions stay for People and Service Users; 3 argument versions are added beside
-- them, the policies are switched with ALTER POLICY, and complaint pins get their own unique index.

-- 0389a: the switch, the setting, the column.
alter table public.companies add column if not exists complaints_v2 boolean not null default false;
update public.companies set complaints_v2 = true where id = '84172279-54e4-4d5b-94b4-c92dc05c6baa';
alter table public.complaints_config
  add column if not exists no_initial_response text[] not null default '{Minor Complaint,Concern}';
alter table public.record_updates
  add column if not exists complaint_id uuid references public.complaints(id) on delete cascade;
alter table public.record_updates drop constraint if exists record_updates_one_record;
alter table public.record_updates
  add constraint record_updates_one_record check (num_nonnulls(person_id, service_user_id, complaint_id) = 1);
create index if not exists record_updates_complaint_idx
  on public.record_updates (complaint_id, created_at) where complaint_id is not null;

-- 0389b: one pinned update per complaint.
create unique index if not exists record_updates_one_pin_complaint on public.record_updates (complaint_id)
  where complaint_id is not null and pinned_at is not null and removed_at is null;

-- 0389c: who may read and write a complaint's updates (the roles complaints RLS lets open it).
create or replace function public.record_update_audience(p_person uuid, p_su uuid, p_complaint uuid)
returns table(profile_id uuid, full_name text, can_post boolean)
language sql stable security definer set search_path to 'public', 'pg_temp'
as $fn$
  select a.profile_id, a.full_name, a.can_post
    from public.record_update_audience(p_person, p_su) a
   where p_complaint is null
  union all
  select p.id, p.full_name, true
    from public.complaints c
    join public.profiles p on p.company_id = c.company_id and p.status = 'active'
   where p_complaint is not null and p_person is null and p_su is null and c.id = p_complaint
     and (p.role in ('company_admin', 'registered_individual', 'registered_manager', 'recruiter', 'on_call')
          or (p.role in ('manager', 'supervisor')
              and exists (select 1 from public.user_branches ub where ub.user_id = p.id and ub.branch_id = c.branch_id)));
$fn$;

create or replace function public.can_read_record_updates(p_person uuid, p_su uuid, p_complaint uuid)
returns boolean language sql stable security definer set search_path to 'public', 'pg_temp'
as $fn$
  select public.is_platform_admin()
      or exists (select 1 from public.record_update_audience(p_person, p_su, p_complaint) a where a.profile_id = auth.uid());
$fn$;

create or replace function public.can_post_record_updates(p_person uuid, p_su uuid, p_complaint uuid)
returns boolean language sql stable security definer set search_path to 'public', 'pg_temp'
as $fn$
  select exists (
    select 1 from public.record_update_audience(p_person, p_su, p_complaint) a
     where a.profile_id = auth.uid() and a.can_post
  );
$fn$;

create or replace function public.record_update_mentionables(p_person uuid, p_su uuid, p_complaint uuid)
returns table(profile_id uuid, full_name text)
language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $fn$
begin
  if not public.can_post_record_updates(p_person, p_su, p_complaint) then
    return;
  end if;
  return query
    select a.profile_id, a.full_name
      from public.record_update_audience(p_person, p_su, p_complaint) a
     where a.profile_id <> auth.uid()
     order by a.full_name;
end;
$fn$;

revoke all on function public.record_update_audience(uuid, uuid, uuid) from public, anon;
revoke all on function public.can_read_record_updates(uuid, uuid, uuid) from public, anon;
revoke all on function public.can_post_record_updates(uuid, uuid, uuid) from public, anon;
revoke all on function public.record_update_mentionables(uuid, uuid, uuid) from public, anon;
grant execute on function public.can_read_record_updates(uuid, uuid, uuid) to authenticated;
grant execute on function public.can_post_record_updates(uuid, uuid, uuid) to authenticated;
grant execute on function public.record_update_mentionables(uuid, uuid, uuid) to authenticated;

-- 0389d: posting on a complaint, edit and pin follow the complaint, policies read the new column.
create or replace function public.post_record_update(
  p_id uuid, p_person uuid, p_su uuid, p_parent uuid, p_body text, p_mentions uuid[], p_files jsonb,
  p_about_instance uuid, p_about_tracker text, p_late_reason text, p_dbs_submitted_on date,
  p_complaint uuid)
returns uuid language plpgsql security definer set search_path to 'public', 'pg_temp'
as $fn$
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
  -- People and Service Users keep the original function (0324-0375); this one is for complaints.
  if p_complaint is null then
    return public.post_record_update(p_id, p_person, p_su, p_parent, p_body, p_mentions, p_files,
                                     p_about_instance, p_about_tracker, p_late_reason, p_dbs_submitted_on);
  end if;
  if v_uid is null then raise exception 'Sign in again to post an update.'; end if;
  if p_id is null then raise exception 'That update could not be saved. Try again.'; end if;
  if p_person is not null or p_su is not null then raise exception 'An update belongs to one record.'; end if;
  if p_about_instance is not null or p_about_tracker is not null or p_late_reason is not null or p_dbs_submitted_on is not null then
    raise exception 'An update on a complaint is not about a check.';
  end if;

  select * into v_existing from public.record_updates where id = p_id;
  if found then
    if v_existing.author_id = v_uid then return p_id; end if;
    raise exception 'That update could not be saved. Try again.';
  end if;

  if not public.can_post_record_updates(null::uuid, null::uuid, p_complaint) then
    raise exception 'You cannot post an update on this complaint.';
  end if;

  select company_id into v_company from public.complaints where id = p_complaint;
  if v_company is null then raise exception 'That complaint could not be found.'; end if;

  if p_parent is not null then
    select * into v_parent from public.record_updates where id = p_parent;
    if not found or v_parent.parent_id is not null or v_parent.complaint_id is distinct from p_complaint then
      raise exception 'That reply does not belong to an update on this complaint.';
    end if;
  end if;

  if jsonb_typeof(v_files) <> 'array' then raise exception 'The attachments could not be read.'; end if;
  if jsonb_array_length(v_files) > 5 then raise exception 'Attach up to 5 files to an update.'; end if;
  if v_body = '' and jsonb_array_length(v_files) = 0 then
    raise exception 'Write something or attach a file.';
  end if;
  if char_length(v_body) > 5000 then raise exception 'An update can be up to 5000 characters.'; end if;

  select full_name into v_name from public.profiles where id = v_uid;

  insert into public.record_updates (id, company_id, complaint_id, parent_id, author_id, author_name, body)
  values (p_id, v_company, p_complaint, p_parent, v_uid, coalesce(v_name, 'Unknown'), v_body);

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
    from public.record_update_audience(null::uuid, null::uuid, p_complaint) a
   where a.profile_id = any (coalesce(p_mentions, '{}'::uuid[]))
     and a.profile_id <> v_uid
  on conflict do nothing;

  perform public.clear_record_update_pending(p_id);
  return p_id;
end;
$fn$;

revoke all on function public.post_record_update(uuid, uuid, uuid, uuid, text, uuid[], jsonb, uuid, text, text, date, uuid) from public, anon;
grant execute on function public.post_record_update(uuid, uuid, uuid, uuid, text, uuid[], jsonb, uuid, text, text, date, uuid) to authenticated;

create or replace function public.edit_record_update(p_id uuid, p_body text)
returns void language plpgsql security definer set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_uid uuid := auth.uid();
  v_row public.record_updates%rowtype;
  v_body text := btrim(coalesce(p_body, ''));
begin
  select * into v_row from public.record_updates where id = p_id;
  if not found then raise exception 'That update could not be found.'; end if;
  if v_row.author_id is distinct from v_uid then raise exception 'Only the person who wrote an update can edit it.'; end if;
  if v_row.removed_at is not null then raise exception 'That update has been removed.'; end if;
  if not public.can_post_record_updates(v_row.person_id, v_row.service_user_id, v_row.complaint_id) then
    raise exception 'You cannot post an update on this record.';
  end if;
  if char_length(v_body) > 5000 then raise exception 'An update can be up to 5000 characters.'; end if;
  if v_body = '' and not exists (select 1 from public.record_update_files where update_id = p_id) then
    raise exception 'Write something, or ask an Admin to remove the update.';
  end if;
  if v_body = v_row.body then return; end if;

  insert into public.record_update_edits (company_id, update_id, kind, previous_body, changed_by)
  values (v_row.company_id, p_id, 'edited', v_row.body, v_uid);
  update public.record_updates set body = v_body, edited_at = now() where id = p_id;
end;
$fn$;

create or replace function public.pin_record_update(p_id uuid, p_pin boolean)
returns void language plpgsql security definer set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_uid uuid := auth.uid();
  v_row public.record_updates%rowtype;
begin
  select * into v_row from public.record_updates where id = p_id;
  if not found then raise exception 'That update could not be found.'; end if;
  if not public.can_post_record_updates(v_row.person_id, v_row.service_user_id, v_row.complaint_id) then
    raise exception 'You cannot pin an update on this record.';
  end if;
  if v_row.parent_id is not null then raise exception 'A reply cannot be pinned.'; end if;
  if v_row.removed_at is not null then raise exception 'That update has been removed.'; end if;

  if coalesce(p_pin, false) then
    update public.record_updates
       set pinned_at = null, pinned_by = null
     where pinned_at is not null and id <> p_id
       and person_id is not distinct from v_row.person_id
       and service_user_id is not distinct from v_row.service_user_id
       and complaint_id is not distinct from v_row.complaint_id;
    update public.record_updates set pinned_at = now(), pinned_by = v_uid where id = p_id;
  else
    update public.record_updates set pinned_at = null, pinned_by = null where id = p_id;
  end if;
end;
$fn$;

alter policy record_updates_select on public.record_updates
  using (public.can_read_record_updates(person_id, service_user_id, complaint_id));
alter policy record_update_files_select on public.record_update_files
  using (exists (
    select 1 from public.record_updates u
     where u.id = record_update_files.update_id
       and public.can_read_record_updates(u.person_id, u.service_user_id, u.complaint_id)
       and (u.removed_at is null or public.is_company_admin(u.company_id) or public.is_platform_admin())));
alter policy record_update_mentions_select on public.record_update_mentions
  using (exists (
    select 1 from public.record_updates u
     where u.id = record_update_mentions.update_id
       and public.can_read_record_updates(u.person_id, u.service_user_id, u.complaint_id)));

-- 0389e: the Complaint Outcome form, every company; Bevan's minor complaints lose the due date.
insert into public.form_templates (key, name, population, description, schema, version, status, locked_reason)
values ('complaint_outcome', 'Complaint Outcome', 'complaints',
        'How a complaint was resolved, the action taken and whether it was upheld. Completing it closes the complaint.',
        $sch${"schemaVersion": 1, "sections": [{"id": "outcome", "title": "", "fields": [{"key": "outcome_date", "type": "date", "label": "Date closed", "required": true, "completionDate": true}, {"key": "resolution", "type": "long_text", "label": "How it was resolved", "required": true, "help": "What was found and what was agreed with the complainant."}, {"key": "actions_taken", "type": "long_text", "label": "Action taken", "help": "What was done, or will change, because of it. For example, team members spoken to."}, {"key": "upheld", "type": "radio", "label": "Was the complaint upheld?", "required": true, "options": [{"value": "yes", "label": "Yes, upheld"}, {"value": "no", "label": "No, not upheld"}, {"value": "undecided", "label": "Not decided"}]}, {"key": "complainant_told", "type": "yes_no", "label": "Has the complainant been told the outcome?", "required": true}, {"key": "complainant_satisfied", "type": "radio", "label": "Was the complainant satisfied with the outcome?", "options": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}, {"value": "unknown", "label": "Not known"}]}, {"key": "lessons", "type": "long_text", "label": "Anything to learn from it", "help": "Feeds the complaints summary and the quality review."}, {"key": "closed_by", "type": "short_text", "label": "Closed by", "required": true, "prefill": "completed_by"}, {"key": "signature", "type": "signature", "label": "Signature", "required": true}]}]}$sch$::jsonb, 1, 'active', 'Powers closing a complaint.')
on conflict (key) do nothing;

with ins as (
  insert into public.forms
    (company_id, key, name, population, description, source_template_key, current_version, library_version, library_schema)
  select c.id, t.key, t.name, t.population, t.description, t.key, 1, t.version, t.schema
    from public.companies c cross join public.form_templates t
   where t.key = 'complaint_outcome' and t.status = 'active' and c.status <> 'deleted'
     and not exists (select 1 from public.forms f where f.company_id = c.id and f.key = t.key)
  returning id, library_schema
)
insert into public.form_versions (form_id, version, schema, status)
select id, 1, library_schema, 'published' from ins;

update public.complaints c
   set acknowledgement_due = null
 where c.company_id = '84172279-54e4-4d5b-94b4-c92dc05c6baa'
   and c.status <> 'closed'
   and c.date_acknowledged is null
   and c.concern_type = any ('{Minor Complaint,Concern}'::text[]);
