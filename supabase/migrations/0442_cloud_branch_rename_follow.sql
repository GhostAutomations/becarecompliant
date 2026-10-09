-- Be Care Compliant 0442: a renamed branch renames its drive folders straight away.
--
-- 0441 renames a branch's folder the next time a file goes into a record in that branch, which on
-- a quiet branch could be days. A rename now queues one record folder job per section (People,
-- Service Users) in that branch, and that job puts the branch folder's name right.

create or replace function public.cloud_branch_folder_follow()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.name is not distinct from old.name then
    return new;
  end if;
  insert into public.cloud_sync_queue (company_id, source_kind, source_id, dedupe_key)
  select new.company_id,
         'record_folder',
         r.folder_key,
         'branch_follow:' || r.folder_key || ':' || extract(epoch from clock_timestamp())::text
    from (
      select distinct on (f.parent_key) f.folder_key
        from public.cloud_folders f
       where f.company_id = new.company_id
         and f.parent_key in ('branch:people:' || new.id::text, 'branch:service_users:' || new.id::text)
         and f.folder_key ~ '^(person|service_user):'
       order by f.parent_key, f.folder_key
    ) r
  on conflict (company_id, dedupe_key) do nothing;
  return new;
end;
$$;

revoke all on function public.cloud_branch_folder_follow() from public, anon, authenticated;

drop trigger if exists branches_cloud_folder_follow on public.branches;
create trigger branches_cloud_folder_follow
  after update of name on public.branches
  for each row execute function public.cloud_branch_folder_follow();
