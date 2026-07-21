-- 0104_care_plan_review_uses_ipr
-- The Care Plan Review check (key care_plan_review; drives Review 1-4 + the matrix)
-- should complete the founder "Individual Plan Review" form, not the thin auto-generated
-- one. Keep the check labelled "Care Plan Review"; only the linked form changes.
--
-- A) Founder default: the care_plan_review TEMPLATE adopts the Individual Plan Review
--    (ipr_form) content + name, so every new company seeds the right form (seeding links
--    the check to the company form whose key = 'care_plan_review').
-- B) Existing companies: their care_plan_review form gains a new published version holding
--    the IPR content and is renamed, keeping the SAME form id so the check link, stored
--    evidence and the Review 1-4 matrix all stay intact.

-- A) Founder template
update public.form_templates cp
set name = 'Individual Plan Review',
    schema = ipr.schema,
    version = cp.version + 1,
    updated_at = now()
from public.form_templates ipr
where cp.key = 'care_plan_review' and ipr.key = 'ipr_form';

-- B) Existing company forms (guarded so it is safe to re-run)
do $$
declare ipr_schema jsonb;
begin
  select schema into ipr_schema from public.form_templates where key = 'ipr_form';
  if ipr_schema is null then
    raise exception 'ipr_form template not found';
  end if;

  -- new published version at current_version + 1
  insert into public.form_versions (form_id, version, schema, status)
  select f.id, f.current_version + 1, ipr_schema, 'published'
  from public.forms f
  where f.key = 'care_plan_review' and f.name <> 'Individual Plan Review';

  -- archive the previously current version
  update public.form_versions fv
  set status = 'archived'
  from public.forms f
  where fv.form_id = f.id
    and f.key = 'care_plan_review'
    and f.name <> 'Individual Plan Review'
    and fv.version = f.current_version
    and fv.status = 'published';

  -- point the form at the new version and rename it
  update public.forms f
  set name = 'Individual Plan Review',
      current_version = f.current_version + 1,
      updated_at = now()
  where f.key = 'care_plan_review' and f.name <> 'Individual Plan Review';
end $$;
