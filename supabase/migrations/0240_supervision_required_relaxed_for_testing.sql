-- 0240_supervision_required_relaxed_for_testing
-- TEMPORARY. Phil, 2026-09-08: "just so I can submit a form without filling in all the
-- questions, make every current mandatory field not mandatory. And then after the test,
-- we will make them mandatory again."
--
-- THISTLE'S COPY ONLY. Bevan's copy and the master template keep their required flags, so
-- the library is not left in a relaxed state and a company onboarding tomorrow gets the
-- form as designed.
--
-- WHICH FIELDS WERE MANDATORY IS RECORDED IN THE SCHEMA, not in anybody's memory. Each
-- field that was required loses "required" and gains "requiredWas": true, so putting them
-- back is mechanical -- every field carrying the marker becomes required again and the
-- marker is dropped -- and it stays correct however long the test takes or whoever does
-- it. requiredWas means nothing to the renderer or the validator, which read "required"
-- and ignore anything they do not recognise, so the only effect is the one intended.
--
-- The 31 fields relaxed, for the record:
--   supervision_date, supervision_type, took_place, not_held_reason, start_time,
--   safeguarding_concerns, working_environment, agree_training, agree_issues_addressed,
--   agree_ppe, agree_recommend, agree_hours, additional_training, goals, role_difficult,
--   improvement_required, issues_set_tasks, issues_communication, issues_notes,
--   issues_medication, issues_data_protection, issues_personal_care,
--   spot_check_non_compliances, issues_daily_log, issues_logging, qcf_completed,
--   qcf_enrolled, scw_enrolled, convictions_declaration, by_telephone, manager_signature.
--
-- Guarded on there being no Supervision evidence, as 0237 to 0239 were: this edits v1 in
-- place, and the moment evidence exists that is no longer allowed.
-- Applied to the becarecompliant project ONLY (ref bgrtcvyjuwopunpnudeu).

do $$
declare
  v_blocked int;
  v_relaxed int;
begin
  select count(*) into v_blocked
    from public.evidence e
    join public.form_versions fv on fv.id = e.form_version_id
    join public.forms f on f.id = fv.form_id
   where f.key = 'supervision';

  if v_blocked > 0 then
    raise exception 'Supervision has % pieces of evidence against it; do not edit v1 in place', v_blocked;
  end if;

  update public.form_versions fv
     set schema = jsonb_set(fv.schema, array['sections'], (
           select jsonb_agg(
                    jsonb_set(s.sec, array['fields'], (
                      select jsonb_agg(
                               case when (x.fld->>'required')::boolean is true
                                    then (x.fld - 'required') || '{"requiredWas": true}'::jsonb
                                    else x.fld end
                               order by x.ord)
                        from jsonb_array_elements(s.sec->'fields') with ordinality x(fld, ord)
                    ))
                    order by s.ord)
             from jsonb_array_elements(fv.schema->'sections') with ordinality s(sec, ord)
         ))
    from public.forms f
    join public.companies c on c.id = f.company_id
   where f.id = fv.form_id
     and f.key = 'supervision'
     and c.name = 'Thistle Care Ltd'
     and fv.version = 1;

  select count(*) into v_relaxed
    from public.form_versions fv
    join public.forms f on f.id = fv.form_id
    join public.companies c on c.id = f.company_id,
         jsonb_array_elements(fv.schema->'sections') s(sec),
         jsonb_array_elements(s.sec->'fields') x(fld)
   where f.key = 'supervision' and c.name = 'Thistle Care Ltd'
     and (x.fld->>'requiredWas')::boolean is true;

  if v_relaxed <> 31 then
    raise exception 'Expected 31 relaxed fields, marked %', v_relaxed;
  end if;

  raise notice 'Supervision relaxed for testing: % fields marked requiredWas', v_relaxed;
end $$;
