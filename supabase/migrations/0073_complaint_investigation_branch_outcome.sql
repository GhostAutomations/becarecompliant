-- 0073_complaint_investigation_branch_outcome
-- Complaint Investigation Form refinements (Phase 10 Additions):
--  * Region  -> Branch: a single-select of the company's own branches, auto-filled
--    from the complaint (options are company specific, so built per company copy).
--  * Remove the "Does the complainer require an official outcome" question.
--  * Add "Outcome of the investigation" (long text) for the investigator's findings.
--  * Keep the complainant's desired-outcome question; tidy its stale help text.
-- Republished across the master template + every company copy; existing evidence
-- keeps its own frozen snapshot. Applied to ref bgrtcvyjuwopunpnudeu only.

do $$
declare
  f record;
  base_fields jsonb;
  fields_with_branch jsonb;
  new_schema jsonb;
  br_opts jsonb;
begin
  -- Idempotency: skip if the template already carries the new outcome field.
  if exists (
    select 1 from public.form_templates
    where key = 'complaints_concerns'
      and (schema->'sections'->0->'fields') @> '[{"key":"investigation_outcome"}]'::jsonb
  ) then
    return;
  end if;

  -- The full field set (branch options left empty; filled per company below).
  base_fields := jsonb_build_array(
    jsonb_build_object('key','intro','type','heading','label','This form should be used for all concerns or complaints'),
    jsonb_build_object('key','branch','type','single_select','label','Branch','options','[]'::jsonb),
    jsonb_build_object('key','complaint_concern_type','type','single_select','label','Complaint/Concern','options', jsonb_build_array(
      jsonb_build_object('label','Concern','value','Concern'),
      jsonb_build_object('label','Complaint','value','Complaint'),
      jsonb_build_object('label','Minor Complaint','value','Minor Complaint'),
      jsonb_build_object('label','Audit Identification','value','Audit Identification'))),
    jsonb_build_object('key','type','type','single_select','label','Type','options', jsonb_build_array(
      jsonb_build_object('label','Informal','value','Informal'),
      jsonb_build_object('label','Formal','value','Formal'))),
    jsonb_build_object('key','individual_name','type','short_text','label','Please insert name of the Individual the complaint/concern relates:','help','Please only include the name of the main person here','required',true),
    jsonb_build_object('key','date_raised','type','date','label','Date raised'),
    jsonb_build_object('key','date_occurred','type','date','label','Date occurred'),
    jsonb_build_object('key','category','type','single_select','label','Category this concern falls into','options', jsonb_build_array(
      jsonb_build_object('label','Medication','value','Medication'),
      jsonb_build_object('label','Late / Early arrival','value','Late / Early arrival'),
      jsonb_build_object('label','Behavioural Concerns','value','Behavioural Concerns'),
      jsonb_build_object('label','PPE','value','PPE'),
      jsonb_build_object('label','Other','value','Other'),
      jsonb_build_object('label','Staff','value','Staff'))),
    jsonb_build_object('key','describe_complaint','type','long_text','label','Please describe what the complaint or concern relates to in as much detail as possible','required',true),
    jsonb_build_object('key','initial_response','type','long_text','label','Details of initial response to this complaint or concern at time of being raised','required',true),
    jsonb_build_object('key','desired_outcome','type','long_text','label','What outcome would the complainant like to see to resolve their concern?'),
    jsonb_build_object('key','investigation_outcome','type','long_text','label','Outcome of the investigation'),
    jsonb_build_object('key','upload_additional','type','file_upload','label','Upload additional information if available','help','an email has been sent'),
    jsonb_build_object('key','name','type','short_text','label','Name','required',true)
  );

  -- Master template (company agnostic): branch options stay empty and are seeded
  -- per company when a new company copy is created.
  update public.form_templates
    set schema = jsonb_build_object('schemaVersion',1,'sections',
          jsonb_build_array(jsonb_build_object('id','section-1','title','','fields', base_fields))),
        version = version + 1,
        updated_at = now()
    where key = 'complaints_concerns';

  -- Each company copy: branch options = that company's own branches.
  for f in select id, company_id from public.forms where key = 'complaints_concerns' loop
    br_opts := coalesce((
      select jsonb_agg(jsonb_build_object('label', b.name, 'value', b.name) order by b.name)
      from public.branches b
      where b.company_id = f.company_id and b.kind = 'branch'
    ), '[]'::jsonb);

    fields_with_branch := jsonb_set(base_fields, '{1,options}', br_opts);
    new_schema := jsonb_build_object('schemaVersion',1,'sections',
      jsonb_build_array(jsonb_build_object('id','section-1','title','','fields', fields_with_branch)));

    insert into public.form_versions (form_id, version, schema, status)
    select f.id, coalesce(max(fv.version),0)+1, new_schema, 'published'
    from public.form_versions fv where fv.form_id = f.id;

    update public.forms
      set current_version = (select max(version) from public.form_versions where form_id = f.id)
      where id = f.id;
  end loop;
end $$;
