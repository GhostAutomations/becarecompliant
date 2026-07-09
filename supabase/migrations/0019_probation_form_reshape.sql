-- 0019_probation_form_reshape
-- Reshape the Probation review form (Phil, 2026-07-09):
--   1. Remove "Probation end due" (it is set from the start date at record creation
--      and must not be overwritten by a form).
--   2. Outcome moves to the top (it drives everything below it).
--   3. "Probation end actual" only shows when the Outcome is Passed.
--   4. "Extension date" only shows when the Outcome is Extended (fills the
--      Probation Extension register column).
-- Updates the master template + every company version.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

update public.form_templates set schema = $sch$
{
  "schemaVersion": 1,
  "sections": [
    {
      "id": "probation",
      "title": "Probation review",
      "fields": [
        { "key": "outcome", "type": "single_select", "label": "Outcome", "required": true,
          "options": [
            { "value": "passed", "label": "Passed" },
            { "value": "failed", "label": "Failed" },
            { "value": "extended", "label": "Extended" },
            { "value": "due", "label": "Due" }
          ] },
        { "key": "probation_end_actual", "type": "date", "label": "Probation end actual",
          "visibleWhen": { "field": "outcome", "in": ["passed"] } },
        { "key": "probation_extension_date", "type": "date", "label": "Extension date",
          "visibleWhen": { "field": "outcome", "in": ["extended"] } },
        { "key": "comments", "type": "long_text", "label": "Comments" },
        { "key": "manager_signature", "type": "signature", "label": "Manager signature" }
      ]
    }
  ]
}
$sch$::jsonb
where key = 'probation_review';

update public.form_versions fv
set schema = ft.schema
from public.form_templates ft
join public.forms f on f.key = ft.key
where fv.form_id = f.id and ft.key = 'probation_review';
