-- Bulk onboarding import: migrated compliance history.
-- A company coming on board brings historical completion dates (supervisions,
-- reviews, DBS etc.) that have NO evidence form on file (paper / another system).
-- These live here, kept separate from `evidence` so the immutable-evidence model
-- stays pure (real form submissions only). The check_instance's last_completed_on
-- + due_date reflect the MOST RECENT migrated date; earlier dates are history here.
-- A check_instance with last_completed_on set but last_evidence_id null reads as
-- "completed, migrated, no form on file".

create table if not exists public.migrated_completions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  record_type text not null check (record_type in ('person','service_user')),
  record_id uuid not null,
  definition_id uuid not null references public.check_definitions(id) on delete cascade,
  completed_on date not null,
  note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (record_id, definition_id, completed_on)
);
create index if not exists migrated_completions_record_idx
  on public.migrated_completions (company_id, record_type, record_id);

alter table public.migrated_completions enable row level security;

drop policy if exists migrated_completions_select on public.migrated_completions;
create policy migrated_completions_select on public.migrated_completions
  for select using (
    public.is_company_member(company_id) and (
      public.is_company_admin(company_id)
      or (record_type = 'person' and branch_id is not null and public.is_branch_member(branch_id))
      or (record_type = 'service_user' and branch_id is not null and public.is_branch_manager(branch_id))
    )
  );

create or replace function public.seed_migrated_completion(
  p_record_type text,
  p_record_id uuid,
  p_definition_id uuid,
  p_completed_on date,
  p_next_due date,
  p_is_latest boolean
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company uuid;
  v_branch uuid;
begin
  if p_record_type = 'person' then
    select company_id, branch_id into v_company, v_branch from public.people where id = p_record_id;
  elsif p_record_type = 'service_user' then
    select company_id, branch_id into v_company, v_branch from public.service_users where id = p_record_id;
  else
    raise exception 'invalid record_type %', p_record_type;
  end if;
  if v_company is null then raise exception 'record not found'; end if;
  if not (public.is_company_admin(v_company) or public.is_platform_admin()) then
    raise exception 'not authorised';
  end if;

  insert into public.migrated_completions(
    company_id, branch_id, record_type, record_id, definition_id, completed_on, created_by
  ) values (
    v_company, v_branch, p_record_type, p_record_id, p_definition_id, p_completed_on, auth.uid()
  )
  on conflict (record_id, definition_id, completed_on) do nothing;

  if p_is_latest then
    if p_record_type = 'person' then
      update public.check_instances
        set last_completed_on = p_completed_on, due_date = p_next_due,
            last_evidence_id = null, updated_at = now()
        where person_id = p_record_id and definition_id = p_definition_id;
    else
      update public.check_instances
        set last_completed_on = p_completed_on, due_date = p_next_due,
            last_evidence_id = null, updated_at = now()
        where service_user_id = p_record_id and definition_id = p_definition_id;
    end if;
  end if;
end;
$$;

revoke all on function public.seed_migrated_completion(text, uuid, uuid, date, date, boolean) from public, anon;
grant execute on function public.seed_migrated_completion(text, uuid, uuid, date, date, boolean) to authenticated;
