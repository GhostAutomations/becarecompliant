-- 0422 — absence meeting form, Outcome section (Phil, 2026-10-07):
--   * "Warning or dismissal" is required when the outcome is "Formal warning issued"
--     (requiredWhen, new in the form engine: lib/form-validate.ts isFieldRequired).
--   * "Improvement targets set" is removed ("i want it deleted").
-- Thistle and Bevan, at their current version, edited in place (default forms stay at v1 while
-- they are being built). Safe to run twice. Evidence already recorded keeps its schema_snapshot,
-- so a meeting filed with improvement targets still shows them.

update public.form_versions fv
   set schema = jsonb_set(
     fv.schema,
     '{sections}',
     (
       select jsonb_agg(
                case
                  when sec->>'title' = 'Outcome' then jsonb_set(
                    sec,
                    '{fields}',
                    coalesce((
                      select jsonb_agg(
                               case
                                 when f->>'key' = 'warning_issued'
                                   then f || '{"requiredWhen": {"field": "meeting_outcome", "in": ["Formal warning issued"]}}'::jsonb
                                 else f
                               end
                               order by o
                             )
                        from jsonb_array_elements(sec->'fields') with ordinality t(f, o)
                       where f->>'key' <> 'improvement_targets'
                    ), '[]'::jsonb)
                  )
                  else sec
                end
                order by so
              )
         from jsonb_array_elements(fv.schema->'sections') with ordinality q(sec, so)
     )
   )
  from public.forms f
 where fv.form_id = f.id
   and fv.version = f.current_version
   and f.key = 'absence_management_meeting'
   and f.company_id in ('eae26e83-1e41-472b-abc0-e2b39b907e49', '84172279-54e4-4d5b-94b4-c92dc05c6baa');
