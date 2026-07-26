-- 0127_public_form_submissions_realtime.sql
-- The Submissions queue updates live, like the other registers. An RLS table
-- needs REPLICA IDENTITY FULL and membership of the supabase_realtime
-- publication for the client to receive its changes.

alter table public.public_form_submissions replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'public_form_submissions'
  ) then
    alter publication supabase_realtime add table public.public_form_submissions;
  end if;
end $$;
