-- 0297_an_audit_percentage_can_pass_one_hundred
--
-- Phil, 2026-09-18: "on the audit form, anything that requires a percent can accept up to
-- one hundred and twenty five percent."
--
-- Average call duration is the percentage of the ALLOCATED time actually spent in the call,
-- and a carer who stays longer than the allocation puts it over 100. 102, 103, 105 are
-- ordinary numbers on a real audit. The field was capped at 100, so the browser refused the
-- true figure -- "Value must be less than or equal to 100" -- and the only ways past it were
-- to round the answer down or abandon the audit. A validation rule that makes an auditor
-- write something other than what happened is worse than no rule.
--
-- Both percentage fields on the Audit take 125 now: calls attended as well as average call
-- duration, matched on the _pct key so a percentage added later inherits it. The minutes
-- fields are untouched -- they are not percentages and 60 is not in anybody's way.
--
-- Applied to the form_versions of EVERY company, and to the form_templates master so a
-- company set up tomorrow starts with it. No stored Evidence changes; a widened ceiling
-- cannot invalidate an answer already given.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

do $$
declare
  r record;
  new_schema jsonb;
begin
  for r in
    select v.id, v.schema, true as is_version
    from form_versions v join forms f on f.id = v.form_id
    where f.key = 'audit'
    union all
    select t.id, t.schema, false
    from form_templates t
    where t.key = 'audit'
  loop
    new_schema := jsonb_set(r.schema, '{sections}', (
      select jsonb_agg(
        jsonb_set(sec, '{fields}', coalesce((
          select jsonb_agg(
            case
              when fld->>'key' like '%\_pct'
              then fld || jsonb_build_object(
                     'validation',
                     coalesce(fld->'validation', '{}'::jsonb) || '{"max": 125}'::jsonb)
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
