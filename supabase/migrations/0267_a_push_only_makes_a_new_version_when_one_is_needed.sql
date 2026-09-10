-- Be Care Compliant — a push edits the form in place unless somebody has already used it.
--
-- Phil, 2026-09-10, watching the first real push land: "as this is adding all the forms to
-- the libary for all companies current and future. all forms should be v1."
--
-- He is right, and the version I shipped was answering a narrower question than the one
-- that matters. It always published a new version, on the reasoning that Evidence pins the
-- exact version it was filled in on and must never be rewritten. True — but only where
-- Evidence EXISTS. Every company here is being handed the default library for the first
-- time and has recorded nothing on it, so publishing a v2 preserved a v1 that nobody had
-- ever filled in, and left both companies reading "version 2" of a form on its first day.
-- A version history is a record of what people actually answered against. Manufacturing one
-- out of our own edits makes it noise, and the number on the screen stops meaning anything.
--
-- So the rule is now the honest one:
--
--   Evidence recorded on the current version  ->  publish a NEW version.
--       Their old version stays exactly as it is, because an inspector opening a record from
--       last March must see the questions that were actually asked.
--
--   Nothing recorded on it                    ->  EDIT THE CURRENT VERSION IN PLACE.
--       There is nothing to protect. The company keeps v1, and a form that nobody has used
--       does not accumulate a history of our corrections.
--
-- This holds for good, not just while the defaults are being built: a company onboarded next
-- year who has not touched a form still gets improvements without their version number
-- climbing, and the moment they record something the form starts keeping its history.

create or replace function public.push_library_form(
  p_form_id uuid,
  p_expect_library_schema jsonb,
  p_schema jsonb,
  p_name text,
  p_library_version integer
) returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_company uuid;
  v_current jsonb;
  v_version integer;
  v_used boolean;
begin
  if not public.is_platform_admin() then
    raise exception 'Not authorised';
  end if;

  select company_id, library_schema, current_version
    into v_company, v_current, v_version
  from public.forms where id = p_form_id;
  if v_company is null then raise exception 'Form not found'; end if;

  -- What the founder saw on the list must still be true, or this company is skipped rather
  -- than overwritten.
  if v_current is distinct from p_expect_library_schema then
    raise exception 'This form changed since the list was read, so it was not pushed.';
  end if;

  -- An open draft belongs to the company: publishing over it would throw their work away.
  if exists (select 1 from public.form_versions
             where form_id = p_form_id and status = 'draft') then
    raise exception 'This company has an unpublished draft open, so it was not pushed.';
  end if;

  -- Has anyone actually filled this in? That, and nothing else, decides whether the current
  -- version is worth keeping.
  select exists (
    select 1 from public.evidence e
    join public.form_versions fv on fv.id = e.form_version_id
    where fv.form_id = p_form_id and fv.version = v_version
  ) into v_used;

  if v_used then
    select coalesce(max(version), 0) + 1 into v_version
    from public.form_versions where form_id = p_form_id;

    insert into public.form_versions (form_id, version, schema, status, created_by)
    values (p_form_id, v_version, p_schema, 'published', auth.uid());
  else
    update public.form_versions
       set schema = p_schema
     where form_id = p_form_id and version = v_version;
  end if;

  update public.forms
     set current_version = v_version,
         name = coalesce(p_name, name),
         library_version = p_library_version,
         library_schema = p_schema,
         updated_at = now()
   where id = p_form_id;

  -- Their own branches, staff and funding types go back into the form, so what they open is
  -- theirs and not the library's placeholder lists.
  perform public.rebake_form_field_options(v_company);

  return v_version;
end;
$function$;

revoke all on function public.push_library_form(uuid, jsonb, jsonb, text, integer) from public;
grant execute on function public.push_library_form(uuid, jsonb, jsonb, text, integer) to authenticated;
