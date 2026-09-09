-- 0259_the_setup_visit_asks_what_the_calls_are
-- Phil, 2026-09-09: "if Care plan in place is yes, get them to add the number of calls a day,
-- durations, double or single handed. this is what will be billed in invoicing."
--
-- The weekly Care Plan already holds exactly this — day, service, duration, single or double
-- handed — and Invoicing bills from it. So the Setup Visit does not invent a second place to
-- keep it: it asks the questions at the visit, and completing it WRITES THE CARE PLAN
-- (lib/service-users/setup-calls.ts). One set of facts, captured when somebody is standing in
-- the house, landing where the billing already reads. The office refines the weekly grid
-- afterwards for the days that differ.
--
-- FOUR CALLS, because that is how a domiciliary rota is written: morning, lunch, tea, bed.
-- Each has its own duration and its own handedness, because a 45 minute double handed morning
-- followed by a 30 minute single handed tea is the normal case, not the exception, and one
-- duration for the lot would seed the plan wrong and need correcting anyway.
--
-- Every question is gated on Care plan in place = Yes, and a blank duration means there is no
-- call at that time. The handedness question only appears once its call has a length, so an
-- unanswered call cannot leave a stray "single handed" behind it.
--
-- The Calls SECTION disappears entirely when the answer is No: form-renderer drops a section
-- whose every field is hidden, so nothing is left as a heading with no questions under it.
--
-- funding_source IS DELIBERATELY CARRIED OVER FIELD FOR FIELD rather than rewritten. Its
-- options are baked per company by rebake_form_field_options, so writing a fresh copy here
-- would put every company back on the generic list until something else re-baked them.
--
-- V1 IS EDITED IN PLACE, the standing rule while the defaults are being built, guarded by a
-- refusal if any Evidence exists against the Setup form.
--
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

do $$
declare
  calls_section jsonb := $json$
{
  "id": "calls",
  "title": "Calls",
  "description": "The calls this package runs, every day. Leave a call blank if there is not one at that time. The weekly Care Plan and the invoices are built from this, and the office can change it later without redoing the visit.",
  "fields": [
    { "key": "call_morning_duration", "type": "single_select", "label": "Morning call",
      "options": [{"label":"15m","value":"15m"},{"label":"30m","value":"30m"},{"label":"45m","value":"45m"},{"label":"1hr","value":"1hr"},{"label":"2hr","value":"2hr"}],
      "visibleWhen": { "field": "care_plan_in_place", "in": ["yes"] } },
    { "key": "call_morning_handed", "type": "radio", "label": "Morning call — carers",
      "options": [{"label":"Single handed","value":"single"},{"label":"Double handed","value":"double"}],
      "visibleWhen": { "field": "call_morning_duration", "in": ["15m","30m","45m","1hr","2hr"] } },
    { "key": "call_lunch_duration", "type": "single_select", "label": "Lunch call",
      "options": [{"label":"15m","value":"15m"},{"label":"30m","value":"30m"},{"label":"45m","value":"45m"},{"label":"1hr","value":"1hr"},{"label":"2hr","value":"2hr"}],
      "visibleWhen": { "field": "care_plan_in_place", "in": ["yes"] } },
    { "key": "call_lunch_handed", "type": "radio", "label": "Lunch call — carers",
      "options": [{"label":"Single handed","value":"single"},{"label":"Double handed","value":"double"}],
      "visibleWhen": { "field": "call_lunch_duration", "in": ["15m","30m","45m","1hr","2hr"] } },
    { "key": "call_tea_duration", "type": "single_select", "label": "Tea call",
      "options": [{"label":"15m","value":"15m"},{"label":"30m","value":"30m"},{"label":"45m","value":"45m"},{"label":"1hr","value":"1hr"},{"label":"2hr","value":"2hr"}],
      "visibleWhen": { "field": "care_plan_in_place", "in": ["yes"] } },
    { "key": "call_tea_handed", "type": "radio", "label": "Tea call — carers",
      "options": [{"label":"Single handed","value":"single"},{"label":"Double handed","value":"double"}],
      "visibleWhen": { "field": "call_tea_duration", "in": ["15m","30m","45m","1hr","2hr"] } },
    { "key": "call_bed_duration", "type": "single_select", "label": "Bed call",
      "options": [{"label":"15m","value":"15m"},{"label":"30m","value":"30m"},{"label":"45m","value":"45m"},{"label":"1hr","value":"1hr"},{"label":"2hr","value":"2hr"}],
      "visibleWhen": { "field": "care_plan_in_place", "in": ["yes"] } },
    { "key": "call_bed_handed", "type": "radio", "label": "Bed call — carers",
      "options": [{"label":"Single handed","value":"single"},{"label":"Double handed","value":"double"}],
      "visibleWhen": { "field": "call_bed_duration", "in": ["15m","30m","45m","1hr","2hr"] } }
  ]
}
$json$;
  n_evidence int;
  r record;
  fld jsonb;
  keep jsonb;
  new_schema jsonb;
begin
  select count(*) into n_evidence
  from public.evidence e join public.forms f on f.id = e.form_id
  where f.key = 'setup';

  if n_evidence > 0 then
    raise exception
      'Refusing to edit v1: % Evidence records exist against the Setup form. Publish a new version instead.',
      n_evidence;
  end if;

  -- The founder template.
  for r in select id, schema from public.form_templates where key = 'setup' loop
    select jsonb_object_agg(f->>'key', f) into keep
    from jsonb_array_elements(r.schema->'sections') s,
         jsonb_array_elements(s->'fields') f;

    new_schema := jsonb_build_object(
      'schemaVersion', 1,
      'sections', jsonb_build_array(
        jsonb_build_object('id','setup','title','Care setup','fields', jsonb_build_array(
          keep->'setup_date', keep->'setup_by', keep->'funding_source', keep->'care_plan_in_place')),
        calls_section,
        jsonb_build_object('id','close','title','','fields', jsonb_build_array(
          keep->'notes', keep->'signature'))
      ));

    update public.form_templates set schema = new_schema, updated_at = now() where id = r.id;
  end loop;

  -- Every company's copy, at its current version.
  for r in
    select fv.id, fv.schema
    from public.form_versions fv
    join public.forms f on f.id = fv.form_id and fv.version = f.current_version
    where f.key = 'setup'
  loop
    select jsonb_object_agg(f2->>'key', f2) into keep
    from jsonb_array_elements(r.schema->'sections') s,
         jsonb_array_elements(s->'fields') f2;

    new_schema := jsonb_build_object(
      'schemaVersion', 1,
      'sections', jsonb_build_array(
        jsonb_build_object('id','setup','title','Care setup','fields', jsonb_build_array(
          keep->'setup_date', keep->'setup_by', keep->'funding_source', keep->'care_plan_in_place')),
        calls_section,
        jsonb_build_object('id','close','title','','fields', jsonb_build_array(
          keep->'notes', keep->'signature'))
      ));

    update public.form_versions set schema = new_schema where id = r.id;
  end loop;
end $$;
