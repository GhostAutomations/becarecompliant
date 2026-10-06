-- 0410: the policy cover laid out like Thistle's own (Phil, 2026-10-06, from Thistle's
-- Recruitment Process and Procedure): a front page in the company's colours with the logo, and an
-- "Audit Checklist and Report" page before the ISO 9001 details.
--   * companies.brand_primary / brand_secondary: the two document colours set in Branding
--     (the band behind the title, and the company name). Null means Be Care Compliant's own.
--   * company_policy_versions.review_reason: why this version was reviewed, asked on approval.
--   * company_policies.last_reviewed_by_name / _role: who pressed "Reviewed, no changes needed",
--     so the review table names them.

alter table public.companies
  add column if not exists brand_primary text,
  add column if not exists brand_secondary text;

do $$ begin
  alter table public.companies add constraint companies_brand_primary_hex check (brand_primary is null or brand_primary ~ '^#[0-9a-f]{6}$');
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.companies add constraint companies_brand_secondary_hex check (brand_secondary is null or brand_secondary ~ '^#[0-9a-f]{6}$');
exception when duplicate_object then null; end $$;

alter table public.company_policy_versions
  add column if not exists review_reason text;
do $$ begin
  alter table public.company_policy_versions add constraint company_policy_versions_review_reason_len check (review_reason is null or char_length(review_reason) between 1 and 80);
exception when duplicate_object then null; end $$;

alter table public.company_policies
  add column if not exists last_reviewed_by_name text,
  add column if not exists last_reviewed_by_role text;
