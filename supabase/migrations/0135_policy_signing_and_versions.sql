-- 0135_policy_signing_and_versions.sql
-- Policies become SIGNED documents, not ticked ones (Phil, 2026-07-26: "think
-- docusign / adobe"), and both of the rules around that are the COMPANY's to set,
-- not ours.
--
--   policy_config.signature_mode         : draw, type, or either.
--   policy_config.reassign_on_new_version: always, ask, or never.
--
-- Versions are the other half of a signature meaning anything. A signature
-- against version 1 proves nothing about version 2, so every version's document
-- is kept for good in company_policy_versions and each assignment records the
-- version it is for. You must always be able to produce the exact document a
-- person signed.

create table if not exists public.policy_config (
  company_id uuid primary key references public.companies(id) on delete cascade,
  signature_mode text not null default 'either'
    check (signature_mode in ('draw', 'type', 'either')),
  reassign_on_new_version text not null default 'always'
    check (reassign_on_new_version in ('always', 'ask', 'never')),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.policy_config enable row level security;

-- Staff need to know which signing method they will be asked for, so the config
-- is readable by any member; only an Admin sets it.
drop policy if exists policy_config_select on public.policy_config;
create policy policy_config_select on public.policy_config
  for select using (
    public.is_platform_admin() or public.is_company_member(company_id)
  );

drop policy if exists policy_config_write on public.policy_config;
create policy policy_config_write on public.policy_config
  for all using (
    public.is_platform_admin() or public.is_company_admin(company_id)
  ) with check (
    public.is_platform_admin() or public.is_company_admin(company_id)
  );

-- Every version of every policy document, kept for good.
create table if not exists public.company_policy_versions (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references public.company_policies(id) on delete cascade,
  version integer not null,
  storage_path text not null,
  file_name text not null,
  mime_type text,
  bytes integer,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (policy_id, version)
);

alter table public.company_policy_versions enable row level security;

-- Same visibility as the policy itself: anyone who runs the service, plus a
-- Team Member the policy is assigned to (so they can open the version they are
-- being asked to sign, and the one they signed before).
drop policy if exists company_policy_versions_select on public.company_policy_versions;
create policy company_policy_versions_select on public.company_policy_versions
  for select using (
    exists (
      select 1 from public.company_policies p
      where p.id = company_policy_versions.policy_id
        and (
          public.is_platform_admin()
          or (public.is_company_member(p.company_id) and not public.is_staff())
          or exists (
            select 1 from public.assignments a
            join public.people pe on pe.id = a.person_id
            where a.policy_id = p.id and pe.profile_id = auth.uid()
          )
        )
    )
  );

drop policy if exists company_policy_versions_write on public.company_policy_versions;
create policy company_policy_versions_write on public.company_policy_versions
  for all using (
    exists (
      select 1 from public.company_policies p
      where p.id = company_policy_versions.policy_id
        and (public.is_platform_admin() or public.is_company_admin(p.company_id))
    )
  ) with check (
    exists (
      select 1 from public.company_policies p
      where p.id = company_policy_versions.policy_id
        and (public.is_platform_admin() or public.is_company_admin(p.company_id))
    )
  );

-- Anything uploaded before this migration becomes its own version 1.
insert into public.company_policy_versions
  (policy_id, version, storage_path, file_name, mime_type, bytes, created_by, created_at)
select p.id, p.version, p.storage_path, p.file_name, p.mime_type, p.bytes, p.created_by, p.created_at
from public.company_policies p
where p.storage_path <> 'pending'
  and not exists (
    select 1 from public.company_policy_versions v
    where v.policy_id = p.id and v.version = p.version
  );

-- Which version an assignment is for, so the signature is tied to the wording.
alter table public.assignments
  add column if not exists policy_version integer;

-- The acknowledgement form gains BOTH a drawn and a typed signature field. The
-- company's signature_mode decides which is rendered (lib/assignments/signing.ts),
-- the same render-side filtering pattern as removeField, so server validation
-- never diverges from the published form. Safe to rewrite in place only because
-- nothing has been signed yet: no Evidence points at these versions.
update public.form_templates t
set schema = jsonb_build_object(
      'schemaVersion', 1,
      'sections', jsonb_build_array(
        jsonb_build_object('id', 'section-1', 'title', 'Confirmation', 'fields', jsonb_build_array(
          jsonb_build_object('key', 'policy', 'type', 'short_text', 'label', 'Policy', 'required', true),
          jsonb_build_object('key', 'policy_version', 'type', 'short_text', 'label', 'Version'),
          jsonb_build_object('key', 'name', 'type', 'short_text', 'label', 'Name'),
          jsonb_build_object('key', 'read_date', 'type', 'date', 'label', 'Date read', 'required', true),
          jsonb_build_object('key', 'confirmed', 'type', 'checkbox', 'required', true,
            'label', 'I confirm I have read and understood this policy'),
          jsonb_build_object('key', 'signature', 'type', 'signature', 'label', 'Sign here'),
          jsonb_build_object('key', 'signature_typed', 'type', 'short_text',
            'label', 'Or type your full name to sign')
        ))
      )
    ),
    updated_at = now()
where t.key = 'policy_acknowledgement';

update public.form_versions fv
set schema = (select t.schema from public.form_templates t where t.key = 'policy_acknowledgement')
where fv.form_id in (select f.id from public.forms f where f.key = 'policy_acknowledgement')
  and not exists (select 1 from public.evidence e where e.form_version_id = fv.id);
