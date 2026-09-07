-- 0234_a_spot_check_that_could_not_happen_asks_nothing_else
-- Phil, 2026-09-07: "for 'Was the spot check able to be completed?' if they select no,
-- all other questions below it inc Service User should grey out so they can submit the
-- form but not need to enter something in all mandatory fields."
--
-- A spot check that did not happen has no arrival, no medication, no observations and
-- no Service User. Forty required questions with no answers is how a compliance record
-- fills up with invented ones, so the No answer stands the rest of the form down: every
-- question after it greys out, stops being required, and stores nothing. The Evidence
-- then records that those questions were never asked, rather than answered blank.
--
-- The rule is ONE property on the ONE question that decides it -- standsDown on
-- able_to_complete -- not a flag repeated on each of the thirty six questions it
-- silences. A question added to this form next year is covered without anyone
-- remembering to mark it. The rule itself is lib/forms/stand-down.ts.
--
-- Applied to the master template as well as every company copy, so companies that come
-- on board later get it too, not only Thistle and Bevan.
--
-- Edited IN PLACE at the version each company holds, not published as a new version,
-- because no Spot Check evidence exists anywhere -- the guard below enforces that
-- rather than trusting this note. The moment any existed this would have to publish a
-- new version, because evidence points at the version it was completed on.
-- Applied to the becarecompliant project ONLY (ref bgrtcvyjuwopunpnudeu).

do $$
declare
  r record;
  si int;
  fi int;
  v_blocked int;
  v_touched int := 0;
begin
  select count(*) into v_blocked
    from public.evidence e
    join public.form_versions fv on fv.id = e.form_version_id
    join public.forms f on f.id = fv.form_id
   where f.key = 'spot_check';

  if v_blocked > 0 then
    raise exception 'Spot Check has % pieces of evidence against it; publish a new version instead of editing it in place', v_blocked;
  end if;

  -- 1. The master template: every company seeded from here on gets the gate.
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

  update public.form_templates
     set schema = jsonb_set(
           schema,
           array['sections', si::text, 'fields', fi::text],
           (schema->'sections'->si->'fields'->fi) || '{"standsDown": {"when": ["no"]}}'::jsonb),
         updated_at = now()
   where key = 'spot_check';

  -- 2. Every company copy. Every version, not just v1: the guard above has already
  --    proved none of them carries evidence.
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

    update public.form_versions
       set schema = jsonb_set(
             schema,
             array['sections', si::text, 'fields', fi::text],
             (schema->'sections'->si->'fields'->fi) || '{"standsDown": {"when": ["no"]}}'::jsonb)
     where id = r.id;

    v_touched := v_touched + 1;
  end loop;

  raise notice 'standsDown added to the template and % company copies', v_touched;
end $$;
