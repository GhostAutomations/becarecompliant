-- 0003_forms_evidence
-- Phase 2: forms engine & immutable evidence.
--   form_templates  : platform-curated master library (founder curates).
--   forms           : a company's copy of a form (seeded from a master template).
--   form_versions   : immutable, versioned form schema (sections -> fields JSON).
--   evidence        : immutable, append-only completed submission (answers snapshot
--                     + pinned form version + embedded schema snapshot + author +
--                     timestamp + branded PDF path/hash). No update/delete via API.
--   evidence_files  : immutable file/signature attachments for an evidence row.
-- Private Storage bucket 'evidence' (5-minute signed URLs, downloads audit-logged
-- in the app layer). GDPR: retention metadata + anonymisation/SAR groundwork.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

-- ===========================================================================
-- Tables
-- ===========================================================================

-- Master, founder-curated template library. Companies never read this directly;
-- they seed their own copies (seed_company_form_templates). Platform-admin only.
create table public.form_templates (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  population text not null check (population in ('people', 'service_users')),
  description text not null default '',
  schema jsonb not null,
  version int not null default 1,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A company's own form (its private copy of a template, or later an authored one).
create table public.forms (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  key text not null,
  name text not null,
  population text not null check (population in ('people', 'service_users')),
  description text not null default '',
  status text not null default 'active' check (status in ('active', 'archived')),
  source_template_key text,
  current_version int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, key)
);

create index forms_company_id_idx on public.forms (company_id);
create index forms_company_population_idx on public.forms (company_id, population);

-- Immutable versioned schema for a form. Evidence pins one of these AND embeds a
-- copy of its schema, so evidence renders identically forever.
create table public.form_versions (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.forms(id) on delete cascade,
  version int not null,
  schema jsonb not null,
  status text not null default 'published'
    check (status in ('draft', 'published', 'archived')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (form_id, version)
);

create index form_versions_form_id_idx on public.form_versions (form_id);

-- Immutable, append-only evidence: one completed Form submission.
create table public.evidence (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  form_id uuid not null references public.forms(id) on delete restrict,
  form_version_id uuid not null references public.form_versions(id) on delete restrict,
  -- Embedded copy of the version's schema at submission time (durability).
  schema_snapshot jsonb not null,
  -- The submitted answers (queryable jsonb; drives RAG/reporting/anonymisation).
  answers jsonb not null default '{}'::jsonb,
  -- Denormalised author details for durability (survive profile deletion).
  author_id uuid references auth.users(id) on delete set null,
  author_email text,
  author_name text,
  submitted_at timestamptz not null default now(),
  -- The branded PDF: the inspector-facing immutable evidence in the private bucket.
  pdf_path text,
  pdf_sha256 text,
  pdf_bytes int,
  pdf_purged_at timestamptz,
  -- Future record linkage (People/Service User records land in Phase 3/4). Kept
  -- nullable + no FK yet so SAR/anonymisation can target a data subject later.
  record_type text check (record_type in ('person', 'service_user')),
  record_id uuid,
  -- GDPR retention (special-category data). Default minimum 8 years from the
  -- record's end of care (IGA/NHS Records Management Code); retention_until is
  -- computed later when a record's end date is known.
  retention_basis text not null default 'record_end_of_care',
  retention_min_years int not null default 8,
  retention_until date,
  -- Anonymisation (SAR erasure / retention expiry). Set by anonymise_evidence.
  anonymised_at timestamptz,
  anonymised_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index evidence_company_idx on public.evidence (company_id, submitted_at desc);
create index evidence_branch_idx on public.evidence (branch_id);
create index evidence_form_version_idx on public.evidence (form_version_id);
create index evidence_record_idx on public.evidence (record_type, record_id);
create index evidence_author_idx on public.evidence (author_id);

-- Immutable file/signature attachments for an evidence row.
create table public.evidence_files (
  id uuid primary key default gen_random_uuid(),
  evidence_id uuid not null references public.evidence(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  field_key text not null,
  kind text not null default 'upload' check (kind in ('upload', 'signature')),
  storage_path text,
  file_name text,
  mime_type text,
  bytes int,
  sha256 text,
  purged_at timestamptz,
  created_at timestamptz not null default now()
);

create index evidence_files_evidence_idx on public.evidence_files (evidence_id);

-- ===========================================================================
-- updated_at maintenance (evidence is immutable, so no updated_at trigger there)
-- ===========================================================================

create trigger form_templates_set_updated_at
  before update on public.form_templates
  for each row execute function public.set_updated_at();

create trigger forms_set_updated_at
  before update on public.forms
  for each row execute function public.set_updated_at();

-- ===========================================================================
-- Idempotent template seeding (SECURITY DEFINER; internal auth check)
-- Copies active master templates into a company's own forms + a v1 form_version.
-- Safe to run twice: existing (company_id, key) forms are skipped, and a version
-- is only created for forms this call newly inserted.
-- ===========================================================================

create or replace function public.seed_company_form_templates(cid uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  t record;
  new_form_id uuid;
  seeded int := 0;
begin
  if not (public.is_platform_admin() or public.is_company_admin(cid)) then
    raise exception 'Not allowed to seed templates for this company';
  end if;

  for t in
    select * from public.form_templates where status = 'active' order by key
  loop
    insert into public.forms
      (company_id, key, name, population, description, source_template_key, current_version)
    values
      (cid, t.key, t.name, t.population, t.description, t.key, 1)
    on conflict (company_id, key) do nothing
    returning id into new_form_id;

    -- new_form_id is null when the form already existed (conflict skipped).
    if new_form_id is not null then
      insert into public.form_versions (form_id, version, schema, status)
      values (new_form_id, 1, t.schema, 'published');
      seeded := seeded + 1;
    end if;
  end loop;

  return seeded;
end;
$$;

-- ===========================================================================
-- Evidence submission RPC (SECURITY DEFINER; guarded by branch membership).
-- The app layer generates the evidence id, renders + uploads the PDF first, then
-- calls this to insert the append-only row in one shot. Runs with the caller's
-- auth.uid(), so it authorises by company + branch membership (not just company).
-- ===========================================================================

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

  -- Authorisation: caller must be an active member of the form's company, and,
  -- when a branch is given, a member of that branch (Admin/Platform implicit).
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
    if not public.is_branch_member(p_branch_id) then
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

-- ===========================================================================
-- GDPR groundwork: anonymise one evidence row (SAR erasure / retention expiry).
-- Controlled path only (no evidence UPDATE policy exists). Blanks the answers and
-- author identifiers, flags the PDF/files as purged. Actual Storage object
-- deletion is performed by the app layer (service role) after this returns.
-- ===========================================================================

create or replace function public.anonymise_evidence(p_evidence_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company_id uuid;
begin
  select company_id into v_company_id from public.evidence where id = p_evidence_id;
  if v_company_id is null then
    raise exception 'Unknown evidence';
  end if;
  if not (public.is_platform_admin() or public.is_company_admin(v_company_id)) then
    raise exception 'Not allowed to anonymise this evidence';
  end if;

  update public.evidence set
    answers = '{}'::jsonb,
    author_email = null,
    author_name = null,
    pdf_path = null,
    pdf_purged_at = now(),
    anonymised_at = now(),
    anonymised_by = auth.uid()
  where id = p_evidence_id;

  update public.evidence_files set
    storage_path = null,
    file_name = null,
    purged_at = now()
  where evidence_id = p_evidence_id;
end;
$$;

-- SAR groundwork: gather all evidence relating to one data subject (a Person or
-- Service User record). Guarded to Admin/Platform. Records land in Phase 3/4;
-- this lets a SAR export be assembled once record_id is populated.
create or replace function public.sar_evidence_for_subject(
  cid uuid, p_record_type text, p_record_id uuid
)
returns setof public.evidence
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select e.* from public.evidence e
  where e.company_id = cid
    and e.record_type = p_record_type
    and e.record_id = p_record_id
    and (public.is_platform_admin() or public.is_company_admin(cid));
$$;

-- ===========================================================================
-- Row Level Security
-- ===========================================================================

alter table public.form_templates enable row level security;
alter table public.forms enable row level security;
alter table public.form_versions enable row level security;
alter table public.evidence enable row level security;
alter table public.evidence_files enable row level security;

-- form_templates: platform admin (founder) only. Companies get copies via seeding.
create policy form_templates_all on public.form_templates
  for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- forms: any active company member may read (they complete them). Authoring
-- (insert/update/delete) is Company Admin only (builder UI arrives in Phase 5);
-- seeding uses the SECURITY DEFINER function which bypasses these.
create policy forms_select on public.forms
  for select using (public.is_company_member(company_id) or public.is_platform_admin());

create policy forms_insert on public.forms
  for insert with check (public.is_company_admin(company_id) or public.is_platform_admin());

create policy forms_update on public.forms
  for update
  using (public.is_company_admin(company_id) or public.is_platform_admin())
  with check (public.is_company_admin(company_id) or public.is_platform_admin());

create policy forms_delete on public.forms
  for delete using (public.is_company_admin(company_id) or public.is_platform_admin());

-- form_versions: readable by members of the form's company; managed by Admin.
create policy form_versions_select on public.form_versions
  for select using (
    exists (
      select 1 from public.forms f
      where f.id = form_id
        and (public.is_company_member(f.company_id) or public.is_platform_admin())
    )
  );

create policy form_versions_insert on public.form_versions
  for insert with check (
    exists (
      select 1 from public.forms f
      where f.id = form_id
        and (public.is_company_admin(f.company_id) or public.is_platform_admin())
    )
  );

create policy form_versions_update on public.form_versions
  for update using (
    exists (
      select 1 from public.forms f
      where f.id = form_id
        and (public.is_company_admin(f.company_id) or public.is_platform_admin())
    )
  ) with check (
    exists (
      select 1 from public.forms f
      where f.id = form_id
        and (public.is_company_admin(f.company_id) or public.is_platform_admin())
    )
  );

create policy form_versions_delete on public.form_versions
  for delete using (
    exists (
      select 1 from public.forms f
      where f.id = form_id
        and (public.is_company_admin(f.company_id) or public.is_platform_admin())
    )
  );

-- evidence: append-only. NO insert/update/delete policies (writes go only through
-- submit_evidence / anonymise_evidence SECURITY DEFINER RPCs). Read scope:
-- Platform Admin, Company Admin (all branches), branch members of the evidence's
-- branch, or the author. NOTE: record-level tightening (Supervisor = own caseload,
-- Team Member = own record only) is applied when records exist in Phase 3/4;
-- logged to Final Testing.
create policy evidence_select on public.evidence
  for select using (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or (branch_id is not null and public.is_branch_member(branch_id))
    or author_id = auth.uid()
  );

-- evidence_files: same visibility as the parent evidence row. No writes via API.
create policy evidence_files_select on public.evidence_files
  for select using (
    exists (
      select 1 from public.evidence e
      where e.id = evidence_id
        and (
          public.is_platform_admin()
          or public.is_company_admin(e.company_id)
          or (e.branch_id is not null and public.is_branch_member(e.branch_id))
          or e.author_id = auth.uid()
        )
    )
  );

-- ===========================================================================
-- Private Storage bucket for evidence PDFs + attachments.
-- Files are served only via short-lived (5 min) signed URLs generated server-side
-- (service role), with each download audit-logged in the app layer. The select
-- policy below is defense-in-depth (path convention: {company_id}/{evidence_id}/...).
-- ===========================================================================

insert into storage.buckets (id, name, public)
values ('evidence', 'evidence', false)
on conflict (id) do nothing;

create policy evidence_objects_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'evidence'
    and (
      public.is_platform_admin()
      or public.is_company_member(((storage.foldername(name))[1])::uuid)
    )
  );

-- ===========================================================================
-- Realtime: RLS-protected tables need REPLICA IDENTITY FULL for UPDATE/DELETE
-- events to reach subscribers (registers show live rollups from Phase 3).
-- ===========================================================================

alter table public.forms replica identity full;
alter table public.form_versions replica identity full;
alter table public.evidence replica identity full;
alter table public.evidence_files replica identity full;

-- ===========================================================================
-- Founder-curated master template library (Phil, 8 starter templates).
-- People: supervision, appraisal, spot_check, competency_assessment.
-- Service Users: care_plan_review, risk_assessment, mar_audit, consent_review.
-- Schema shape: { schemaVersion, sections: [ { id, title, description?, fields:
--   [ { key, type, label, required?, help?, options?, validation?, visibleWhen? } ] } ] }.
-- Field types: short_text, long_text, number, date, single_select, multi_select,
--   radio, checkbox, heading, signature, file_upload. Conditional via visibleWhen.
-- Idempotent: on conflict (key) do nothing, so re-running never duplicates.
-- ===========================================================================

insert into public.form_templates (key, name, population, description, schema) values
(
  'supervision', 'Supervision', 'people',
  'One to one supervision of a staff member: wellbeing, workload, objectives and agreed actions.',
  $sch$
  {
    "schemaVersion": 1,
    "sections": [
      {
        "id": "details",
        "title": "Supervision details",
        "fields": [
          { "key": "supervision_date", "type": "date", "label": "Date of supervision", "required": true },
          { "key": "supervision_type", "type": "single_select", "label": "Type", "required": true,
            "options": [
              { "value": "planned", "label": "Planned" },
              { "value": "ad_hoc", "label": "Ad hoc" },
              { "value": "return_to_work", "label": "Return to work" }
            ] },
          { "key": "supervisor_name", "type": "short_text", "label": "Supervisor name", "required": true }
        ]
      },
      {
        "id": "discussion",
        "title": "Discussion",
        "fields": [
          { "key": "wellbeing", "type": "long_text", "label": "Wellbeing and any concerns", "required": true },
          { "key": "workload", "type": "long_text", "label": "Workload and capacity" },
          { "key": "training_needs", "type": "long_text", "label": "Training and development needs" },
          { "key": "objectives_reviewed", "type": "radio", "label": "Were objectives reviewed?", "required": true,
            "options": [ { "value": "yes", "label": "Yes" }, { "value": "no", "label": "No" } ] }
        ]
      },
      {
        "id": "signoff",
        "title": "Actions and sign off",
        "fields": [
          { "key": "actions_agreed", "type": "long_text", "label": "Actions agreed" },
          { "key": "next_supervision_due", "type": "date", "label": "Next supervision due" },
          { "key": "confidentiality_confirmed", "type": "checkbox", "label": "I confirm this supervision was conducted confidentially", "required": true },
          { "key": "staff_signature", "type": "signature", "label": "Staff member signature", "required": true },
          { "key": "supporting_docs", "type": "file_upload", "label": "Supporting documents" }
        ]
      }
    ]
  }
  $sch$
),
(
  'appraisal', 'Appraisal', 'people',
  'Annual appraisal: performance rating, strengths, development areas and goals for the year ahead.',
  $sch$
  {
    "schemaVersion": 1,
    "sections": [
      {
        "id": "period",
        "title": "Appraisal period",
        "fields": [
          { "key": "appraisal_date", "type": "date", "label": "Date of appraisal", "required": true },
          { "key": "period_covered", "type": "short_text", "label": "Period covered" }
        ]
      },
      {
        "id": "performance",
        "title": "Performance",
        "fields": [
          { "key": "perf_heading", "type": "heading", "label": "Overall performance this year" },
          { "key": "overall_rating", "type": "single_select", "label": "Overall rating", "required": true,
            "options": [
              { "value": "exceeds", "label": "Exceeds expectations" },
              { "value": "meets", "label": "Meets expectations" },
              { "value": "below", "label": "Below expectations" }
            ] },
          { "key": "strengths", "type": "long_text", "label": "Strengths" },
          { "key": "development_areas", "type": "long_text", "label": "Areas for development" },
          { "key": "goals_next_year", "type": "long_text", "label": "Goals for the year ahead" }
        ]
      },
      {
        "id": "signoff",
        "title": "Sign off",
        "fields": [
          { "key": "staff_comments", "type": "long_text", "label": "Staff member comments" },
          { "key": "staff_signature", "type": "signature", "label": "Staff member signature", "required": true }
        ]
      }
    ]
  }
  $sch$
),
(
  'spot_check', 'Spot Check', 'people',
  'Unannounced observation of a staff member in practice, with a satisfactory rating and any actions.',
  $sch$
  {
    "schemaVersion": 1,
    "sections": [
      {
        "id": "details",
        "title": "Spot check",
        "fields": [
          { "key": "check_date", "type": "date", "label": "Date of spot check", "required": true },
          { "key": "location", "type": "short_text", "label": "Location" },
          { "key": "observed_by", "type": "short_text", "label": "Observed by", "required": true }
        ]
      },
      {
        "id": "observations",
        "title": "Observations",
        "fields": [
          { "key": "ppe_worn", "type": "radio", "label": "PPE worn correctly", "required": true,
            "options": [ { "value": "yes", "label": "Yes" }, { "value": "no", "label": "No" }, { "value": "na", "label": "Not applicable" } ] },
          { "key": "id_badge", "type": "radio", "label": "ID badge visible",
            "options": [ { "value": "yes", "label": "Yes" }, { "value": "no", "label": "No" }, { "value": "na", "label": "Not applicable" } ] },
          { "key": "hand_hygiene", "type": "radio", "label": "Hand hygiene followed",
            "options": [ { "value": "yes", "label": "Yes" }, { "value": "no", "label": "No" }, { "value": "na", "label": "Not applicable" } ] },
          { "key": "followed_care_plan", "type": "radio", "label": "Followed the care plan",
            "options": [ { "value": "yes", "label": "Yes" }, { "value": "no", "label": "No" }, { "value": "na", "label": "Not applicable" } ] }
        ]
      },
      {
        "id": "outcome",
        "title": "Outcome",
        "fields": [
          { "key": "overall", "type": "single_select", "label": "Overall outcome", "required": true,
            "options": [
              { "value": "satisfactory", "label": "Satisfactory" },
              { "value": "needs_improvement", "label": "Needs improvement" },
              { "value": "unsatisfactory", "label": "Unsatisfactory" }
            ] },
          { "key": "action_required", "type": "long_text", "label": "Action required",
            "required": true,
            "visibleWhen": { "field": "overall", "in": ["needs_improvement", "unsatisfactory"] } },
          { "key": "notes", "type": "long_text", "label": "Additional notes" }
        ]
      }
    ]
  }
  $sch$
),
(
  'competency_assessment', 'Competency Assessment', 'people',
  'Assessment of a staff member as competent in a defined area, with reassessment where needed.',
  $sch$
  {
    "schemaVersion": 1,
    "sections": [
      {
        "id": "assessment",
        "title": "Competency assessment",
        "fields": [
          { "key": "competency_area", "type": "single_select", "label": "Competency area", "required": true,
            "options": [
              { "value": "medication", "label": "Medication" },
              { "value": "moving_handling", "label": "Moving and handling" },
              { "value": "safeguarding", "label": "Safeguarding" },
              { "value": "infection_control", "label": "Infection control" },
              { "value": "first_aid", "label": "First aid" }
            ] },
          { "key": "assessment_date", "type": "date", "label": "Date of assessment", "required": true },
          { "key": "assessor", "type": "short_text", "label": "Assessor", "required": true },
          { "key": "outcome", "type": "single_select", "label": "Outcome", "required": true,
            "options": [
              { "value": "competent", "label": "Competent" },
              { "value": "not_yet", "label": "Not yet competent" }
            ] },
          { "key": "evidence_observed", "type": "long_text", "label": "Evidence observed" },
          { "key": "reassessment_date", "type": "date", "label": "Reassessment date",
            "visibleWhen": { "field": "outcome", "in": ["not_yet"] } },
          { "key": "certificate", "type": "file_upload", "label": "Certificate or evidence upload" }
        ]
      }
    ]
  }
  $sch$
),
(
  'care_plan_review', 'Care Plan Review', 'service_users',
  'Scheduled review of a service user care plan: changes to needs, goals and consent.',
  $sch$
  {
    "schemaVersion": 1,
    "sections": [
      {
        "id": "review",
        "title": "Review details",
        "fields": [
          { "key": "review_date", "type": "date", "label": "Date of review", "required": true },
          { "key": "reviewed_by", "type": "short_text", "label": "Reviewed by", "required": true },
          { "key": "present_at_review", "type": "multi_select", "label": "Present at the review",
            "options": [
              { "value": "service_user", "label": "Service user" },
              { "value": "family", "label": "Family" },
              { "value": "advocate", "label": "Advocate" },
              { "value": "care_worker", "label": "Care worker" },
              { "value": "manager", "label": "Manager" }
            ] }
        ]
      },
      {
        "id": "outcome",
        "title": "Outcome",
        "fields": [
          { "key": "needs_changed", "type": "radio", "label": "Have needs changed?", "required": true,
            "options": [ { "value": "yes", "label": "Yes" }, { "value": "no", "label": "No" } ] },
          { "key": "changes_summary", "type": "long_text", "label": "Summary of changes", "required": true,
            "visibleWhen": { "field": "needs_changed", "in": ["yes"] } },
          { "key": "goals_progress", "type": "long_text", "label": "Progress against goals" },
          { "key": "risks_reviewed", "type": "radio", "label": "Risks reviewed", "required": true,
            "options": [ { "value": "yes", "label": "Yes" }, { "value": "no", "label": "No" } ] },
          { "key": "service_user_consent", "type": "radio", "label": "Service user consents to the updated plan", "required": true,
            "options": [ { "value": "yes", "label": "Yes" }, { "value": "no", "label": "No" } ] },
          { "key": "signature", "type": "signature", "label": "Reviewer signature" }
        ]
      }
    ]
  }
  $sch$
),
(
  'risk_assessment', 'Risk Assessment', 'service_users',
  'Assessment of a specific risk to a service user, with controls and residual risk rating.',
  $sch$
  {
    "schemaVersion": 1,
    "sections": [
      {
        "id": "assessment",
        "title": "Risk assessment",
        "fields": [
          { "key": "assessment_date", "type": "date", "label": "Date of assessment", "required": true },
          { "key": "risk_area", "type": "single_select", "label": "Risk area", "required": true,
            "options": [
              { "value": "falls", "label": "Falls" },
              { "value": "moving_handling", "label": "Moving and handling" },
              { "value": "medication", "label": "Medication" },
              { "value": "nutrition", "label": "Nutrition" },
              { "value": "skin_integrity", "label": "Skin integrity" },
              { "value": "environment", "label": "Environment" }
            ] },
          { "key": "likelihood", "type": "single_select", "label": "Likelihood", "required": true,
            "options": [ { "value": "low", "label": "Low" }, { "value": "medium", "label": "Medium" }, { "value": "high", "label": "High" } ] },
          { "key": "impact", "type": "single_select", "label": "Impact", "required": true,
            "options": [ { "value": "low", "label": "Low" }, { "value": "medium", "label": "Medium" }, { "value": "high", "label": "High" } ] },
          { "key": "controls_in_place", "type": "long_text", "label": "Controls in place", "required": true },
          { "key": "residual_risk", "type": "single_select", "label": "Residual risk", "required": true,
            "options": [ { "value": "low", "label": "Low" }, { "value": "medium", "label": "Medium" }, { "value": "high", "label": "High" } ] },
          { "key": "review_due", "type": "date", "label": "Review due" },
          { "key": "assessor_signature", "type": "signature", "label": "Assessor signature" }
        ]
      }
    ]
  }
  $sch$
),
(
  'mar_audit', 'MAR (Medication) Audit', 'service_users',
  'Audit of a service user Medication Administration Record: gaps, stock and actions.',
  $sch$
  {
    "schemaVersion": 1,
    "sections": [
      {
        "id": "audit",
        "title": "MAR audit",
        "fields": [
          { "key": "audit_date", "type": "date", "label": "Date of audit", "required": true },
          { "key": "audited_by", "type": "short_text", "label": "Audited by", "required": true },
          { "key": "medication_cycle", "type": "short_text", "label": "Medication cycle" },
          { "key": "gaps_found", "type": "number", "label": "Number of unexplained gaps", "required": true,
            "validation": { "min": 0 } },
          { "key": "controlled_drugs_correct", "type": "radio", "label": "Controlled drugs records correct",
            "options": [ { "value": "yes", "label": "Yes" }, { "value": "no", "label": "No" }, { "value": "na", "label": "Not applicable" } ] },
          { "key": "stock_matches", "type": "radio", "label": "Stock matches records", "required": true,
            "options": [ { "value": "yes", "label": "Yes" }, { "value": "no", "label": "No" } ] },
          { "key": "issues", "type": "long_text", "label": "Issues identified" },
          { "key": "action_taken", "type": "long_text", "label": "Action taken" },
          { "key": "auditor_signature", "type": "signature", "label": "Auditor signature" }
        ]
      }
    ]
  }
  $sch$
),
(
  'consent_review', 'Consent Review', 'service_users',
  'Review of a service user consent and mental capacity, including best interest decisions.',
  $sch$
  {
    "schemaVersion": 1,
    "sections": [
      {
        "id": "review",
        "title": "Consent review",
        "fields": [
          { "key": "review_date", "type": "date", "label": "Date of review", "required": true },
          { "key": "capacity_assessed", "type": "radio", "label": "Does the service user have capacity for this decision?", "required": true,
            "options": [ { "value": "yes", "label": "Yes" }, { "value": "no", "label": "No" } ] },
          { "key": "consent_for", "type": "multi_select", "label": "Consent recorded for",
            "options": [
              { "value": "care_support", "label": "Care and support" },
              { "value": "photography", "label": "Photography" },
              { "value": "information_sharing", "label": "Information sharing" },
              { "value": "medication", "label": "Medication" },
              { "value": "covert_medication", "label": "Covert medication" }
            ] },
          { "key": "best_interest_decision", "type": "long_text", "label": "Best interest decision detail", "required": true,
            "visibleWhen": { "field": "capacity_assessed", "in": ["no"] } },
          { "key": "notes", "type": "long_text", "label": "Notes" },
          { "key": "signature", "type": "signature", "label": "Reviewer signature" }
        ]
      }
    ]
  }
  $sch$
)
on conflict (key) do nothing;
