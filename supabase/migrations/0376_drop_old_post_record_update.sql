-- 0376: drop the superseded post_record_update overloads (Phil, 3 Oct 2026).
-- 0374 added a 9 argument version (About) and 0375 an 11 argument version (late reason and DBS
-- submitted date) beside the original 7 argument one, to avoid dropping a function in the same
-- migration. The app only calls the 11 argument version (lib/updates/actions.ts passes every named
-- argument), so the 7 and 9 argument versions are unused.
drop function if exists public.post_record_update(uuid,uuid,uuid,uuid,text,uuid[],jsonb);
drop function if exists public.post_record_update(uuid,uuid,uuid,uuid,text,uuid[],jsonb,uuid,text);
