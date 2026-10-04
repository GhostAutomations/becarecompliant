-- Audit S5 (3 Oct 2026). A Planner calendar feed is a URL with no login on it, read with the
-- service client. Until now it outlived the login: a leaver's Outlook would keep pulling visits
-- with Service User names. The feed now goes the moment the login stops being active (disabled
-- by an Admin, closed by leaving, or moved company by the Founder). loadFeedByToken also
-- refuses anything whose owner or company is not live, as a backstop.
create or replace function public.drop_calendar_feeds_when_login_ends()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if (new.status is distinct from 'active' and old.status = 'active')
     or new.company_id is distinct from old.company_id then
    delete from public.planner_calendar_feeds where profile_id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function public.drop_calendar_feeds_when_login_ends() from public, anon, authenticated;

drop trigger if exists profiles_drop_calendar_feeds on public.profiles;
create trigger profiles_drop_calendar_feeds
  after update of status, company_id on public.profiles
  for each row execute function public.drop_calendar_feeds_when_login_ends();

-- Anything already orphaned (none on 3 Oct 2026, kept for rebuilt environments).
delete from public.planner_calendar_feeds f
using public.profiles p
where p.id = f.profile_id and (p.status <> 'active' or p.company_id is distinct from f.company_id);
