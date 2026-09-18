-- 0292_a_completion_asks_the_date_it_was_completed
--
-- Phil, 2026-09-17: "For supervisions, appraisals, reviews and probations, ask for date of
-- completion", and "that is the date that should go into the matrix".
--
-- Three of the four already asked and were already right, by luck of ordering: the completion
-- date is taken from the form's FIRST date question, and on Supervision, Annual Appraisal and
-- Probation Review that happens to be the date of the thing. They are marked here so it stops
-- being luck. Order is a rule about layout; somebody moving a question is not making a claim
-- about what the register should show.
--
-- The fourth was wrong. The Individual Plan Review's only date question is "Date of Last Review"
-- -- the PREVIOUS one -- so a completed review was stamped with the date of the review before it,
-- in the Done column and in the next due date worked out from it. It now asks "Date of review"
-- and that is the marked one.
--
-- Zero Evidence exists against any of the four, so nothing already filed is re-dated by this.
--
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

do $$
declare
  r record;
  new_schema jsonb;
  review_field jsonb := '{"key":"review_date","type":"date","label":"Date of review","required":true,"completionDate":true,"help":"The day this review was carried out. This is the date the register shows."}'::jsonb;
begin
  -- 1. Mark the date that already means "when it happened".
  for r in
    select v.id, v.schema, f.key
    from form_versions v
    join forms f on f.id = v.form_id
    where f.key in ('supervision', 'annual_appraisal_acme', 'probation_review')
    union all
    select t.id, t.schema, t.key
    from form_templates t
    where t.key in ('supervision', 'annual_appraisal_acme', 'probation_review')
  loop
    new_schema := jsonb_set(r.schema, '{sections}', (
      select jsonb_agg(
        jsonb_set(sec, '{fields}', coalesce((
          select jsonb_agg(
            case
              when (fld->>'type') = 'date'
               and (fld->>'key') in ('supervision_date', 'appraisal_date', 'review_date')
              then fld || '{"completionDate": true}'::jsonb
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
    update form_versions set schema = new_schema where id = r.id;
    update form_templates set schema = new_schema, updated_at = now() where id = r.id;
  end loop;

  -- 2. The Individual Plan Review gains a date of its own, first in its first section.
  for r in
    select v.id, v.schema, f.key
    from form_versions v
    join forms f on f.id = v.form_id
    where f.key = 'care_plan_review'
    union all
    select t.id, t.schema, t.key
    from form_templates t
    where t.key = 'care_plan_review'
  loop
    if exists (
      select 1 from jsonb_array_elements(r.schema->'sections') s,
                    jsonb_array_elements(s->'fields') fl
      where fl->>'key' = 'review_date'
    ) then
      continue;
    end if;

    new_schema := jsonb_set(r.schema, '{sections}', (
      select jsonb_agg(
        case
          when so = 1
          then jsonb_set(sec, '{fields}', review_field || coalesce(sec->'fields', '[]'::jsonb))
          else sec
        end
        order by so
      )
      from jsonb_array_elements(r.schema->'sections') with ordinality as ss(sec, so)
    ));
    update form_versions set schema = new_schema where id = r.id;
    update form_templates set schema = new_schema, updated_at = now() where id = r.id;
  end loop;
end $$;
