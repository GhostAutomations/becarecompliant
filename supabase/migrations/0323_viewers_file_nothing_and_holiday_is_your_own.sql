-- 0323_viewers_file_nothing_and_holiday_is_your_own
--
-- Operation Thistle list 12 (2026-09-24): the access probe (scripts/access-probe.sql) run as a
-- Branch Manager, an On Call and a Viewer against Thistle's live data, each attempt rolled back.
-- The Branch Manager matched every tile. Two things did not, and Phil chose to close both:
--
-- 1. HOLIDAY. holiday_requests_insert accepted any member of the company as long as they put
--    themselves in requested_by, whoever the request was FOR. So an On Call or a Viewer could put
--    a (pending) holiday on anybody's record. Now: a request is either the person's own (their
--    record's profile_id is them, or no record is named, which is how the portal files a carer's
--    own request) or it is made by somebody who may manage holiday for that branch (Supervisor
--    and above, can_manage_holiday). The 0206 trigger still decides pending or approved.
--    Phil: "Own record, or Supervisor and above".
--
-- 2. VIEWER FILING FORMS. submit_evidence let any branch member file a completed form against
--    anybody in the branch, so a Viewer (team_member), who is read only, could. Now a Viewer is
--    refused inside submit_evidence. On Call keeps its absence and complaint forms, carers keep
--    their own portal forms, Supervisors and above are unchanged. Phil: "Viewers can never file
--    a form".
--
-- Incidents were NOT changed: any member reporting an incident is deliberate (0301, the carer's
-- report), and the probe's expectation was wrong, not the policy.
--
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

drop policy if exists holiday_requests_insert on public.holiday_requests;
create policy holiday_requests_insert on public.holiday_requests for insert to authenticated with check (
  is_company_member(company_id)
  and (
    can_manage_holiday(company_id, branch_id)
    or (
      requested_by = auth.uid()
      and (
        person_id is null
        or exists (
          select 1 from public.people pe
          where pe.id = holiday_requests.person_id and pe.profile_id = auth.uid()
        )
      )
    )
  )
);

create or replace function public.submit_evidence(
  p_evidence_id uuid, p_form_version_id uuid, p_branch_id uuid, p_answers jsonb, p_pdf_path text,
  p_pdf_sha256 text, p_pdf_bytes integer, p_record_type text default null, p_record_id uuid default null,
  p_files jsonb default '[]'::jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_company_id uuid; v_form_id uuid; v_schema jsonb; v_email text; v_name text; f jsonb;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select f.company_id, fv.form_id, fv.schema into v_company_id, v_form_id, v_schema
  from public.form_versions fv join public.forms f on f.id = fv.form_id where fv.id = p_form_version_id;
  if v_company_id is null then raise exception 'Unknown form version'; end if;
  if not public.is_company_member(v_company_id) then raise exception 'Not a member of this company'; end if;
  -- 0323: a Viewer reads the registers and files nothing.
  if exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'team_member') then
    raise exception 'A Viewer can see the registers but cannot fill in a form.';
  end if;
  if p_branch_id is not null then
    if not exists (select 1 from public.branches b where b.id = p_branch_id and b.company_id = v_company_id) then
      raise exception 'Branch does not belong to this company';
    end if;
    if not (public.is_branch_member(p_branch_id) or public.is_company_on_call(v_company_id)) then
      raise exception 'Not a member of this branch';
    end if;
  end if;
  select email, full_name into v_email, v_name from public.profiles where id = auth.uid();
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
    for f in select * from jsonb_array_elements(p_files) loop
      insert into public.evidence_files
        (evidence_id, company_id, field_key, kind, storage_path, file_name, mime_type, bytes, sha256)
      values (
        p_evidence_id, v_company_id, coalesce(f->>'field_key', ''), coalesce(f->>'kind', 'upload'),
        f->>'storage_path', f->>'file_name', f->>'mime_type', nullif(f->>'bytes','')::int, f->>'sha256'
      );
    end loop;
  end if;
  return p_evidence_id;
end;
$function$;
