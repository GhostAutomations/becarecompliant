-- Be Care Compliant — the Individual Plan Review stops asking for what we already hold.
--
-- Phil, 2026-09-09, reviewing the form against Thistle's Monday original:
--   "region branch, doesnt need to be on here as it is completed in the record."
--   "dont need cardiff or newport on there as it is completed in the branch."
--   "for Select current call durations have a import call schedule if one has been
--    created."  -> and, asked how: "does this match".
--
-- Three things were wrong with the form as copied:
--
--  1. It asked which BRANCH the person is in. The record knows. Worse, the master
--     template every new company copies from had Thistle's own branches, Cardiff and
--     Newport, baked into it, so a company in Swansea inherited two Welsh branches it
--     has never heard of. Removing the field removes the stale options with it.
--
--  2. It asked the reviewer to tick which call DURATIONS the person has and then type
--     the days and times of each one into eight free text boxes. The office already
--     holds that: it is the care schedule Invoicing bills from. Retyping it at a
--     kitchen table produced a second version of the truth that nothing reconciled.
--
--  3. Nothing in the review ever compared the two.
--
-- So the review now SHOWS the schedule we hold (a read only care_package field, seeded
-- from care_plan_entries and rewritten server side on submit so the frozen Evidence
-- carries the record's own data) and asks one question: does this match? A No, with a
-- sentence saying what is different, is worth more than eight retyped boxes — it is a
-- disagreement between the record and the doorstep, which is what a review is for.
--
-- Forms stay at v1 while the defaults are being built, so v1 is edited in place. Guarded:
-- the migration refuses if any Evidence exists against a version being changed, because
-- Evidence freezes its own schema_snapshot and must never be re-interpreted.

begin;

-- Refuse if anything has already been recorded against this form for any company.
do $$
declare
  n integer;
begin
  select count(*) into n
  from evidence e
  join forms f on f.id = e.form_id
  where f.key = 'care_plan_review';
  if n > 0 then
    raise exception
      'Refusing to edit care_plan_review in place: % Evidence row(s) exist. Publish a v2 instead.', n;
  end if;
end $$;

-- The new fields, written once and applied to the master template and to every company.
create temporary table _review_patch (schedule jsonb, matches jsonb, changes jsonb) on commit drop;
insert into _review_patch values (
  jsonb_build_object(
    'key', 'current_care_schedule',
    'type', 'care_package',
    'label', 'Care schedule on record',
    'readOnly', true,
    'help', 'This is the schedule the office holds and Invoicing bills from. Read it out and check it against what is actually happening.'
  ),
  jsonb_build_object(
    'key', 'schedule_matches',
    'type', 'single_select',
    'label', 'Does this match the calls being delivered?',
    'required', true,
    'options', jsonb_build_array(
      jsonb_build_object('label', 'No', 'value', 'No'),
      jsonb_build_object('label', 'Yes', 'value', 'Yes')
    )
  ),
  jsonb_build_object(
    'key', 'schedule_changes',
    'type', 'long_text',
    'label', 'What is different?',
    'help', 'Say what is actually being delivered, and from when. The office updates the care schedule from this, which is what changes the invoices.',
    'visibleWhen', jsonb_build_object('field', 'schedule_matches', 'in', jsonb_build_array('No'))
  )
);

-- Rewrite one schema: drop the dead fields, insert the new three where the durations were.
create or replace function _patch_review_schema(p_schema jsonb) returns jsonb
language plpgsql as $$
declare
  dead text[] := array[
    'region',
    'call_durations',
    'calls_15', 'calls_30', 'calls_45', 'calls_1h', 'calls_15h', 'calls_2h', 'calls_3h', 'calls_other'
  ];
  patch record;
  sections jsonb := '[]'::jsonb;
  sec jsonb;
  fields jsonb;
  fld jsonb;
begin
  select * into patch from _review_patch;

  for sec in select * from jsonb_array_elements(p_schema->'sections') loop
    fields := '[]'::jsonb;
    for fld in select * from jsonb_array_elements(sec->'fields') loop
      if fld->>'key' = 'call_durations' then
        -- The durations question is where the schedule belongs: same place in the form,
        -- so the reviewer reads it at the same point in the conversation.
        fields := fields || jsonb_build_array(patch.schedule, patch.matches, patch.changes);
      elsif (fld->>'key') = any(dead) then
        null;  -- dropped
      else
        fields := fields || jsonb_build_array(fld);
      end if;
    end loop;
    sections := sections || jsonb_build_array(jsonb_set(sec, '{fields}', fields));
  end loop;

  return jsonb_set(p_schema, '{sections}', sections);
end $$;

-- The master library every new company copies from.
update form_templates
set schema = _patch_review_schema(schema)
where key = 'care_plan_review';

-- Every company's own copy, published version edited in place.
update form_versions fv
set schema = _patch_review_schema(fv.schema)
from forms f
where f.id = fv.form_id
  and f.key = 'care_plan_review'
  and fv.status = 'published';

drop function _patch_review_schema(jsonb);

-- Prove it: no company may be left holding a branch question or a durations question.
do $$
declare
  n integer;
begin
  select count(*) into n
  from form_versions fv
  join forms f on f.id = fv.form_id,
       lateral jsonb_array_elements(fv.schema->'sections') s,
       lateral jsonb_array_elements(s->'fields') fld
  where f.key = 'care_plan_review'
    and fv.status = 'published'
    and fld->>'key' in ('region', 'call_durations', 'calls_15', 'calls_30', 'calls_45',
                        'calls_1h', 'calls_15h', 'calls_2h', 'calls_3h', 'calls_other');
  if n > 0 then
    raise exception 'care_plan_review still holds % removed field(s) after the patch.', n;
  end if;

  select count(*) into n
  from form_versions fv
  join forms f on f.id = fv.form_id,
       lateral jsonb_array_elements(fv.schema->'sections') s,
       lateral jsonb_array_elements(s->'fields') fld
  where f.key = 'care_plan_review'
    and fv.status = 'published'
    and fld->>'key' = 'current_care_schedule';
  if n <> (select count(*) from forms where key = 'care_plan_review') then
    raise exception 'Not every care_plan_review gained the care schedule field.';
  end if;
end $$;

commit;
