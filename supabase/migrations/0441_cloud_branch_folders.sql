-- Be Care Compliant 0441: branch folders in the cloud drive (Phil, 9 Oct 2026, by popup).
--
-- People > [Branch] > [Person], Service Users > [Branch] > [Service user]. A record's folder sits
-- in its branch's folder, named without the branch; a transfer moves the whole folder into the new
-- branch; existing folders are moved in.
--
-- 1. cloud_folders.parent_key: which folder a remembered folder was last put in, so a record that
--    has changed branch is noticed without asking the drive. Null on folders made before this
--    (they are moved, then stamped, the next time they are used).
-- 2. A transfer or a new name queues the record's folder job straight away, so the folder follows
--    the record at once rather than at its next file. Only for records that already have a folder.

alter table public.cloud_folders add column if not exists parent_key text;

create or replace function public.cloud_record_folder_follow()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_key text;
begin
  if new.branch_id is not distinct from old.branch_id and new.full_name is not distinct from old.full_name then
    return new;
  end if;
  v_key := (case when tg_table_name = 'people' then 'person:' else 'service_user:' end) || new.id::text;
  if exists (
    select 1 from public.cloud_folders f
     where f.company_id = new.company_id and f.folder_key = v_key
  ) then
    insert into public.cloud_sync_queue (company_id, source_kind, source_id, dedupe_key)
    values (
      new.company_id,
      'record_folder',
      v_key,
      'record_follow:' || v_key || ':' || extract(epoch from clock_timestamp())::text
    )
    on conflict (company_id, dedupe_key) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.cloud_record_folder_follow() from public, anon, authenticated;

drop trigger if exists people_cloud_folder_follow on public.people;
create trigger people_cloud_folder_follow
  after update of branch_id, full_name on public.people
  for each row execute function public.cloud_record_folder_follow();

drop trigger if exists service_users_cloud_folder_follow on public.service_users;
create trigger service_users_cloud_folder_follow
  after update of branch_id, full_name on public.service_users
  for each row execute function public.cloud_record_folder_follow();
