-- 0069_complaint_investigation_required_fields
-- A blank Complaint Investigation Form should never count as a completed
-- investigation. The form had no required fields, so an empty submission passed
-- validation, stored as evidence, turned the button green and stamped the
-- investigation complete. Make the substantive fields required: what the complaint
-- relates to, the description, the investigation/response detail, and the name of
-- the person completing it. The validator enforces required both client and server
-- side. Republished across the master template + every company copy; existing
-- evidence keeps its own snapshot. Applied to ref bgrtcvyjuwopunpnudeu only.

do $$
declare
  v_old jsonb;
  v_new jsonb;
  v_already boolean;
  f record;
  req text[] := array['individual_name', 'describe_complaint', 'initial_response', 'name'];
begin
  select schema into v_old from public.form_templates where key = 'complaints_concerns';
  if v_old is null then
    return;
  end if;

  -- Idempotency: skip if describe_complaint is already required.
  select coalesce((
    select (fld->>'required')::boolean
    from jsonb_array_elements(v_old->'sections'->0->'fields') fld
    where fld->>'key' = 'describe_complaint'
  ), false) into v_already;
  if v_already then
    return;
  end if;

  v_new := jsonb_set(v_old, '{sections,0,fields}', (
    select jsonb_agg(
      case when fld->>'key' = any(req) then fld || '{"required": true}'::jsonb else fld end
      order by ord
    )
    from jsonb_array_elements(v_old->'sections'->0->'fields') with ordinality as t(fld, ord)
  ));

  update public.form_templates
    set schema = v_new, version = version + 1, updated_at = now()
    where key = 'complaints_concerns';

  for f in select id from public.forms where key = 'complaints_concerns' loop
    insert into public.form_versions (form_id, version, schema, status)
    select f.id, coalesce(max(fv.version), 0) + 1, v_new, 'published'
    from public.form_versions fv where fv.form_id = f.id;

    update public.forms
      set current_version = (select max(version) from public.form_versions where form_id = f.id)
      where id = f.id;
  end loop;
end $$;
