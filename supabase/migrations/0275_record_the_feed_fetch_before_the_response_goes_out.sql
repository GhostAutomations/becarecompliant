-- Be Care Compliant — actually record the fetch, in one call, before the response goes out.
--
-- THE BUG THIS FIXES, shipped by me the same day (Phil: "didnt the iphone and microsoft sync?").
-- 0274 added the panel and the route called a recordFetch() helper as fire-and-forget:
--
--     void recordFetch(profileId, userAgent, now);
--
-- That helper did a SELECT and then an INSERT or UPDATE. On a serverless function the process is
-- frozen as soon as the response is returned, so work still in flight simply never happens. The
-- SELECT round-trip guaranteed the write was still pending at that moment, so NOTHING was ever
-- written, and the panel told Phil nothing had fetched while his iPhone and Outlook were both
-- fetching happily. The panel was confidently wrong, which is worse than not having it.
--
-- (The older last_fetched_at line survived only by luck: a PostgREST builder dispatches its
-- request when .then() is called, so it left before the freeze. Luck is not a mechanism, so that
-- write moves in here too.)
--
-- THE FIX IS SHAPE, NOT CARE. One round trip that the route AWAITS. Both writes happen in one
-- statement pair inside the database, so there is nothing in flight to lose, and the count is
-- incremented by Postgres rather than by a read-modify-write that could race with a second
-- calendar fetching at the same moment.
--
-- SECURITY DEFINER with the token as the argument: the caller is an unauthenticated calendar
-- app, so there is no auth.uid() to write as. The token is the same bearer secret that already
-- authorises reading the feed, and an unknown one writes nothing and says nothing.

create or replace function public.record_planner_feed_fetch(
  p_token text,
  p_client text,
  p_agent text
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_profile uuid;
  v_client text := case
    when p_client in ('Outlook', 'Apple Calendar', 'Google Calendar', 'Browser') then p_client
    else 'Other'
  end;
begin
  select profile_id into v_profile
  from public.planner_calendar_feeds
  where token = p_token;

  -- An unknown or revoked token records nothing and reveals nothing.
  if v_profile is null then
    return;
  end if;

  update public.planner_calendar_feeds
     set last_fetched_at = now()
   where token = p_token;

  insert into public.planner_calendar_feed_clients
    (profile_id, client, user_agent, first_fetched_at, last_fetched_at, fetch_count)
  values (v_profile, v_client, left(p_agent, 300), now(), now(), 1)
  on conflict (profile_id, client) do update
    set last_fetched_at = now(),
        user_agent = excluded.user_agent,
        fetch_count = planner_calendar_feed_clients.fetch_count + 1;
end;
$function$;

revoke all on function public.record_planner_feed_fetch(text, text, text) from public;
grant execute on function public.record_planner_feed_fetch(text, text, text) to service_role;
