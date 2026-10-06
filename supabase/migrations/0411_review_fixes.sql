-- 0411: fixes from the 7 October 2026 review of the previous 24 hours' work.

-- 1. Each policy version keeps its cover as it stood when approved (Phil: "As it was at that
--    version"), so a signed copy opened later never shows today's owner, distribution or branding.
alter table public.company_policy_versions add column if not exists cover jsonb;

-- 2. A change summary is at most 200 characters (the form already said so; now the database does).
do $$ begin
  alter table public.company_policy_versions add constraint company_policy_versions_change_summary_len
    check (change_summary is null or char_length(change_summary) <= 200);
exception when duplicate_object then null; end $$;

-- 3. A new version stamps the review date with nobody named, so the cover never treats it as a
--    "Reviewed, no changes needed" by whoever pressed that on an earlier version.
create or replace function public.company_policies_stamp_review()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare today date := (now() at time zone 'Europe/London')::date;
begin
  if tg_op = 'INSERT' or new.version is distinct from old.version then
    new.last_reviewed_on := today;
    new.review_due_on := (today + make_interval(months => coalesce(new.review_months, 12)))::date;
    new.last_reviewed_by_name := null;
    new.last_reviewed_by_role := null;
  elsif new.review_months is distinct from old.review_months and new.last_reviewed_on is not null then
    new.review_due_on := (new.last_reviewed_on + make_interval(months => new.review_months))::date;
  end if;
  return new;
end $function$;

-- 4. An automatic reference given to a policy that was then not saved goes back, but only when it
--    is still the last one given, so no number is ever given twice.
create or replace function public.release_policy_reference(cid uuid, p_reference text)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare m text[]; n integer;
begin
  if not public.can_write_policies(cid) then
    raise exception 'not allowed to number policies for this company';
  end if;
  m := regexp_match(coalesce(p_reference, ''), '^POL-([A-Z]{2,6})-([0-9]+)$');
  if m is null then return; end if;
  n := m[2]::integer;
  if exists (select 1 from public.company_policies where company_id = cid and reference = p_reference) then
    return;
  end if;
  update public.policy_reference_counters
     set last = last - 1
   where company_id = cid and prefix = m[1] and last = n;
end $function$;
revoke all on function public.release_policy_reference(uuid, text) from public, anon;
grant execute on function public.release_policy_reference(uuid, text) to authenticated;

-- 5. Who may write policies, set for a named company, so the Founder managing a company can save
--    it too (the old form read the company from the caller's own profile, which the Founder has not).
create or replace function public.set_policy_writer_role_for(p_company_id uuid, p_role text, p_on boolean)
returns text[]
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare result text[];
begin
  if p_company_id is null or not (public.is_company_admin(p_company_id) or public.is_platform_admin()) then
    raise exception 'Only a Company Admin can change who writes policies';
  end if;
  if p_role not in ('manager','registered_manager','registered_individual') then
    raise exception 'That role cannot be given policy writing';
  end if;
  update public.companies
     set policy_writer_roles = case when p_on
           then (select array_agg(distinct r) from unnest(policy_writer_roles || p_role) r)
           else array_remove(policy_writer_roles, p_role) end
   where id = p_company_id returning policy_writer_roles into result;
  return result;
end $function$;
revoke all on function public.set_policy_writer_role_for(uuid, text, boolean) from public, anon;
grant execute on function public.set_policy_writer_role_for(uuid, text, boolean) to authenticated;

-- 6. Signed out visitors cannot call these (they were refused inside anyway).
revoke execute on function public.can_write_policies(uuid) from anon;
revoke execute on function public.set_policy_writer_role(text, boolean) from anon;

-- 7. When an absence meeting last changed, for the calendar feed (a rearranged meeting must show
--    as changed in Outlook).
alter table public.absence_meetings add column if not exists updated_at timestamptz not null default now();
update public.absence_meetings set updated_at = greatest(created_at, coalesce(responded_at, created_at)) where updated_at >= now() - interval '1 minute';
drop trigger if exists absence_meetings_set_updated_at on public.absence_meetings;
create trigger absence_meetings_set_updated_at before update on public.absence_meetings
  for each row execute function public.set_updated_at();
