-- 0027_service_users
-- Phase 4 — Service Users. The same compliance loop as People (Phase 3), for the
-- clients receiving care. Service User data is special-category health data under
-- UK GDPR, so this is the most sensitive data in the platform: Team Members never
-- see it unless explicitly assigned, Supervisors are scoped to their caseload, and
-- cancelled/discharged Service Users are excluded from the active register, rollups,
-- dashboard and reminders (kept for audit).
--
-- Maximum reuse of Phase 3 (agreed with Phil, 2026-07-09): the shared check_instances
-- and evidence tables already carry record_type in ('person','service_user'), so
-- Service User checks and evidence live in the SAME tables (extended here with a
-- service_user_id column and parallel SU views/RPCs), driven by the SAME recurrence
-- engine and submitEvidence pipeline. No parallel compliance engine.
--
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

-- ===========================================================================
-- Company-level: shorthand register column labels for Service Users (mirrors
-- people_column_labels).
-- ===========================================================================
alter table public.companies
  add column if not exists service_user_column_labels jsonb not null default '{}'::jsonb;

-- ===========================================================================
-- service_users: one Record per client receiving care. SSID (Social Services ID)
-- is unique within a company when set. service_status drives the register views;
-- 'cancelled' behaves like a People leaver (excluded from the active register and
-- all rollups). archived_at keeps a cancelled Record for audit without showing it
-- in the active views.
-- ===========================================================================
create table public.service_users (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  full_name text not null,
  ssid text,
  package_start_date date,
  service_status text not null default 'active'
    check (service_status in ('active', 'hospital', 'respite', 'cancelled')),
  discharge_date date,
  archived_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- SSID unique within a company, but optional (multiple Records may have no SSID yet).
create unique index service_users_ssid_uq
  on public.service_users (company_id, ssid) where ssid is not null;

create index service_users_company_idx on public.service_users (company_id);
create index service_users_branch_idx on public.service_users (branch_id);
create index service_users_status_idx on public.service_users (company_id, service_status);

create trigger service_users_set_updated_at
  before update on public.service_users
  for each row execute function public.set_updated_at();

-- ===========================================================================
-- service_user_trackers: directly-recorded fields on the Record (edited on the
-- record, not via a Form). Holds the Planned Review Date booking now (the booked
-- date for the next Care Plan Review + the reviewer chosen to complete it), with
-- room for future SU-specific fields. Mirrors person_trackers. One row per Record,
-- auto-created on insert.
-- ===========================================================================
create table public.service_user_trackers (
  service_user_id uuid primary key references public.service_users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  planned_review_date date,
  planned_reviewer_id uuid references public.profiles(id) on delete set null,
  planned_review_booked_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create index service_user_trackers_company_idx on public.service_user_trackers (company_id);
create index service_user_trackers_branch_idx on public.service_user_trackers (branch_id);

create trigger service_user_trackers_set_updated_at
  before update on public.service_user_trackers
  for each row execute function public.set_updated_at();

create or replace function public.create_service_user_tracker()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  insert into public.service_user_trackers (service_user_id, company_id, branch_id)
  values (new.id, new.company_id, new.branch_id)
  on conflict (service_user_id) do nothing;
  return new;
end;
$$;

create trigger service_users_create_tracker
  after insert on public.service_users
  for each row execute function public.create_service_user_tracker();

-- ===========================================================================
-- service_user_assignments: a user's Service User caseload (Supervisor visibility,
-- and the "explicitly assigned" rule that lets an assigned user see a Service User
-- they otherwise could not). Mirrors person_assignments.
-- ===========================================================================
create table public.service_user_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  service_user_id uuid not null references public.service_users(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (service_user_id, user_id)
);

create index service_user_assignments_user_idx on public.service_user_assignments (user_id);
create index service_user_assignments_su_idx on public.service_user_assignments (service_user_id);

-- ===========================================================================
-- Extend the shared check_instances table for Service Users. Person rows keep
-- person_id; Service User rows carry service_user_id (record_type discriminates).
-- ===========================================================================
alter table public.check_instances
  add column if not exists service_user_id uuid references public.service_users(id) on delete cascade;

alter table public.check_instances
  add constraint check_instances_service_user_present
  check (record_type <> 'service_user' or service_user_id is not null);

create unique index check_instances_service_user_uq
  on public.check_instances (definition_id, service_user_id) where service_user_id is not null;

create index check_instances_service_user_idx on public.check_instances (service_user_id);

-- ===========================================================================
-- Keep a Service User's checks + tracker branch in step on transfer.
-- ===========================================================================
create or replace function public.sync_service_user_branch()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.branch_id is distinct from old.branch_id then
    update public.check_instances
      set branch_id = new.branch_id, updated_at = now()
      where service_user_id = new.id;
    update public.service_user_trackers
      set branch_id = new.branch_id
      where service_user_id = new.id;
  end if;
  return new;
end;
$$;

create trigger service_users_branch_sync
  after update of branch_id on public.service_users
  for each row execute function public.sync_service_user_branch();

-- ===========================================================================
-- Visibility helpers (SECURITY DEFINER, stable). NOTE the special-category rule:
-- there is NO is_branch_team_member path for Service Users. A Team Member only
-- sees a Service User when explicitly assigned (service_user_assignments), which
-- is exactly what is_service_user_supervisor checks.
-- ===========================================================================

-- Is the current user assigned this Service User (their caseload / explicit assignment)?
create or replace function public.is_service_user_supervisor(p_service_user_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.service_user_assignments sa
    where sa.service_user_id = p_service_user_id and sa.user_id = auth.uid()
  );
$$;

-- Can the current user MANAGE this Service User (create/edit/transfer/assign)?
create or replace function public.can_manage_service_user(p_service_user_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.service_users su
    where su.id = p_service_user_id
      and ( public.is_platform_admin()
         or public.is_company_admin(su.company_id)
         or public.is_branch_manager(su.branch_id) )
  );
$$;

-- Can the current user COMPLETE a check for this Service User (satisfy a Form)?
-- Managers, Admin/Platform, and any explicitly-assigned user (their caseload).
create or replace function public.can_complete_service_user_check(p_service_user_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.service_users su
    where su.id = p_service_user_id
      and ( public.is_platform_admin()
         or public.is_company_admin(su.company_id)
         or public.is_branch_manager(su.branch_id)
         or public.is_service_user_supervisor(su.id) )
  );
$$;

-- ===========================================================================
-- Write RPCs (SECURITY DEFINER, internally authorised).
-- ===========================================================================

-- Apply definitions to a Service User (idempotent). p_rows: [{definition_id,
-- due_date, expiry_date}]. Only the Service User's own company definitions insert.
create or replace function public.apply_service_user_checks(p_service_user_id uuid, p_rows jsonb)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_company uuid;
  v_branch uuid;
  r jsonb;
  n int := 0;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.can_manage_service_user(p_service_user_id) then
    raise exception 'Not allowed to manage this record';
  end if;

  select company_id, branch_id into v_company, v_branch
    from public.service_users where id = p_service_user_id;
  if v_company is null then raise exception 'Unknown record'; end if;

  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
  loop
    insert into public.check_instances
      (company_id, branch_id, definition_id, record_type, service_user_id, due_date, expiry_date)
    select v_company, v_branch, (r->>'definition_id')::uuid, 'service_user', p_service_user_id,
           nullif(r->>'due_date','')::date, nullif(r->>'expiry_date','')::date
    where exists (
      select 1 from public.check_definitions cd
      where cd.id = (r->>'definition_id')::uuid and cd.company_id = v_company
    )
    on conflict (definition_id, service_user_id) where service_user_id is not null do nothing;
    if found then n := n + 1; end if;
  end loop;

  return n;
end;
$$;

-- Generalise complete_check to advance either a Person or a Service User check.
-- next_due (and any expiry) are computed by the shared TS recurrence engine.
-- Idempotent on the evidence id. Fully backward compatible with Phase 3 callers.
create or replace function public.complete_check(
  p_instance_id uuid,
  p_completed_on date,
  p_evidence_id uuid,
  p_next_due date,
  p_expiry_date date default null
)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_person uuid;
  v_service_user uuid;
  v_recurring boolean;
  v_existing uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select ci.person_id, ci.service_user_id, cd.recurring, ci.last_evidence_id
    into v_person, v_service_user, v_recurring, v_existing
  from public.check_instances ci
  join public.check_definitions cd on cd.id = ci.definition_id
  where ci.id = p_instance_id;

  if v_person is null and v_service_user is null then raise exception 'Unknown check'; end if;

  if v_person is not null then
    if not public.can_complete_person_check(v_person) then
      raise exception 'Not allowed to complete this check';
    end if;
  else
    if not public.can_complete_service_user_check(v_service_user) then
      raise exception 'Not allowed to complete this check';
    end if;
  end if;

  -- Idempotent: the same evidence already advanced this check.
  if v_existing is not null and v_existing = p_evidence_id then return; end if;

  update public.check_instances set
    last_completed_on = p_completed_on,
    last_evidence_id = p_evidence_id,
    expiry_date = coalesce(p_expiry_date, expiry_date),
    due_date = case when v_recurring then p_next_due else null end,
    updated_at = now()
  where id = p_instance_id;
end;
$$;

-- ===========================================================================
-- Seed a company's default Service User check catalogue (idempotent), linking each
-- check to the company's already-seeded Form by key. Founder-curated defaults;
-- editable per company. Intervals reflect UK sector norms (CQC/CIW expect care
-- plans and risk assessments reviewed at least annually, and sooner on change of
-- need; medication (MAR) audits are commonly monthly best practice). Only the Care
-- Plan Review drives the register's review columns; the rest live in the drill-down.
-- ===========================================================================
create or replace function public.seed_company_service_user_checks(cid uuid)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare
  seeded int;
begin
  if not (public.is_platform_admin() or public.is_company_admin(cid)) then
    raise exception 'Not allowed to seed checks for this company';
  end if;

  insert into public.check_definitions
    (company_id, population, key, name, description, form_id, recurring, frequency,
     "interval", anchor, lead_days, expiry_field_key, amber_days, sort_order)
  select cid, 'service_users', v.key, v.name, v.description,
         (select f.id from public.forms f where f.company_id = cid and f.key = v.form_key),
         v.recurring, v.frequency, v."interval", v.anchor, v.lead_days,
         v.expiry_field_key, v.amber_days::int, v.sort_order
  from (values
    ('care_plan_review','Care Plan Review','Recurring review of the care plan, at least annually and sooner on change of need.','care_plan_review',
       true,'month',12,'completion',0,null,null,10),
    ('risk_assessment','Risk Assessment','Recurring review of the service user risk assessments.','risk_assessment',
       true,'month',12,'completion',0,null,null,20),
    ('mar_audit','MAR Audit','Medication administration record audit.','mar_audit',
       true,'month',1,'completion',0,null,null,30),
    ('consent_review','Consent Review','Review of consent and capacity to the care and support provided.','consent_review',
       true,'month',12,'completion',0,null,null,40)
  ) as v(key,name,description,form_key,recurring,frequency,"interval",anchor,lead_days,expiry_field_key,amber_days,sort_order)
  on conflict (company_id, population, key) do nothing;

  get diagnostics seeded = row_count;
  return seeded;
end;
$$;

-- ===========================================================================
-- Row Level Security
-- ===========================================================================
alter table public.service_users enable row level security;
alter table public.service_user_assignments enable row level security;
alter table public.service_user_trackers enable row level security;

-- service_users read: Managers see their branch(es); assigned users (any role,
-- including Team Members and Supervisors) see their caseload; Admin/Platform all.
-- There is deliberately NO branch-wide Team Member read here (special-category).
create policy service_users_select on public.service_users
  for select using (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or public.is_branch_manager(branch_id)
    or public.is_service_user_supervisor(id)
  );

create policy service_users_insert on public.service_users
  for insert with check (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or public.is_branch_manager(branch_id)
  );

create policy service_users_update on public.service_users
  for update using (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or public.is_branch_manager(branch_id)
  ) with check (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or public.is_branch_manager(branch_id)
  );

create policy service_users_delete on public.service_users
  for delete using (
    public.is_platform_admin() or public.is_company_admin(company_id)
  );

-- service_user_assignments: visible to those who manage the Service User or the assignee.
create policy service_user_assignments_select on public.service_user_assignments
  for select using (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or public.can_manage_service_user(service_user_id)
    or user_id = auth.uid()
  );

create policy service_user_assignments_insert on public.service_user_assignments
  for insert with check (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or public.can_manage_service_user(service_user_id)
  );

create policy service_user_assignments_delete on public.service_user_assignments
  for delete using (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or public.can_manage_service_user(service_user_id)
  );

-- service_user_trackers: read follows the Service User's visibility; write is
-- Managers/Admins (can_manage_service_user). No delete (rows follow the record).
create policy service_user_trackers_select on public.service_user_trackers
  for select using (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or (branch_id is not null and public.is_branch_manager(branch_id))
    or public.is_service_user_supervisor(service_user_id)
  );

create policy service_user_trackers_insert on public.service_user_trackers
  for insert with check (public.can_manage_service_user(service_user_id));

create policy service_user_trackers_update on public.service_user_trackers
  for update using (public.can_manage_service_user(service_user_id))
  with check (public.can_manage_service_user(service_user_id));

-- Extend check_instances read to include Service User visibility (Person scope
-- unchanged). Managers by branch; assigned users by caseload; Admin/Platform all.
drop policy if exists check_instances_select on public.check_instances;
create policy check_instances_select on public.check_instances
  for select using (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or (branch_id is not null and public.is_branch_manager(branch_id))
    or (person_id is not null and public.is_person_supervisor(person_id))
    or (person_id is not null and exists (
      select 1 from public.people pe
      where pe.id = check_instances.person_id and pe.profile_id = auth.uid()
    ))
    or (service_user_id is not null and public.is_service_user_supervisor(service_user_id))
  );

-- Extend evidence reads to include Service User scope (Person scope unchanged).
drop policy if exists evidence_select on public.evidence;
create policy evidence_select on public.evidence
  for select using (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or (branch_id is not null and public.is_branch_manager(branch_id))
    or author_id = auth.uid()
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

drop policy if exists evidence_files_select on public.evidence_files;
create policy evidence_files_select on public.evidence_files
  for select using (
    exists (
      select 1 from public.evidence e
      where e.id = evidence_id
        and (
          public.is_platform_admin()
          or public.is_company_admin(e.company_id)
          or (e.branch_id is not null and public.is_branch_manager(e.branch_id))
          or e.author_id = auth.uid()
          or (
            e.record_type = 'person' and e.record_id is not null and (
              public.is_person_supervisor(e.record_id)
              or exists (
                select 1 from public.people pe
                where pe.id = e.record_id and pe.profile_id = auth.uid()
              )
            )
          )
          or (
            e.record_type = 'service_user' and e.record_id is not null
            and public.is_service_user_supervisor(e.record_id)
          )
        )
    )
  );

-- ===========================================================================
-- RAG views (security_invoker so each caller's RLS applies). The active views
-- exclude cancelled + archived Records AND the temporary non-active states
-- (hospital/respite), exactly as the People views count only 'active' — so the
-- dashboard/summary rollup shows the active caseload. The _all views drop the
-- status filter (RLS still scopes by company/branch/caseload) so the register can
-- show the Hospital / Respite / Cancelled views; the register filters by scope.
-- ===========================================================================
create view public.service_user_check_status
  with (security_invoker = true) as
select
  ci.id            as instance_id,
  ci.company_id,
  ci.branch_id,
  ci.service_user_id,
  ci.definition_id,
  cd.key           as check_key,
  cd.name          as check_name,
  cd.population,
  cd.recurring,
  cd.anchor,
  cd.form_id,
  cd.expiry_field_key,
  ci.due_date,
  ci.last_completed_on,
  ci.expiry_date,
  ci.last_evidence_id,
  coalesce(cd.amber_days, co.amber_days_default, 30) as effective_amber,
  public.check_rag(ci.due_date, coalesce(cd.amber_days, co.amber_days_default, 30)) as rag
from public.check_instances ci
join public.check_definitions cd on cd.id = ci.definition_id
join public.service_users su on su.id = ci.service_user_id
join public.companies co on co.id = ci.company_id
where ci.active
  and cd.active
  and su.service_status = 'active'
  and su.archived_at is null;

create view public.service_user_check_status_all
  with (security_invoker = true) as
select
  ci.id            as instance_id,
  ci.company_id,
  ci.branch_id,
  ci.service_user_id,
  ci.definition_id,
  cd.key           as check_key,
  cd.name          as check_name,
  cd.population,
  cd.recurring,
  cd.anchor,
  cd.form_id,
  cd.expiry_field_key,
  ci.due_date,
  ci.last_completed_on,
  ci.expiry_date,
  ci.last_evidence_id,
  coalesce(cd.amber_days, co.amber_days_default, 30) as effective_amber,
  public.check_rag(ci.due_date, coalesce(cd.amber_days, co.amber_days_default, 30)) as rag
from public.check_instances ci
join public.check_definitions cd on cd.id = ci.definition_id
join public.service_users su on su.id = ci.service_user_id
join public.companies co on co.id = ci.company_id
where ci.active and cd.active;

create view public.service_user_rollup
  with (security_invoker = true) as
select
  su.id as service_user_id,
  su.company_id,
  su.branch_id,
  count(s.instance_id)                          as total_checks,
  count(*) filter (where s.rag = 'red')         as red_count,
  count(*) filter (where s.rag = 'amber')       as amber_count,
  count(*) filter (where s.rag = 'green')       as green_count,
  case
    when count(*) filter (where s.rag = 'red') > 0 then 'red'
    when count(*) filter (where s.rag = 'amber') > 0 then 'amber'
    when count(s.instance_id) = 0 then 'none'
    else 'green'
  end as rag
from public.service_users su
left join public.service_user_check_status s on s.service_user_id = su.id
where su.service_status = 'active' and su.archived_at is null
group by su.id, su.company_id, su.branch_id;

create view public.service_user_rollup_all
  with (security_invoker = true) as
select
  su.id as service_user_id,
  su.company_id,
  su.branch_id,
  count(s.instance_id)                          as total_checks,
  count(*) filter (where s.rag = 'red')         as red_count,
  count(*) filter (where s.rag = 'amber')       as amber_count,
  count(*) filter (where s.rag = 'green')       as green_count,
  case
    when count(*) filter (where s.rag = 'red') > 0 then 'red'
    when count(*) filter (where s.rag = 'amber') > 0 then 'amber'
    when count(s.instance_id) = 0 then 'none'
    else 'green'
  end as rag
from public.service_users su
left join public.service_user_check_status_all s on s.service_user_id = su.id
group by su.id, su.company_id, su.branch_id;

-- ===========================================================================
-- Realtime: RLS-protected tables need REPLICA IDENTITY FULL for UPDATE/DELETE
-- events to reach subscribers (the register shows live RAG rollups). Adding the
-- tables to the supabase_realtime publication is done in 0028 (mirrors People's
-- 0004/0005 split).
-- ===========================================================================
alter table public.service_users replica identity full;
alter table public.service_user_assignments replica identity full;
alter table public.service_user_trackers replica identity full;
