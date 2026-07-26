-- 0133_assignments_and_policies.sql
-- Team Member logins, increment 2: giving someone something to do.
--
-- Two new ideas, both agreed by popup 2026-07-26:
--   company_policies : the company uploads its policy documents once. A staff
--     member opens the document and ticks "I have read and understood", and that
--     tick is stored as Evidence with a timestamp, so it is inspection proof.
--     Not a form with the text pasted in, and not a bare external link: the
--     inspector wants the version they actually read.
--   assignments      : a form or a policy given to a Person, with an optional due
--     date, completed when the Evidence exists. Assigned per person or in bulk.
--
-- The acknowledgement rides the existing forms engine through a seeded
-- 'policy_acknowledgement' form, so it inherits validation, immutable Evidence,
-- the branded PDF and retention with no parallel pipeline.

create table if not exists public.company_policies (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  title text not null,
  summary text,
  storage_path text not null,
  file_name text not null,
  mime_type text,
  bytes integer,
  version integer not null default 1,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists company_policies_company_idx
  on public.company_policies (company_id, status);

create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  kind text not null check (kind in ('form', 'policy')),
  form_id uuid references public.forms(id) on delete cascade,
  policy_id uuid references public.company_policies(id) on delete cascade,
  due_date date,
  status text not null default 'assigned'
    check (status in ('assigned', 'completed', 'cancelled')),
  evidence_id uuid references public.evidence(id) on delete set null,
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint assignments_target check (
    (kind = 'form' and form_id is not null and policy_id is null)
    or (kind = 'policy' and policy_id is not null and form_id is null)
  )
);

create index if not exists assignments_person_idx
  on public.assignments (person_id, status);
create index if not exists assignments_company_idx
  on public.assignments (company_id, status, assigned_at desc);

-- Assigning the same thing twice while the first is still open is a mistake, not
-- a second job. Completed ones are free to repeat (next year's policy refresh).
-- NOTE this is a PARTIAL index, which ON CONFLICT cannot infer, so the app
-- filters duplicates before inserting and this stays as the backstop.
create unique index if not exists assignments_open_idx
  on public.assignments (person_id, coalesce(form_id, policy_id))
  where status = 'assigned';

alter table public.company_policies enable row level security;
alter table public.assignments enable row level security;

-- Staff see a policy only when it is assigned to them; everyone else who runs the
-- service sees the library.
drop policy if exists company_policies_select on public.company_policies;
create policy company_policies_select on public.company_policies
  for select using (
    public.is_platform_admin()
    or (public.is_company_member(company_id) and not public.is_staff())
    or exists (
      select 1 from public.assignments a
      join public.people pe on pe.id = a.person_id
      where a.policy_id = company_policies.id
        and pe.profile_id = auth.uid()
    )
  );

drop policy if exists company_policies_write on public.company_policies;
create policy company_policies_write on public.company_policies
  for all using (
    public.is_platform_admin() or public.is_company_admin(company_id)
  ) with check (
    public.is_platform_admin() or public.is_company_admin(company_id)
  );

drop policy if exists assignments_select on public.assignments;
create policy assignments_select on public.assignments
  for select using (
    public.is_platform_admin()
    or public.is_company_wide(company_id)
    or exists (
      select 1 from public.people pe
      where pe.id = assignments.person_id
        and (public.is_branch_manager(pe.branch_id) or pe.profile_id = auth.uid())
    )
  );

drop policy if exists assignments_insert on public.assignments;
create policy assignments_insert on public.assignments
  for insert with check (
    public.is_platform_admin()
    or public.is_company_wide(company_id)
    or exists (
      select 1 from public.people pe
      where pe.id = person_id and public.is_branch_manager(pe.branch_id)
    )
  );

-- Managers cancel or re-date an assignment. A staff member never updates the row
-- directly: completing goes through complete_assignment below.
drop policy if exists assignments_update on public.assignments;
create policy assignments_update on public.assignments
  for update using (
    public.is_platform_admin()
    or public.is_company_wide(company_id)
    or exists (
      select 1 from public.people pe
      where pe.id = assignments.person_id and public.is_branch_manager(pe.branch_id)
    )
  ) with check (
    public.is_platform_admin()
    or public.is_company_wide(company_id)
    or exists (
      select 1 from public.people pe
      where pe.id = assignments.person_id and public.is_branch_manager(pe.branch_id)
    )
  );

create or replace function public.complete_assignment(
  p_assignment_id uuid,
  p_evidence_id uuid
) returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  a public.assignments%rowtype;
  v_is_owner boolean;
  v_branch uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select * into a from public.assignments where id = p_assignment_id;
  if a.id is null then raise exception 'That assignment could not be found'; end if;
  if a.status <> 'assigned' then raise exception 'That assignment is already closed'; end if;

  select (pe.profile_id = auth.uid()), pe.branch_id into v_is_owner, v_branch
  from public.people pe where pe.id = a.person_id;

  if not (
    coalesce(v_is_owner, false)
    or public.is_platform_admin()
    or public.is_company_wide(a.company_id)
    or public.is_branch_manager(v_branch)
  ) then
    raise exception 'You do not have permission to complete this';
  end if;

  update public.assignments
  set status = 'completed', evidence_id = p_evidence_id, completed_at = now()
  where id = p_assignment_id;
end;
$$;

revoke all on function public.complete_assignment(uuid, uuid) from public, anon;
grant execute on function public.complete_assignment(uuid, uuid) to authenticated;

-- The acknowledgement form: a master template, plus a published copy for every
-- company that exists today. New companies get it through the normal seeding.
insert into public.form_templates (key, name, population, description, schema, status)
values (
  'policy_acknowledgement',
  'Policy Acknowledgement',
  'people',
  'Confirms a team member has read and understood a company policy.',
  jsonb_build_object(
    'schemaVersion', 1,
    'sections', jsonb_build_array(
      jsonb_build_object(
        'id', 'section-1',
        'title', 'Confirmation',
        'fields', jsonb_build_array(
          jsonb_build_object('key', 'policy', 'type', 'short_text', 'label', 'Policy', 'required', true),
          jsonb_build_object('key', 'policy_version', 'type', 'short_text', 'label', 'Version'),
          jsonb_build_object('key', 'name', 'type', 'short_text', 'label', 'Name'),
          jsonb_build_object('key', 'read_date', 'type', 'date', 'label', 'Date read', 'required', true),
          jsonb_build_object(
            'key', 'confirmed', 'type', 'checkbox', 'required', true,
            'label', 'I confirm I have read and understood this policy'
          )
        )
      )
    )
  ),
  'active'
)
on conflict (key) do nothing;

do $$
declare
  c record;
  t record;
  v_form_id uuid;
begin
  select * into t from public.form_templates where key = 'policy_acknowledgement';
  for c in select id from public.companies loop
    if not exists (
      select 1 from public.forms f
      where f.company_id = c.id and f.key = 'policy_acknowledgement'
    ) then
      insert into public.forms (company_id, key, name, population, description, status, source_template_key, current_version)
      values (c.id, t.key, t.name, t.population, t.description, 'active', t.key, 1)
      returning id into v_form_id;

      insert into public.form_versions (form_id, version, schema, status)
      values (v_form_id, 1, t.schema, 'published');
    end if;
  end loop;
end $$;
