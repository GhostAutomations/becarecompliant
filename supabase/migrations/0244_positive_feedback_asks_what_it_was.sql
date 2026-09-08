-- 0244_positive_feedback_asks_what_it_was
-- Phil, 2026-09-08: "Has the employee received any positive feedback from either
-- management, colleagues or clients? if yes ask for details".
--
-- A bare Yes is not evidence of anything. Somebody reading the record in a year, or an
-- inspector reading it next week, learns only that a box was ticked; the detail is the
-- part worth keeping, and it is worth capturing while the manager still remembers who
-- said it. Asked only on Yes, and required when it is asked, so a No costs nothing.
--
-- Inserted directly after the question it belongs to, in the master template and both
-- company copies, so companies onboarding later get it too. Guarded on there being no
-- Probation Review evidence anywhere, as 0242 was.
-- Applied to the becarecompliant project ONLY (ref bgrtcvyjuwopunpnudeu).

do $$
declare
  r record;
  si int;
  fi int;
  v_blocked int;
  v_touched int := 0;
  v_detail jsonb := '{"key": "positive_feedback_detail", "type": "long_text", "label": "What was the feedback, and who gave it?", "required": true, "validation": {"maxLength": 2000}, "visibleWhen": {"field": "positive_feedback", "in": ["yes"]}}'::jsonb;
  v_fields jsonb;
begin
  select count(*) into v_blocked
    from public.evidence e
    join public.form_versions fv on fv.id = e.form_version_id
    join public.forms f on f.id = fv.form_id
   where f.key = 'probation_review';

  if v_blocked > 0 then
    raise exception 'Probation Review has % pieces of evidence against it; publish a new version instead of editing v1', v_blocked;
  end if;

  -- The master template.
  select s.ord - 1, fl.ord - 1
    into si, fi
    from public.form_templates t,
         jsonb_array_elements(t.schema->'sections') with ordinality s(sec, ord),
         jsonb_array_elements(s.sec->'fields') with ordinality fl(fld, ord)
   where t.key = 'probation_review'
     and fl.fld->>'key' = 'positive_feedback';

  if si is null then
    raise exception 'positive_feedback is not in the probation_review template';
  end if;

  select t.schema->'sections'->si->'fields' into v_fields
    from public.form_templates t where t.key = 'probation_review';

  if not exists (select 1 from jsonb_array_elements(v_fields) e where e->>'key' = 'positive_feedback_detail') then
    select jsonb_agg(elem order by pos) into v_fields
      from (
        select elem, ord::numeric as pos
          from jsonb_array_elements(v_fields) with ordinality x(elem, ord)
        union all
        select v_detail, (fi + 1)::numeric + 0.5
      ) ordered;

    update public.form_templates
       set schema = jsonb_set(schema, array['sections', si::text, 'fields'], v_fields),
           updated_at = now()
     where key = 'probation_review';
  end if;

  -- Every company copy.
  for r in
    select fv.id, fv.schema
      from public.form_versions fv
      join public.forms f on f.id = fv.form_id
     where f.key = 'probation_review'
  loop
    select s.ord - 1, fl.ord - 1
      into si, fi
      from jsonb_array_elements(r.schema->'sections') with ordinality s(sec, ord),
           jsonb_array_elements(s.sec->'fields') with ordinality fl(fld, ord)
     where fl.fld->>'key' = 'positive_feedback';

    if si is null then
      raise exception 'positive_feedback is not in probation review version %', r.id;
    end if;

    v_fields := r.schema->'sections'->si->'fields';

    if exists (select 1 from jsonb_array_elements(v_fields) e where e->>'key' = 'positive_feedback_detail') then
      continue;
    end if;

    select jsonb_agg(elem order by pos) into v_fields
      from (
        select elem, ord::numeric as pos
          from jsonb_array_elements(v_fields) with ordinality x(elem, ord)
        union all
        select v_detail, (fi + 1)::numeric + 0.5
      ) ordered;

    update public.form_versions
       set schema = jsonb_set(schema, array['sections', si::text, 'fields'], v_fields)
     where id = r.id;

    v_touched := v_touched + 1;
  end loop;

  raise notice 'feedback detail added to the template and % company copies', v_touched;
end $$;
