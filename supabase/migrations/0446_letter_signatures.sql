-- 0446: signatures on letters (Phil, 2026-10-12, Job 2 Part A, docs/decisions/letter-signatures.md).
--
-- Why letters had none: no office login had anywhere to keep a signature, and the letter PDFs drew
-- only "Yours sincerely", the name and the job title.
--
-- MY SIGNATURE. A Supervisor, Recruiter, Manager, Registered Manager, Registered Individual or
-- Company Admin can keep two: one uploaded (a photo or scan of it) and one drawn on screen. A letter
-- can use either, or one drawn just for that letter, or none.
--
-- A SAVED SIGNATURE BELONGS ONLY TO ITS OWNER, and that is enforced HERE, not only on the screen:
--   * user_signatures: every policy is "your own row". There is no admin, company or Founder policy,
--     so nobody else can see that a signature exists, let alone read it.
--   * The private 'signatures' bucket: files live at <company>/<owner>/..., and the storage policies
--     let a signed in caller touch only the folder that is theirs in their own company. Unlike the
--     other private buckets the app reaches it with the owner's own sign in, never the server key,
--     so a short signed URL can only ever be made by the owner, for the owner.
--   * The Founder in support mode is the real Founder login underneath: no company of its own and
--     not one of the six roles, so it can neither keep nor read anyone's signature.
--   * Keeping (insert, update) needs one of the six roles and an active login; reading and removing
--     your own needs only that it is yours, so somebody whose role changes can still clear it.
--
-- A letter already sent never changes: the signature is drawn into the letter's PDF when it is
-- made, and the kept PDF and its hash are frozen as before (0343, 0406).

create table if not exists public.user_signatures (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  kind text not null check (kind in ('upload', 'drawn')),
  storage_path text not null,
  content_type text not null check (content_type in ('image/png', 'image/jpeg')),
  sha256 text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (profile_id, kind),
  constraint user_signatures_path_is_theirs
    check (storage_path like company_id::text || '/' || profile_id::text || '/%')
);

alter table public.user_signatures enable row level security;

drop trigger if exists user_signatures_set_updated_at on public.user_signatures;
create trigger user_signatures_set_updated_at
  before update on public.user_signatures
  for each row execute function public.set_updated_at();

-- The six roles that can keep a signature, for the signed in caller, from the real profile row.
create or replace function public.may_keep_letter_signature()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.status = 'active'
      and p.company_id is not null
      and p.role in ('company_admin', 'registered_individual', 'registered_manager',
                     'manager', 'supervisor', 'recruiter')
  );
$$;

revoke all on function public.may_keep_letter_signature() from public, anon;
grant execute on function public.may_keep_letter_signature() to authenticated;

-- A storage path is the caller's own: <their company>/<their id>/<file>.
create or replace function public.signature_folder_is_mine(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
     and (storage.foldername(p_name))[2] = auth.uid()::text
     and (storage.foldername(p_name))[1] = (
       select p.company_id::text from public.profiles p where p.id = auth.uid()
     );
$$;

revoke all on function public.signature_folder_is_mine(text) from public, anon;
grant execute on function public.signature_folder_is_mine(text) to authenticated;

drop policy if exists user_signatures_select on public.user_signatures;
create policy user_signatures_select on public.user_signatures
  for select to authenticated
  using (profile_id = auth.uid());

drop policy if exists user_signatures_insert on public.user_signatures;
create policy user_signatures_insert on public.user_signatures
  for insert to authenticated
  with check (
    profile_id = auth.uid()
    and company_id = public.my_company_id()
    and public.may_keep_letter_signature()
  );

drop policy if exists user_signatures_update on public.user_signatures;
create policy user_signatures_update on public.user_signatures
  for update to authenticated
  using (profile_id = auth.uid())
  with check (
    profile_id = auth.uid()
    and company_id = public.my_company_id()
    and public.may_keep_letter_signature()
  );

drop policy if exists user_signatures_delete on public.user_signatures;
create policy user_signatures_delete on public.user_signatures
  for delete to authenticated
  using (profile_id = auth.uid());

-- The private bucket: PNG or JPEG, 1MB at most.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('signatures', 'signatures', false, 1048576, array['image/png', 'image/jpeg'])
on conflict (id) do update
  set public = false, file_size_limit = 1048576, allowed_mime_types = array['image/png', 'image/jpeg'];

drop policy if exists signatures_objects_select on storage.objects;
create policy signatures_objects_select on storage.objects
  for select to authenticated
  using (bucket_id = 'signatures' and public.signature_folder_is_mine(name));

drop policy if exists signatures_objects_insert on storage.objects;
create policy signatures_objects_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'signatures'
    and public.signature_folder_is_mine(name)
    and public.may_keep_letter_signature()
  );

drop policy if exists signatures_objects_update on storage.objects;
create policy signatures_objects_update on storage.objects
  for update to authenticated
  using (bucket_id = 'signatures' and public.signature_folder_is_mine(name))
  with check (
    bucket_id = 'signatures'
    and public.signature_folder_is_mine(name)
    and public.may_keep_letter_signature()
  );

drop policy if exists signatures_objects_delete on storage.objects;
create policy signatures_objects_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'signatures' and public.signature_folder_is_mine(name));

-- Records stay in their own company (0443): the profile a signature belongs to is in its company.
select public.install_company_link_triggers();
