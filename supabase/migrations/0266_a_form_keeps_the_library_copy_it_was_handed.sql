-- Be Care Compliant — a company's form keeps the library schema it was handed.
--
-- 0265 stored a FINGERPRINT of that schema. Wrong shape: the fingerprint is computed in
-- TypeScript (lib/forms/library-sync.ts) with the per company baked option lists removed,
-- and nothing in the database can reproduce it. That left the seeding function — pure SQL,
-- and the moment a company is actually handed a form — unable to record what it had just
-- handed over. Every newly onboarded company would have started life unprovable, and a
-- push would have skipped them forever.
--
-- So the database stores the thing, not a derivation of it: the library schema as handed.
-- SQL copies jsonb, which it can do exactly. TypeScript fingerprints it when it needs to
-- compare, which keeps the comparison rule in ONE place instead of two implementations
-- that drift.
--
-- The backfill sets it only where the company's current published form still matches the
-- library with baked options ignored — verified before running this, on the two companies
-- that exist. A form that cannot be proved untouched is left null, and the push treats null
-- as hands off.

alter table forms
  add column if not exists library_schema jsonb;

comment on column forms.library_schema is
  'The master library schema this copy was handed, stored as given. Null means we cannot prove the copy is unedited and a push leaves it alone. Compared in lib/forms/library-sync.ts, which ignores the option lists baked per company.';

alter table forms drop column if exists library_fingerprint;

-- Seeding records what it hands over, in the same statement that hands it over.
create or replace function public.seed_company_form_templates(cid uuid)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
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
      (company_id, key, name, population, description, source_template_key, current_version,
       library_version, library_schema)
    values
      (cid, t.key, t.name, t.population, t.description, t.key, 1,
       t.version, t.schema)
    on conflict (company_id, key) do nothing
    returning id into new_form_id;

    if new_form_id is not null then
      insert into public.form_versions (form_id, version, schema, status)
      values (new_form_id, 1, t.schema, 'published');
      seeded := seeded + 1;
    end if;
  end loop;

  return seeded;
end;
$function$;

-- The push, re-cut against the stored schema. The optimistic check is now an exact jsonb
-- comparison rather than a fingerprint the database cannot compute.
drop function if exists public.push_library_form(uuid, text, jsonb, text, integer, text);

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
  v_next integer;
begin
  if not public.is_platform_admin() then
    raise exception 'Not authorised';
  end if;

  select company_id, library_schema into v_company, v_current
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

  select coalesce(max(version), 0) + 1 into v_next
  from public.form_versions where form_id = p_form_id;

  -- A NEW VERSION, never an edit in place: Evidence pins the exact version it was filled
  -- in on, and a record from last March must still show the questions actually asked.
  insert into public.form_versions (form_id, version, schema, status, created_by)
  values (p_form_id, v_next, p_schema, 'published', auth.uid());

  update public.forms
     set current_version = v_next,
         name = coalesce(p_name, name),
         library_version = p_library_version,
         library_schema = p_schema,
         updated_at = now()
   where id = p_form_id;

  -- Their own branches, staff and funding types go back into the new version, so the form
  -- they open is theirs and not the library's placeholder lists.
  perform public.rebake_form_field_options(v_company);

  return v_next;
end;
$function$;

revoke all on function public.push_library_form(uuid, jsonb, jsonb, text, integer) from public;
grant execute on function public.push_library_form(uuid, jsonb, jsonb, text, integer) to authenticated;
