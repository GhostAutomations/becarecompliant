-- 0324 — Updates on People and Service User records (Phil, 2026-09-24).
--
-- "A bit like the update section on Monday... on their record... for people and service user."
-- Agreed by popup the same day:
--   * Supervisor and above who can see the record read and post. A Viewer reads only. On Call
--     and carers never see them.
--   * A Manager, Supervisor or Viewer does NOT see the Updates on their OWN Person record: these
--     are management notes. Company Admins, the RM and the RI see every record's.
--   * The author can edit their own; the update then says Edited and the old wording is kept.
--     Only a Company Admin can remove one, with a reason, and a "removed" line stays in its place.
--   * Replies (one level), attachments, @mentions (only people who can see the record), and
--     pinning (anybody who can post; one pinned update per record).
--
-- EVERY WRITE IS AN RPC. The tables have select policies only, so nothing can be written, edited
-- or deleted through the ordinary client, and every rule above lives here, in the database.
--
-- WHO MAY SEE IT IS ONE FUNCTION (record_update_audience). Reading, posting and the @ list all
-- ask it, so the three can never disagree about who is allowed.
--
-- FILES live in their own private bucket, record-updates, with NO storage policies at all: they
-- are reached only through a short signed URL the server makes after checking the caller, and
-- every download is written to the audit log. (The evidence bucket lets any company member read
-- by path; this one lets nobody.)

-- ---------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------

create table if not exists public.record_updates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  person_id uuid references public.people(id) on delete cascade,
  service_user_id uuid references public.service_users(id) on delete cascade,
  parent_id uuid references public.record_updates(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  -- Kept as written, so the name survives the author's login being removed.
  author_name text not null,
  body text not null default '',
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  pinned_at timestamptz,
  pinned_by uuid references auth.users(id) on delete set null,
  removed_at timestamptz,
  removed_by uuid references auth.users(id) on delete set null,
  removed_reason text,
  constraint record_updates_one_record check (num_nonnulls(person_id, service_user_id) = 1),
  constraint record_updates_body_len check (char_length(body) <= 5000)
);

create index if not exists record_updates_person_idx on public.record_updates (person_id, created_at) where person_id is not null;
create index if not exists record_updates_su_idx on public.record_updates (service_user_id, created_at) where service_user_id is not null;
create index if not exists record_updates_parent_idx on public.record_updates (parent_id) where parent_id is not null;
-- One pinned update per record.
create unique index if not exists record_updates_one_pin
  on public.record_updates (coalesce(person_id, service_user_id))
  where pinned_at is not null and removed_at is null;

-- The wording an update had before it was edited or removed. Company Admins only.
create table if not exists public.record_update_edits (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  update_id uuid not null references public.record_updates(id) on delete cascade,
  kind text not null check (kind in ('edited', 'removed')),
  previous_body text not null,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now()
);
create index if not exists record_update_edits_update_idx on public.record_update_edits (update_id);

create table if not exists public.record_update_files (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  update_id uuid not null references public.record_updates(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  bytes bigint not null check (bytes > 0),
  sha256 text not null,
  created_at timestamptz not null default now()
);
create index if not exists record_update_files_update_idx on public.record_update_files (update_id);

create table if not exists public.record_update_mentions (
  update_id uuid not null references public.record_updates(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  display_name text not null,
  emailed_at timestamptz,
  primary key (update_id, profile_id)
);

-- An upload started and never posted, so the nightly run can remove its files.
create table if not exists public.record_update_uploads_pending (
  update_id uuid primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Files whose row has gone (the record was deleted, cascading its updates). No foreign keys, so
-- the queue survives the cascade that fills it; the nightly run empties it.
create table if not exists public.record_update_file_trash (
  storage_path text primary key,
  company_id uuid not null,
  queued_at timestamptz not null default now()
);

create or replace function public.record_update_file_to_trash()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.record_update_file_trash (storage_path, company_id)
  values (old.storage_path, old.company_id)
  on conflict (storage_path) do nothing;
  return old;
end;
$$;

drop trigger if exists record_update_files_trash on public.record_update_files;
create trigger record_update_files_trash
  after delete on public.record_update_files
  for each row execute function public.record_update_file_to_trash();

-- ---------------------------------------------------------------------------------------------
-- Who may see a record's Updates
-- ---------------------------------------------------------------------------------------------

-- Every active login who may read this record's Updates, and whether they may post. INTERNAL:
-- not executable by clients, because it names staff for any record id it is given.
create or replace function public.record_update_audience(p_person uuid, p_su uuid)
returns table (profile_id uuid, full_name text, can_post boolean)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with rec as (
    select pe.company_id, pe.branch_id, pe.profile_id as own_profile
      from public.people pe where p_person is not null and pe.id = p_person
    union all
    select su.company_id, su.branch_id, null::uuid
      from public.service_users su where p_su is not null and p_person is null and su.id = p_su
  )
  select p.id, p.full_name,
         p.role in ('company_admin', 'registered_individual', 'registered_manager', 'manager', 'supervisor', 'recruiter')
    from rec
    join public.profiles p on p.company_id = rec.company_id and p.status = 'active'
   where
     -- Company wide: every record, their own included.
     p.role in ('company_admin', 'registered_individual', 'registered_manager')
     -- Branch roles: the record's branch, never their own record.
     or (
       p.id is distinct from rec.own_profile
       and (
         (p.role in ('manager', 'supervisor', 'team_member')
            and exists (select 1 from public.user_branches ub where ub.user_id = p.id and ub.branch_id = rec.branch_id))
         -- A recruiter counts as a supervisor in every branch (is_branch_supervisor).
         or p.role = 'recruiter'
       )
     );
$$;

revoke all on function public.record_update_audience(uuid, uuid) from public, anon, authenticated;

create or replace function public.can_read_record_updates(p_person uuid, p_su uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_platform_admin()
      or exists (select 1 from public.record_update_audience(p_person, p_su) a where a.profile_id = auth.uid());
$$;

create or replace function public.can_post_record_updates(p_person uuid, p_su uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.record_update_audience(p_person, p_su) a
     where a.profile_id = auth.uid() and a.can_post
  );
$$;

grant execute on function public.can_read_record_updates(uuid, uuid) to authenticated;
grant execute on function public.can_post_record_updates(uuid, uuid) to authenticated;

-- The @ list: names only, and only for somebody who may post here.
create or replace function public.record_update_mentionables(p_person uuid, p_su uuid)
returns table (profile_id uuid, full_name text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.can_post_record_updates(p_person, p_su) then
    return;
  end if;
  return query
    select a.profile_id, a.full_name
      from public.record_update_audience(p_person, p_su) a
     where a.profile_id <> auth.uid()
     order by a.full_name;
end;
$$;
grant execute on function public.record_update_mentionables(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Row level security: read only
-- ---------------------------------------------------------------------------------------------

alter table public.record_updates enable row level security;
alter table public.record_update_edits enable row level security;
alter table public.record_update_files enable row level security;
alter table public.record_update_mentions enable row level security;
alter table public.record_update_uploads_pending enable row level security;
alter table public.record_update_file_trash enable row level security;

drop policy if exists record_updates_select on public.record_updates;
create policy record_updates_select on public.record_updates for select to authenticated
  using (public.can_read_record_updates(person_id, service_user_id));

drop policy if exists record_update_files_select on public.record_update_files;
create policy record_update_files_select on public.record_update_files for select to authenticated
  using (exists (
    select 1 from public.record_updates u
     where u.id = record_update_files.update_id
       and public.can_read_record_updates(u.person_id, u.service_user_id)
       and (u.removed_at is null or public.is_company_admin(u.company_id) or public.is_platform_admin())
  ));

drop policy if exists record_update_mentions_select on public.record_update_mentions;
create policy record_update_mentions_select on public.record_update_mentions for select to authenticated
  using (exists (
    select 1 from public.record_updates u
     where u.id = record_update_mentions.update_id
       and public.can_read_record_updates(u.person_id, u.service_user_id)
  ));

drop policy if exists record_update_edits_select on public.record_update_edits;
create policy record_update_edits_select on public.record_update_edits for select to authenticated
  using (public.is_company_admin(company_id) or public.is_platform_admin());

-- record_update_uploads_pending and record_update_file_trash: no policies, service role only.

-- ---------------------------------------------------------------------------------------------
-- Writes
-- ---------------------------------------------------------------------------------------------

-- Post an update or a reply. p_id is made by the server before the files are uploaded, which
-- also makes posting safe to run twice: a second call with the same id returns it unchanged.
create or replace function public.post_record_update(
  p_id uuid,
  p_person uuid,
  p_su uuid,
  p_parent uuid,
  p_body text,
  p_mentions uuid[],
  p_files jsonb
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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

  if jsonb_typeof(v_files) <> 'array' then raise exception 'The attachments could not be read.'; end if;
  if jsonb_array_length(v_files) > 5 then raise exception 'Attach up to 5 files to an update.'; end if;
  if v_body = '' and jsonb_array_length(v_files) = 0 then
    raise exception 'Write something or attach a file.';
  end if;
  if char_length(v_body) > 5000 then raise exception 'An update can be up to 5000 characters.'; end if;

  select full_name into v_name from public.profiles where id = v_uid;

  insert into public.record_updates (id, company_id, person_id, service_user_id, parent_id, author_id, author_name, body)
  values (p_id, v_company, p_person, p_su, p_parent, v_uid, coalesce(v_name, 'Unknown'), v_body);

  for f in select * from jsonb_array_elements(v_files) loop
    if coalesce(f->>'storage_path', '') not like (v_company::text || '/' || p_id::text || '/%') then
      raise exception 'An attachment is not part of this update. Start again.';
    end if;
    insert into public.record_update_files (company_id, update_id, storage_path, file_name, mime_type, bytes, sha256)
    values (v_company, p_id, f->>'storage_path', left(coalesce(f->>'file_name', 'file'), 200),
            coalesce(f->>'mime_type', 'application/octet-stream'), (f->>'bytes')::bigint, coalesce(f->>'sha256', ''));
  end loop;

  -- Only people who may see the record, and never yourself.
  insert into public.record_update_mentions (update_id, profile_id, company_id, display_name)
  select p_id, a.profile_id, v_company, a.full_name
    from public.record_update_audience(p_person, p_su) a
   where a.profile_id = any (coalesce(p_mentions, '{}'::uuid[]))
     and a.profile_id <> v_uid
  on conflict do nothing;

  delete from public.record_update_uploads_pending where update_id = p_id;
  return p_id;
end;
$$;
grant execute on function public.post_record_update(uuid, uuid, uuid, uuid, text, uuid[], jsonb) to authenticated;

-- The author changes their own wording. The old wording is kept.
create or replace function public.edit_record_update(p_id uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.record_updates%rowtype;
  v_body text := btrim(coalesce(p_body, ''));
begin
  select * into v_row from public.record_updates where id = p_id;
  if not found then raise exception 'That update could not be found.'; end if;
  if v_row.author_id is distinct from v_uid then raise exception 'Only the person who wrote an update can edit it.'; end if;
  if v_row.removed_at is not null then raise exception 'That update has been removed.'; end if;
  if not public.can_post_record_updates(v_row.person_id, v_row.service_user_id) then
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
$$;
grant execute on function public.edit_record_update(uuid, text) to authenticated;

-- A Company Admin removes an update, with a reason. The wording goes to record_update_edits,
-- which only Admins can read, and a "removed" line stays in the thread.
create or replace function public.remove_record_update(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.record_updates%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  select * into v_row from public.record_updates where id = p_id;
  if not found then raise exception 'That update could not be found.'; end if;
  if not public.is_company_admin(v_row.company_id) then
    raise exception 'Only a Company Admin can remove an update.';
  end if;
  if v_row.removed_at is not null then return; end if;
  if char_length(v_reason) < 3 then raise exception 'Say why the update is being removed.'; end if;

  insert into public.record_update_edits (company_id, update_id, kind, previous_body, changed_by)
  values (v_row.company_id, p_id, 'removed', v_row.body, v_uid);
  update public.record_updates
     set body = '', removed_at = now(), removed_by = v_uid, removed_reason = left(v_reason, 500),
         pinned_at = null, pinned_by = null
   where id = p_id;
end;
$$;
grant execute on function public.remove_record_update(uuid, text) to authenticated;

-- Pin (or unpin) an update. Anybody who can post; top level updates only; one per record.
create or replace function public.pin_record_update(p_id uuid, p_pin boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.record_updates%rowtype;
begin
  select * into v_row from public.record_updates where id = p_id;
  if not found then raise exception 'That update could not be found.'; end if;
  if not public.can_post_record_updates(v_row.person_id, v_row.service_user_id) then
    raise exception 'You cannot pin an update on this record.';
  end if;
  if v_row.parent_id is not null then raise exception 'A reply cannot be pinned.'; end if;
  if v_row.removed_at is not null then raise exception 'That update has been removed.'; end if;

  if coalesce(p_pin, false) then
    update public.record_updates
       set pinned_at = null, pinned_by = null
     where pinned_at is not null and id <> p_id
       and person_id is not distinct from v_row.person_id
       and service_user_id is not distinct from v_row.service_user_id;
    update public.record_updates set pinned_at = now(), pinned_by = v_uid where id = p_id;
  else
    update public.record_updates set pinned_at = null, pinned_by = null where id = p_id;
  end if;
end;
$$;
grant execute on function public.pin_record_update(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- The private bucket
-- ---------------------------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit)
values ('record-updates', 'record-updates', false, 20971520)
on conflict (id) do update set public = false, file_size_limit = 20971520;
