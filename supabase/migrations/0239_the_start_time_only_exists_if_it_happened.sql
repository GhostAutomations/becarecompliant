-- 0239_the_start_time_only_exists_if_it_happened
-- Phil, 2026-09-08: "did the supervision take place? If yes, then time supervision took
-- place pops up... If no, then the why did the supervision not take place box shows."
--
-- 0238 moved the start time below the gate, which greyed it out on No. Greyed out is not
-- the same as gone: the box was still sitting there, a dead control on a form that had
-- just been told the supervision did not happen. The two questions are now a proper
-- either/or -- Yes shows the start time, No shows the reason, and neither is on screen
-- until the gate is answered.
--
-- The start time keeps being required, so it is required WHEN IT IS ASKED and never when
-- it is not: a field hidden by conditional logic is not required and stores nothing
-- (lib/form-validate.ts), which is the same rule the reason box has been using all along.
--
-- Applied to the master template and every company copy, and it refuses if any
-- Supervision evidence exists, for the same reason as 0237 and 0238.
-- Applied to the becarecompliant project ONLY (ref bgrtcvyjuwopunpnudeu).

do $$
declare
  r record;
  v_blocked int;
  v_fields jsonb;
  v_when jsonb := '{"visibleWhen": {"field": "took_place", "in": ["yes"]}}'::jsonb;
  i int;
begin
  select count(*) into v_blocked
    from public.evidence e
    join public.form_versions fv on fv.id = e.form_version_id
    join public.forms f on f.id = fv.form_id
   where f.key = 'supervision';

  if v_blocked > 0 then
    raise exception 'Supervision has % pieces of evidence against it; publish a new version instead of editing v1', v_blocked;
  end if;

  -- The master template.
  select x.ord - 1 into i
    from public.form_templates t,
         jsonb_array_elements(t.schema->'sections'->0->'fields') with ordinality x(elem, ord)
   where t.key = 'supervision' and x.elem->>'key' = 'start_time';

  if i is null then
    raise exception 'start_time is not in the first section of the supervision template';
  end if;

  select t.schema->'sections'->0->'fields' into v_fields
    from public.form_templates t where t.key = 'supervision';

  update public.form_templates
     set schema = jsonb_set(schema, array['sections','0','fields'],
           jsonb_set(v_fields, array[i::text], (v_fields->i) || v_when)),
         updated_at = now()
   where key = 'supervision';

  -- Every company copy.
  for r in
    select fv.id, fv.schema
      from public.form_versions fv
      join public.forms f on f.id = fv.form_id
     where f.key = 'supervision'
  loop
    select x.ord - 1 into i
      from jsonb_array_elements(r.schema->'sections'->0->'fields') with ordinality x(elem, ord)
     where x.elem->>'key' = 'start_time';

    if i is null then
      raise exception 'start_time is not in the first section of supervision version %', r.id;
    end if;

    v_fields := r.schema->'sections'->0->'fields';

    update public.form_versions
       set schema = jsonb_set(schema, array['sections','0','fields'],
             jsonb_set(v_fields, array[i::text], (v_fields->i) || v_when))
     where id = r.id;
  end loop;
end $$;
