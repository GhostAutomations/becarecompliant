-- 0373: the founder form library can delete a form nobody holds, and give a form to one company
-- (Phil, 2 Oct 2026, popups: "Delete if no company has it", "Pick any company").

-- DELETE. Only a library form that no company holds and no built in check uses. Once a company
-- holds a copy, its versions and Evidence point back at the key, so the founder archives instead.
create or replace function public.founder_delete_form_template(p_template_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_key text;
  v_name text;
  v_held int;
begin
  if not public.is_platform_admin() then
    raise exception 'Founder only';
  end if;
  select key, name into v_key, v_name from public.form_templates where id = p_template_id;
  if v_key is null then
    raise exception 'That form is not in the library.';
  end if;
  select count(distinct company_id) into v_held from public.forms where source_template_key = v_key;
  if v_held > 0 then
    raise exception '% is held by % %, so it cannot be deleted. Archive it instead.',
      v_name, v_held, case when v_held = 1 then 'company' else 'companies' end;
  end if;
  if exists (select 1 from public.default_check_definitions where form_key = v_key) then
    raise exception '% is used by a built in check, so it cannot be deleted. Archive it instead.', v_name;
  end if;
  delete from public.form_templates where id = p_template_id;
  return v_name;
end;
$$;

-- GIVE. Adds one active library form to one company that does not hold it, exactly as a new
-- company is seeded (seed_company_forms_except): version 1 published, the library version and
-- schema recorded so a later Send to companies can update it. Safe to run twice: a company that
-- already has a form with that key is left alone and 'already' is returned.
create or replace function public.founder_give_form_template(p_template_id uuid, p_company_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  t public.form_templates%rowtype;
  v_status text;
  v_form uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'Founder only';
  end if;
  select * into t from public.form_templates where id = p_template_id;
  if t.id is null then
    raise exception 'That form is not in the library.';
  end if;
  if t.status <> 'active' then
    raise exception 'Restore % before giving it to a company.', t.name;
  end if;
  select status into v_status from public.companies where id = p_company_id;
  if v_status is null then
    raise exception 'That company no longer exists.';
  end if;
  if v_status = 'deleted' then
    raise exception 'That company has been deleted.';
  end if;

  insert into public.forms
    (company_id, key, name, population, description, source_template_key, current_version,
     library_version, library_schema)
  values
    (p_company_id, t.key, t.name, t.population, t.description, t.key, 1, t.version, t.schema)
  on conflict (company_id, key) do nothing
  returning id into v_form;

  if v_form is null then
    return 'already';
  end if;
  insert into public.form_versions (form_id, version, schema, status)
  values (v_form, 1, t.schema, 'published');
  return 'added';
end;
$$;

revoke all on function public.founder_delete_form_template(uuid) from public, anon;
revoke all on function public.founder_give_form_template(uuid, uuid) from public, anon;
grant execute on function public.founder_delete_form_template(uuid) to authenticated;
grant execute on function public.founder_give_form_template(uuid, uuid) to authenticated;
