-- 0434_absence_meeting_form_everywhere
-- Phil, 2026-10-08 (popup: "Yes, Demo and the template"): the absence meeting form Thistle and
-- Bevan have (Dismissal outcome, last day of employment, notice, NFA reason, who hears an appeal,
-- days to appeal, warning required for a formal warning, Improvement targets removed; 0421, 0422,
-- 0425, 0428) goes to every other company and to the template new companies start from. Thistle's
-- schema is the source: it holds no company specific names. Edited in place (default forms stay at
-- v1); a form that already has the NFA reason is left alone, so a re-run does nothing.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

with src as (
  select fv.schema
  from public.forms f
  join public.form_versions fv on fv.form_id = f.id and fv.version = f.current_version
  where f.key = 'absence_management_meeting'
    and f.company_id = 'eae26e83-1e41-472b-abc0-e2b39b907e49'
)
update public.form_versions fv
set schema = (select schema from src)
from public.forms f
where f.id = fv.form_id
  and f.key = 'absence_management_meeting'
  and (select schema from src) is not null
  and not (fv.schema @? '$.sections[*].fields[*] ? (@.key == "nfa_reason")');

with src as (
  select fv.schema
  from public.forms f
  join public.form_versions fv on fv.form_id = f.id and fv.version = f.current_version
  where f.key = 'absence_management_meeting'
    and f.company_id = 'eae26e83-1e41-472b-abc0-e2b39b907e49'
)
update public.form_templates
set schema = (select schema from src), version = version + 1, updated_at = now()
where key = 'absence_management_meeting'
  and (select schema from src) is not null
  and not (schema @? '$.sections[*].fields[*] ? (@.key == "nfa_reason")');
