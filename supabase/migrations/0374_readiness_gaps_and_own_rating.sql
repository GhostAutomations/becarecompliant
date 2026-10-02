-- 0374 Readiness: CIW gap labels and the manager's own rating per theme (Phil, 2026-10-02).
--
-- After reading CIW's inspection framework (May 2025) and its quality of care review guidance:
-- 1. An Update on a record can be ABOUT one of that record's checks, or about its DBS renewal or
--    Right to Work. A linked Update posted after the check went overdue counts as "action in
--    place" on the Readiness page (CIW: "measures have been taken or are currently being
--    implemented"), which lowers a gap from "Priority Action Notice risk" to "Area for
--    Improvement likely". Only top level updates carry it; replies follow their parent.
-- 2. readiness_self_ratings: the manager's OWN rating of each theme, per registered service,
--    chosen with CIW's descriptors (CIW invites providers to rate themselves; the app never
--    predicts the inspector's word, Phil 2026-09-19). Append only, so every change is kept.
--    Set by the same people who record an inspection (branch_inspections RLS).

-- 1 -------------------------------------------------------------------------------------------
alter table public.record_updates
  add column if not exists about_check_instance uuid references public.check_instances(id) on delete set null,
  add column if not exists about_tracker text;

alter table public.record_updates drop constraint if exists record_updates_about_tracker;
alter table public.record_updates add constraint record_updates_about_tracker
  check (about_tracker is null or about_tracker in ('dbs_renewal', 'right_to_work'));
alter table public.record_updates drop constraint if exists record_updates_about_one;
alter table public.record_updates add constraint record_updates_about_one
  check (num_nonnulls(about_check_instance, about_tracker) <= 1);
alter table public.record_updates drop constraint if exists record_updates_about_top_level;
alter table public.record_updates add constraint record_updates_about_top_level
  check (parent_id is null or num_nonnulls(about_check_instance, about_tracker) = 0);

create index if not exists record_updates_about_instance_idx
  on public.record_updates (about_check_instance, created_at) where about_check_instance is not null;
create index if not exists record_updates_about_tracker_idx
  on public.record_updates (person_id, about_tracker, created_at) where about_tracker is not null;

-- The same function with two more arguments, ADDED beside the seven argument version rather than
-- replacing it: the code live before this deploy calls the seven argument one by name and keeps
-- working, the new code calls this one. No defaults, so a call by name can only match one. The old
-- version can be dropped once this is deployed. (Applied as 0374, 0374b and 0374c: the Supabase
-- connector stalls on a long migration, so it went in three parts; this file is the whole.)

create or replace function public.post_record_update(
  p_id uuid,
  p_person uuid,
  p_su uuid,
  p_parent uuid,
  p_body text,
  p_mentions uuid[],
  p_files jsonb,
  p_about_instance uuid,
  p_about_tracker text
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

  if jsonb_typeof(v_files) <> 'array' then raise exception 'The attachments could not be read.'; end if;
  if jsonb_array_length(v_files) > 5 then raise exception 'Attach up to 5 files to an update.'; end if;
  if v_body = '' and jsonb_array_length(v_files) = 0 then
    raise exception 'Write something or attach a file.';
  end if;
  if char_length(v_body) > 5000 then raise exception 'An update can be up to 5000 characters.'; end if;

  select full_name into v_name from public.profiles where id = v_uid;

  insert into public.record_updates (id, company_id, person_id, service_user_id, parent_id, author_id, author_name, body,
                                     about_check_instance, about_tracker)
  values (p_id, v_company, p_person, p_su, p_parent, v_uid, coalesce(v_name, 'Unknown'), v_body,
          p_about_instance, p_about_tracker);

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

-- The pending upload row is cleared once its update is posted.
create or replace function public.clear_record_update_pending(p_id uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from public.record_update_uploads_pending where update_id = p_id;
$$;
revoke all on function public.clear_record_update_pending(uuid) from public, anon, authenticated;

revoke all on function public.post_record_update(uuid, uuid, uuid, uuid, text, uuid[], jsonb, uuid, text) from public, anon;
grant execute on function public.post_record_update(uuid, uuid, uuid, uuid, text, uuid[], jsonb, uuid, text) to authenticated;

-- 2 -------------------------------------------------------------------------------------------
create table if not exists public.readiness_self_ratings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  -- The registered service rated; null when the company has no registered service and Readiness
  -- shows every branch together.
  branch_id uuid references public.branches(id) on delete cascade,
  regulator text not null check (regulator in ('ciw', 'cqc')),
  requirement_code text not null check (length(requirement_code) between 1 and 20),
  rating text not null check (rating in (
    'excellent', 'good', 'requires_improvement', 'requires_significant_improvement',
    'outstanding', 'inadequate')),
  note text check (note is null or length(note) <= 1000),
  set_by uuid references auth.users(id) on delete set null,
  -- Kept as written, so the name survives the login being removed.
  set_by_name text not null,
  created_at timestamptz not null default now(),
  check (regulator = 'ciw' and rating in ('excellent', 'good', 'requires_improvement', 'requires_significant_improvement')
      or regulator = 'cqc' and rating in ('outstanding', 'good', 'requires_improvement', 'inadequate'))
);
create index if not exists readiness_self_ratings_lookup_idx
  on public.readiness_self_ratings (company_id, branch_id, regulator, requirement_code, created_at desc);
create index if not exists readiness_self_ratings_branch_idx on public.readiness_self_ratings (branch_id);
create index if not exists readiness_self_ratings_set_by_idx on public.readiness_self_ratings (set_by);

alter table public.readiness_self_ratings enable row level security;

drop policy if exists readiness_self_ratings_select on public.readiness_self_ratings;
create policy readiness_self_ratings_select on public.readiness_self_ratings for select
  using (public.is_platform_admin() or public.is_company_wide(company_id) or public.is_company_manager(company_id));

drop policy if exists readiness_self_ratings_insert on public.readiness_self_ratings;
create policy readiness_self_ratings_insert on public.readiness_self_ratings for insert
  with check (
    (public.is_platform_admin() or public.is_company_wide(company_id) or public.is_company_manager(company_id))
    and set_by = auth.uid()
    and (branch_id is null or exists (
      select 1 from public.branches b where b.id = branch_id and b.company_id = readiness_self_ratings.company_id))
  );
-- No update or delete policy: a rating is changed by setting a new one, so the history stays.
