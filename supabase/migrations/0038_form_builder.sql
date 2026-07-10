-- 0038_form_builder.sql
-- Phase 5: Form builder — version-lifecycle RPCs (SECURITY DEFINER, pinned search_path).
--
-- Authoring model agreed with Phil (popups 2026-07-10):
--   * Company Admins author/edit only their own company forms (RLS already enforces
--     this on forms/form_versions; these RPCs guard the same way internally).
--   * Editing a PUBLISHED form creates a NEW DRAFT version. A published version is
--     NEVER mutated in place. Publishing promotes the draft to forms.current_version.
--   * At most ONE open draft per form (partial unique index).
--   * The Founder (platform admin) curates the master form_templates library in place;
--     existing companies keep their already-seeded copies untouched.
--
-- Applies to becarecompliant (ref bgrtcvyjuwopunpnudeu) ONLY.

-- At most one open draft version per form (DB-level guarantee).
create unique index if not exists form_versions_one_draft_per_form
  on public.form_versions (form_id)
  where status = 'draft';

-- ===========================================================================
-- Company form authoring RPCs.
-- Every one guards: is_platform_admin() OR is_company_admin(<the form's company>).
-- Because these are end-user-callable SECURITY DEFINER functions, authorisation
-- is checked against the specific company/form, not merely "is a member".
-- ===========================================================================

-- Create a new company form: blank, or duplicated from an existing company form.
-- Seeds a v1 DRAFT version. forms.current_version stays null until first publish.
create or replace function public.create_company_form(
  p_company_id uuid,
  p_name text,
  p_population text,
  p_source_form_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
  v_base text;
  v_suffix int := 1;
  v_schema jsonb;
  v_form_id uuid;
begin
  if not (public.is_platform_admin() or public.is_company_admin(p_company_id)) then
    raise exception 'Not authorised to author forms for this company';
  end if;

  if p_population not in ('people', 'service_users') then
    raise exception 'Invalid population %', p_population;
  end if;

  if coalesce(btrim(p_name), '') = '' then
    raise exception 'Form name is required';
  end if;

  -- Base schema: copy the source form's current (or latest) schema, else a blank section.
  if p_source_form_id is not null then
    select coalesce(
             (select fv.schema from public.form_versions fv
                where fv.form_id = f.id and fv.version = f.current_version),
             (select fv.schema from public.form_versions fv
                where fv.form_id = f.id order by fv.version desc limit 1)
           )
      into v_schema
    from public.forms f
    where f.id = p_source_form_id and f.company_id = p_company_id;

    if v_schema is null then
      raise exception 'Source form not found in this company';
    end if;
  else
    v_schema := jsonb_build_object(
      'schemaVersion', 1,
      'sections', jsonb_build_array(
        jsonb_build_object(
          'id', 'section-1',
          'title', 'Section 1',
          'fields', jsonb_build_array()
        )
      )
    );
  end if;

  -- Unique key within the company: slug of the name, numbered on collision.
  v_base := regexp_replace(lower(btrim(p_name)), '[^a-z0-9]+', '_', 'g');
  v_base := btrim(v_base, '_');
  if v_base = '' then v_base := 'form'; end if;
  v_key := v_base;
  while exists (select 1 from public.forms where company_id = p_company_id and key = v_key) loop
    v_suffix := v_suffix + 1;
    v_key := v_base || '_' || v_suffix;
  end loop;

  insert into public.forms (company_id, key, name, population, description, current_version)
  values (p_company_id, v_key, btrim(p_name), p_population, '', null)
  returning id into v_form_id;

  insert into public.form_versions (form_id, version, schema, status, created_by)
  values (v_form_id, 1, v_schema, 'draft', auth.uid());

  return v_form_id;
end;
$$;

-- Open (or return the existing) draft version for a form. Idempotent: one draft
-- per form. A new draft clones the current published (or latest) schema.
create or replace function public.create_form_draft(p_form_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_existing uuid;
  v_next int;
  v_schema jsonb;
  v_version_id uuid;
begin
  select company_id into v_company from public.forms where id = p_form_id;
  if v_company is null then raise exception 'Form not found'; end if;
  if not (public.is_platform_admin() or public.is_company_admin(v_company)) then
    raise exception 'Not authorised';
  end if;

  select id into v_existing from public.form_versions
    where form_id = p_form_id and status = 'draft' limit 1;
  if v_existing is not null then return v_existing; end if;

  select coalesce(
           (select fv.schema from public.form_versions fv
              join public.forms f on f.id = fv.form_id
              where fv.form_id = p_form_id and fv.version = f.current_version),
           (select schema from public.form_versions
              where form_id = p_form_id order by version desc limit 1)
         )
    into v_schema;
  if v_schema is null then raise exception 'Form has no versions to base a draft on'; end if;

  select coalesce(max(version), 0) + 1 into v_next
    from public.form_versions where form_id = p_form_id;

  insert into public.form_versions (form_id, version, schema, status, created_by)
  values (p_form_id, v_next, v_schema, 'draft', auth.uid())
  returning id into v_version_id;

  return v_version_id;
end;
$$;

-- Save the working schema into a DRAFT version. Rejects any non-draft version, so
-- a published version can never be mutated in place.
create or replace function public.save_form_draft(p_version_id uuid, p_schema jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_status text;
begin
  select f.company_id, fv.status into v_company, v_status
  from public.form_versions fv join public.forms f on f.id = fv.form_id
  where fv.id = p_version_id;
  if v_company is null then raise exception 'Version not found'; end if;
  if not (public.is_platform_admin() or public.is_company_admin(v_company)) then
    raise exception 'Not authorised';
  end if;
  if v_status <> 'draft' then
    raise exception 'Cannot edit a % version: published versions are immutable', v_status;
  end if;
  if p_schema is null or jsonb_typeof(p_schema) <> 'object' then
    raise exception 'Invalid schema';
  end if;
  update public.form_versions set schema = p_schema where id = p_version_id;
end;
$$;

-- Publish a draft: mark it published and point forms.current_version at it.
-- Prior versions keep their rows (evidence pins its own version), so historic
-- evidence renders identically forever. Idempotent.
create or replace function public.publish_form_version(p_version_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_form_id uuid;
  v_version int;
  v_status text;
begin
  select f.company_id, fv.form_id, fv.version, fv.status
    into v_company, v_form_id, v_version, v_status
  from public.form_versions fv join public.forms f on f.id = fv.form_id
  where fv.id = p_version_id;
  if v_company is null then raise exception 'Version not found'; end if;
  if not (public.is_platform_admin() or public.is_company_admin(v_company)) then
    raise exception 'Not authorised';
  end if;

  if v_status = 'draft' then
    update public.form_versions set status = 'published' where id = p_version_id;
  end if;
  update public.forms set current_version = v_version where id = v_form_id;
  return v_version;
end;
$$;

-- Discard a draft. If the form is left with no versions and was never published,
-- the empty form is removed too.
create or replace function public.discard_form_draft(p_version_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_form_id uuid;
  v_status text;
  v_remaining int;
begin
  select f.company_id, fv.form_id, fv.status into v_company, v_form_id, v_status
  from public.form_versions fv join public.forms f on f.id = fv.form_id
  where fv.id = p_version_id;
  if v_company is null then raise exception 'Version not found'; end if;
  if not (public.is_platform_admin() or public.is_company_admin(v_company)) then
    raise exception 'Not authorised';
  end if;
  if v_status <> 'draft' then raise exception 'Only a draft can be discarded'; end if;

  delete from public.form_versions where id = p_version_id;

  select count(*) into v_remaining from public.form_versions where form_id = v_form_id;
  if v_remaining = 0 then
    delete from public.forms where id = v_form_id and current_version is null;
  end if;
end;
$$;

-- ===========================================================================
-- Founder master template curation RPCs (platform admin only).
-- Templates seed a company's own copies at creation; editing a master template
-- does NOT retroactively alter companies that already seeded it. Edited in place
-- (bumping version) because there is no separate template-versions table and the
-- master library is single-curator.
-- ===========================================================================

create or replace function public.create_form_template(
  p_key text,
  p_name text,
  p_population text,
  p_schema jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_platform_admin() then raise exception 'Founder only'; end if;
  if p_population not in ('people', 'service_users') then
    raise exception 'Invalid population %', p_population;
  end if;
  if coalesce(btrim(p_key), '') = '' then raise exception 'Template key is required'; end if;

  insert into public.form_templates (key, name, population, schema, version, status)
  values (
    btrim(p_key),
    coalesce(nullif(btrim(p_name), ''), btrim(p_key)),
    p_population,
    coalesce(p_schema, jsonb_build_object('schemaVersion', 1, 'sections', jsonb_build_array())),
    1,
    'active'
  )
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.update_form_template(
  p_template_id uuid,
  p_name text,
  p_schema jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then raise exception 'Founder only'; end if;
  if p_schema is not null and jsonb_typeof(p_schema) <> 'object' then
    raise exception 'Invalid schema';
  end if;
  update public.form_templates
     set name    = coalesce(nullif(btrim(p_name), ''), name),
         schema  = coalesce(p_schema, schema),
         version = version + 1
   where id = p_template_id;
  if not found then raise exception 'Template not found'; end if;
end;
$$;

create or replace function public.set_form_template_status(p_template_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then raise exception 'Founder only'; end if;
  if p_status not in ('active', 'archived') then raise exception 'Invalid status %', p_status; end if;
  update public.form_templates set status = p_status where id = p_template_id;
  if not found then raise exception 'Template not found'; end if;
end;
$$;
