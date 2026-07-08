-- 0004_people_checks
-- Phase 3: People section — the compliance loop for staff.
--   people            : one Record per staff member (identity + employment only).
--   person_assignments: Supervisor caseload (a user assigned to a Person).
--   check_definitions : a company's recurring compliance requirements (name, linked
--                       Form, recurrence rule, amber override). People + (later) SUs.
--   check_instances   : a definition applied to one Record (due_date, last_completed).
-- The complete-a-Form-satisfies-a-Check loop: a Form is completed -> Evidence via the
-- existing submit_evidence RPC (record_type='person') -> complete_check advances the
-- instance. ALL date maths (next due, initial due) is computed by the shared TS engine
-- (lib/recurrence.ts); SQL only does the RAG green/amber/red comparison and persistence,
-- so recurrence logic lives in exactly one place.
-- RAG rolls up check -> record -> register -> branch -> company. Leavers + archived are
-- excluded from the active views everywhere.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

-- ===========================================================================
-- Company-wide amber ("due soon") default threshold, overridable per check.
-- ===========================================================================

alter table public.companies
  add column if not exists amber_days_default int not null default 30;

-- ===========================================================================
-- People — the staff Record. Identity + employment only; DBS/right to work/
-- training are Checks, never columns. Distinct from Service Users (Phase 4).
-- ===========================================================================

create table public.people (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete restrict,
  -- Links a Team Member's login to their own Record (own-record-only visibility).
  profile_id uuid references public.profiles(id) on delete set null,
  full_name text not null,
  job_title text,
  -- Optional ownership fields mirrored from the manager's compliance matrix.
  manager_id uuid references public.profiles(id) on delete set null,
  team_leader_id uuid references public.profiles(id) on delete set null,
  team text,
  employment_status text not null default 'active'
    check (employment_status in ('active', 'leaver')),
  start_date date,
  leaver_date date,
  work_email text,
  mobile text,
  -- Archived is separate from leaver: both are excluded from active registers.
  archived_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index people_company_idx on public.people (company_id);
create index people_branch_idx on public.people (company_id, branch_id);
create index people_status_idx on public.people (company_id, employment_status, archived_at);
create unique index people_profile_uniq on public.people (profile_id) where profile_id is not null;

create trigger people_set_updated_at
  before update on public.people
  for each row execute function public.set_updated_at();

-- ===========================================================================
-- Supervisor caseload. A user assigned to a Person sees only their caseload.
-- ===========================================================================

create table public.person_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (person_id, user_id)
);

create index person_assignments_user_idx on public.person_assignments (user_id);
create index person_assignments_person_idx on public.person_assignments (person_id);

-- ===========================================================================
-- Check definitions — a company's compliance requirements. Every check is
-- satisfied by completing a Form (Evidence). anchor + expiry_field_key drive
-- scheduling: 'completion' schedules interval-from-completion; 'expiry' reads the
-- named form answer (a document expiry, e.g. right to work) and schedules
-- lead_days before it. recurring=false marks a one-off (e.g. probation review).
-- ===========================================================================

create table public.check_definitions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  population text not null check (population in ('people', 'service_users')),
  key text not null,
  name text not null,
  description text not null default '',
  form_id uuid references public.forms(id) on delete set null,
  recurring boolean not null default true,
  frequency text check (frequency in ('day', 'week', 'month', 'year')),
  "interval" int check ("interval" is null or "interval" >= 1),
  anchor text not null default 'completion' check (anchor in ('completion', 'expiry')),
  lead_days int not null default 0,
  -- For expiry anchor: which form answer holds the document expiry date.
  expiry_field_key text,
  -- Per-check amber override; null inherits the company default.
  amber_days int,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, population, key)
);

create index check_definitions_company_idx on public.check_definitions (company_id, population, active);

create trigger check_definitions_set_updated_at
  before update on public.check_definitions
  for each row execute function public.set_updated_at();

-- ===========================================================================
-- Check instances — one definition applied to one Record. unique(definition,person)
-- makes applying a definition twice a no-op (idempotency). due_date/last_completed
-- are written only via the definer RPCs below (values computed by the TS engine).
-- ===========================================================================

create table public.check_instances (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  definition_id uuid not null references public.check_definitions(id) on delete cascade,
  record_type text not null default 'person' check (record_type in ('person', 'service_user')),
  person_id uuid references public.people(id) on delete cascade,
  due_date date,
  last_completed_on date,
  last_evidence_id uuid references public.evidence(id) on delete set null,
  -- Tracked document expiry for expiry-anchored checks (right to work, DBS).
  expiry_date date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (definition_id, person_id),
  constraint check_instances_person_present
    check (record_type <> 'person' or person_id is not null)
);

create index check_instances_company_idx on public.check_instances (company_id);
create index check_instances_branch_idx on public.check_instances (branch_id);
create index check_instances_person_idx on public.check_instances (person_id);
create index check_instances_due_idx on public.check_instances (company_id, due_date);

create trigger check_instances_set_updated_at
  before update on public.check_instances
  for each row execute function public.set_updated_at();

-- Keep an instance's branch in step when a Record is transferred between branches.
create or replace function public.sync_check_instance_branch()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.branch_id is distinct from old.branch_id then
    update public.check_instances
      set branch_id = new.branch_id, updated_at = now()
      where person_id = new.id;
  end if;
  return new;
end;
$$;

create trigger people_branch_sync
  after update of branch_id on public.people
  for each row execute function public.sync_check_instance_branch();

-- ===========================================================================
-- Visibility helper functions (SECURITY DEFINER, stable). Role-aware so a Team
-- Member or Supervisor who merely belongs to a branch does NOT get branch-wide
-- read: only Managers (role) assigned to a branch do.
-- ===========================================================================

-- role = manager AND assigned to this branch. (Admin/Platform are added in policies.)
create or replace function public.is_branch_manager(bid uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.profiles p
    join public.user_branches ub on ub.user_id = p.id
    where p.id = auth.uid()
      and p.role = 'manager'
      and p.status = 'active'
      and ub.branch_id = bid
  );
$$;

-- Is the current user assigned this Person (their caseload)?
create or replace function public.is_person_supervisor(p_person_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.person_assignments pa
    where pa.person_id = p_person_id and pa.user_id = auth.uid()
  );
$$;

-- Can the current user MANAGE this Person (create/edit/transfer/assign)?
create or replace function public.can_manage_person(p_person_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.people pe
    where pe.id = p_person_id
      and ( public.is_platform_admin()
         or public.is_company_admin(pe.company_id)
         or public.is_branch_manager(pe.branch_id) )
  );
$$;

-- Can the current user COMPLETE a check for this Person (satisfy a Form)?
-- Managers, Supervisors on caseload, Admin/Platform, and the Team Member themselves.
create or replace function public.can_complete_person_check(p_person_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.people pe
    where pe.id = p_person_id
      and ( public.is_platform_admin()
         or public.is_company_admin(pe.company_id)
         or public.is_branch_manager(pe.branch_id)
         or public.is_person_supervisor(pe.id)
         or pe.profile_id = auth.uid() )
  );
$$;

-- RAG comparison ONLY (no interval maths — that lives in the TS engine). Today is
-- the Europe/London calendar date, so RAG never flips a day early at a UTC boundary.
create or replace function public.check_rag(p_due date, p_amber int)
returns text language sql stable set search_path = public, pg_temp as $$
  select case
    when p_due is null then 'none'
    when p_due < (now() at time zone 'Europe/London')::date then 'red'
    when p_due <= (now() at time zone 'Europe/London')::date + coalesce(p_amber, 30) then 'amber'
    else 'green'
  end;
$$;

-- ===========================================================================
-- Write RPCs (SECURITY DEFINER, internally authorised). check_instances has no
-- direct write policies; all writes go through these, with dates precomputed by
-- the TS recurrence engine and passed in.
-- ===========================================================================

-- Apply definitions to a Person (idempotent). p_rows: [{definition_id, due_date,
-- expiry_date}]. Only definitions of the Person's own company are inserted.
create or replace function public.apply_person_checks(p_person_id uuid, p_rows jsonb)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_company uuid;
  v_branch uuid;
  r jsonb;
  n int := 0;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.can_manage_person(p_person_id) then
    raise exception 'Not allowed to manage this record';
  end if;

  select company_id, branch_id into v_company, v_branch from public.people where id = p_person_id;
  if v_company is null then raise exception 'Unknown record'; end if;

  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
  loop
    insert into public.check_instances
      (company_id, branch_id, definition_id, record_type, person_id, due_date, expiry_date)
    select v_company, v_branch, (r->>'definition_id')::uuid, 'person', p_person_id,
           nullif(r->>'due_date','')::date, nullif(r->>'expiry_date','')::date
    where exists (
      select 1 from public.check_definitions cd
      where cd.id = (r->>'definition_id')::uuid and cd.company_id = v_company
    )
    on conflict (definition_id, person_id) do nothing;
    if found then n := n + 1; end if;
  end loop;

  return n;
end;
$$;

-- Advance a check after its Form is completed. next_due (and any expiry) are
-- computed by the TS engine. Idempotent on the evidence id.
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
  v_recurring boolean;
  v_existing uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select ci.person_id, cd.recurring, ci.last_evidence_id
    into v_person, v_recurring, v_existing
  from public.check_instances ci
  join public.check_definitions cd on cd.id = ci.definition_id
  where ci.id = p_instance_id;

  if v_person is null then raise exception 'Unknown check'; end if;
  if not public.can_complete_person_check(v_person) then
    raise exception 'Not allowed to complete this check';
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

-- Seed a company's default People check catalogue (idempotent), linking each check
-- to the company's already-seeded Form by key. Founder-curated defaults; editable.
create or replace function public.seed_company_people_checks(cid uuid)
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
  select cid, 'people', v.key, v.name, v.description,
         (select f.id from public.forms f where f.company_id = cid and f.key = v.form_key),
         v.recurring, v.frequency, v."interval", v.anchor, v.lead_days,
         v.expiry_field_key, v.amber_days, v.sort_order
  from (values
    ('supervision','Supervision','Recurring one to one supervision.','supervision',
       true,'month',3,'completion',0,null,null,10),
    ('appraisal','Appraisal','Annual appraisal.','appraisal',
       true,'month',12,'completion',0,null,null,20),
    ('spot_check','Spot Check','Unannounced observation of practice.','spot_check',
       true,'month',3,'completion',0,null,null,30),
    ('competency','Competency Assessment','Competency reassessment.','competency_assessment',
       true,'month',12,'completion',0,null,null,40),
    ('dbs_renewal','DBS Renewal','Enhanced DBS review, typically every three years.','dbs_renewal',
       true,'month',36,'completion',0,null,90,50),
    ('right_to_work','Right to Work','Follow up before a time limited permission expires.','right_to_work',
       true,'year',1,'expiry',30,'rtw_expiry',60,60),
    ('manual_handling','Manual Handling Refresher','Annual moving and handling refresher.','manual_handling_refresher',
       true,'month',12,'completion',0,null,null,70),
    ('probation_review','Probation Review','One off review at the end of probation.','probation_review',
       false,'month',3,'completion',0,null,14,80)
  ) as v(key,name,description,form_key,recurring,frequency,"interval",anchor,lead_days,expiry_field_key,amber_days,sort_order)
  on conflict (company_id, population, key) do nothing;

  get diagnostics seeded = row_count;
  return seeded;
end;
$$;

-- ===========================================================================
-- Row Level Security
-- ===========================================================================

alter table public.people enable row level security;
alter table public.person_assignments enable row level security;
alter table public.check_definitions enable row level security;
alter table public.check_instances enable row level security;

-- people: read scope by role. Managers see their branch(es); Supervisors only
-- their caseload; Team Members only their own linked Record; Admin/Platform all.
create policy people_select on public.people
  for select using (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or public.is_branch_manager(branch_id)
    or public.is_person_supervisor(id)
    or profile_id = auth.uid()
  );

-- Create / edit / transfer / archive: Managers (their branch) + Admin/Platform.
create policy people_insert on public.people
  for insert with check (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or public.is_branch_manager(branch_id)
  );

create policy people_update on public.people
  for update using (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or public.is_branch_manager(branch_id)
  ) with check (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or public.is_branch_manager(branch_id)
  );

-- Hard delete: Admin/Platform only (Managers archive, not delete).
create policy people_delete on public.people
  for delete using (
    public.is_platform_admin() or public.is_company_admin(company_id)
  );

-- person_assignments: visible to those who manage the Person or the assignee.
create policy person_assignments_select on public.person_assignments
  for select using (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or public.can_manage_person(person_id)
    or user_id = auth.uid()
  );

create policy person_assignments_insert on public.person_assignments
  for insert with check (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or public.can_manage_person(person_id)
  );

create policy person_assignments_delete on public.person_assignments
  for delete using (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or public.can_manage_person(person_id)
  );

-- check_definitions: any company member reads the catalogue; Admin creates/deletes;
-- Admin or Manager may edit (e.g. adjust a recurrence).
create policy check_definitions_select on public.check_definitions
  for select using (public.is_company_member(company_id) or public.is_platform_admin());

create policy check_definitions_insert on public.check_definitions
  for insert with check (public.is_company_admin(company_id) or public.is_platform_admin());

create policy check_definitions_update on public.check_definitions
  for update using (
    public.is_company_admin(company_id) or public.is_company_manager(company_id) or public.is_platform_admin()
  ) with check (
    public.is_company_admin(company_id) or public.is_company_manager(company_id) or public.is_platform_admin()
  );

create policy check_definitions_delete on public.check_definitions
  for delete using (public.is_company_admin(company_id) or public.is_platform_admin());

-- check_instances: read follows the Person's visibility. NO write policies — all
-- writes go through the definer RPCs above (apply_person_checks / complete_check).
create policy check_instances_select on public.check_instances
  for select using (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or (branch_id is not null and public.is_branch_manager(branch_id))
    or (person_id is not null and public.is_person_supervisor(person_id))
    or exists (
      select 1 from public.people pe
      where pe.id = check_instances.person_id and pe.profile_id = auth.uid()
    )
  );

-- ===========================================================================
-- Tighten Phase 2 evidence reads now that Records exist (was logged to Final
-- Testing). Replace the broad branch-member read with role-aware, record-level
-- scope: Managers by branch, Supervisors by caseload, Team Members by own Record,
-- plus the author and Admin/Platform.
-- ===========================================================================

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
        )
    )
  );

-- ===========================================================================
-- RAG views (security_invoker so each caller's RLS applies). Leavers + archived
-- Records are excluded, so registers, rollups and reports never count them.
-- ===========================================================================

create view public.person_check_status
  with (security_invoker = true) as
select
  ci.id            as instance_id,
  ci.company_id,
  ci.branch_id,
  ci.person_id,
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
join public.people pe on pe.id = ci.person_id
join public.companies co on co.id = ci.company_id
where ci.active
  and cd.active
  and pe.employment_status = 'active'
  and pe.archived_at is null;

create view public.person_rollup
  with (security_invoker = true) as
select
  pe.id as person_id,
  pe.company_id,
  pe.branch_id,
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
from public.people pe
left join public.person_check_status s on s.person_id = pe.id
where pe.employment_status = 'active' and pe.archived_at is null
group by pe.id, pe.company_id, pe.branch_id;

-- ===========================================================================
-- Realtime: RLS-protected tables need REPLICA IDENTITY FULL for UPDATE/DELETE
-- events to reach subscribers (the register shows live RAG rollups).
-- ===========================================================================

alter table public.people replica identity full;
alter table public.person_assignments replica identity full;
alter table public.check_definitions replica identity full;
alter table public.check_instances replica identity full;

-- ===========================================================================
-- New master Form templates for the document/one-off People checks, so every
-- check is satisfied by completing a Form (Evidence). Idempotent on key.
-- ===========================================================================

insert into public.form_templates (key, name, population, description, schema) values
(
  'dbs_renewal', 'DBS Renewal', 'people',
  'Record of an enhanced DBS check for a staff member.',
  $sch$
  {
    "schemaVersion": 1,
    "sections": [
      {
        "id": "dbs",
        "title": "DBS check",
        "fields": [
          { "key": "date_checked", "type": "date", "label": "Date checked", "required": true },
          { "key": "dbs_level", "type": "single_select", "label": "Level", "required": true,
            "options": [
              { "value": "enhanced_barred", "label": "Enhanced with barred lists" },
              { "value": "enhanced", "label": "Enhanced" },
              { "value": "standard", "label": "Standard" }
            ] },
          { "key": "certificate_number", "type": "short_text", "label": "Certificate number" },
          { "key": "on_update_service", "type": "radio", "label": "On the DBS Update Service", "required": true,
            "options": [ { "value": "yes", "label": "Yes" }, { "value": "no", "label": "No" } ] },
          { "key": "certificate", "type": "file_upload", "label": "Certificate or evidence" }
        ]
      }
    ]
  }
  $sch$
),
(
  'right_to_work', 'Right to Work', 'people',
  'Right to work check. Record the expiry date for time limited permissions so the follow up is scheduled automatically.',
  $sch$
  {
    "schemaVersion": 1,
    "sections": [
      {
        "id": "rtw",
        "title": "Right to work",
        "fields": [
          { "key": "check_date", "type": "date", "label": "Date of check", "required": true },
          { "key": "rtw_type", "type": "single_select", "label": "Basis", "required": true,
            "options": [
              { "value": "settled", "label": "Settled status or British or Irish" },
              { "value": "pre_settled", "label": "Pre settled status" },
              { "value": "visa", "label": "Visa or time limited permission" },
              { "value": "other", "label": "Other" }
            ] },
          { "key": "rtw_expiry", "type": "date", "label": "Permission expiry date",
            "help": "Leave blank if there is no time limit.",
            "visibleWhen": { "field": "rtw_type", "in": ["pre_settled", "visa", "other"] } },
          { "key": "share_code", "type": "short_text", "label": "Share code" },
          { "key": "document", "type": "file_upload", "label": "Evidence" }
        ]
      }
    ]
  }
  $sch$
),
(
  'manual_handling_refresher', 'Manual Handling Refresher', 'people',
  'Record of moving and handling refresher training for a staff member.',
  $sch$
  {
    "schemaVersion": 1,
    "sections": [
      {
        "id": "training",
        "title": "Manual handling refresher",
        "fields": [
          { "key": "training_date", "type": "date", "label": "Date of training", "required": true },
          { "key": "trainer", "type": "short_text", "label": "Trainer" },
          { "key": "outcome", "type": "single_select", "label": "Outcome", "required": true,
            "options": [
              { "value": "competent", "label": "Competent" },
              { "value": "refresher_needed", "label": "Further training needed" }
            ] },
          { "key": "certificate", "type": "file_upload", "label": "Certificate" }
        ]
      }
    ]
  }
  $sch$
),
(
  'probation_review', 'Probation Review', 'people',
  'End of probation review for a new staff member.',
  $sch$
  {
    "schemaVersion": 1,
    "sections": [
      {
        "id": "review",
        "title": "Probation review",
        "fields": [
          { "key": "review_date", "type": "date", "label": "Date of review", "required": true },
          { "key": "outcome", "type": "single_select", "label": "Outcome", "required": true,
            "options": [
              { "value": "passed", "label": "Passed" },
              { "value": "extended", "label": "Extended" },
              { "value": "failed", "label": "Not passed" }
            ] },
          { "key": "extension_to", "type": "date", "label": "Extended until",
            "visibleWhen": { "field": "outcome", "in": ["extended"] } },
          { "key": "comments", "type": "long_text", "label": "Comments" },
          { "key": "manager_signature", "type": "signature", "label": "Manager signature", "required": true }
        ]
      }
    ]
  }
  $sch$
)
on conflict (key) do nothing;
