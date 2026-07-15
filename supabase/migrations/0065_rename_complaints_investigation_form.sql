-- 0065_rename_complaints_investigation_form
-- Rename the 'complaints_concerns' form to "Complaint Investigation Form" in the
-- master template library and in every company copy. The key is unchanged (it is
-- referenced in code and evidence); only the display name changes. Applied to ref
-- bgrtcvyjuwopunpnudeu only.

update public.form_templates
  set name = 'Complaint Investigation Form'
  where key = 'complaints_concerns';

update public.forms
  set name = 'Complaint Investigation Form'
  where key = 'complaints_concerns';
