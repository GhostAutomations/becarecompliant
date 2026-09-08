-- 0238_the_start_time_comes_after_it_happened
-- Phil, 2026-09-08: "put time took place below did the supervision take place".
--
-- 0237 kept the paper form's order, which asked what time the supervision started before
-- asking whether it started at all. Moving the start time BELOW the gate also makes it
-- one of the questions the gate stands down: a supervision that did not happen has no
-- start time, so the box greys out and stores nothing instead of inviting a made up one.
--
-- Section one now reads: date, which supervision, did it take place, why not, start time.
-- The reason stays directly under the gate that raises it.
--
-- Reordered in place rather than rewritten, so nothing but the order can change. Applied
-- to the master template and every company copy, and it refuses if any Supervision
-- evidence exists, for the same reason as 0237.
-- Applied to the becarecompliant project ONLY (ref bgrtcvyjuwopunpnudeu).

do $$
declare
  r record;
  v_blocked int;
  v_fields jsonb;
begin
  select count(*) into v_blocked
    from public.evidence e
    join public.form_versions fv on fv.id = e.form_version_id
    join public.forms f on f.id = fv.form_id
   where f.key = 'supervision';

  if v_blocked > 0 then
    raise exception 'Supervision has % pieces of evidence against it; publish a new version instead of reordering v1', v_blocked;
  end if;

  -- The master template.
  select jsonb_agg(elem order by pos) into v_fields
    from (
      select elem,
             case elem->>'key'
               when 'supervision_date' then 1
               when 'supervision_type' then 2
               when 'took_place' then 3
               when 'not_held_reason' then 4
               when 'start_time' then 5
               else 99
             end as pos
        from public.form_templates t,
             jsonb_array_elements(t.schema->'sections'->0->'fields') x(elem)
       where t.key = 'supervision'
    ) ordered;

  if v_fields is null or jsonb_array_length(v_fields) <> 5 then
    raise exception 'The supervision template first section is not the five fields this migration expects';
  end if;

  update public.form_templates
     set schema = jsonb_set(schema, array['sections','0','fields'], v_fields),
         updated_at = now()
   where key = 'supervision';

  -- Every company copy.
  for r in
    select fv.id, fv.schema
      from public.form_versions fv
      join public.forms f on f.id = fv.form_id
     where f.key = 'supervision'
  loop
    select jsonb_agg(elem order by pos) into v_fields
      from (
        select elem,
               case elem->>'key'
                 when 'supervision_date' then 1
                 when 'supervision_type' then 2
                 when 'took_place' then 3
                 when 'not_held_reason' then 4
                 when 'start_time' then 5
                 else 99
               end as pos
          from jsonb_array_elements(r.schema->'sections'->0->'fields') x(elem)
      ) ordered;

    update public.form_versions
       set schema = jsonb_set(schema, array['sections','0','fields'], v_fields)
     where id = r.id;
  end loop;
end $$;
