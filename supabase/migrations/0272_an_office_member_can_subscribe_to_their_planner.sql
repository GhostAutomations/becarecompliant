-- Be Care Compliant — an office member can subscribe to their planner in Outlook.
--
-- Phil, 2026-09-15: office members should see what they have booked in the Planner inside
-- their own Outlook calendar. Of the three ways to do that (a subscribed feed, an invite
-- email per booking, or a full Microsoft Graph integration) he chose the SUBSCRIBED FEED
-- "for now", knowing what it costs: Outlook refreshes a subscribed calendar on its own
-- schedule, roughly every three hours and by Microsoft's own account sometimes far longer,
-- and neither we nor the user can make it go faster. So this is a background view of the
-- weeks ahead, never a same-day alerting mechanism, and nothing in BCC should come to
-- depend on it having arrived.
--
-- WHAT A FEED TOKEN IS. Outlook fetches the URL with no login and no cookie, so the token IN
-- the URL is the whole of the authentication. It is a password that happens to look like a
-- link: whoever holds it reads that person's planner until the link is changed. Three
-- consequences, all deliberate:
--
-- 1. The token lives in its own table, NOT on profiles. Admins can read colleagues' profile
--    rows; if the token sat there, every admin would hold every colleague's calendar key.
--    Here the only row you can see is your own, and that is enforced by the database rather
--    than by remembering to filter.
--
-- 2. It is rotatable, and rotating it is the revoke. A link that was forwarded, pasted in a
--    ticket or left on a machine that walked out of the building is killed by generating a
--    new one, which is why rotated_at is kept.
--
-- 3. What travels down it is deliberately thin. The appointment says "Care Plan Review -
--    M.J. (Cardiff)", initials and never a service user's full name, so a leaked link gives
--    away that somebody has a review on Tuesday and not who they are. That rule is enforced
--    in lib/planner/ics.ts and tested there; this comment is here so nobody later "improves"
--    the title back to the full name without knowing what it was protecting.
--
-- last_fetched_at is written by the feed route on each successful read. It is not
-- housekeeping: it is the only way a user can see how stale Outlook's copy is, which is the
-- first question anyone asks when a booking they made an hour ago is not showing.

create table if not exists planner_calendar_feeds (
  profile_id uuid primary key references profiles(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  token text not null unique,
  created_at timestamptz not null default now(),
  rotated_at timestamptz,
  last_fetched_at timestamptz,
  constraint planner_calendar_feeds_token_len_ck check (length(token) >= 32)
);

comment on table planner_calendar_feeds is
  'One subscribable calendar URL per office member, for their own planner bookings. The token is a bearer secret: it is the entire authentication for an unauthenticated Outlook fetch, so a row is readable only by the person it belongs to, and rotating the token is how a leaked link is revoked.';

comment on column planner_calendar_feeds.last_fetched_at is
  'When the feed was last read, so the owner can see how stale Outlook''s copy is. Outlook refreshes on its own schedule and there is no way to force it.';

create index if not exists planner_calendar_feeds_company_idx on planner_calendar_feeds (company_id);

alter table planner_calendar_feeds enable row level security;

-- YOUR OWN ROW AND NOBODY ELSE'S. No admin exception and no platform admin exception: this
-- is a credential, not a record, and there is no operational reason for anyone else to read
-- one. An admin who needs to cut off a departing colleague deletes their account, which
-- cascades this away, or asks them to rotate it.
create policy planner_calendar_feeds_select on planner_calendar_feeds for select
  using (profile_id = auth.uid());

create policy planner_calendar_feeds_insert on planner_calendar_feeds for insert
  with check (profile_id = auth.uid());

create policy planner_calendar_feeds_update on planner_calendar_feeds for update
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy planner_calendar_feeds_delete on planner_calendar_feeds for delete
  using (profile_id = auth.uid());
