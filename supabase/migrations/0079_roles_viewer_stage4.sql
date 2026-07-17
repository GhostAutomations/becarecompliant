-- 0079_roles_viewer_stage4
-- Roles overhaul, Stage 4. A Viewer (the `team_member` role, relabelled "Viewer") is
-- read-only and sees the People AND Service User registers for their branch, and
-- nothing else. People read already grants team_member (people_select uses
-- is_branch_team_member). This adds the missing read-only grants so the Service User
-- register and the compliance/RAG columns render for a Viewer, via NEW additive
-- policies (RLS ORs permissive policies together) so existing policies are untouched.
-- Viewer stays out of Evidence content (evidence_select unchanged) and cannot write
-- anywhere (no write policy grants team_member). App-side, MANAGE_ROLES/COMPLETE_ROLES
-- exclude team_member and the nav hides everything but People + Service Users.
-- Applied to ref bgrtcvyjuwopunpnudeu only.

drop policy if exists service_users_viewer_select on public.service_users;
create policy service_users_viewer_select on public.service_users
  for select using (branch_id is not null and public.is_branch_team_member(branch_id));

drop policy if exists check_instances_viewer_select on public.check_instances;
create policy check_instances_viewer_select on public.check_instances
  for select using (branch_id is not null and public.is_branch_team_member(branch_id));
