-- 0439_record_documents.sql
--
-- Phil, 2026-10-09: "if a company wants to upload an ad hoc document, a copy of an email or a random
-- copy of a certificate, where can they do that in the person's record? ... a tile ... next to
-- updates ... a button saying upload ... the number of documents."
--
-- Decided by popup, 2026-10-09:
--   * Who sees and uploads: the same people as Updates (record_update_audience). Supervisors and
--     above who can see the record upload and open; a Viewer opens only; carers never; nobody sees
--     their own record's documents except Company Admins, the RM and the RI.
--   * Removing: a Company Admin only, with a reason. The file is deleted and a line saying who removed
--     it, when and why stays on the record.
--   * People and Service Users both.
--
-- Built on the Updates pattern (0324): its own PRIVATE bucket with no storage policies at all, so a
-- file is reached only through a short signed URL the server makes after checking the caller, and
-- every open is written to the audit log; uploads in two steps (a phone photo is bigger than a server
-- action may carry); abandoned uploads and the files of deleted or removed documents cleaned up by the
-- nightly run. Same retention as Updates (0325): erased eight years after end of care, never while
-- the record is on a retention hold.
--
-- EVERY WRITE IS A FUNCTION. The table has a select policy only.
--
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

-- ---------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------

create table if not exists public.record_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  person_id uuid references public.people(id) on delete cascade,
  service_user_id uuid references public.service_users(id) on delete cascade,
  -- The upload it arrived in: its file sits in the folder <company>/<batch_id>/.
  batch_id uuid not null,
  title text not null,
  note text,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  bytes bigint not null check (bytes > 0),
  sha256 text not null,
  uploaded_by uuid references auth.users(id) on delete set null,
  -- Kept as written, so the name survives the uploader's login being removed.
  uploaded_by_name text not null,
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  removed_by uuid references auth.users(id) on delete set null,
  removed_by_name text,
  removed_reason text,
  constraint record_documents_one_record check (num_nonnulls(person_id, service_user_id) = 1),
  constraint record_documents_title_len check (char_length(title) between 1 and 120),
  constraint record_documents_note_len check (note is null or char_length(note) <= 1000),
  constraint record_documents_removed_has_reason check (removed_at is null or char_length(coalesce(removed_reason, '')) > 0)
);

create index if not exists record_documents_person_idx
  on public.record_documents (person_id, created_at) where person_id is not null;
create index if not exists record_documents_su_idx
  on public.record_documents (service_user_id, created_at) where service_user_id is not null;
create index if not exists record_documents_company_idx on public.record_documents (company_id);
create index if not exists record_documents_batch_idx on public.record_documents (batch_id);
create index if not exists record_documents_uploaded_by_idx on public.record_documents (uploaded_by);
create index if not exists record_documents_removed_by_idx on public.record_documents (removed_by);

alter table public.record_documents enable row level security;
revoke all on public.record_documents from anon, authenticated;
grant select on public.record_documents to authenticated;

-- Whoever may read the record's Updates may see its documents: one rule, so the two never disagree.
drop policy if exists record_documents_select on public.record_documents;
create policy record_documents_select on public.record_documents
  for select to authenticated
  using (public.can_read_record_updates(person_id, service_user_id));

-- An upload started and not saved, so the nightly run can remove its files.
create table if not exists public.record_document_uploads_pending (
  batch_id uuid primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists record_document_uploads_pending_company_idx on public.record_document_uploads_pending (company_id);
create index if not exists record_document_uploads_pending_created_by_idx on public.record_document_uploads_pending (created_by);
alter table public.record_document_uploads_pending enable row level security;
revoke all on public.record_document_uploads_pending from anon, authenticated;

-- Files to take out of the bucket: a removed document's (if the immediate delete failed), and every
-- document whose row has gone (its record was deleted, cascading it). No foreign keys, so the queue
-- survives the cascade that fills it; the nightly run empties it.
create table if not exists public.record_document_file_trash (
  storage_path text primary key,
  company_id uuid not null,
  queued_at timestamptz not null default now()
);
alter table public.record_document_file_trash enable row level security;
revoke all on public.record_document_file_trash from anon, authenticated;

create or replace function public.record_document_file_to_trash()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.record_document_file_trash (storage_path, company_id)
  values (old.storage_path, old.company_id)
  on conflict (storage_path) do nothing;
  return old;
end;
$$;
revoke all on function public.record_document_file_to_trash() from public, anon, authenticated;

drop trigger if exists record_documents_trash on public.record_documents;
create trigger record_documents_trash
  after delete on public.record_documents
  for each row execute function public.record_document_file_to_trash();

-- ---------------------------------------------------------------------------------------------
-- Adding documents
-- ---------------------------------------------------------------------------------------------

-- p_files: [{storage_path, file_name, mime_type, bytes, sha256, title}], each inside
-- <company>/<p_batch>/. Saving the same upload twice returns what is already there.
create or replace function public.add_record_documents(
  p_batch uuid,
  p_person uuid,
  p_su uuid,
  p_note text,
  p_files jsonb
) returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_company uuid;
  v_name text;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_files jsonb := coalesce(p_files, '[]'::jsonb);
  v_title text;
  v_count integer := 0;
  f jsonb;
begin
  if v_uid is null then raise exception 'Sign in again to add a document.'; end if;
  if p_batch is null then raise exception 'That upload could not be saved. Start again.'; end if;
  if num_nonnulls(p_person, p_su) <> 1 then raise exception 'A document belongs to one record.'; end if;

  if exists (select 1 from public.record_documents d where d.batch_id = p_batch) then
    if exists (select 1 from public.record_documents d where d.batch_id = p_batch and d.uploaded_by is distinct from v_uid) then
      raise exception 'That upload could not be saved. Start again.';
    end if;
    return (select count(*)::int from public.record_documents d where d.batch_id = p_batch);
  end if;

  if not public.can_post_record_updates(p_person, p_su) then
    raise exception 'You cannot add documents to this record.';
  end if;

  if p_person is not null then
    select company_id into v_company from public.people where id = p_person;
  else
    select company_id into v_company from public.service_users where id = p_su;
  end if;
  if v_company is null then raise exception 'That record could not be found.'; end if;

  -- Only an upload this person started here (startDocumentUpload) can be saved, and only once.
  if not exists (
    select 1 from public.record_document_uploads_pending u
     where u.batch_id = p_batch and u.company_id = v_company and u.created_by = v_uid
  ) then
    raise exception 'That upload could not be saved. Start again.';
  end if;

  if jsonb_typeof(v_files) <> 'array' then raise exception 'The files could not be read.'; end if;
  if jsonb_array_length(v_files) = 0 then raise exception 'Choose a file to upload.'; end if;
  if jsonb_array_length(v_files) > 10 then raise exception 'Upload up to 10 files at a time.'; end if;
  if v_note is not null and char_length(v_note) > 1000 then
    raise exception 'A note can be up to 1000 characters.';
  end if;

  select coalesce(nullif(btrim(full_name), ''), email) into v_name from public.profiles where id = v_uid;

  for f in select * from jsonb_array_elements(v_files) loop
    if coalesce(f->>'storage_path', '') not like (v_company::text || '/' || p_batch::text || '/%') then
      raise exception 'A file is not part of this upload. Start again.';
    end if;
    v_title := btrim(coalesce(f->>'title', ''));
    if char_length(v_title) < 1 or char_length(v_title) > 120 then
      raise exception 'Give each document a short name, up to 120 characters.';
    end if;
    insert into public.record_documents
      (company_id, person_id, service_user_id, batch_id, title, note, storage_path, file_name,
       mime_type, bytes, sha256, uploaded_by, uploaded_by_name)
    values
      (v_company, p_person, p_su, p_batch, v_title, v_note, f->>'storage_path',
       left(coalesce(f->>'file_name', 'file'), 200), coalesce(f->>'mime_type', 'application/octet-stream'),
       (f->>'bytes')::bigint, coalesce(f->>'sha256', ''), v_uid, coalesce(v_name, 'Unknown'));
    v_count := v_count + 1;
  end loop;

  delete from public.record_document_uploads_pending where batch_id = p_batch;
  return v_count;
end;
$$;

revoke all on function public.add_record_documents(uuid, uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.add_record_documents(uuid, uuid, uuid, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Removing a document: a Company Admin, with a reason. Returns the file's path so the server can
-- delete it at once; it is also queued, so a failed delete is retried by the nightly run.
-- ---------------------------------------------------------------------------------------------
create or replace function public.remove_record_document(p_id uuid, p_reason text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_name text;
  d public.record_documents%rowtype;
begin
  if v_uid is null then raise exception 'Sign in again to remove a document.'; end if;
  if v_reason is null then raise exception 'Give a reason for removing it.'; end if;
  if char_length(v_reason) > 1000 then raise exception 'A reason can be up to 1000 characters.'; end if;

  select * into d from public.record_documents where id = p_id for update;
  if not found then raise exception 'That document could not be found.'; end if;
  if d.removed_at is not null then raise exception 'That document has already been removed.'; end if;
  if not public.is_company_admin(d.company_id) then
    raise exception 'Only a Company Admin can remove a document.';
  end if;

  select coalesce(nullif(btrim(full_name), ''), email) into v_name from public.profiles where id = v_uid;

  update public.record_documents set
    removed_at = now(),
    removed_by = v_uid,
    removed_by_name = coalesce(v_name, 'Unknown'),
    removed_reason = v_reason,
    note = null
  where id = p_id;

  insert into public.record_document_file_trash (storage_path, company_id)
  values (d.storage_path, d.company_id)
  on conflict (storage_path) do nothing;

  return d.storage_path;
end;
$$;

revoke all on function public.remove_record_document(uuid, text) from public, anon;
grant execute on function public.remove_record_document(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Retention: the Updates rule (0325). Service role only, from the nightly run.
-- ---------------------------------------------------------------------------------------------
create or replace function public.expire_record_document_retention(p_limit integer default 200)
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
       and exists (select 1 from public.record_documents d where d.person_id = pe.id)
     limit greatest(coalesce(p_limit, 200), 1)
  ),
  due_sus as (
    select su.id, su.company_id
      from public.service_users su
     where su.service_status = 'cancelled'
       and su.discharge_date is not null
       and (su.discharge_date + interval '8 years')::date <= current_date
       and coalesce(su.retention_hold, false) = false
       and exists (select 1 from public.record_documents d where d.service_user_id = su.id)
     limit greatest(coalesce(p_limit, 200), 1)
  ),
  gone_people as (
    delete from public.record_documents d
     using due_people x
     where d.person_id = x.id
    returning d.person_id as pid, x.company_id as cid
  ),
  gone_sus as (
    delete from public.record_documents d
     using due_sus x
     where d.service_user_id = x.id
    returning d.service_user_id as sid, x.company_id as cid
  )
  select g.cid, g.pid, null::uuid, count(*)::int from gone_people g group by g.cid, g.pid
  union all
  select g.cid, null::uuid, g.sid, count(*)::int from gone_sus g group by g.cid, g.sid;
end;
$$;

revoke all on function public.expire_record_document_retention(integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- The private bucket
-- ---------------------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('record-documents', 'record-documents', false, 20971520)
on conflict (id) do update set public = false, file_size_limit = 20971520;
