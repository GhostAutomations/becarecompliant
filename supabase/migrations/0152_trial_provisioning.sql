-- 0152_trial_provisioning
-- Phase 10 Additions (Phil, 2026-07-29). Item 4c: a trial that is provisioned in ONE press
-- from the founder console, with a 14 day clock, and a request screen that says "we have
-- seen this before" BEFORE the press rather than after it.
--
-- WHAT PHIL DECIDED, AND WHY THE SHAPE IS THIS SHAPE.
-- A stranger never creates a tenant. Somebody requests a trial exactly as they do today, the
-- request lands on the 0151 screen carrying flags for anything already seen, and the founder
-- presses Provision. That one decision removes an entire layer an earlier draft of this work
-- needed: no pending signup table, no hashed verification token, no public provisioning route
-- and NO service role surface at all, because the caller is the signed in platform admin. It
-- also means the five seed_company_* functions are untouched: their existing is_platform_admin()
-- guard is satisfied by the real caller. An earlier draft would have had to loosen all five.
--
-- THE RULES.
--   * One trial per email address, for ever, until the founder clears the field.
--   * One trial per COMPANY domain. NOT per personal domain. gmail, outlook, icloud, btinternet
--     and the rest are shared by millions, so enforcing there would mean the first applicant on
--     gmail blocked every applicant on gmail afterwards, and small UK care providers run on
--     personal addresses constantly. trial_owner_domain is therefore left NULL for a personal
--     provider, and a partial unique index cannot constrain a NULL. The rule enforces itself by
--     what is written, not by a branch in application code.
--   * A similar company name or a repeated phone number WARNS, never blocks. Only a person can
--     tell a genuine second service in the same group from somebody having another go.
--
-- ONE DEFINITION OF A NAME KEY, NOT TWO. The lesson already paid for on this project is that the
-- same rule written twice drifts apart and then lies: the Evidence page reported a signature as
-- missing while the PDF said it was captured. So the normalisation lives in ONE immutable SQL
-- function and both companies and trial_requests carry a STORED GENERATED column built from it.
-- TypeScript never re-implements it, it compares keys the database produced.
--
-- ATOMIC PROVISIONING. Today's createCompany inserts the company, then the branches, then five
-- seeds, one statement at a time, and reports a failure in a note while leaving a half seeded
-- company behind for ever. provision_company() does the lot inside one function, so a seed
-- failure rolls the whole company back and the founder simply presses again.
--
-- ON CONFLICT WARNING, another lesson already paid for here: the two unique indexes below are
-- PARTIAL, and a partial unique index cannot be used by ON CONFLICT (42P10). Every caller must
-- select, filter, then insert.
--
-- Idempotent. Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).

-- ---------------------------------------------------------------------------------------------
-- 1. The one and only company name key.
--
-- Lowercase, drop everything that is not a letter or a digit, drop the words that carry no
-- identity in this sector, then close up the spaces. "Sunrise Care Ltd", "sunrise care" and
-- "Sunrise Care Services Limited" all become "sunrise". Deliberately blunt: it feeds a WARNING
-- a human reads next to the real names, so a false positive costs a glance, while a miss costs
-- a duplicate trial. IMMUTABLE and STRICT so it can back a stored generated column.
-- ---------------------------------------------------------------------------------------------
create or replace function public.company_name_key(raw text)
returns text
language sql
immutable
strict
as $$
  select nullif(
    regexp_replace(
      regexp_replace(
        regexp_replace(lower(raw), '[^a-z0-9]+', ' ', 'g'),
        '\y(ltd|limited|llp|plc|cic|cio|uk|the|and|care|cares|caring|carers|services|service|group|holdings|homes|home|company|co|agency)\y',
        ' ', 'g'),
      '\s+', '', 'g'),
    '');
$$;

comment on function public.company_name_key(text) is
  'The single definition of a comparable company name, used by the generated name_key column on companies AND trial_requests. Never re-implement this in TypeScript: compare the keys the database produced, or the two rules will drift apart and the screen will lie.';

-- ---------------------------------------------------------------------------------------------
-- 2. companies: the trial clock, who owns the trial, and where the company came from.
-- ---------------------------------------------------------------------------------------------
alter table public.companies
  add column if not exists trial_started_at timestamptz,
  add column if not exists trial_ends_at timestamptz,
  add column if not exists trial_owner_email text,
  add column if not exists trial_owner_domain text,
  add column if not exists provisioned_by text not null default 'founder',
  add column if not exists name_key text generated always as (public.company_name_key(name)) stored;

alter table public.companies drop constraint if exists companies_provisioned_by_check;
alter table public.companies
  add constraint companies_provisioned_by_check
  check (provisioned_by in ('founder', 'trial_request'));

comment on column public.companies.trial_ends_at is
  'End of the 14 day trial, stamped when the founder presses Provision, not when the request arrived. NULL means this company is not on a trial at all, which is every company that existed before 0152, so nothing already live can ever be locked out by the trial gate.';
comment on column public.companies.trial_owner_email is
  'The address the trial was granted to. Held for ever so the same person cannot take a second free trial. Clear it by hand to deliberately grant another.';
comment on column public.companies.trial_owner_domain is
  'The company domain the trial was granted to, or NULL when the address was a personal provider such as gmail. NULL on purpose: the partial unique index below cannot constrain a NULL, which is exactly how personal addresses escape the one per domain rule.';

-- One trial per address, and one per company domain. Both PARTIAL, so never ON CONFLICT here.
create unique index if not exists companies_trial_owner_email_idx
  on public.companies (lower(trial_owner_email))
  where trial_owner_email is not null;

create unique index if not exists companies_trial_owner_domain_idx
  on public.companies (lower(trial_owner_domain))
  where trial_owner_domain is not null;

create index if not exists companies_name_key_idx on public.companies (name_key);
create index if not exists companies_trial_ends_at_idx
  on public.companies (trial_ends_at) where trial_ends_at is not null;

-- ---------------------------------------------------------------------------------------------
-- 3. trial_requests: the link to what it became, and its own name key for matching.
-- ---------------------------------------------------------------------------------------------
alter table public.trial_requests
  add column if not exists company_id uuid references public.companies(id) on delete set null,
  add column if not exists name_key text generated always as (public.company_name_key(company_name)) stored;

comment on column public.trial_requests.company_id is
  'The company this request became when it was provisioned. NULL for every request that has not been provisioned. Set only by provision_company().';

create index if not exists trial_requests_name_key_idx on public.trial_requests (name_key);
create index if not exists trial_requests_email_idx on public.trial_requests (lower(email));
create index if not exists trial_requests_phone_idx on public.trial_requests (phone) where phone is not null;

-- ---------------------------------------------------------------------------------------------
-- 4. provision_company(): the whole tenant, or nothing.
--
-- SECURITY DEFINER so the seeds and the trial_requests update all run in one transaction under
-- one authority, guarded on its FIRST line by is_platform_admin(), which reads the real caller's
-- JWT and is unaffected by the definer context. Execute is revoked from public and anon; only an
-- authenticated session can reach it, and only a platform admin gets past the guard.
--
-- The duplicate checks are repeated here even though the console checks them first. The console
-- check is for the founder to READ; this one is what actually holds, because two tabs, a double
-- press or a future caller must not be able to slip past a screen.
-- ---------------------------------------------------------------------------------------------
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

  -- The two hard rules. Both are overridable ON PURPOSE, but only deliberately: the caller has
  -- to have supplied a reason, which the console records in the audit log.
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
    case when v_days > 0 then now() end,
    case when v_days > 0 then now() + make_interval(days => v_days) end,
    case when v_days > 0 then v_email end,
    case when v_days > 0 then v_domain end,
    case when p_request_id is null then 'founder' else 'trial_request' end
  )
  returning id into v_company_id;

  insert into public.branches (company_id, name, kind) values
    (v_company_id, v_name || ' Office', 'team'),
    (v_company_id, coalesce(nullif(btrim(p_branch_name), ''), 'Main Branch'), 'branch');

  -- Every seed inside the same transaction: if one throws, the company never existed.
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

comment on function public.provision_company(text, text, text, text, integer, text, text, uuid, text) is
  'Creates a whole tenant in one transaction: company, Office and first Branch, and all five seed catalogues. Platform admin only. A seed failure rolls the entire company back, unlike the statement by statement createCompany it replaces. Pass p_override_reason only when the founder has deliberately chosen to grant a second trial to an address or domain that has already had one.';

revoke execute on function public.provision_company(text, text, text, text, integer, text, text, uuid, text) from public;
revoke execute on function public.provision_company(text, text, text, text, integer, text, text, uuid, text) from anon;
grant execute on function public.provision_company(text, text, text, text, integer, text, text, uuid, text) to authenticated;
