-- 0070_consolidate_complaint_response_form
-- The Cardiff and Newport complaint response forms are identical (both even carry a
-- Region dropdown); the only difference was a Status typo ("Closed" vs "Close").
-- Consolidate to a single branch-neutral "Complaint Response Form": rename the
-- Cardiff form (key complaint_response, keeps the correct "Closed" wording) so it
-- shows on every branch, and remove the Newport duplicate. Neither form has any
-- evidence. Applied to ref bgrtcvyjuwopunpnudeu only.

update public.form_templates
  set key = 'complaint_response', name = 'Complaint Response Form'
  where key = 'cardiff_complaint_response';

update public.forms
  set key = 'complaint_response', name = 'Complaint Response Form'
  where key = 'cardiff_complaint_response';

-- Remove the Newport duplicate (versions first for the FK, then forms, then master).
delete from public.form_versions fv
  using public.forms f
  where fv.form_id = f.id and f.key = 'newport_complaint_response';
delete from public.forms where key = 'newport_complaint_response';
delete from public.form_templates where key = 'newport_complaint_response';
