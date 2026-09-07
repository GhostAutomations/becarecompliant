-- 0235_a_spot_check_that_could_not_happen_says_why
-- Phil, 2026-09-07: "we need a why it couldnt be completed, just a small text box that
-- only shows if no is selected."
--
-- 0234 let a No stand the rest of the form down, which left a record saying only that
-- the spot check did not happen. This adds the one question that makes that record
-- worth keeping, directly under the gate: a free text box that appears only when the
-- answer is No, and is required when it appears.
--
-- It sits BELOW the gate, where it reads correctly, so the gate has to spare it. That
-- is what standsDown.except is for: the questions that exist BECAUSE of the answer that
-- silenced everything else. Every other question after the gate still greys out.
--
-- Applied to the master template as well as every company copy, so companies onboarding
-- later get it too. Edited in place, guarded on there being no Spot Check evidence
-- anywhere, for the same reason as 0233 and 0234.
-- Applied to the becarecompliant project ONLY (ref bgrtcvyjuwopunpnudeu).

do $$
declare
  r record;
  si int;
  fi int;
  v_blocked int;
  v_touched int := 0;
  v_reason jsonb := '{"key": "not_completed_reason", "type": "long_text", "label": "Why could the spot check not be completed?", "required": true, "validation": {"maxLength": 500}, "visibleWhen": {"field": "able_to_complete", "in": ["no"]}}'::jsonb;
  v_gate jsonb := '{"standsDown": {"when": ["no"], "except": ["not_completed_reason"]}}'::jsonb;
  v_fields jsonb;
begin
  select count(*) into v_blocked
    from public.evidence e
    join public.form_versions fv on fv.id = e.form_version_id
    join public.forms f on f.id = fv.form_id
   where f.key = 'spot_check';

  if v_blocked > 0 then
    raise exception 'Spot Check has % pieces of evidence against it; publish a new version instead of editing it in place', v_blocked;
  end if;

  -- 1. The master template.
  select s.ord - 1, fl.ord - 1
    into si, fi
    from public.form_templates t,
         jsonb_array_elements(t.schema->'sections') with ordinality s(sec, ord),
         jsonb_array_elements(s.sec->'fields') with ordinality fl(fld, ord)
   where t.key = 'spot_check'
     and fl.fld->>'key' = 'able_to_complete';

  if si is null then
    raise exception 'able_to_complete is not in the spot_check template; the form changed under this migration';
  end if;

  select t.schema->'sections'->si->'fields' into v_fields
    from public.form_templates t where t.key = 'spot_check';

  if not exists (select 1 from jsonb_array_elements(v_fields) e where e->>'key' = 'not_completed_reason') then
    -- The gate gains its exception, and the reason box is spliced in straight after it.
    v_fields := jsonb_set(v_fields, array[fi::text], (v_fields->fi) || v_gate);
    select jsonb_agg(elem order by pos) into v_fields
      from (
        select elem, ord::numeric as pos
          from jsonb_array_elements(v_fields) with ordinality x(elem, ord)
        union all
        select v_reason, (fi + 1)::numeric + 0.5
      ) ordered;

    update public.form_templates
       set schema = jsonb_set(schema, array['sections', si::text, 'fields'], v_fields),
           updated_at = now()
     where key = 'spot_check';
  end if;

  -- 2. Every company copy.
  for r in
    select fv.id, fv.schema
      from public.form_versions fv
      join public.forms f on f.id = fv.form_id
     where f.key = 'spot_check'
  loop
    select s.ord - 1, fl.ord - 1
      into si, fi
      from jsonb_array_elements(r.schema->'sections') with ordinality s(sec, ord),
           jsonb_array_elements(s.sec->'fields') with ordinality fl(fld, ord)
     where fl.fld->>'key' = 'able_to_complete';

    if si is null then
      raise exception 'able_to_complete is not in spot check version %', r.id;
    end if;

    v_fields := r.schema->'sections'->si->'fields';

    if exists (select 1 from jsonb_array_elements(v_fields) e where e->>'key' = 'not_completed_reason') then
      continue;
    end if;

    v_fields := jsonb_set(v_fields, array[fi::text], (v_fields->fi) || v_gate);
    select jsonb_agg(elem order by pos) into v_fields
      from (
        select elem, ord::numeric as pos
          from jsonb_array_elements(v_fields) with ordinality x(elem, ord)
        union all
        select v_reason, (fi + 1)::numeric + 0.5
      ) ordered;

    update public.form_versions
       set schema = jsonb_set(schema, array['sections', si::text, 'fields'], v_fields)
     where id = r.id;

    v_touched := v_touched + 1;
  end loop;

  raise notice 'reason box added to the template and % company copies', v_touched;
end $$;
