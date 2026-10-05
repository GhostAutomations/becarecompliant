-- Be Care Compliant: Phil, 2026-10-05. Remove "Care schedule on record" and "How is the
-- individual's well-being?" from the Customer Satisfaction section of the CURRENT Individual
-- Plan Review. Neither is scored, so no satisfaction figure moves; completed reviews keep
-- their own frozen copy. Bevan (test) first, then Thistle. Idempotent.

do $$
declare co uuid; vid uuid;
begin
  foreach co in array array[
    '84172279-54e4-4d5b-94b4-c92dc05c6baa'::uuid,  -- Bevan Care Ltd (test)
    'eae26e83-1e41-472b-abc0-e2b39b907e49'::uuid   -- Thistle Care Ltd
  ] loop
    select fv.id into vid from forms f join form_versions fv on fv.form_id = f.id and fv.version = f.current_version
     where f.company_id = co and f.key = 'care_plan_review';
    if vid is null then continue; end if;
    update form_versions v
       set schema = jsonb_set(v.schema, '{sections}', (
         select jsonb_agg(case when s->>'title' = 'Customer Satisfaction'
           then s || jsonb_build_object('fields', (select jsonb_agg(f order by o)
                  from jsonb_array_elements(s->'fields') with ordinality as x(f, o)
                 where f->>'key' not in ('current_care_schedule', 'sat_wellbeing')))
           else s end order by ord)
         from jsonb_array_elements(v.schema->'sections') with ordinality as t(s, ord)))
     where v.id = vid and v.schema::text ~ '"(current_care_schedule|sat_wellbeing)"';
    if found then
      insert into audit_log (company_id, action, entity_type, entity_id, summary, metadata)
      values (co, 'satisfaction.fields_removed', 'form', vid::text,
              'Care schedule on record and well-being removed from Customer Satisfaction', '{"migration":"0392"}');
    end if;
  end loop;
end $$;
