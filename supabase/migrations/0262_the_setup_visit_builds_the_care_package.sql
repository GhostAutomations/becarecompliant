-- 0262_the_setup_visit_builds_the_care_package
-- Phil, 2026-09-09: "i want it done at setup visit so it isnt lost", after asking what Birdie
-- and the rest of the market offer.
--
-- The four fixed call slots added earlier today go. They could not say what a real package
-- says — more than four calls, a Tuesday only sitting service, a shop on a Friday, every day
-- different — and everything they could not say was lost between the visit and somebody typing
-- the weekly grid a week later.
--
-- In their place, ONE field of a new kind: care_package. A builder, not a question. Each line
-- is a recurring call — service, which days, which part of the day, how long, how many carers —
-- and there are as many lines as the package takes. Shaped after Birdie's visit schedule,
-- because that is the model the sector uses: part of the day rather than a clock time, carers
-- as a number up to four, a one-off being the same object over a single day.
--
-- What is deliberately NOT here is everything that belongs to rostering rather than billing: no
-- clock times, no carer allocation, no runs, no week 1 / week 2. Those are Phase 14, and
-- alternating weeks in particular would mean changing care_plan_entries, the billing maths, the
-- recurring invoice cron and the grid (Phil: "later, and log it").
--
-- Completing the visit freezes the package into the Evidence AND writes the weekly Care Plan,
-- so what was agreed at the door survives whatever the office edits afterwards.
--
-- V1 edited in place, guarded by a refusal if any Evidence exists against the Setup form.
--
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

do $$
declare
  package_section jsonb := $json$
{
  "id": "package",
  "title": "The care package",
  "description": "Every call this package runs. One line per repeating visit: what it is, which days, which part of the day, how long, and how many carers. This becomes the weekly Care Plan and is what invoices are built from.",
  "fields": [
    { "key": "care_package", "type": "care_package", "label": "Calls", "required": true,
      "help": "Add a line for each visit that repeats. Untick the days it does not happen on.",
      "visibleWhen": { "field": "care_plan_in_place", "in": ["yes"] } }
  ]
}
$json$;
  n_evidence int;
  r record;
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

  for r in select id, schema from public.form_templates where key = 'setup' loop
    select jsonb_object_agg(fl->>'key', fl) into keep
    from jsonb_array_elements(r.schema->'sections') s,
         jsonb_array_elements(s->'fields') fl;

    new_schema := jsonb_build_object(
      'schemaVersion', 1,
      'sections', jsonb_build_array(
        jsonb_build_object('id','setup','title','Care setup','fields', jsonb_build_array(
          keep->'setup_date', keep->'setup_by', keep->'funding_source', keep->'care_plan_in_place')),
        package_section,
        jsonb_build_object('id','close','title','','fields', jsonb_build_array(
          keep->'notes', keep->'signature'))
      ));

    update public.form_templates set schema = new_schema, updated_at = now() where id = r.id;
  end loop;

  for r in
    select fv.id, fv.schema
    from public.form_versions fv
    join public.forms f on f.id = fv.form_id and fv.version = f.current_version
    where f.key = 'setup'
  loop
    select jsonb_object_agg(fl->>'key', fl) into keep
    from jsonb_array_elements(r.schema->'sections') s,
         jsonb_array_elements(s->'fields') fl;

    new_schema := jsonb_build_object(
      'schemaVersion', 1,
      'sections', jsonb_build_array(
        jsonb_build_object('id','setup','title','Care setup','fields', jsonb_build_array(
          keep->'setup_date', keep->'setup_by', keep->'funding_source', keep->'care_plan_in_place')),
        package_section,
        jsonb_build_object('id','close','title','','fields', jsonb_build_array(
          keep->'notes', keep->'signature'))
      ));

    update public.form_versions set schema = new_schema where id = r.id;
  end loop;
end $$;
