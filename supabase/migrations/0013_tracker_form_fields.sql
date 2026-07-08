-- 0013_tracker_form_fields
-- DBS/RTW/Probation dates are fed by completing a form (Phil, 2026-07-09). Shape the
-- DBS and Probation form fields to the tracker dates they populate. Right to Work
-- already captures rtw_expiry. Updates the master templates + every company version.
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

update public.form_templates set schema = $sch$
{
  "schemaVersion": 1,
  "sections": [
    {
      "id": "dbs",
      "title": "DBS",
      "fields": [
        { "key": "dbs_date", "type": "date", "label": "DBS date", "required": true },
        { "key": "enhanced_dbs_date", "type": "date", "label": "Enhanced DBS date" },
        { "key": "dbs_level", "type": "single_select", "label": "Level",
          "options": [
            { "value": "enhanced_barred", "label": "Enhanced with barred lists" },
            { "value": "enhanced", "label": "Enhanced" },
            { "value": "standard", "label": "Standard" }
          ] },
        { "key": "certificate_number", "type": "short_text", "label": "Certificate number" },
        { "key": "on_update_service", "type": "radio", "label": "On the DBS Update Service",
          "options": [ { "value": "yes", "label": "Yes" }, { "value": "no", "label": "No" } ] },
        { "key": "certificate", "type": "file_upload", "label": "Certificate or evidence" }
      ]
    }
  ]
}
$sch$::jsonb
where key = 'dbs_renewal';

update public.form_templates set schema = $sch$
{
  "schemaVersion": 1,
  "sections": [
    {
      "id": "probation",
      "title": "Probation review",
      "fields": [
        { "key": "probation_end_due", "type": "date", "label": "Probation end due" },
        { "key": "probation_end_actual", "type": "date", "label": "Probation end actual" },
        { "key": "outcome", "type": "single_select", "label": "Outcome", "required": true,
          "options": [
            { "value": "passed", "label": "Passed" },
            { "value": "failed", "label": "Failed" },
            { "value": "extended", "label": "Extended" },
            { "value": "due", "label": "Due" }
          ] },
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
where fv.form_id = f.id and ft.key in ('dbs_renewal', 'probation_review');
