-- 0428 — a dismissal on the absence meeting form (Phil, 2026-10-08, after the four stage test).
--
-- "Outcome of the meeting" gains "Dismissal" (after "Formal warning issued"). Choosing it asks two
-- questions, both required, shown only for a dismissal:
--   last_day_of_employment  "Last day of employment" (a date)
--   dismissal_notice        "Notice": Worked notice, or Paid in lieu of notice
-- Both go into the outcome letter. Warning or dismissal is set to Dismissal by the save.
--
-- Thistle and Bevan, edited in place at their current version, like 0421 (default forms stay at v1
-- while they are being built). Safe to run twice: a version that already asks dismissal_notice is
-- left alone. Evidence already recorded keeps its own schema_snapshot, so nothing filed changes.

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
                          select case
                                   when f->>'key' = 'meeting_outcome' then jsonb_set(
                                     f,
                                     '{options}',
                                     (
                                       select jsonb_agg(op order by oo)
                                         from (
                                           select op, oo * 10 as oo
                                             from jsonb_array_elements(f->'options') with ordinality t2(op, oo)
                                           union all
                                           select '{"label": "Dismissal", "value": "Dismissal"}'::jsonb,
                                                  coalesce((select oo * 10 + 1 from jsonb_array_elements(f->'options') with ordinality t3(op, oo) where op->>'value' = 'Formal warning issued'), 9999)
                                         ) y
                                     )
                                   )
                                   else f
                                 end as f,
                                 o * 10 as ord
                            from jsonb_array_elements(sec->'fields') with ordinality t(f, o)
                          union all
                          select '{"key": "last_day_of_employment", "type": "date", "label": "Last day of employment", "required": true, "description": "Named in the outcome letter, and set as the leaving date when you make them a leaver.", "visibleWhen": {"field": "meeting_outcome", "in": ["Dismissal"]}}'::jsonb,
                                 coalesce((select o * 10 + 1 from jsonb_array_elements(sec->'fields') with ordinality t(f, o) where f->>'key' = 'warning_live_until'), 9997)
                          union all
                          select '{"key": "dismissal_notice", "type": "single_select", "label": "Notice", "required": true, "description": "Named in the outcome letter.", "options": [{"value": "Worked notice", "label": "Worked notice"}, {"value": "Paid in lieu of notice", "label": "Paid in lieu of notice"}], "visibleWhen": {"field": "meeting_outcome", "in": ["Dismissal"]}}'::jsonb,
                                 coalesce((select o * 10 + 2 from jsonb_array_elements(sec->'fields') with ordinality t(f, o) where f->>'key' = 'warning_live_until'), 9998)
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
      where f2->>'key' = 'dismissal_notice'
   );
