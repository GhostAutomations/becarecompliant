-- 0293_the_review_asks_which_review_number_it_is
--
-- Phil, 2026-09-17: "On the SU review form type of review is not required, it should say review
-- number and be pre filled."
--
-- The field is called type_of_review and was labelled "Type of Review", optional, and left blank
-- on every review. The completion page meant to hide it entirely -- removeField(schema,
-- "review_number") -- and that call has never once fired, because no field of that name exists.
-- So the question nobody was supposed to see has been asked on every review since, and answered
-- on none.
--
-- It is now "Review number", required, and filled in by the page from the record card. Shown
-- rather than hidden, unlike the supervision equivalent: Setup sits in the same list, so there is
-- a real answer that is not simply the next number, and the reviewer at the door should see what
-- is about to be recorded and be able to correct it.
--
-- Zero Evidence exists against this form, so no stored answer is relabelled underneath anybody.
--
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

do $$
declare
  r record;
  new_schema jsonb;
begin
  for r in
    select v.id, v.schema, true as is_version
    from form_versions v join forms f on f.id = v.form_id
    where f.key = 'care_plan_review'
    union all
    select t.id, t.schema, false
    from form_templates t
    where t.key = 'care_plan_review'
  loop
    new_schema := jsonb_set(r.schema, '{sections}', (
      select jsonb_agg(
        jsonb_set(sec, '{fields}', coalesce((
          select jsonb_agg(
            case
              when fld->>'key' = 'type_of_review'
              then fld || '{"label": "Review number", "required": true}'::jsonb
              else fld
            end
            order by fo
          )
          from jsonb_array_elements(sec->'fields') with ordinality as ff(fld, fo)
        ), '[]'::jsonb))
        order by so
      )
      from jsonb_array_elements(r.schema->'sections') with ordinality as ss(sec, so)
    ));
    if r.is_version then
      update form_versions set schema = new_schema where id = r.id;
    else
      update form_templates set schema = new_schema, updated_at = now() where id = r.id;
    end if;
  end loop;
end $$;
