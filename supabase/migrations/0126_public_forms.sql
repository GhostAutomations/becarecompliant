-- 0126_public_forms.sql
-- Be Care Compliant — Public (no-account) forms for Team Members.
--
-- Standing decision: Team Members do NOT get app logins. A company creates a
-- short link (e.g. /f/acme/holiday_requests), publishes it on its own team page,
-- and a staff member fills the form with no account. The submission is WRITE
-- ONLY: nothing is ever read back to the public page.
--
-- Matching is by personal email against people.work_email (the "Personal email"
-- field on Add a person). A confident single match becomes Evidence plus the
-- normal pending holiday request straight away. No match, or an ambiguous match,
-- lands in an unmatched queue for a Manager to link to the right Person, never
-- guessed and never dropped.
--
-- Everything privileged happens in SECURITY DEFINER functions with a pinned
-- search_path. The public submit path is service_role only (the Next.js server
-- action calls it), so anon can never reach it directly.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.public_form_links (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  form_key text not null,
  enabled boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, form_key)
);

comment on table public.public_form_links is
  'One row per company + form published as a public no-login form. The row existing and enabled is what makes /f/<slug>/<form_key> live.';

create table if not exists public.public_form_submissions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  form_key text not null,
  form_version_id uuid not null references public.form_versions(id),
  submitted_name text,
  submitted_email text not null,
  answers jsonb not null default '{}'::jsonb,
  status text not null default 'unmatched'
    check (status in ('matched', 'unmatched', 'linked', 'discarded')),
  person_id uuid references public.people(id) on delete set null,
  evidence_id uuid references public.evidence(id) on delete set null,
  holiday_request_id uuid references public.holiday_requests(id) on delete set null,
  handled_by uuid references public.profiles(id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.public_form_submissions is
  'Every public form submission. Matched ones already hold their evidence_id; unmatched ones keep the raw answers until a Manager links them to a Person, at which point the Evidence is created.';

create index if not exists public_form_submissions_company_idx
  on public.public_form_submissions (company_id, status, created_at desc);

-- Rate limiting. Stores only a salted hash of the caller, never an IP address
-- (the audit trail is deliberately lean and holds no IPs).
create table if not exists public.public_form_hits (
  id bigserial primary key,
  hit_key text not null,
  hit_at timestamptz not null default now()
);

create index if not exists public_form_hits_key_idx
  on public.public_form_hits (hit_key, hit_at desc);

-- Email matching needs to be case-insensitive and fast.
create index if not exists people_company_work_email_idx
  on public.people (company_id, lower(work_email));

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.public_form_links enable row level security;
alter table public.public_form_submissions enable row level security;
alter table public.public_form_hits enable row level security;

drop policy if exists public_form_links_select on public.public_form_links;
create policy public_form_links_select on public.public_form_links
  for select using (
    public.is_platform_admin() or public.is_company_member(company_id)
  );

drop policy if exists public_form_links_write on public.public_form_links;
create policy public_form_links_write on public.public_form_links
  for all using (
    public.is_platform_admin() or public.is_company_admin(company_id)
  ) with check (
    public.is_platform_admin() or public.is_company_admin(company_id)
  );

-- Submissions are visible to company-wide roles and to Branch Managers. An
-- unmatched submission has no branch yet, so any Manager in the company can see
-- it (that is the whole point of the queue); once it has a branch, normal branch
-- isolation applies. Writes only ever happen through the RPCs below.
drop policy if exists public_form_submissions_select on public.public_form_submissions;
create policy public_form_submissions_select on public.public_form_submissions
  for select using (
    public.is_platform_admin()
    or public.is_company_wide(company_id)
    or (branch_id is not null and public.is_branch_manager(branch_id))
    or (
      branch_id is null
      and exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.company_id = public_form_submissions.company_id
          and p.role = 'manager'
          and p.status = 'active'
      )
    )
  );

-- public_form_hits: RLS on, no policies at all. Service role only.

-- ---------------------------------------------------------------------------
-- Rate limiting helper (service role only)
-- ---------------------------------------------------------------------------

create or replace function public.public_form_rate_ok(
  p_key text,
  p_limit int default 5,
  p_window_minutes int default 10
) returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_count int;
begin
  -- Housekeeping: hits older than a day are of no use to anyone.
  delete from public.public_form_hits where hit_at < now() - interval '1 day';

  select count(*) into v_count
  from public.public_form_hits
  where hit_key = p_key
    and hit_at > now() - make_interval(mins => p_window_minutes);

  insert into public.public_form_hits (hit_key) values (p_key);

  return v_count < p_limit;
end;
$$;

revoke all on function public.public_form_rate_ok(text, int, int) from public, anon, authenticated;
grant execute on function public.public_form_rate_ok(text, int, int) to service_role;

-- ---------------------------------------------------------------------------
-- Shared internals: turn a submission into Evidence (+ a holiday request)
-- ---------------------------------------------------------------------------

create or replace function public.public_form_materialise(
  p_company_id uuid,
  p_form_version_id uuid,
  p_form_key text,
  p_person_id uuid,
  p_branch_id uuid,
  p_answers jsonb,
  p_email text,
  p_name text,
  p_start_date date,
  p_end_date date,
  p_note text
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_form_id uuid;
  v_schema jsonb;
  v_evidence_id uuid := gen_random_uuid();
  v_request_id uuid;
  v_person_name text;
begin
  select fv.form_id, fv.schema into v_form_id, v_schema
  from public.form_versions fv
  where fv.id = p_form_version_id;
  if v_form_id is null then
    raise exception 'Unknown form version';
  end if;

  select full_name into v_person_name from public.people where id = p_person_id;

  -- Immutable Evidence. The author is the person who filled the public form, not
  -- whichever Manager happened to link it, so author_id stays null and the
  -- submitted email and name are recorded instead.
  insert into public.evidence (
    id, company_id, branch_id, form_id, form_version_id, schema_snapshot,
    answers, author_id, author_email, author_name, record_type, record_id
  ) values (
    v_evidence_id, p_company_id, p_branch_id, v_form_id, p_form_version_id, v_schema,
    coalesce(p_answers, '{}'::jsonb), null, p_email,
    coalesce(v_person_name, p_name), 'person', p_person_id
  );

  -- Holiday: the same pending request an in-app submission creates, so it lands
  -- in the Managers' existing approve or decline screen untouched.
  if p_form_key = 'holiday_requests' and p_start_date is not null and p_end_date is not null then
    insert into public.holiday_requests (
      company_id, branch_id, person_id, requested_by, requester_name,
      start_date, end_date, note, status, request_evidence_id
    ) values (
      p_company_id, p_branch_id, p_person_id, null, coalesce(v_person_name, p_name),
      p_start_date, p_end_date, p_note, 'pending', v_evidence_id
    ) returning id into v_request_id;
  end if;

  return jsonb_build_object(
    'evidence_id', v_evidence_id,
    'holiday_request_id', v_request_id,
    'person_name', v_person_name
  );
end;
$$;

revoke all on function public.public_form_materialise(uuid, uuid, text, uuid, uuid, jsonb, text, text, date, date, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The public submit path (service role only)
-- ---------------------------------------------------------------------------

create or replace function public.submit_public_form(
  p_company_id uuid,
  p_form_key text,
  p_form_version_id uuid,
  p_answers jsonb,
  p_email text,
  p_name text,
  p_start_date date default null,
  p_end_date date default null,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_enabled boolean;
  v_form_company uuid;
  v_form_key text;
  v_match_count int;
  v_person_id uuid;
  v_branch_id uuid;
  v_made jsonb;
  v_submission_id uuid;
  v_status text;
begin
  if p_email is null or btrim(p_email) = '' then
    raise exception 'An email address is required';
  end if;

  -- The link must exist and be switched on. This is the capability: no link, no
  -- submission, however the caller arrived.
  select enabled into v_enabled
  from public.public_form_links
  where company_id = p_company_id and form_key = p_form_key;
  if v_enabled is null or v_enabled = false then
    raise exception 'This form is not currently accepting submissions';
  end if;

  -- The form version must belong to this company AND to the form the link names.
  select f.company_id, f.key into v_form_company, v_form_key
  from public.form_versions fv
  join public.forms f on f.id = fv.form_id
  where fv.id = p_form_version_id;
  if v_form_company is null or v_form_company <> p_company_id or v_form_key <> p_form_key then
    raise exception 'That form does not belong to this company';
  end if;

  -- Match by personal email. Leavers and archived records never match, and an
  -- ambiguous match (two people sharing an email) is treated as no match so a
  -- human decides rather than the system guessing.
  select count(*) into v_match_count
  from public.people
  where company_id = p_company_id
    and archived_at is null
    and employment_status <> 'leaver'
    and lower(work_email) = lower(btrim(p_email));

  if v_match_count = 1 then
    select id, branch_id into v_person_id, v_branch_id
    from public.people
    where company_id = p_company_id
      and archived_at is null
      and employment_status <> 'leaver'
      and lower(work_email) = lower(btrim(p_email));
  end if;

  if v_person_id is not null then
    v_made := public.public_form_materialise(
      p_company_id, p_form_version_id, p_form_key, v_person_id, v_branch_id,
      p_answers, btrim(p_email), p_name, p_start_date, p_end_date, p_note
    );
    v_status := 'matched';
  else
    v_status := 'unmatched';
  end if;

  insert into public.public_form_submissions (
    company_id, branch_id, form_key, form_version_id, submitted_name,
    submitted_email, answers, status, person_id, evidence_id, holiday_request_id
  ) values (
    p_company_id, v_branch_id, p_form_key, p_form_version_id, nullif(btrim(coalesce(p_name, '')), ''),
    btrim(p_email), coalesce(p_answers, '{}'::jsonb), v_status, v_person_id,
    nullif(v_made->>'evidence_id', '')::uuid,
    nullif(v_made->>'holiday_request_id', '')::uuid
  ) returning id into v_submission_id;

  return jsonb_build_object(
    'submission_id', v_submission_id,
    'status', v_status,
    'person_id', v_person_id,
    'branch_id', v_branch_id,
    'holiday_request_id', nullif(v_made->>'holiday_request_id', '')::uuid,
    'person_name', v_made->>'person_name'
  );
end;
$$;

revoke all on function public.submit_public_form(uuid, text, uuid, jsonb, text, text, date, date, text)
  from public, anon, authenticated;
grant execute on function public.submit_public_form(uuid, text, uuid, jsonb, text, text, date, date, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- Queue actions (signed-in Managers and Admins)
-- ---------------------------------------------------------------------------

create or replace function public.link_public_submission(
  p_submission_id uuid,
  p_person_id uuid,
  p_start_date date default null,
  p_end_date date default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  s public.public_form_submissions%rowtype;
  v_person_company uuid;
  v_branch_id uuid;
  v_made jsonb;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select * into s from public.public_form_submissions where id = p_submission_id;
  if s.id is null then raise exception 'That submission could not be found'; end if;
  if s.status <> 'unmatched' then raise exception 'That submission has already been handled'; end if;

  select company_id, branch_id into v_person_company, v_branch_id
  from public.people where id = p_person_id;
  if v_person_company is null or v_person_company <> s.company_id then
    raise exception 'That person is not in this company';
  end if;

  if not (
    public.is_platform_admin()
    or public.is_company_wide(s.company_id)
    or public.is_branch_manager(v_branch_id)
  ) then
    raise exception 'You do not have permission to link this submission';
  end if;

  v_made := public.public_form_materialise(
    s.company_id, s.form_version_id, s.form_key, p_person_id, v_branch_id,
    s.answers, s.submitted_email, s.submitted_name,
    coalesce(p_start_date, (s.answers->>'start_date_of_holiday')::date),
    coalesce(p_end_date, (s.answers->>'end_date_of_holiday')::date),
    nullif(s.answers->>'note', '')
  );

  update public.public_form_submissions
  set status = 'linked',
      person_id = p_person_id,
      branch_id = v_branch_id,
      evidence_id = nullif(v_made->>'evidence_id', '')::uuid,
      holiday_request_id = nullif(v_made->>'holiday_request_id', '')::uuid,
      handled_by = auth.uid(),
      handled_at = now()
  where id = p_submission_id;

  return jsonb_build_object(
    'evidence_id', v_made->>'evidence_id',
    'holiday_request_id', v_made->>'holiday_request_id',
    'branch_id', v_branch_id,
    'person_name', v_made->>'person_name'
  );
end;
$$;

revoke all on function public.link_public_submission(uuid, uuid, date, date) from public, anon;
grant execute on function public.link_public_submission(uuid, uuid, date, date) to authenticated;

create or replace function public.discard_public_submission(
  p_submission_id uuid
) returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  s public.public_form_submissions%rowtype;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select * into s from public.public_form_submissions where id = p_submission_id;
  if s.id is null then raise exception 'That submission could not be found'; end if;
  if s.status <> 'unmatched' then raise exception 'That submission has already been handled'; end if;

  if not (
    public.is_platform_admin()
    or public.is_company_wide(s.company_id)
    or (
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.company_id = s.company_id
          and p.role = 'manager'
          and p.status = 'active'
      )
    )
  ) then
    raise exception 'You do not have permission to discard this submission';
  end if;

  update public.public_form_submissions
  set status = 'discarded', handled_by = auth.uid(), handled_at = now()
  where id = p_submission_id;
end;
$$;

revoke all on function public.discard_public_submission(uuid) from public, anon;
grant execute on function public.discard_public_submission(uuid) to authenticated;
