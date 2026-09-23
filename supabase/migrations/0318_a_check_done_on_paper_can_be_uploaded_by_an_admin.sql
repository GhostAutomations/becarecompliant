-- 0318: a Check completed on paper can be uploaded as its Evidence, by an Admin (DEF-056).
--
-- Phil, 2026-09-23: "lets create an upload button where evidence can be uploaded, this will be
-- handy if anything ever has to be completed on paper and can be uploaded as evidence", then
-- "it should only be active for admin". Agreed by popup: on the Complete page, dated the day it
-- was done on paper (may be past), file required, People and Service Users.
--
-- HOW THE PAGES GET IN. A scan or a phone photo is bigger than a request to the app may be
-- (Vercel stops a request at 4.5 MB), so each page goes from the browser STRAIGHT into the
-- private evidence bucket on a single use signed upload URL the app hands out after checking the
-- caller is an Admin. This function then files them.
--
-- 1. paper_upload_pending: the Evidence ids handed out and not yet filed. A page uploaded and
--    then abandoned (the tab closed half way) is special category data sitting in the bucket
--    with no Evidence row pointing at it; the retention cron removes anything here older than a
--    day, and filing the Evidence removes the row. No policies: the service role only.
-- 2. submit_paper_evidence: files the Evidence. SECURITY DEFINER with its OWN authorisation:
--    Company Admin of the Check's company, and nobody else, whatever the screen shows.

create table if not exists public.paper_upload_pending (
  evidence_id uuid primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  instance_id uuid not null,
  created_by uuid not null,
  created_at timestamptz not null default now()
);
alter table public.paper_upload_pending enable row level security;
revoke all on public.paper_upload_pending from anon, authenticated;

create or replace function public.submit_paper_evidence(
  p_evidence_id uuid,
  p_instance_id uuid,
  p_completed_on date,
  p_answers jsonb,
  p_files jsonb
) returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_company uuid; v_branch uuid; v_person uuid; v_su uuid; v_def_key text; v_anchor text;
  v_form uuid; v_version uuid; v_population text;
  v_email text; v_name text;
  v_today date := (now() at time zone 'Europe/London')::date;
  v_prefix text; f jsonb; n int := 0; v_fields jsonb := '[]'::jsonb; v_answers jsonb;
  v_key text; v_sup text; v_week text; v_archived boolean;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select ci.company_id, ci.branch_id, ci.person_id, ci.service_user_id, cd.key, cd.anchor, cd.form_id, cd.population
    into v_company, v_branch, v_person, v_su, v_def_key, v_anchor, v_form, v_population
  from public.check_instances ci
  join public.check_definitions cd on cd.id = ci.definition_id
  where ci.id = p_instance_id;
  if v_company is null then raise exception 'Unknown check'; end if;

  -- ADMINS ONLY (Phil, 2026-09-23). Not a Manager, not a Supervisor, and not the Founder from
  -- outside the company: a paper upload is an Admin vouching for a Form nobody filled in here.
  if not public.is_company_admin(v_company) then
    raise exception 'Only an Admin can upload a check completed on paper';
  end if;

  if v_form is null then raise exception 'This check has no form'; end if;
  if v_su is not null and v_def_key = 'setup' then
    raise exception 'The Setup Visit cannot be uploaded on paper: complete it in the app';
  end if;
  if v_anchor = 'expiry' then
    raise exception 'This check is dated from an expiry on its form and cannot be uploaded on paper';
  end if;

  -- Archived records, leavers and cancelled packages are not taking new completions.
  if v_person is not null then
    select (pe.archived_at is not null or pe.employment_status = 'leaver') into v_archived
      from public.people pe where pe.id = v_person;
  else
    select (su.archived_at is not null or su.service_status = 'cancelled') into v_archived
      from public.service_users su where su.id = v_su;
  end if;
  if coalesce(v_archived, true) then raise exception 'This record is not active'; end if;

  if p_completed_on is null then raise exception 'Enter the date it was completed on paper'; end if;
  if p_completed_on > v_today then raise exception 'The date it was completed cannot be in the future'; end if;
  if p_completed_on < date '2000-01-01' then raise exception 'Enter a date from 2000 onwards'; end if;

  -- Idempotent: the same upload filed twice is one piece of Evidence.
  if exists (select 1 from public.evidence e where e.id = p_evidence_id) then
    return p_evidence_id;
  end if;

  select fv.id into v_version
  from public.form_versions fv
  where fv.form_id = v_form and fv.status = 'published'
  order by fv.version desc limit 1;
  if v_version is null then raise exception 'This check''s form has no published version'; end if;

  -- Only the answers a paper upload can carry: which supervision, which Health Check week.
  v_sup := nullif(p_answers->>'supervision_type', '');
  v_week := nullif(p_answers->>'week', '');
  if v_sup is not null and v_sup not in ('1','2','3','4') then raise exception 'Unknown supervision number'; end if;
  if v_week is not null and v_week not in ('4','8') then raise exception 'Unknown Health Check week'; end if;
  v_answers := jsonb_build_object('__completed_on', to_char(p_completed_on, 'YYYY-MM-DD'));
  v_fields := v_fields || jsonb_build_array(jsonb_build_object(
    'key', '__completed_on', 'type', 'date', 'label', 'Date completed on paper', 'required', true));
  if v_sup is not null then
    v_answers := v_answers || jsonb_build_object('supervision_type', v_sup);
    v_fields := v_fields || jsonb_build_array(jsonb_build_object(
      'key', 'supervision_type', 'type', 'short_text', 'label', 'Supervision number'));
  end if;
  if v_week is not null then
    v_answers := v_answers || jsonb_build_object('week', v_week);
    v_fields := v_fields || jsonb_build_array(jsonb_build_object(
      'key', 'week', 'type', 'short_text', 'label', 'Health Check week'));
  end if;

  if p_files is null or jsonb_typeof(p_files) <> 'array' or jsonb_array_length(p_files) = 0 then
    raise exception 'Attach the scanned copy or a photo of each page';
  end if;
  if jsonb_array_length(p_files) > 10 then raise exception 'Upload up to 10 files at a time'; end if;

  v_prefix := v_company::text || '/' || p_evidence_id::text || '/files/paper_copy_';
  for f in select * from jsonb_array_elements(p_files) loop
    n := n + 1;
    v_key := 'paper_copy_' || n;
    if coalesce(f->>'field_key', '') <> v_key then raise exception 'Pages out of order'; end if;
    -- Every page must sit in THIS upload's own folder, so nobody can file somebody else's
    -- object as their Evidence.
    if left(coalesce(f->>'storage_path', ''), length(v_prefix)) <> v_prefix then
      raise exception 'A page is not part of this upload';
    end if;
    v_answers := v_answers || jsonb_build_object(v_key, coalesce(f->>'file_name', 'Page ' || n));
    v_fields := v_fields || jsonb_build_array(jsonb_build_object(
      'key', v_key, 'type', 'file_upload',
      'label', case when jsonb_array_length(p_files) = 1 then 'Paper copy' else 'Page ' || n end));
  end loop;

  select email, full_name into v_email, v_name from public.profiles where id = auth.uid();

  insert into public.evidence (
    id, company_id, branch_id, form_id, form_version_id, schema_snapshot,
    answers, author_id, author_email, author_name, record_type, record_id
  ) values (
    p_evidence_id, v_company, v_branch, v_form, v_version,
    jsonb_build_object('schemaVersion', 1, 'sections', jsonb_build_array(jsonb_build_object(
      'id', 'paper', 'title', 'Completed on paper', 'fields', v_fields))),
    v_answers, auth.uid(), v_email, v_name,
    case when v_person is not null then 'person' else 'service_user' end,
    coalesce(v_person, v_su)
  );

  for f in select * from jsonb_array_elements(p_files) loop
    insert into public.evidence_files
      (evidence_id, company_id, field_key, kind, storage_path, file_name, mime_type, bytes, sha256)
    values (
      p_evidence_id, v_company, f->>'field_key', 'upload',
      f->>'storage_path', f->>'file_name', f->>'mime_type', nullif(f->>'bytes','')::int, f->>'sha256'
    );
  end loop;

  delete from public.paper_upload_pending where evidence_id = p_evidence_id;
  return p_evidence_id;
end;
$$;

revoke all on function public.submit_paper_evidence(uuid, uuid, date, jsonb, jsonb) from public, anon;
grant execute on function public.submit_paper_evidence(uuid, uuid, date, jsonb, jsonb) to authenticated;
