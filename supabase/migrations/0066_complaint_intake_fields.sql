-- 0066_complaint_intake_fields
-- Capture more at complaint log time and republish the Complaint Investigation Form.
--   - New complaint columns: concern_type, formality, contact_method, contact_email,
--     contact_address (collected on the Log a complaint form; concern_type + formality
--     prefill the investigation form's dropdowns, still editable there).
--   - Complaint Investigation Form (complaints_concerns): remove the section title
--     "Complaint / Concern Details" and rename the "Complaint/Concern Type" field to
--     "Complaint/Concern". Republished as the next published version across the master
--     template and every company copy; existing evidence keeps its own snapshot.
-- Applied to ref bgrtcvyjuwopunpnudeu only.

alter table public.complaints
  add column if not exists concern_type text
    check (concern_type is null or concern_type in
      ('Concern', 'Complaint', 'Minor Complaint', 'Audit Identification')),
  add column if not exists formality text
    check (formality is null or formality in ('Informal', 'Formal')),
  add column if not exists contact_method text
    check (contact_method is null or contact_method in ('email', 'post')),
  add column if not exists contact_email text,
  add column if not exists contact_address text;

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

  -- Remove the section title text and rename the Complaint/Concern Type field
  -- (index 3 in section 0: intro, region, email_area_manager, complaint_concern_type).
  v_new := jsonb_set(v_old, '{sections,0,title}', '""'::jsonb);
  v_new := jsonb_set(v_new, '{sections,0,fields,3,label}', '"Complaint/Concern"'::jsonb);

  update public.form_templates
    set schema = v_new, version = version + 1, updated_at = now()
    where key = 'complaints_concerns';

  -- Republish as the next published version of each company copy, unless already done
  -- (latest published version still carries the old section title).
  for f in
    select fo.id from public.forms fo
    where fo.key = 'complaints_concerns'
      and (
        select fv.schema->'sections'->0->>'title'
        from public.form_versions fv
        where fv.form_id = fo.id and fv.status = 'published'
        order by fv.version desc limit 1
      ) = 'Complaint / Concern Details'
  loop
    insert into public.form_versions (form_id, version, schema, status)
    select f.id, coalesce(max(fv.version), 0) + 1, v_new, 'published'
    from public.form_versions fv where fv.form_id = f.id;

    update public.forms
      set current_version = (
        select max(version) from public.form_versions where form_id = f.id
      )
      where id = f.id;
  end loop;
end $$;
