-- 0161_three_tiers_business_pro_black
--
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).
--
-- THE TIER LIST IS BUSINESS, PRO AND BLACK (Phil, 2026-07-31).
--
-- Enterprise and Diamond are retired. The public pricing page has sold two plans for a while,
-- Business £49 and Pro £69, while the code still carried five: the SMS allowance built earlier
-- today was cut against the code's list rather than what is actually sold, which is how this came
-- to light. Black stays: it is the free, founder granted account and is never sold.
--
-- ORDER MATTERS. Backfill first, THEN narrow the constraint. Adding the constraint first would
-- fail on the one live company, which is on Enterprise.

-- 1. Move everybody off the retired tiers. Enterprise and Diamond both had Pro's feature set or
--    better, so Pro is the landing place: nothing a company can do today stops working.
update public.companies set tier = 'pro' where tier in ('enterprise', 'diamond');

-- company_billing.billed_tier is a SEPARATE snapshot with no constraint of its own. Left behind
-- it would silently stop seat syncing to Stripe for ever (stripe-sync returns
-- not_subscription_tier and gives up), so it moves too.
update public.company_billing set billed_tier = 'pro' where billed_tier in ('enterprise', 'diamond');

-- 2. Narrow the constraint so a retired tier cannot come back through the founder console, a
--    seed, or a hand written insert.
alter table public.companies drop constraint if exists companies_tier_check;
alter table public.companies
  add constraint companies_tier_check check (tier in ('business', 'pro', 'black'));

-- 3. The two allowance functions. Business and Pro are unchanged; Black keeps everything.
create or replace function public.tier_monthly_ai_credits(t text)
returns integer language sql immutable as $$
  select case t
    when 'business' then 25
    when 'pro' then 50
    when 'black' then 1000
    else 25 end;
$$;

create or replace function public.tier_monthly_sms_credits(t text)
returns integer language sql immutable as $$
  select case t
    when 'business' then 0
    when 'pro' then 100
    when 'black' then 2000
    else 0 end;
$$;

-- 4. provision_company lost its tier whitelist in 0154 and defaults to 'starter', which is not a
--    tier at all: a blank tier raised a raw constraint violation instead of a plain error. Both
--    fixed here, against the new list. (Body identical to 0154 otherwise; see that file.)
create or replace function public.provision_company(
  p_name text, p_slug text, p_tier text, p_branch_name text, p_trial_days integer,
  p_owner_email text, p_owner_domain text, p_request_id uuid, p_override_reason text default null
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_company_id uuid;
  v_name text := nullif(btrim(p_name), '');
  v_slug text := nullif(btrim(lower(p_slug)), '');
  v_email text := nullif(btrim(lower(p_owner_email)), '');
  v_domain text := nullif(btrim(lower(p_owner_domain)), '');
  v_days integer := coalesce(p_trial_days, 0);
  v_tier text := coalesce(nullif(btrim(lower(p_tier)), ''), 'business');
  v_forms int; v_people int; v_su int; v_training int; v_map int;
begin
  if not public.is_platform_admin() then
    raise exception 'Only the platform admin may provision a company';
  end if;
  if v_name is null or v_slug is null then
    raise exception 'A company needs a name and a slug';
  end if;
  if v_tier not in ('business', 'pro', 'black') then
    raise exception 'Unknown tier: %', v_tier;
  end if;

  insert into public.companies (
    name, slug, tier, trial_started_at, trial_ends_at,
    trial_owner_email, trial_owner_domain, provisioned_by
  ) values (
    v_name, v_slug, v_tier,
    case when v_days > 0 then now() end,
    case when v_days > 0 then now() + make_interval(days => v_days) end,
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
  v_map      := public.seed_requirement_map(v_company_id);

  if p_request_id is not null then
    update public.trial_requests
       set company_id = v_company_id, status = 'provisioned',
           status_changed_at = now(), status_changed_by = auth.uid()
     where id = p_request_id;
  end if;

  return jsonb_build_object(
    'company_id', v_company_id, 'forms_seeded', v_forms, 'people_checks_seeded', v_people,
    'su_checks_seeded', v_su, 'training_seeded', v_training,
    'requirement_maps_seeded', v_map, 'trial_days', v_days
  );
end;
$fn$;
