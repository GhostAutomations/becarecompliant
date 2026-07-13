-- ===========================================================================
-- 0057 — Live-updating Users & invites list (Additions item, pulled into Phase 7)
--
-- Add public.invites and public.profiles to the supabase_realtime publication so
-- the Settings > Users screen updates the instant an invite is accepted (invite
-- flips to accepted, a new active profile appears) or a user is changed, disabled
-- or deleted, with no manual refresh. Both tables already have REPLICA IDENTITY
-- FULL (set in earlier migrations) so UPDATE/DELETE events carry through, and RLS
-- scopes which events each Admin receives. Mirrors migration 0005 for People.
-- ===========================================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'invites'
  ) then
    alter publication supabase_realtime add table public.invites;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
end $$;
