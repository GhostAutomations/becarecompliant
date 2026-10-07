-- 0416: the second round of RLS fast lanes (Phil, 2026-10-07, after 0415: "still slow clicking on
-- service users"). Timings off live requests showed the absence register, evidence, holidays and
-- the readiness pages still running every permission function on every row. Same rule as 0415:
-- each policy below admits ONLY rows an existing SELECT policy on that table already admits,
-- worked out once per query, and named "_zz_fast" so Postgres checks it first (reverse name
-- order). Nothing anybody can see changes; verified per role before and after.

-- absence_events_select / absence_meetings_select: platform OR admin OR branch lead (branch set).
create policy absence_events_zz_fast on public.absence_events for select to authenticated using (
  (select public.is_platform_admin())
  or company_id = (select public.my_admin_company_id())
  or branch_id = any ((select public.my_lead_branch_ids())::uuid[])
);
create policy absence_meetings_zz_fast on public.absence_meetings for select to authenticated using (
  (select public.is_platform_admin())
  or company_id = (select public.my_admin_company_id())
  or branch_id = any ((select public.my_lead_branch_ids())::uuid[])
);

-- absence_config_select: platform OR company member.
create policy absence_config_zz_fast on public.absence_config for select to authenticated using (
  (select public.is_platform_admin()) or company_id = (select public.my_company_id())
);

-- evidence_select: platform OR admin OR branch lead (branch set).
create policy evidence_zz_fast on public.evidence for select to authenticated using (
  (select public.is_platform_admin())
  or company_id = (select public.my_admin_company_id())
  or branch_id = any ((select public.my_lead_branch_ids())::uuid[])
);

-- holiday_requests_select: platform OR company wide OR branch lead (branch set).
create policy holiday_requests_zz_fast on public.holiday_requests for select to authenticated using (
  (select public.is_platform_admin())
  or company_id = (select public.my_wide_company_id())
  or branch_id = any ((select public.my_lead_branch_ids())::uuid[])
);

-- complaints_select / complaint_responses_select / incidents_select: platform OR admin OR
-- is_branch_manager OR is_branch_supervisor (which together are is_branch_lead).
create policy complaints_zz_fast on public.complaints for select to authenticated using (
  (select public.is_platform_admin())
  or company_id = (select public.my_admin_company_id())
  or branch_id = any ((select public.my_lead_branch_ids())::uuid[])
);
create policy complaint_responses_zz_fast on public.complaint_responses for select to authenticated using (
  (select public.is_platform_admin())
  or company_id = (select public.my_admin_company_id())
  or branch_id = any ((select public.my_lead_branch_ids())::uuid[])
);
create policy incidents_zz_fast on public.incidents for select to authenticated using (
  (select public.is_platform_admin())
  or company_id = (select public.my_admin_company_id())
  or branch_id = any ((select public.my_lead_branch_ids())::uuid[])
);

-- audit_log_select: platform OR admin.
create policy audit_log_zz_fast on public.audit_log for select to authenticated using (
  (select public.is_platform_admin()) or company_id = (select public.my_admin_company_id())
);

-- migrated_completions_select: member AND admin (an active admin of the company is a member of it).
-- No platform clause: the existing policy has none.
create policy migrated_completions_zz_fast on public.migrated_completions for select to authenticated using (
  company_id = (select public.my_admin_company_id())
);

-- profiles_select: own row OR platform OR admin.
create policy profiles_zz_fast on public.profiles for select to authenticated using (
  (select public.is_platform_admin()) or company_id = (select public.my_admin_company_id())
);

-- assignments_select, inspection_notices_select, readiness_self_ratings_select,
-- branch_inspections_select: platform OR company wide (each also admits more; this is a subset).
create policy assignments_zz_fast on public.assignments for select to authenticated using (
  (select public.is_platform_admin()) or company_id = (select public.my_wide_company_id())
);
create policy inspection_notices_zz_fast on public.inspection_notices for select to authenticated using (
  (select public.is_platform_admin()) or company_id = (select public.my_wide_company_id())
);
create policy readiness_self_ratings_zz_fast on public.readiness_self_ratings for select to authenticated using (
  (select public.is_platform_admin()) or company_id = (select public.my_wide_company_id())
);
create policy branch_inspections_zz_fast on public.branch_inspections for select to authenticated using (
  (select public.is_platform_admin()) or company_id = (select public.my_wide_company_id())
);

-- care_plan_entries / service_user_outcomes / service_user_outcome_updates / outcomes_reviews
-- (_select): platform OR admin.
create policy care_plan_entries_zz_fast on public.care_plan_entries for select to authenticated using (
  (select public.is_platform_admin()) or company_id = (select public.my_admin_company_id())
);
create policy service_user_outcomes_zz_fast on public.service_user_outcomes for select to authenticated using (
  (select public.is_platform_admin()) or company_id = (select public.my_admin_company_id())
);
create policy service_user_outcome_updates_zz_fast on public.service_user_outcome_updates for select to authenticated using (
  (select public.is_platform_admin()) or company_id = (select public.my_admin_company_id())
);
create policy outcomes_reviews_zz_fast on public.outcomes_reviews for select to authenticated using (
  (select public.is_platform_admin()) or company_id = (select public.my_admin_company_id())
);

-- requirement_evidence_map_select: platform OR company member.
create policy requirement_evidence_map_zz_fast on public.requirement_evidence_map for select to authenticated using (
  (select public.is_platform_admin()) or company_id = (select public.my_company_id())
);
