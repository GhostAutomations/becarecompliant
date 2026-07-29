-- 0153_provision_company_ownership_fix
-- Phase 10 Additions (Phil, 2026-07-29). Two defects in 0152, both found by reviewing the
-- diff before building, both in the same two lines of provision_company().
--
-- DEFECT 1: THE OVERRIDE COULD NEVER HAVE WORKED. 0152 skips its own duplicate checks when
-- the founder supplies a reason, but the two PARTIAL UNIQUE INDEXES are unconditional and
-- the insert still claimed trial_owner_email and trial_owner_domain. So "Provision anyway"
-- would have sailed past the friendly check and hit Postgres, which would have raised
-- 23505 and rolled the whole company back. The founder would have read "duplicate key
-- value violates unique constraint companies_trial_owner_email_idx" and had no way at all
-- to grant a genuine second service in a group. The entire override path, its confirm
-- prompt, its reason box and its audit metadata were dead code.
--
-- The fix is not to weaken the index. It is that an override does not RE-CLAIM the keys:
-- the FIRST company keeps ownership of that address and that domain, so a third attempt is
-- still blocked and still needs a deliberate reason. Exactly one company can ever hold a
-- given address, which is what the index is for.
--
-- DEFECT 2: TYPING 0 IN THE TRIAL DAYS BOX VOIDED THE RULE. 0152 wrote the ownership
-- columns only "when v_days > 0", so provisioning with a 0 day trial recorded nothing, and
-- the same address could take a full trial on a second company later with no block and no
-- flag on the console, because the Seen before panel reads exactly those two columns.
-- These columns record WHO THE COMPANY WAS GRANTED TO, not whether a clock is running, so
-- they must not depend on the number of days. Only trial_started_at and trial_ends_at do.
--
-- Nothing else changes. Same signature, so CREATE OR REPLACE keeps the existing grants
-- (execute revoked from public and anon, granted to authenticated, guarded on the first
-- line by is_platform_admin()).
--
-- Idempotent. Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

create or replace function public.provision_company(
  p_name text,
  p_slug text,
  p_tier text,
  p_branch_name text,
  p_trial_days integer,
  p_owner_email text,
  p_owner_domain text,
  p_request_id uuid,
  p_override_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company_id uuid;
  v_name text := nullif(btrim(p_name), '');
  v_slug text := nullif(btrim(lower(p_slug)), '');
  v_email text := nullif(btrim(lower(p_owner_email)), '');
  v_domain text := nullif(btrim(lower(p_owner_domain)), '');
  v_days integer := coalesce(p_trial_days, 0);
  v_forms integer := 0;
  v_people integer := 0;
  v_su integer := 0;
  v_training integer := 0;
begin
  if not public.is_platform_admin() then
    raise exception 'Only the platform admin can provision a company';
  end if;

  if v_name is null then
    raise exception 'Enter a company name.';
  end if;
  if v_slug is null then
    raise exception 'Could not derive a slug. Enter one manually.';
  end if;
  if p_tier not in ('business', 'pro', 'enterprise', 'diamond', 'black') then
    raise exception 'Choose a valid tier.';
  end if;

  if exists (select 1 from public.companies where slug = v_slug) then
    raise exception 'That slug is already taken. Choose another.';
  end if;

  if v_email is not null
     and p_override_reason is null
     and exists (select 1 from public.companies where lower(trial_owner_email) = v_email) then
    raise exception 'That email address has already had a trial.';
  end if;

  if v_domain is not null
     and p_override_reason is null
     and exists (select 1 from public.companies where lower(trial_owner_domain) = v_domain) then
    raise exception 'Somebody at that company domain has already had a trial.';
  end if;

  insert into public.companies (
    name, slug, tier,
    trial_started_at, trial_ends_at, trial_owner_email, trial_owner_domain, provisioned_by
  )
  values (
    v_name, v_slug, p_tier,
    -- The CLOCK depends on the days.
    case when v_days > 0 then now() end,
    case when v_days > 0 then now() + make_interval(days => v_days) end,
    -- OWNERSHIP does not. It records who this company was granted to, so it is written
    -- whatever the number of days (defect 2), and it is NOT re-claimed on a deliberate
    -- override, because the first company still holds it (defect 1).
    case when p_override_reason is null then v_email end,
    case when p_override_reason is null then v_domain end,
    case when p_request_id is null then 'founder' else 'trial_request' end
  )
  returning id into v_company_id;

  insert into public.branches (company_id, name, kind) values
    (v_company_id, v_name || ' Office', 'team'),
    (v_company_id, coalesce(nullif(btrim(p_branch_name), ''), 'Main Branch'), 'branch');

  v_forms    := public.seed_company_form_templates(v_company_id);
  v_people   := public.seed_company_people_checks(v_company_id);
  v_su       := public.seed_company_service_user_checks(v_company_id);
  v_training := public.seed_company_training_courses(v_company_id);
  perform public.seed_company_job_titles(v_company_id);

  if p_request_id is not null then
    update public.trial_requests
       set company_id = v_company_id,
           status = 'provisioned',
           status_changed_at = now(),
           status_changed_by = auth.uid()
     where id = p_request_id;
  end if;

  return jsonb_build_object(
    'company_id', v_company_id,
    'forms_seeded', v_forms,
    'people_checks_seeded', v_people,
    'su_checks_seeded', v_su,
    'training_seeded', v_training,
    'trial_days', v_days
  );
end;
$$;
