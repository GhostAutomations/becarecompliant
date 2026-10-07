-- 0425 — a reason for No further action (Phil, 2026-10-08).
--
-- On the absence meeting form, choosing "No further action" as the outcome opens a required box
-- underneath: "Reason for no further action". Hidden (and so never required, never stored) for any
-- other outcome. The AI writes the outcome letter from it too.
-- Thistle and Bevan, current version, edited in place. Safe to run twice.

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
                          select '{"key": "nfa_reason", "type": "long_text", "label": "Reason for no further action", "required": true, "description": "Why no further action was taken. This is kept with the meeting and used in the outcome letter.", "visibleWhen": {"field": "meeting_outcome", "in": ["No further action"]}}'::jsonb,
                                 coalesce((select o * 10 + 1 from jsonb_array_elements(sec->'fields') with ordinality t(f, o) where f->>'key' = 'meeting_outcome'), 9999)
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
      where f2->>'key' = 'nfa_reason'
   );
