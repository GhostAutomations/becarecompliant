-- 0241_supervision_required_restored
-- Phil, 2026-09-08: "put back to mandatory". Undoes 0240, which relaxed Thistle's
-- Supervision so the form could be submitted without filling in forty eight questions.
--
-- Mechanical, not remembered: every field carrying the requiredWas marker 0240 left
-- behind becomes required again and the marker is dropped. The count is asserted at 31,
-- the number 0240 relaxed, so this fails loudly rather than quietly restoring the wrong
-- set. Nothing else in the schema is touched.
--
-- WHY THERE IS NO "REFUSE IF EVIDENCE EXISTS" GUARD HERE, unlike 0237 to 0240. Three
-- supervisions WERE completed against the relaxed form while the test ran, and that guard
-- would now block this migration forever. It does not apply, because evidence does not
-- merely point at a version: every evidence row froze its own schema_snapshot at the
-- moment it was submitted (checked: all three carry 31 requiredWas fields and none
-- required). Those three records still render as the form that was actually filled in,
-- and nothing anybody signed is rewritten. Only future completions see the flags return,
-- which is precisely what putting them back means.
--
-- Bevan's copy and the master template were never relaxed and are not touched.
-- Applied to the becarecompliant project ONLY (ref bgrtcvyjuwopunpnudeu).

do $$
declare
  v_marked int;
  v_required int;
begin
  select count(*) into v_marked
    from public.form_versions fv
    join public.forms f on f.id = fv.form_id
    join public.companies c on c.id = f.company_id,
         jsonb_array_elements(fv.schema->'sections') s(sec),
         jsonb_array_elements(s.sec->'fields') x(fld)
   where f.key = 'supervision' and c.name = 'Thistle Care Ltd'
     and (x.fld->>'requiredWas')::boolean is true;

  if v_marked <> 31 then
    raise exception 'Expected 31 fields marked requiredWas, found %; refusing to guess which were mandatory', v_marked;
  end if;

  update public.form_versions fv
     set schema = jsonb_set(fv.schema, array['sections'], (
           select jsonb_agg(
                    jsonb_set(s.sec, array['fields'], (
                      select jsonb_agg(
                               case when (x.fld->>'requiredWas')::boolean is true
                                    then (x.fld - 'requiredWas') || '{"required": true}'::jsonb
                                    else x.fld end
                               order by x.ord)
                        from jsonb_array_elements(s.sec->'fields') with ordinality x(fld, ord)
                    ))
                    order by s.ord)
             from jsonb_array_elements(fv.schema->'sections') with ordinality s(sec, ord)
         ))
    from public.forms f
    join public.companies c on c.id = f.company_id
   where f.id = fv.form_id
     and f.key = 'supervision'
     and c.name = 'Thistle Care Ltd'
     and fv.version = 1;

  select count(*) filter (where (x.fld->>'required')::boolean),
         count(*) filter (where (x.fld->>'requiredWas')::boolean)
    into v_required, v_marked
    from public.form_versions fv
    join public.forms f on f.id = fv.form_id
    join public.companies c on c.id = f.company_id,
         jsonb_array_elements(fv.schema->'sections') s(sec),
         jsonb_array_elements(s.sec->'fields') x(fld)
   where f.key = 'supervision' and c.name = 'Thistle Care Ltd';

  if v_required <> 31 or v_marked <> 0 then
    raise exception 'Restore left % required and % still marked; expected 31 and 0', v_required, v_marked;
  end if;

  raise notice 'Supervision required flags restored: % fields', v_required;
end $$;
