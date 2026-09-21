-- 0308_a_failed_spot_check_is_due_again_in_a_week
--
-- Phil, 2026-09-19: "If a spot check is failed a new one should be done within 7 days." A failed
-- spot check still counts as done, but the next one is due 7 days after it rather than 28.
--
-- The rule lives on the question ("Has the carer passed the spot check?"), as retestWithin
-- (lib/forms/retest.ts), so it is part of the form for every company and every future company.
-- Only a behaviour property is added: no question, option or wording changes, so versions already
-- used by Evidence are updated in place.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

create or replace function pg_temp.with_retest(p jsonb) returns jsonb language sql immutable as $$
  select case when p is null then null else jsonb_set(p, '{sections}', (
    select jsonb_agg(
      jsonb_set(sec, '{fields}', coalesce((
        select jsonb_agg(
          case when fld->>'key' = 'passed' and fld->>'label' ilike '%spot check%'
            then fld || jsonb_build_object('retestWithin', jsonb_build_object('when', jsonb_build_array('fail'), 'days', 7))
            else fld end
          order by fo)
        from jsonb_array_elements(sec->'fields') with ordinality as ff(fld, fo)
      ), '[]'::jsonb))
      order by so)
    from jsonb_array_elements(p->'sections') with ordinality as ss(sec, so))) end
$$;

update public.form_templates set schema = pg_temp.with_retest(schema), updated_at = now() where key = 'spot_check';
update public.form_versions v set schema = pg_temp.with_retest(v.schema)
  from public.forms f where f.id = v.form_id and f.key = 'spot_check';
update public.forms set library_schema = pg_temp.with_retest(library_schema)
  where key = 'spot_check' and library_schema is not null;
