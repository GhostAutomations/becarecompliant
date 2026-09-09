-- 0254_three_service_user_forms_nothing_could_reach
-- Phil, 2026-09-09, reviewing Thistle's Service User forms: "delete these from founder and
-- companies" — Consent Review, MAR (Medication) Audit and Risk Assessment.
--
-- WHY THEY WERE DEAD. All three were seeded as Service User CHECKS by 0027/0028/0030/0031.
-- The current seed_company_service_user_checks creates three checks and these are not among
-- them: setup, care_plan_review and audit. So the FORMS carried on being seeded into every
-- new company while nothing scheduled them, nothing linked to them, and no screen offered
-- them. A service user's record only shows its checks, so a form with no check has no route
-- to it at all. Measured before writing this: 0 check definitions, 0 Evidence rows, 0
-- briefings and 0 public submissions against all three, in every company.
--
-- A form nobody can reach is worse than no form. It sits in Settings > Forms looking like
-- part of the product, it appears in the founder library as something a customer is getting,
-- and the first person to notice is the customer who tries to use one.
--
-- SAFE BY THE DATABASE, NOT BY THIS FILE'S CARE. evidence.form_id and
-- evidence.form_version_id are ON DELETE RESTRICT, so if any company anywhere has ever
-- completed one of these, this migration ABORTS rather than erasing a record. The explicit
-- guard below fails first with a readable message, but the constraint is the real protection.
--
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

do $$
declare
  dead_keys text[] := array['consent_review', 'mar_audit', 'risk_assessment'];
  n_evidence int;
  n_checks int;
  n_forms int;
  n_templates int;
begin
  select count(*) into n_evidence
  from public.evidence e join public.forms f on f.id = e.form_id
  where f.key = any(dead_keys);

  if n_evidence > 0 then
    raise exception
      'Refusing to delete: % Evidence records exist against these forms. A completed record is never erased to tidy a library.',
      n_evidence;
  end if;

  select count(*) into n_checks
  from public.check_definitions cd join public.forms f on f.id = cd.form_id
  where f.key = any(dead_keys);

  if n_checks > 0 then
    raise exception
      'Refusing to delete: % check definitions point at these forms. Unwire the check first, or the check silently loses its form.',
      n_checks;
  end if;

  -- form_versions cascade from forms; assignments cascade too, and were measured at 0.
  delete from public.forms where key = any(dead_keys);
  get diagnostics n_forms = row_count;

  delete from public.form_templates where key = any(dead_keys);
  get diagnostics n_templates = row_count;

  raise notice 'Deleted % company forms and % founder templates.', n_forms, n_templates;
end $$;
