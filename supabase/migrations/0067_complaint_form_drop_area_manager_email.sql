-- 0067_complaint_form_drop_area_manager_email
-- Remove the "Email for Area Manager" field (key email_area_manager) from the
-- Complaint Investigation Form (complaints_concerns): the branch manager is already
-- tied to the complaint via its branch. Republished as the next published version
-- across the master template and every company copy; existing evidence keeps its own
-- snapshot. The field is removed BY KEY (not index), so it is order independent.
-- Applied to ref bgrtcvyjuwopunpnudeu only.

do $$
declare
  v_old jsonb;
  v_new jsonb;
  f record;
begin
  select schema into v_old from public.form_templates where key = 'complaints_concerns';
  if v_old is null then
    return;
  end if;

  v_new := jsonb_set(
    v_old,
    '{sections,0,fields}',
    (
      select jsonb_agg(fld)
      from jsonb_array_elements(v_old->'sections'->0->'fields') fld
      where fld->>'key' <> 'email_area_manager'
    )
  );

  update public.form_templates
    set schema = v_new, version = version + 1, updated_at = now()
    where key = 'complaints_concerns';

  for f in
    select fo.id from public.forms fo
    where fo.key = 'complaints_concerns'
      and (
        select fv.schema::text like '%email_area_manager%'
        from public.form_versions fv
        where fv.form_id = fo.id and fv.status = 'published'
        order by fv.version desc limit 1
      )
  loop
    insert into public.form_versions (form_id, version, schema, status)
    select f.id, coalesce(max(fv.version), 0) + 1, v_new, 'published'
    from public.form_versions fv where fv.form_id = f.id;

    update public.forms
      set current_version = (select max(version) from public.form_versions where form_id = f.id)
      where id = f.id;
  end loop;
end $$;
