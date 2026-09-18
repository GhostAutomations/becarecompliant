-- 0300_the_right_to_work_form_asks_about_limits
--
-- Phil, 2026-09-18: "right to work, move the limits drop down to the form that appears when
-- you click complete."
--
-- Limits was a dropdown and a Save button sitting on the Right to Work TILE, edited in place,
-- separately from the check it belongs to. Two consequences, and the second is the one that
-- matters: the tile carried a control nothing else on the record had, and a limit could be
-- changed without any Evidence saying who changed it or why. It is a fact established by the
-- right to work check, so it is asked by the right to work FORM, and the answer stamps the
-- record the same way the expiry date already does (TRACKER_FORMS.statusFrom).
--
-- Placed straight after the expiry date, which is the question it qualifies. Idempotent: a
-- schema that already asks it is left alone. Applied to every company's published version and
-- to the form_templates master.
--
-- Nothing already recorded changes: rtw_limits keeps whatever it holds until the next check
-- is completed, and the tile shows it as before -- read only now, like every other date on it.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

do $mig$
declare
  r record;
  v_field jsonb := $j$
  {
    "key": "limits",
    "type": "single_select",
    "label": "Limits on the right to work",
    "options": [
      { "value": "none", "label": "None" },
      { "value": "20hrs_term", "label": "20hrs Term" },
      { "value": "20hrs_2nd_job", "label": "20hrs 2nd Job" },
      { "value": "visa_expires", "label": "Visa Expires" }
    ],
    "help": "Any restriction on the hours they may work, or a permission that runs out."
  }
  $j$::jsonb;
  new_schema jsonb;
begin
  for r in
    select v.id, v.schema, true as is_version
    from form_versions v join forms f on f.id = v.form_id
    where f.key = 'right_to_work'
    union all
    select t.id, t.schema, false
    from form_templates t
    where t.key = 'right_to_work'
  loop
    if exists (
      select 1 from jsonb_array_elements(r.schema->'sections') sec,
                     jsonb_array_elements(sec->'fields') fld
      where fld->>'key' = 'limits'
    ) then
      continue;
    end if;

    new_schema := jsonb_set(r.schema, '{sections}', (
      select jsonb_agg(
        jsonb_set(sec, '{fields}', coalesce((
          select jsonb_agg(fld order by fo)
          from (
            select fld, fo from jsonb_array_elements(sec->'fields') with ordinality as ff(fld, fo)
            union all
            select v_field, (
              select fo2 + 0.5 from jsonb_array_elements(sec->'fields') with ordinality as gg(f2, fo2)
              where f2->>'key' = 'rtw_expiry'
            )
            where exists (
              select 1 from jsonb_array_elements(sec->'fields') as g2
              where g2->>'key' = 'rtw_expiry'
            )
          ) ordered
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
end
$mig$;
