-- Be Care Compliant — a scored question carries the fact that it is scored.
--
-- Phil, 2026-09-12: a Customer Satisfaction section in Settings where a company adds and
-- removes the questions that feed the PQS score, and "they should only be editable in there
-- settings to protect the scoring mechanism".
--
-- Which questions counted used to be a list in the code. That cannot survive the company
-- editing the list, for a reason that only shows up months later: remove a question in March
-- and every review completed in January is suddenly scored against a list it never asked,
-- so the percentage already reported to CIW quietly changes and nothing on any screen says
-- why. Phil chose the honest rule — each review scored on the questions that were live when
-- it was completed.
--
-- That is what this migration makes possible. The flag goes IN THE SCHEMA, so Evidence
-- freezes it along with the questions themselves when a review is submitted, and January's
-- review carries January's list for ever. No separate history table, and nothing to keep in
-- step with anything.
--
-- The three that ship as standard are flagged here. Phil chose full control, so a company
-- may reword or remove any of them; standard only means where it came from.

begin;

do $$
declare
  n integer;
begin
  select count(*) into n
  from evidence e join forms f on f.id = e.form_id
  where f.key = 'care_plan_review';
  if n > 0 then
    raise exception
      'Refusing to edit care_plan_review in place: % Evidence row(s) exist. Publish a v2 instead.', n;
  end if;
end $$;

create or replace function _flag_satisfaction(p_schema jsonb) returns jsonb
language plpgsql as $$
declare
  scored text[] := array['schedule_matches', 'call_times_suit', 'review_previous_setup'];
  sections jsonb := '[]'::jsonb;
  sec jsonb;
  fld jsonb;
  fields jsonb;
begin
  for sec in select * from jsonb_array_elements(p_schema->'sections') loop
    fields := '[]'::jsonb;
    for fld in select * from jsonb_array_elements(sec->'fields') loop
      if (fld->>'key') = any(scored) then
        fld := fld || jsonb_build_object('satisfaction', true);
      end if;
      fields := fields || jsonb_build_array(fld);
    end loop;
    sections := sections || jsonb_build_array(jsonb_set(sec, '{fields}', fields));
  end loop;
  return jsonb_set(p_schema, '{sections}', sections);
end $$;

update form_templates
set schema = _flag_satisfaction(schema)
where key = 'care_plan_review';

update form_versions fv
set schema = _flag_satisfaction(fv.schema)
from forms f
where f.id = fv.form_id
  and f.key = 'care_plan_review'
  and fv.version = f.current_version;

-- The library copy each company was handed moves with it, or every company reads as having
-- edited their own form and stops receiving improvements (lib/forms/library-sync.ts).
update forms f
set library_schema = _flag_satisfaction(f.library_schema)
where f.key = 'care_plan_review' and f.library_schema is not null;

drop function _flag_satisfaction(jsonb);

-- Prove it: every company scores exactly the three, and so does the library.
do $$
declare
  expected integer := (select count(*) from forms where key = 'care_plan_review') * 3;
  actual integer;
begin
  select count(*) into actual
  from form_versions fv
  join forms f on f.id = fv.form_id,
       lateral jsonb_array_elements(fv.schema->'sections') s,
       lateral jsonb_array_elements(s->'fields') fld
  where f.key = 'care_plan_review'
    and fv.version = f.current_version
    and (fld->>'satisfaction')::boolean is true;
  if actual <> expected then
    raise exception 'Expected % scored questions across the companies, found %.', expected, actual;
  end if;
end $$;

commit;
