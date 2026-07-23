-- 0113_on_call
-- Phase 10 Additions: the On Call department + a new "On Call" user role.
--
-- On Call is a FOURTH top-level section (alongside People, Service Users,
-- Complaints). It is a log/register, NOT the recurring Check/RAG engine:
--   on_call_shifts : the rota. One row = one cover period (start -> end
--                    datetime), the person on call and an on-call phone.
--   on_call_logs   : each out-of-hours call/incident and how it was handled,
--                    with a per-company reference number and a follow-up flag.
-- Department access = Supervisors and above, PLUS the new on_call role.
--
-- NEW ROLE 'on_call': a focused out-of-hours role whose ONLY departments are
-- On Call, Absence and Complaints, across ALL branches of their company, with
-- full use (create/edit) in those three areas and NOTHING else (no People
-- compliance, no Service Users, no Dashboard). Implemented with a dedicated
-- is_company_on_call() helper that is added ONLY to the on-call / absence /
-- complaints policies, so it never leaks into People or Service User data the
-- way is_company_wide() would.
--
-- Pro-and-above feature (gated in the app by lib/billing/tier "on_call").
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

-- ===========================================================================
-- 1. Allow the new role on profiles and invites.
-- ===========================================================================
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in (
    'platform_admin','company_admin',
    'registered_individual','registered_manager',
    'manager','supervisor','team_member','on_call'
  ));

alter table public.invites drop constraint if exists invites_role_check;
alter table public.invites add constraint invites_role_check
  check (role = any (array[
    'company_admin', 'registered_individual', 'registered_manager',
    'manager', 'supervisor', 'team_member', 'on_call'
  ]));

-- ===========================================================================
-- 2. Helpers.
--    is_company_on_call(cid): caller is an active on_call user in that company
--      (all branches; no per-branch assignment needed).
--    is_branch_supervisor(bid): an active supervisor assigned to that branch
--      (created for Planner; recreated defensively in case it is absent).
-- ===========================================================================
create or replace function public.is_company_on_call(cid uuid)
returns boolean language sql stable security definer set search_path to 'public','pg_temp'
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.company_id = cid
      and p.role = 'on_call'
      and p.status = 'active'
  );
$$;

create or replace function public.is_branch_supervisor(bid uuid)
returns boolean language sql stable security definer set search_path to 'public','pg_temp'
as $$
  select exists (
    select 1
    from public.profiles p
    join public.user_branches ub on ub.user_id = p.id
    where p.id = auth.uid()
      and p.role = 'supervisor'
      and p.status = 'active'
      and ub.branch_id = bid
  );
$$;

-- Department access predicate for the On Call tables: Supervisors and above,
-- company-wide seniors, Founder, and the on_call role (all branches).
--   is_platform_admin() OR is_company_wide(cid) OR is_branch_manager(bid)
--   OR is_branch_supervisor(bid) OR is_company_on_call(cid)

-- ===========================================================================
-- 3. on_call_shifts — the rota.
-- ===========================================================================
create table if not exists public.on_call_shifts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete restrict,
  on_call_profile_id uuid references public.profiles(id) on delete set null,
  on_call_name text,               -- fallback label when the person has no account
  phone text,                      -- on-call phone number for this shift
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index on_call_shifts_company_idx on public.on_call_shifts (company_id, starts_at);
create index on_call_shifts_branch_idx on public.on_call_shifts (branch_id, starts_at);
create index on_call_shifts_person_idx on public.on_call_shifts (on_call_profile_id);

alter table public.on_call_shifts enable row level security;

create policy on_call_shifts_select on public.on_call_shifts
  for select to authenticated
  using (
    public.is_platform_admin()
    or public.is_company_wide(company_id)
    or public.is_branch_manager(branch_id)
    or public.is_branch_supervisor(branch_id)
    or public.is_company_on_call(company_id)
  );

create policy on_call_shifts_insert on public.on_call_shifts
  for insert to authenticated
  with check (
    public.is_platform_admin()
    or public.is_company_wide(company_id)
    or public.is_branch_manager(branch_id)
    or public.is_branch_supervisor(branch_id)
    or public.is_company_on_call(company_id)
  );

create policy on_call_shifts_update on public.on_call_shifts
  for update to authenticated
  using (
    public.is_platform_admin()
    or public.is_company_wide(company_id)
    or public.is_branch_manager(branch_id)
    or public.is_branch_supervisor(branch_id)
    or public.is_company_on_call(company_id)
  )
  with check (
    public.is_platform_admin()
    or public.is_company_wide(company_id)
    or public.is_branch_manager(branch_id)
    or public.is_branch_supervisor(branch_id)
    or public.is_company_on_call(company_id)
  );

create policy on_call_shifts_delete on public.on_call_shifts
  for delete to authenticated
  using (
    public.is_platform_admin()
    or public.is_company_wide(company_id)
    or public.is_branch_manager(branch_id)
    or public.is_branch_supervisor(branch_id)
    or public.is_company_on_call(company_id)
  );

-- ===========================================================================
-- 4. on_call_logs — each out-of-hours call/incident.
-- ===========================================================================
create table if not exists public.on_call_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete restrict,
  ref_number integer not null,
  shift_id uuid references public.on_call_shifts(id) on delete set null,
  occurred_at timestamptz not null default now(),
  handler_profile_id uuid references public.profiles(id) on delete set null,
  handler_name text,
  caller_name text,
  caller_relationship text
    check (caller_relationship is null or caller_relationship in
      ('service_user','relative','staff','professional','public','other')),
  service_user_id uuid references public.service_users(id) on delete set null,
  category text,                   -- e.g. staff sickness / missed visit / care emergency / medication / safeguarding / other
  details text not null,
  action_taken text,
  outcome text,
  follow_up_required boolean not null default false,
  follow_up_notes text,
  follow_up_done boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (company_id, ref_number)
);

create index on_call_logs_company_idx on public.on_call_logs (company_id, occurred_at desc);
create index on_call_logs_branch_idx on public.on_call_logs (branch_id, occurred_at desc);
create index on_call_logs_followup_idx on public.on_call_logs (company_id) where follow_up_required and not follow_up_done;
create index on_call_logs_shift_idx on public.on_call_logs (shift_id);

-- Per-company incrementing reference number, assigned server-side on insert.
create or replace function public.on_call_logs_assign_ref()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.ref_number is null then
    select coalesce(max(ref_number), 0) + 1
      into new.ref_number
      from public.on_call_logs
      where company_id = new.company_id;
  end if;
  return new;
end;
$$;

create trigger on_call_logs_assign_ref_trg
  before insert on public.on_call_logs
  for each row execute function public.on_call_logs_assign_ref();

alter table public.on_call_logs enable row level security;

create policy on_call_logs_select on public.on_call_logs
  for select to authenticated
  using (
    public.is_platform_admin()
    or public.is_company_wide(company_id)
    or public.is_branch_manager(branch_id)
    or public.is_branch_supervisor(branch_id)
    or public.is_company_on_call(company_id)
  );

create policy on_call_logs_insert on public.on_call_logs
  for insert to authenticated
  with check (
    public.is_platform_admin()
    or public.is_company_wide(company_id)
    or public.is_branch_manager(branch_id)
    or public.is_branch_supervisor(branch_id)
    or public.is_company_on_call(company_id)
  );

create policy on_call_logs_update on public.on_call_logs
  for update to authenticated
  using (
    public.is_platform_admin()
    or public.is_company_wide(company_id)
    or public.is_branch_manager(branch_id)
    or public.is_branch_supervisor(branch_id)
    or public.is_company_on_call(company_id)
  )
  with check (
    public.is_platform_admin()
    or public.is_company_wide(company_id)
    or public.is_branch_manager(branch_id)
    or public.is_branch_supervisor(branch_id)
    or public.is_company_on_call(company_id)
  );

create policy on_call_logs_delete on public.on_call_logs
  for delete to authenticated
  using (
    public.is_platform_admin()
    or public.is_company_wide(company_id)
    or public.is_branch_manager(branch_id)
    or public.is_branch_supervisor(branch_id)
    or public.is_company_on_call(company_id)
  );

-- Keep updated_at fresh on both tables.
create or replace function public.on_call_set_updated_at()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger on_call_shifts_updated_at
  before update on public.on_call_shifts
  for each row execute function public.on_call_set_updated_at();
create trigger on_call_logs_updated_at
  before update on public.on_call_logs
  for each row execute function public.on_call_set_updated_at();

-- Realtime: RLS-protected tables need REPLICA IDENTITY FULL for UPDATE/DELETE
-- events to reach subscribers, and must be added to the publication.
alter table public.on_call_shifts replica identity full;
alter table public.on_call_logs replica identity full;
alter publication supabase_realtime add table public.on_call_shifts;
alter publication supabase_realtime add table public.on_call_logs;

-- ===========================================================================
-- 5. Grant the on_call role its OTHER two departments: Complaints + Absence.
--    Add is_company_on_call to the existing policies (recreate them). This is
--    additive: every role that had access keeps it.
-- ===========================================================================

-- Complaints (records)
drop policy if exists complaints_select on public.complaints;
create policy complaints_select on public.complaints
  for select to authenticated
  using (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or public.is_branch_manager(branch_id)
    or public.is_company_on_call(company_id)
  );

drop policy if exists complaints_insert on public.complaints;
create policy complaints_insert on public.complaints
  for insert to authenticated
  with check (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or public.is_branch_manager(branch_id)
    or public.is_company_on_call(company_id)
  );

drop policy if exists complaints_update on public.complaints;
create policy complaints_update on public.complaints
  for update to authenticated
  using (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or public.is_branch_manager(branch_id)
    or public.is_company_on_call(company_id)
  )
  with check (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or public.is_branch_manager(branch_id)
    or public.is_company_on_call(company_id)
  );

-- Complaints config (response timescales): on_call may READ (needed to compute
-- due dates), not write.
drop policy if exists complaints_config_select on public.complaints_config;
create policy complaints_config_select on public.complaints_config
  for select to authenticated
  using (
    public.is_platform_admin()
    or public.is_company_member(company_id)
    or public.is_company_on_call(company_id)
  );

-- Complaint responses (letters / investigations)
drop policy if exists complaint_responses_select on public.complaint_responses;
create policy complaint_responses_select on public.complaint_responses
  for select to authenticated
  using (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or public.is_branch_manager(branch_id)
    or public.is_company_on_call(company_id)
  );

drop policy if exists complaint_responses_insert on public.complaint_responses;
create policy complaint_responses_insert on public.complaint_responses
  for insert to authenticated
  with check (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or public.is_branch_manager(branch_id)
    or public.is_company_on_call(company_id)
  );

-- Absence events + meetings + config (the Absence department)
drop policy if exists absence_events_select on public.absence_events;
create policy absence_events_select on public.absence_events
  for select to authenticated
  using (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or (branch_id is not null and public.is_branch_manager(branch_id))
    or public.is_person_supervisor(person_id)
    or public.is_company_on_call(company_id)
    or exists (
      select 1 from public.people pe
      where pe.id = absence_events.person_id and pe.profile_id = auth.uid()
    )
  );

drop policy if exists absence_events_insert on public.absence_events;
create policy absence_events_insert on public.absence_events
  for insert to authenticated
  with check (
    public.is_company_member(company_id)
    and (
      public.is_company_admin(company_id)
      or (branch_id is not null and public.is_branch_manager(branch_id))
      or public.is_company_on_call(company_id)
    )
  );

drop policy if exists absence_meetings_select on public.absence_meetings;
create policy absence_meetings_select on public.absence_meetings
  for select to authenticated
  using (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or (branch_id is not null and public.is_branch_manager(branch_id))
    or public.is_person_supervisor(person_id)
    or public.is_company_on_call(company_id)
    or exists (
      select 1 from public.people pe
      where pe.id = absence_meetings.person_id and pe.profile_id = auth.uid()
    )
  );

drop policy if exists absence_meetings_insert on public.absence_meetings;
create policy absence_meetings_insert on public.absence_meetings
  for insert to authenticated
  with check (
    public.is_company_member(company_id)
    and (
      public.is_company_admin(company_id)
      or (branch_id is not null and public.is_branch_manager(branch_id))
      or public.is_company_on_call(company_id)
    )
  );

drop policy if exists absence_config_select on public.absence_config;
create policy absence_config_select on public.absence_config
  for select to authenticated
  using (
    public.is_platform_admin()
    or public.is_company_member(company_id)
    or public.is_company_on_call(company_id)
  );

-- ===========================================================================
-- 6. Evidence: let on_call VIEW complaint evidence (cleanly separable by
--    record_type), and let submit_evidence accept on_call as a valid branch
--    author (so they can complete complaint + absence forms for any branch).
--    Person/Service-User evidence READ is deliberately NOT opened to on_call;
--    they still see evidence they authored themselves (author_id = auth.uid()).
-- ===========================================================================
drop policy if exists evidence_select on public.evidence;
create policy evidence_select on public.evidence
  for select using (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or (branch_id is not null and public.is_branch_manager(branch_id))
    or author_id = auth.uid()
    or (record_type = 'complaint' and public.is_company_on_call(company_id))
    or (
      record_type = 'person' and record_id is not null and (
        public.is_person_supervisor(record_id)
        or exists (
          select 1 from public.people pe
          where pe.id = record_id and pe.profile_id = auth.uid()
        )
      )
    )
    or (
      record_type = 'service_user' and record_id is not null
      and public.is_service_user_supervisor(record_id)
    )
  );

-- Recreate submit_evidence with the on_call branch allowance (body identical to
-- 0003 except the branch authorisation line).
create or replace function public.submit_evidence(
  p_evidence_id uuid,
  p_form_version_id uuid,
  p_branch_id uuid,
  p_answers jsonb,
  p_pdf_path text,
  p_pdf_sha256 text,
  p_pdf_bytes int,
  p_record_type text default null,
  p_record_id uuid default null,
  p_files jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company_id uuid;
  v_form_id uuid;
  v_schema jsonb;
  v_email text;
  v_name text;
  f jsonb;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select f.company_id, fv.form_id, fv.schema
    into v_company_id, v_form_id, v_schema
  from public.form_versions fv
  join public.forms f on f.id = fv.form_id
  where fv.id = p_form_version_id;

  if v_company_id is null then
    raise exception 'Unknown form version';
  end if;

  if not public.is_company_member(v_company_id) then
    raise exception 'Not a member of this company';
  end if;
  if p_branch_id is not null then
    if not exists (
      select 1 from public.branches b
      where b.id = p_branch_id and b.company_id = v_company_id
    ) then
      raise exception 'Branch does not belong to this company';
    end if;
    -- Branch author: a branch member, OR an on_call user (all-branch access to
    -- their Complaints + Absence forms).
    if not (public.is_branch_member(p_branch_id) or public.is_company_on_call(v_company_id)) then
      raise exception 'Not a member of this branch';
    end if;
  end if;

  select email, full_name into v_email, v_name
  from public.profiles where id = auth.uid();

  insert into public.evidence (
    id, company_id, branch_id, form_id, form_version_id, schema_snapshot,
    answers, author_id, author_email, author_name,
    pdf_path, pdf_sha256, pdf_bytes, record_type, record_id
  ) values (
    p_evidence_id, v_company_id, p_branch_id, v_form_id, p_form_version_id, v_schema,
    coalesce(p_answers, '{}'::jsonb), auth.uid(), v_email, v_name,
    p_pdf_path, p_pdf_sha256, p_pdf_bytes, p_record_type, p_record_id
  );

  if p_files is not null and jsonb_typeof(p_files) = 'array' then
    for f in select * from jsonb_array_elements(p_files)
    loop
      insert into public.evidence_files
        (evidence_id, company_id, field_key, kind, storage_path, file_name, mime_type, bytes, sha256)
      values (
        p_evidence_id, v_company_id,
        coalesce(f->>'field_key', ''),
        coalesce(f->>'kind', 'upload'),
        f->>'storage_path', f->>'file_name', f->>'mime_type',
        nullif(f->>'bytes','')::int, f->>'sha256'
      );
    end loop;
  end if;

  return p_evidence_id;
end;
$$;
