-- 0245_a_telephone_review_can_be_emailed_over
-- Phil, 2026-09-08: "if they select conducted over telephone, add a 'would you like to
-- email a copy to the team member', if they tick yes, when complete and save is clicked,
-- email over a copy."
--
-- A face to face review ends with the care worker signing the form in front of the
-- manager, so they have seen it. A review done over the phone ends with neither: the form
-- exists, and the person it is about has no idea what it says. Emailing the record over is
-- how the telephone version gets the same standing as the face to face one.
--
-- Asked only when the meeting was by telephone, and only then, because after a face to
-- face meeting they have already signed it.
--
-- The sending itself is in lib/people/actions.ts: on Complete and save, the same Evidence
-- PDF the Reports section produces is rendered and attached to an email to the address on
-- the person's record. A key called email_copy triggers it, not the form's name, so any
-- form that asks the question behaves the same way without a special case per form.
--
-- Inserted after the meeting question, in the master template and both company copies.
-- Guarded on there being no Probation Review evidence anywhere, as 0242 and 0244 were.
-- Applied to the becarecompliant project ONLY (ref bgrtcvyjuwopunpnudeu).

do $$
declare
  r record;
  si int;
  fi int;
  v_blocked int;
  v_touched int := 0;
  v_ask jsonb := '{"key": "email_copy", "type": "single_select", "label": "Email a copy of this review to the team member?", "required": true, "options": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}], "visibleWhen": {"field": "meeting_mode", "in": ["telephone"]}, "help": "Sent to the email address on their record when this form is saved."}'::jsonb;
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

  select s.ord - 1, fl.ord - 1
    into si, fi
    from public.form_templates t,
         jsonb_array_elements(t.schema->'sections') with ordinality s(sec, ord),
         jsonb_array_elements(s.sec->'fields') with ordinality fl(fld, ord)
   where t.key = 'probation_review'
     and fl.fld->>'key' = 'meeting_mode';

  if si is null then
    raise exception 'meeting_mode is not in the probation_review template';
  end if;

  select t.schema->'sections'->si->'fields' into v_fields
    from public.form_templates t where t.key = 'probation_review';

  if not exists (select 1 from jsonb_array_elements(v_fields) e where e->>'key' = 'email_copy') then
    select jsonb_agg(elem order by pos) into v_fields
      from (
        select elem, ord::numeric as pos
          from jsonb_array_elements(v_fields) with ordinality x(elem, ord)
        union all
        select v_ask, (fi + 1)::numeric + 0.5
      ) ordered;

    update public.form_templates
       set schema = jsonb_set(schema, array['sections', si::text, 'fields'], v_fields),
           updated_at = now()
     where key = 'probation_review';
  end if;

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
     where fl.fld->>'key' = 'meeting_mode';

    if si is null then
      raise exception 'meeting_mode is not in probation review version %', r.id;
    end if;

    v_fields := r.schema->'sections'->si->'fields';

    if exists (select 1 from jsonb_array_elements(v_fields) e where e->>'key' = 'email_copy') then
      continue;
    end if;

    select jsonb_agg(elem order by pos) into v_fields
      from (
        select elem, ord::numeric as pos
          from jsonb_array_elements(v_fields) with ordinality x(elem, ord)
        union all
        select v_ask, (fi + 1)::numeric + 0.5
      ) ordered;

    update public.form_versions
       set schema = jsonb_set(schema, array['sections', si::text, 'fields'], v_fields)
     where id = r.id;

    v_touched := v_touched + 1;
  end loop;

  raise notice 'email_copy added to the template and % company copies', v_touched;
end $$;
