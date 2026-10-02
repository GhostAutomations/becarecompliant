-- 0372: archive a demo (Phil, 2 Oct 2026: "add a archive button").
-- A deleted demo keeps its usage and feedback on Founder > Demos. Archiving takes it off the list
-- without erasing anything; "Show archived" brings it back, and Unarchive returns it to the list.
-- Only a demo whose company has been deleted can be archived (enforced in the server action), so
-- a running demo can never be hidden by mistake. Founder only: demos already has founder only RLS.
alter table public.demos add column if not exists archived_at timestamptz;
