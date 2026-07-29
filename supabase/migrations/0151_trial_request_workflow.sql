-- 0151_trial_request_workflow
-- Phase 10 Additions (Phil, 2026-07-29). Turns a trial request from a one-shot email
-- into a lead the founder can actually work.
--
-- WHY. When somebody presses "Start free trial" on the marketing site,
-- submitTrialRequest (lib/marketing/actions.ts) writes one row here through the
-- service-role client and emails the platform admin. That email is, today, the ONLY
-- place the lead is ever seen. Miss it, filter it, read it on a phone and forget it,
-- and the lead is invisible short of opening the SQL editor. A person who asked to
-- buy the product then hears nothing. This migration gives the founder console the
-- columns it needs to show every request and to record what has been done about each
-- one, over the several days a real lead usually takes.
--
-- PROVISIONING STAYS FOUNDER LED, AND NOTHING HERE CHANGES THAT. A request is a lead,
-- not a tenant. No trigger, no automation, no company row appears because of this
-- migration. The founder still creates the company by hand on /founder/new. The status
-- only records where the conversation has got to.
--
-- 'converted' BECOMES 'provisioned'. The original 0086 vocabulary was sales language;
-- the console is read by the one person who does the work, and what he actually does is
-- provision the company. Renaming rather than adding avoids two values that mean the
-- same thing sitting in the same dropdown for ever. Safe to rename: 'converted' appears
-- nowhere in the application code (only the 0086 check constraint), and any existing row
-- carrying it is moved across below before the constraint is replaced.
--
-- WHY COLUMNS AND NOT A SEPARATE WORKFLOW TABLE. One status, one note and one "who moved
-- it, when" per request. It is read on one screen, never joined, never queried on its
-- own, and the shape follows what every other status-carrying table in this codebase
-- already does (complaints, invoicing_config, holiday_requests): updated_by uuid
-- referencing auth.users with on delete set null, plus a timestamptz. No new table, no
-- new policy, no new RLS surface.
--
-- SECURITY IS DELIBERATELY UNCHANGED. trial_requests is PUBLIC-facing data typed by an
-- anonymous visitor on the internet. 0086 gave it exactly one policy: platform admin for
-- ALL commands, and NO anonymous policy at all, because inserts arrive through the
-- service-role client which bypasses RLS. That is what makes the public endpoint
-- controlled and spam-resistant, so it is left exactly as it was. The new status update
-- from the founder console is therefore platform-admin-only IN RLS, not merely in the
-- UI: a non-admin's UPDATE matches no policy, changes zero rows, and the action surfaces
-- that as a visible error. The block below only RE-CREATES the policy if it has somehow
-- gone missing; it never loosens it.
--
-- Idempotent (data update first, constraint dropped by name then re-added, add column if
-- not exists). Applied to the becarecompliant Supabase project ONLY (ref
-- bgrtcvyjuwopunpnudeu).

-- 1. Move any existing row onto the new vocabulary BEFORE the constraint changes.
update public.trial_requests
  set status = 'provisioned'
  where status = 'converted';

alter table public.trial_requests
  drop constraint if exists trial_requests_status_check;

alter table public.trial_requests
  add constraint trial_requests_status_check
  check (status in ('new', 'contacted', 'provisioned', 'declined'));

-- 2. Who moved it, when, and the founder's own running note.
alter table public.trial_requests
  add column if not exists status_changed_at timestamptz,
  add column if not exists status_changed_by uuid references auth.users(id) on delete set null,
  add column if not exists notes text;

comment on column public.trial_requests.status is
  'Where the founder has got to with this lead: new (nobody has touched it), contacted, provisioned (the company has been created by hand on /founder/new), declined. Never set by the public form, which always inserts the default ''new''.';
comment on column public.trial_requests.status_changed_at is
  'When the status was last moved from the founder console. Null means it has never been moved off ''new''.';
comment on column public.trial_requests.status_changed_by is
  'The platform admin who last moved the status. Null for a request nobody has worked yet.';
comment on column public.trial_requests.notes is
  'Founder-only free text against the lead, for chasing it over several days. Never shown to the applicant and never emailed anywhere.';

-- 3. The list is "newest first, and how many are still new", so index for exactly that.
create index if not exists trial_requests_status_created_at_idx
  on public.trial_requests (status, created_at desc);

-- 4. Restate the 0086 guarantee without weakening it: platform admin only, every
--    command, no anonymous policy. Recreated ONLY if it is missing.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'trial_requests'
      and policyname = 'trial_requests_admin'
  ) then
    create policy trial_requests_admin on public.trial_requests
      for all to authenticated
      using (public.is_platform_admin())
      with check (public.is_platform_admin());
  end if;
end $$;
