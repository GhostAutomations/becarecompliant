-- Be Care Compliant: every policy has an owner and a review date (Phil, 2026-10-06, Policies
-- department). Wales regulation 12 (SI 2017/1264) requires policies to be "kept up to date";
-- a review date is how a company proves it.
--
--   owner_id         who is responsible for it (optional)
--   review_months    how often it is reviewed, 12 by default
--   last_reviewed_on the day it was last reviewed or replaced by a new version
--   review_due_on    when the next review is due; red once passed, amber 30 days before
--   topic_key        which standard policy it is, for the required policies checklist
--
-- A NEW VERSION IS A REVIEW. A trigger stamps the dates whenever a policy is created or its
-- version moves, so every way in (upload, new version, edited wording, and the AI writer to
-- come) restarts the clock without each one having to remember to.

alter table public.company_policies
  add column if not exists owner_id uuid references public.profiles(id) on delete set null,
  add column if not exists review_months smallint not null default 12,
  add column if not exists last_reviewed_on date,
  add column if not exists review_due_on date,
  add column if not exists topic_key text;

do $$ begin
  alter table public.company_policies
    add constraint company_policies_review_months_range check (review_months between 1 and 36);
exception when duplicate_object then null; end $$;

-- Existing policies: reviewed on the day their current version was made.
update public.company_policies p
   set last_reviewed_on = coalesce(
         (select max(v.created_at) from public.company_policy_versions v where v.policy_id = p.id),
         p.created_at)::date
 where p.last_reviewed_on is null;
update public.company_policies
   set review_due_on = (last_reviewed_on + make_interval(months => review_months))::date
 where review_due_on is null and last_reviewed_on is not null;

create or replace function public.company_policies_stamp_review()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  today date := (now() at time zone 'Europe/London')::date;
begin
  if tg_op = 'INSERT' or new.version is distinct from old.version then
    new.last_reviewed_on := today;
    new.review_due_on := (today + make_interval(months => coalesce(new.review_months, 12)))::date;
  elsif new.review_months is distinct from old.review_months and new.last_reviewed_on is not null then
    new.review_due_on := (new.last_reviewed_on + make_interval(months => new.review_months))::date;
  end if;
  return new;
end $$;

drop trigger if exists company_policies_stamp_review on public.company_policies;
create trigger company_policies_stamp_review
  before insert or update of version, review_months on public.company_policies
  for each row execute function public.company_policies_stamp_review();
