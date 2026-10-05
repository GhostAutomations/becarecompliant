-- Be Care Compliant: Phil, 2026-10-05. "Are there any outcomes you would like to achieve that
-- are not currently being assisted with?" moves from Customer Satisfaction into the Outcomes
-- section (it is now the question that opens a new outcome, lib/service-users/outcomes-review.ts)
-- and is no longer scored: outcomes have their own PQS measure. Satisfaction is scored on the
-- remaining three. Completed reviews keep their frozen questions and scores.
-- Bevan (test) first, then Thistle. Idempotent.

do $$
declare co uuid; vid uuid;
begin
  foreach co in array array[
    '84172279-54e4-4d5b-94b4-c92dc05c6baa'::uuid   -- Bevan Care Ltd (test)
  ] loop
    select fv.id into vid from forms f join form_versions fv on fv.form_id = f.id and fv.version = f.current_version
     where f.company_id = co and f.key = 'care_plan_review';
    if vid is null then continue; end if;
    update form_versions v
       set schema = jsonb_set(v.schema, '{sections}', (
         select jsonb_agg(case when s->>'title' = 'Customer Satisfaction'
           then s || jsonb_build_object('fields', (select jsonb_agg(f order by o)
                  from jsonb_array_elements(s->'fields') with ordinality as x(f, o)
                 where f->>'key' not in ('sat_outcomes_not_assisted', 'sat_outcomes_not_assisted_detail')))
           else s end order by ord)
         from jsonb_array_elements(v.schema->'sections') with ordinality as t(s, ord)))
     where v.id = vid and v.schema::text like '%"sat_outcomes_not_assisted"%';
    if found then
      insert into audit_log (company_id, action, entity_type, entity_id, summary, metadata)
      values (co, 'satisfaction.question_removed', 'form', vid::text,
              'Outcomes question moved from Customer Satisfaction to Outcomes (no longer scored)',
              '{"migration":"0395","key":"sat_outcomes_not_assisted"}');
    end if;
  end loop;
end $$;
