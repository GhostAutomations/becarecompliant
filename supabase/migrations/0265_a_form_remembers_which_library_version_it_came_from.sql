-- Be Care Compliant — a company's form remembers which library version it came from.
--
-- Step 5 of Phil's forms plan: when the master library changes, offer the change to the
-- companies that already hold that form, and leave alone any company that has made the
-- form their own.
--
-- Nothing recorded what a company was HANDED. forms.source_template_key said which library
-- form a copy came from, but not which version of it, and not what it looked like at the
-- time. Without that, "have they edited it?" is unanswerable: a copy that differs from
-- today's library might be one somebody carefully changed, or one the library has simply
-- moved past. Guessing wrong in one direction means nobody ever gets an improvement; in
-- the other it means silently deleting a company's own work.
--
-- So each form now carries the version it was given and a FINGERPRINT of the library
-- schema at that moment. The fingerprint is computed with the per company baked option
-- lists removed (lib/forms/library-sync.ts), because rebake_form_field_options rewrites
-- every copy the instant it is handed over — their branches into Branch, their staff into
-- Conducted by, the funding types they accept into Care package funded by. Comparing raw
-- would mark every company as edited and the push would reach nobody.
--
-- Backfill is honest rather than convenient: it records the CURRENT library version and
-- leaves the fingerprint null. A null means "we cannot prove this copy is untouched", and
-- the push treats that as hands off, exactly like an edit. The first push a form receives
-- fills it in properly, and forms whose schema already matches the library read as up to
-- date without needing it.

alter table forms
  add column if not exists library_version integer,
  add column if not exists library_fingerprint text;

comment on column forms.library_version is
  'The master library version this copy was handed. Set when seeded and on every accepted push.';
comment on column forms.library_fingerprint is
  'Fingerprint of the library schema this copy was handed, baked per company option lists excluded (lib/forms/library-sync.ts). Null means we cannot prove the copy is unedited, and a push leaves it alone.';

update forms f
set library_version = t.version
from form_templates t
where t.key = f.source_template_key
  and f.library_version is null;

/*
 * Push one library form to one company.
 *
 * A NEW VERSION, never an edit in place. Evidence pins the exact form_version_id it was
 * filled in on, so their old version has to stay exactly as it is: an inspector opening a
 * record from last March must see the questions that were actually asked, not this year's.
 * Phil, 2026-09-10, choosing this over editing v1: their v1 stays as it is and new
 * completions use v2.
 *
 * Platform admin only, and it refuses to touch a form whose fingerprint does not match what
 * the caller says it should be. That check is what makes the screen's "in step / edited"
 * list binding rather than decorative: if somebody edits their form between the founder
 * reading the list and pressing the button, the push for that company fails instead of
 * overwriting them.
 */
create or replace function public.push_library_form(
  p_form_id uuid,
  p_expect_fingerprint text,
  p_schema jsonb,
  p_name text,
  p_library_version integer,
  p_new_fingerprint text
) returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_company uuid;
  v_current text;
  v_next integer;
begin
  if not public.is_platform_admin() then
    raise exception 'Not authorised';
  end if;

  select company_id, library_fingerprint into v_company, v_current
  from public.forms where id = p_form_id;
  if v_company is null then raise exception 'Form not found'; end if;

  if v_current is distinct from p_expect_fingerprint then
    raise exception 'This form changed since the list was read, so it was not pushed.';
  end if;

  -- An open draft belongs to the company: publishing over it would throw their work away.
  if exists (select 1 from public.form_versions
             where form_id = p_form_id and status = 'draft') then
    raise exception 'This company has an unpublished draft open, so it was not pushed.';
  end if;

  select coalesce(max(version), 0) + 1 into v_next
  from public.form_versions where form_id = p_form_id;

  insert into public.form_versions (form_id, version, schema, status, created_by)
  values (p_form_id, v_next, p_schema, 'published', auth.uid());

  update public.forms
     set current_version = v_next,
         name = coalesce(p_name, name),
         library_version = p_library_version,
         library_fingerprint = p_new_fingerprint,
         updated_at = now()
   where id = p_form_id;

  -- Their own branches, staff and funding types go straight back into the new version, so
  -- the form they open is theirs and not the library's placeholder lists.
  perform public.rebake_form_field_options(v_company);

  return v_next;
end;
$function$;

revoke all on function public.push_library_form(uuid, text, jsonb, text, integer, text) from public;
grant execute on function public.push_library_form(uuid, text, jsonb, text, integer, text) to authenticated;
