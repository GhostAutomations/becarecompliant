-- 0421 — who hears an appeal and the days allowed, on the absence meeting form (Phil, 2026-10-07).
--
-- Two fields in the Outcome section, after the review date:
--   appeal_heard_by  "Appeal to be heard by": a drop down of the company's Managers and Admins on
--                    screen (stored as the name, like Manager conducting).
--   appeal_days      "Working days to appeal": 5, 7, 10 or 14, seven unless changed.
-- Both are named in the outcome letter ({{appeal_manager}}, {{appeal_days}}).
--
-- Thistle and Bevan, edited in place at their current version (default forms stay at v1 while
-- they are being built). Safe to run twice: a version that already has appeal_days is left alone.
-- Evidence already recorded keeps its own schema_snapshot, so nothing filed changes.

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
                    (
                      select jsonb_agg(x.f order by x.ord)
                        from (
                          select f, o * 10 as ord
                            from jsonb_array_elements(sec->'fields') with ordinality t(f, o)
                          union all
                          select '{"key": "appeal_heard_by", "type": "short_text", "label": "Appeal to be heard by", "description": "Someone who was not involved in this meeting. Named in the outcome letter."}'::jsonb,
                                 coalesce((select o * 10 + 1 from jsonb_array_elements(sec->'fields') with ordinality t(f, o) where f->>'key' = 'review_date'), 9998)
                          union all
                          select '{"key": "appeal_days", "type": "single_select", "label": "Working days to appeal", "description": "Named in the outcome letter.", "options": [{"value": "5", "label": "5"}, {"value": "7", "label": "7"}, {"value": "10", "label": "10"}, {"value": "14", "label": "14"}]}'::jsonb,
                                 coalesce((select o * 10 + 2 from jsonb_array_elements(sec->'fields') with ordinality t(f, o) where f->>'key' = 'review_date'), 9999)
                        ) x
                    )
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
   and f.company_id in ('eae26e83-1e41-472b-abc0-e2b39b907e49', '84172279-54e4-4d5b-94b4-c92dc05c6baa')
   and not exists (
     select 1
       from jsonb_array_elements(fv.schema->'sections') s2, jsonb_array_elements(s2->'fields') f2
      where f2->>'key' = 'appeal_days'
   );
