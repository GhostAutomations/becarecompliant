-- Be Care Compliant 0443: records stay in their own company (security audit of 10 October 2026,
-- findings F1 to F4, F6, F12, F14, F15, F19, F41 and F51; the group Phil chose by popup on
-- 11 October 2026). The audit report is in BCC Documents, SECURITY-AUDIT-2026-10-10.md.
--
-- The audit proved the database trusted that a row's company, its branch, the records it links
-- to and the files it points at all belong together. Nothing made them: a login could move its
-- own rows into another company, link them to another company's people, branches, policies or
-- Evidence, or point a file path at another company's file and have the server sign it.
--
-- 1. enforce_company_links, on every company owned table: a row never moves to another company
--    once it has one, and every link it holds to another company owned row (branch, person,
--    service user, Evidence, form, policy, login and the rest, read from the foreign keys) must
--    point inside the same company. Shared rows with no company (library forms, courses, check
--    templates) and logins with no company (the Founder, the Be Care Compliant team) are allowed.
--    install_company_link_triggers() puts the trigger on every such table from the catalogue, so
--    a later migration that adds a table re-runs it: select public.install_company_link_triggers();
-- 2. Evidence's record (record_type and record_id, which is not a foreign key) must be in the
--    Evidence's company, and a record type always comes with a record.
-- 3. A login is only ever linked to branches of its own company (user_branches).
-- 4. Every stored file path sits under its own company's folder with no '..' segment: check
--    constraints on each path column, and a trigger for policy versions, which carry no company.
-- 5. submit_evidence says so in plain words before the database refuses it.
-- 6. record_update_audience (3 arguments) and branch_blocking_references can no longer be called
--    by signed in users (F41, F51). Only SECURITY DEFINER functions use them, as their owner.
--
-- Live data checked first (read only, 11 October 2026): 0 rows out of place on all 121 company
-- links, the 48 login links, Evidence records, user_branches, every path column, the briefing and
-- ticket file lists, policy versions and the company logo. Nothing here changes a row.

set local lock_timeout = '5s';

-- 1. Company links ----------------------------------------------------------------------------

create or replace function public.enforce_company_links()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_new jsonb := to_jsonb(new);
  v_old jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) end;
  v_company text := v_new ->> 'company_id';
  v_pair text;
  v_col text;
  v_ref text;
  v_val text;
  v_ref_company uuid;
begin
  -- A row never moves to another company. Filling in a company that was missing is allowed.
  if tg_op = 'UPDATE' and (v_old ->> 'company_id') is not null
     and (v_old ->> 'company_id') is distinct from v_company then
    raise exception 'A record cannot be moved to another company.'
      using errcode = '42501', detail = format('%s.company_id', tg_table_name);
  end if;
  if v_company is null or tg_nargs = 0 then
    return new;
  end if;

  -- Every link stays inside the row's own company. Only links that are new or changed are
  -- looked up, so an ordinary edit costs nothing.
  foreach v_pair in array tg_argv loop
    v_col := split_part(v_pair, ':', 1);
    v_ref := split_part(v_pair, ':', 2);
    v_val := v_new ->> v_col;
    continue when v_val is null;
    continue when tg_op = 'UPDATE'
      and v_val is not distinct from (v_old ->> v_col)
      and (v_old ->> 'company_id') is not distinct from v_company;
    execute format('select company_id from public.%I where id = $1', v_ref)
      into v_ref_company using v_val::uuid;
    if v_ref_company is not null and v_ref_company::text <> v_company then
      raise exception 'That % belongs to another company, so it cannot be linked here.',
        case v_ref
          when 'branches' then 'branch'
          when 'people' then 'person'
          when 'service_users' then 'service user'
          when 'profiles' then 'login'
          when 'evidence' then 'Evidence'
          when 'company_policies' then 'policy'
          when 'forms' then 'form'
          when 'complaints' then 'complaint'
          when 'incidents' then 'incident'
          else 'record'
        end
        using errcode = '42501', detail = format('%s.%s', tg_table_name, v_col);
    end if;
  end loop;
  return new;
end;
$$;

revoke all on function public.enforce_company_links() from public, anon, authenticated;

-- Puts zz_company_links on every company owned table, with that table's links as arguments. The
-- zz_ name makes it the last BEFORE trigger, after any trigger that fills in a company or branch.
-- Left out: profiles (a login changes company when it is invited, and has its own guard) and the
-- platform tables that are not a customer's records.
create or replace function public.install_company_link_triggers()
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  r record;
  v_n integer := 0;
begin
  for r in
    with excluded(t) as (
      values ('profiles'), ('trial_requests'), ('demos'), ('founder_emails'), ('audit_log'),
             ('stripe_events'), ('sms_inbound'), ('sms_opt_outs')
    ),
    -- Materialized, and joined on oid: written the obvious way the planner took two minutes.
    tenant as materialized (
      select c.oid, c.relname
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        join pg_attribute a on a.attrelid = c.oid and a.attname = 'company_id' and not a.attisdropped
       where n.nspname = 'public' and c.relkind = 'r'
    ),
    fks as materialized (
      select con.conrelid, a.attname as col, t2.relname as ref
        from pg_constraint con
        join tenant t2 on t2.oid = con.confrelid
        join pg_attribute a on a.attrelid = con.conrelid and a.attnum = con.conkey[1]
        join pg_attribute ra on ra.attrelid = con.confrelid and ra.attnum = con.confkey[1]
       where con.contype = 'f' and cardinality(con.conkey) = 1
         and con.conrelid in (select oid from tenant)
         and a.attname <> 'company_id' and ra.attname = 'id'
         and t2.relname not in (select t from excluded where t <> 'profiles')
    )
    select t.relname as t,
           string_agg(quote_ident(f.col), ', ' order by f.col) as cols,
           string_agg(quote_literal(f.col || ':' || f.ref), ', ' order by f.col) as args
      from tenant t
      left join fks f on f.conrelid = t.oid
     where t.relname not in (select t from excluded)
     group by t.relname
  loop
    execute format('drop trigger if exists zz_company_links on public.%I', r.t);
    execute format(
      'create trigger zz_company_links before insert or update of company_id%s on public.%I '
      'for each row execute function public.enforce_company_links(%s)',
      case when r.cols is null then '' else ', ' || r.cols end, r.t, coalesce(r.args, ''));
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

revoke all on function public.install_company_link_triggers() from public, anon, authenticated;

select public.install_company_link_triggers();

-- 2. Evidence's record ------------------------------------------------------------------------

create or replace function public.enforce_evidence_record_company()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company uuid;
begin
  if new.record_id is null then
    if new.record_type is not null then
      raise exception 'Choose the record this form is about.' using errcode = '23502';
    end if;
    return new;
  end if;
  v_company := case new.record_type
    when 'person' then (select company_id from public.people where id = new.record_id)
    when 'service_user' then (select company_id from public.service_users where id = new.record_id)
    when 'complaint' then (select company_id from public.complaints where id = new.record_id)
    when 'incident' then (select company_id from public.incidents where id = new.record_id)
  end;
  if v_company is null then
    raise exception 'That record could not be found.' using errcode = '23503';
  end if;
  if v_company <> new.company_id then
    raise exception 'That record belongs to another company, so Evidence cannot be filed on it here.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_evidence_record_company() from public, anon, authenticated;

drop trigger if exists zz_evidence_record_company on public.evidence;
create trigger zz_evidence_record_company
  before insert or update of record_type, record_id, company_id on public.evidence
  for each row execute function public.enforce_evidence_record_company();

-- 3. Logins and branches ----------------------------------------------------------------------

create or replace function public.enforce_user_branch_company()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1
      from public.branches b
      join public.profiles p on p.id = new.user_id
     where b.id = new.branch_id and b.company_id = p.company_id
  ) then
    raise exception 'A login can only be linked to branches of its own company.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_user_branch_company() from public, anon, authenticated;

drop trigger if exists zz_user_branch_company on public.user_branches;
create trigger zz_user_branch_company
  before insert or update of user_id, branch_id on public.user_branches
  for each row execute function public.enforce_user_branch_company();

-- 4. File paths -------------------------------------------------------------------------------

-- True when a stored path is in this company's folder: '<company id>/...', no '..' segment and
-- no backslash. A row with no file (null) is fine.
create or replace function public.path_in_company(p_path text, p_company uuid)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select p_path is null
      or (p_company is not null
          and starts_with(p_path, p_company::text || '/')
          and length(p_path) > length(p_company::text) + 1
          and p_path !~ '(^|/)\.\.(/|$)'
          and strpos(p_path, chr(92)) = 0)
$$;

-- The same for a JSON list of files, each with a "path" (briefing attachments, ticket screenshots).
create or replace function public.paths_in_company(p_list jsonb, p_company uuid)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(bool_and(public.path_in_company(e ->> 'path', p_company)), true)
    from jsonb_array_elements(
      case when jsonb_typeof(p_list) = 'array' then p_list else '[]'::jsonb end) as e
$$;

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('absence_config', 'policy_path'),
      ('absence_meeting_letters', 'pdf_path'),
      ('absence_outcome_letters', 'pdf_path'),
      ('evidence', 'pdf_path'),
      ('evidence_files', 'storage_path'),
      ('person_training', 'certificate_path'),
      ('record_document_file_trash', 'storage_path'),
      ('record_documents', 'storage_path'),
      ('record_update_file_trash', 'storage_path'),
      ('record_update_files', 'storage_path'),
      ('reg73_visits', 'signature_path'),
      ('reg80_reviews', 'signature_path'),
      ('rtw_questionnaires', 'fit_note_path'),
      ('sar_exports', 'storage_path'),
      ('service_users', 'care_plan_path')
    ) as v(t, col)
  loop
    execute format('alter table public.%I drop constraint if exists %I', r.t, r.t || '_' || r.col || '_in_company');
    execute format('alter table public.%I add constraint %I check (public.path_in_company(%I, company_id)) not valid',
      r.t, r.t || '_' || r.col || '_in_company', r.col);
    execute format('alter table public.%I validate constraint %I', r.t, r.t || '_' || r.col || '_in_company');
  end loop;
end;
$$;

-- A written policy is saved with the placeholder 'pending' until its PDF is drawn
-- (lib/assignments/actions.ts, seed_demo_company), so that one word is allowed too.
alter table public.company_policies drop constraint if exists company_policies_storage_path_in_company;
alter table public.company_policies
  add constraint company_policies_storage_path_in_company
  check (storage_path = 'pending' or public.path_in_company(storage_path, company_id)) not valid;
alter table public.company_policies validate constraint company_policies_storage_path_in_company;

alter table public.briefing_notices drop constraint if exists briefing_notices_files_in_company;
alter table public.briefing_notices
  add constraint briefing_notices_files_in_company check (public.paths_in_company(files, company_id)) not valid;
alter table public.briefing_notices validate constraint briefing_notices_files_in_company;

alter table public.support_tickets drop constraint if exists support_tickets_screenshots_in_company;
alter table public.support_tickets
  add constraint support_tickets_screenshots_in_company check (public.paths_in_company(screenshots, company_id)) not valid;
alter table public.support_tickets validate constraint support_tickets_screenshots_in_company;

alter table public.companies drop constraint if exists companies_logo_path_in_company;
alter table public.companies
  add constraint companies_logo_path_in_company check (public.path_in_company(logo_path, id)) not valid;
alter table public.companies validate constraint companies_logo_path_in_company;

-- Policy versions carry no company of their own: their file must be in their policy's company.
create or replace function public.enforce_policy_version_path()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company uuid;
begin
  if new.storage_path is null then
    return new;
  end if;
  select company_id into v_company from public.company_policies where id = new.policy_id;
  if v_company is null or not public.path_in_company(new.storage_path, v_company) then
    raise exception 'That file is not in this company''s storage.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_policy_version_path() from public, anon, authenticated;

drop trigger if exists zz_policy_version_path on public.company_policy_versions;
create trigger zz_policy_version_path
  before insert or update of storage_path, policy_id on public.company_policy_versions
  for each row execute function public.enforce_policy_version_path();

-- 5. submit_evidence: the same rules, in plain words, before the database refuses ------------

create or replace function public.submit_evidence(
  p_evidence_id uuid, p_form_version_id uuid, p_branch_id uuid, p_answers jsonb, p_pdf_path text,
  p_pdf_sha256 text, p_pdf_bytes integer, p_record_type text default null, p_record_id uuid default null,
  p_files jsonb default '[]'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_company_id uuid; v_form_id uuid; v_schema jsonb; v_email text; v_name text; f jsonb;
  v_record_company uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select f.company_id, fv.form_id, fv.schema into v_company_id, v_form_id, v_schema
  from public.form_versions fv join public.forms f on f.id = fv.form_id where fv.id = p_form_version_id;
  if v_company_id is null then raise exception 'Unknown form version'; end if;
  if not public.is_company_member(v_company_id) then raise exception 'Not a member of this company'; end if;
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
  -- 0443: the record must be this company's (audit F3), and every file in this company's folder
  -- (audit F1). Who may file on which record is a separate rule, still to be decided with Phil.
  if p_record_type is not null and p_record_id is null then
    raise exception 'Choose the record this form is about.';
  end if;
  if p_record_id is not null then
    v_record_company := case p_record_type
      when 'person' then (select company_id from public.people where id = p_record_id)
      when 'service_user' then (select company_id from public.service_users where id = p_record_id)
      when 'complaint' then (select company_id from public.complaints where id = p_record_id)
      when 'incident' then (select company_id from public.incidents where id = p_record_id)
    end;
    if v_record_company is distinct from v_company_id then
      raise exception 'That record could not be found in this company.';
    end if;
  end if;
  if not public.path_in_company(p_pdf_path, v_company_id) then
    raise exception 'That file is not in this company''s storage.';
  end if;
  if p_files is not null and jsonb_typeof(p_files) = 'array' and exists (
    select 1 from jsonb_array_elements(p_files) e
     where not public.path_in_company(e ->> 'storage_path', v_company_id)
  ) then
    raise exception 'That file is not in this company''s storage.';
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

-- Signed out visitors never had a use for it (it refused them inside).
revoke execute on function public.submit_evidence(uuid, uuid, uuid, jsonb, text, text, integer, text, uuid, jsonb) from public, anon;
grant execute on function public.submit_evidence(uuid, uuid, uuid, jsonb, text, text, integer, text, uuid, jsonb) to authenticated;

-- 6. Two functions that named or counted another company's records (F41, F51) ----------------

revoke execute on function public.record_update_audience(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.branch_blocking_references(uuid) from public, anon, authenticated;
