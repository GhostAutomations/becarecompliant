-- Be Care Compliant — every question in the Customer Satisfaction section must be answered.
--
-- Phil, 2026-09-14: "all questions in the satsfaction section must be manitory".
--
-- Two of the three standard questions were optional, which quietly weakened the measure. A
-- skipped question is not counted as a failure — rightly — so a reviewer in a hurry could
-- leave two of the three blank and the service would score 100% off one answer. The
-- percentage would be true and useless.
--
-- The follow-ups go with them. Those only appear when the answer is No, and the validator
-- skips a field nobody was shown, so requiring them costs nothing on a good review and
-- means a bad one always carries the reason with it. A score with nothing behind it tells a
-- manager something is wrong but not what.
--
-- The care schedule shown at the top is EXEMPT, because it is read only: it is shown, never
-- asked, and a service user who has no schedule on file yet would otherwise be unreviewable.

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

create or replace function _require_satisfaction(p_schema jsonb) returns jsonb
language plpgsql as $$
declare
  sections jsonb := '[]'::jsonb;
  sec jsonb;
  fld jsonb;
  fields jsonb;
begin
  for sec in select * from jsonb_array_elements(p_schema->'sections') loop
    fields := '[]'::jsonb;
    for fld in select * from jsonb_array_elements(sec->'fields') loop
      if sec->>'id' = 'customer_satisfaction'
         and coalesce((fld->>'readOnly')::boolean, false) = false
         and fld->>'type' <> 'heading' then
        fld := fld || jsonb_build_object('required', true);
      end if;
      fields := fields || jsonb_build_array(fld);
    end loop;
    sections := sections || jsonb_build_array(jsonb_set(sec, '{fields}', fields));
  end loop;
  return jsonb_set(p_schema, '{sections}', sections);
end $$;

update form_templates set schema = _require_satisfaction(schema) where key = 'care_plan_review';

update form_versions fv
set schema = _require_satisfaction(fv.schema)
from forms f
where f.id = fv.form_id and f.key = 'care_plan_review' and fv.version = f.current_version;

update forms f
set library_schema = _require_satisfaction(f.library_schema)
where f.key = 'care_plan_review' and f.library_schema is not null;

drop function _require_satisfaction(jsonb);

-- Prove it: nothing askable in the section is left optional, and the read only schedule is
-- still not demanding an answer.
do $$
declare
  optional_count integer;
  schedule_required integer;
begin
  select count(*) into optional_count
  from form_versions fv
  join forms f on f.id = fv.form_id,
       lateral jsonb_array_elements(fv.schema->'sections') s,
       lateral jsonb_array_elements(s->'fields') fld
  where f.key = 'care_plan_review' and fv.version = f.current_version
    and s->>'id' = 'customer_satisfaction'
    and coalesce((fld->>'readOnly')::boolean, false) = false
    and coalesce((fld->>'required')::boolean, false) = false;
  if optional_count > 0 then
    raise exception '% satisfaction question(s) are still optional.', optional_count;
  end if;

  select count(*) into schedule_required
  from form_versions fv
  join forms f on f.id = fv.form_id,
       lateral jsonb_array_elements(fv.schema->'sections') s,
       lateral jsonb_array_elements(s->'fields') fld
  where f.key = 'care_plan_review' and fv.version = f.current_version
    and (fld->>'readOnly')::boolean is true
    and (fld->>'required')::boolean is true;
  if schedule_required > 0 then
    raise exception 'The read only care schedule must never be required.';
  end if;
end $$;

commit;
