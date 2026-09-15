-- Be Care Compliant — the Share page can say WHICH calendar last checked, and when.
--
-- Phil, 2026-09-15. He subscribed in Outlook, a supervision was booked five minutes later, and
-- Outlook showed nothing. Nothing was broken: Outlook had fetched once at subscribe time, found
-- an empty calendar, and would not look again for about three hours. Proving that meant reading
-- the Vercel request logs, which is not something he or any office member can do. The page said
-- "last checked" but not BY WHAT, so the single fact that answered the question was the one
-- fact missing from the screen.
--
-- This is a diagnostics panel, not a feature. It exists so the FIRST question anyone asks about
-- a subscribed calendar ("why can I not see it yet?") answers itself, instead of becoming a
-- support conversation that only somebody with log access can end.
--
-- WHY IT IS KEYED ON A SMALL CLOSED LABEL SET. Every fetch writes here, and the request is
-- unauthenticated: anyone holding the link could otherwise grow unbounded rows by varying their
-- User-Agent. Five labels means at most five rows per person, whatever arrives. The raw agent is
-- kept because the labels are a GUESS at a self-declared string, and the honest thing to show
-- for an unrecognised fetcher is what it actually said. Microsoft's fetcher in particular is the
-- one we are least sure of; the first real Outlook fetch will settle it from evidence.

create table if not exists planner_calendar_feed_clients (
  profile_id uuid not null references profiles(id) on delete cascade,
  client text not null check (client in ('Outlook', 'Apple Calendar', 'Google Calendar', 'Browser', 'Other')),
  user_agent text,
  first_fetched_at timestamptz not null default now(),
  last_fetched_at timestamptz not null default now(),
  fetch_count integer not null default 1,
  primary key (profile_id, client)
);

comment on table planner_calendar_feed_clients is
  'Which calendar apps have fetched a person''s planner feed, and when. Diagnostics for the Share page: it answers "Outlook last looked before you made that booking" without needing request logs. The client label is derived from a self-declared User-Agent, so it is a guess, and the raw agent is kept alongside.';

alter table planner_calendar_feed_clients enable row level security;

-- Your own rows and nobody else's, exactly like the feed itself. There is no operational reason
-- for a colleague or an admin to read which devices somebody syncs their diary to.
create policy planner_calendar_feed_clients_select on planner_calendar_feed_clients for select
  using (profile_id = auth.uid());

-- Writes come from the feed route under the service role, which bypasses RLS: the fetch carries
-- no session, so there is no auth.uid() to write as. No insert or update policy is offered,
-- because nothing a signed-in user does should be able to forge a fetch record.
