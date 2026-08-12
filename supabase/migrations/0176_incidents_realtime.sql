-- 0176_incidents_realtime
--
-- The Incidents register renders <RealtimeRefresh tables={["incidents"]} />, the same
-- as Complaints. That subscription is silent if the table is not in the supabase_realtime
-- publication: the page simply never refreshes and nothing anywhere reports an error,
-- which is the worst kind of broken. Add it.
--
-- whistleblowing_disclosures is deliberately NOT added. It is low volume, nobody is
-- watching a live list of it, and there is no reason to put those row changes on a
-- broadcast channel at all.

alter publication supabase_realtime add table public.incidents;
