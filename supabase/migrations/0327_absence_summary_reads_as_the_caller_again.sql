-- DEF-073 (found 2026-09-24 while building absence discounting).
--
-- person_absence_summary was created in 0041 WITH (security_invoker = on), so a reader only ever
-- saw the people their own RLS lets them see. 0223 and 0224 redefined it with a plain
-- "create or replace view ... as", which dropped that option. From then on the view ran as its
-- owner and ignored RLS entirely, and because anon and authenticated both hold SELECT on it, anyone
-- holding the publishable key could read every company's names, branches and absence counts.
--
-- The fix puts the option back and takes anon off it altogether. Every later redefinition of this
-- view must carry "with (security_invoker = on)"; 0328 does.
alter view public.person_absence_summary set (security_invoker = on);
revoke all on public.person_absence_summary from anon;
revoke insert, update, delete, truncate, references, trigger on public.person_absence_summary from authenticated;
