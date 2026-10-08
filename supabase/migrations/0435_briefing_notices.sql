-- 0435: Briefings can carry a memo, a message or attachments, not only a policy or a form
-- (Phil, 2026-10-08: "expand it, so that attachments, memos and messages can be sent out").
--
-- A notice is written ONCE and sent to many people: one briefing_notices row, one assignment per
-- person (kind 'notice'), so the outstanding list, the due date chasers, withdraw and the "who has
-- responded" report all keep working exactly as they do for a policy.
--
-- What the person must do is chosen per notice:
--   read    : opening it is enough. The assignment completes the first time they open it.
--   confirm : they open it and press "I have read this".
--   sign    : they sign it, filed as Evidence on their record like a policy signature.
-- read_at records the first time they opened it, for every response type.
--
-- A notice never changes once sent (no update policy), so what each person read is what was sent.

create table if not exists public.briefing_notices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  kind text not null check (kind in ('memo', 'message', 'attachment')),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  body text check (body is null or char_length(body) <= 20000),
  -- [{ "path": "...", "name": "...", "size": 123, "type": "application/pdf" }], at most 3.
  files jsonb not null default '[]'::jsonb check (jsonb_typeof(files) = 'array' and jsonb_array_length(files) <= 3),
  response text not null check (response in ('read', 'confirm', 'sign')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists briefing_notices_company_idx on public.briefing_notices (company_id, created_at desc);
create index if not exists briefing_notices_created_by_idx on public.briefing_notices (created_by);

alter table public.briefing_notices enable row level security;

alter table public.assignments add column if not exists notice_id uuid references public.briefing_notices(id) on delete cascade;
alter table public.assignments add column if not exists read_at timestamptz;
create index if not exists assignments_notice_idx on public.assignments (notice_id);

alter table public.assignments drop constraint if exists assignments_kind_check;
alter table public.assignments add constraint assignments_kind_check check (kind in ('form', 'policy', 'notice'));

alter table public.assignments drop constraint if exists assignments_target;
alter table public.assignments add constraint assignments_target check (
  (kind = 'form' and form_id is not null and policy_id is null and notice_id is null)
  or (kind = 'policy' and policy_id is not null and form_id is null and notice_id is null)
  or (kind = 'notice' and notice_id is not null and form_id is null and policy_id is null)
);

drop index if exists public.assignments_open_idx;
create unique index assignments_open_idx on public.assignments (person_id, coalesce(form_id, policy_id, notice_id))
  where status = 'assigned';

-- Who can see a notice: the company-wide roles, whoever sent it, a branch lead for anyone in their
-- branch it went to, and the people it was sent to.
drop policy if exists briefing_notices_select on public.briefing_notices;
create policy briefing_notices_select on public.briefing_notices for select to authenticated using (
  public.is_platform_admin()
  or public.is_company_wide(company_id)
  or created_by = (select auth.uid())
  or exists (
    select 1 from public.assignments a
    join public.people pe on pe.id = a.person_id
    where a.notice_id = briefing_notices.id
      and (pe.profile_id = (select auth.uid()) or public.is_branch_lead(pe.branch_id))
  )
);

-- Who can write one: managers and above, as themselves. Never edited or deleted afterwards.
drop policy if exists briefing_notices_insert on public.briefing_notices;
create policy briefing_notices_insert on public.briefing_notices for insert to authenticated with check (
  created_by = (select auth.uid())
  and (
    public.is_platform_admin()
    or public.is_company_wide(company_id)
    or public.is_company_manager(company_id)
  )
);

-- The person opens their notice. Stamps read_at the first time, and completes it when opening is
-- all that was asked. Safe to call every time it is opened.
create or replace function public.open_briefing_notice(p_assignment_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  a public.assignments%rowtype;
  v_response text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into a from public.assignments where id = p_assignment_id;
  if a.id is null or a.kind <> 'notice' then raise exception 'That briefing could not be found'; end if;
  -- Only the person it was sent to. Opening it as their manager is not them reading it.
  if not exists (select 1 from public.people pe where pe.id = a.person_id and pe.profile_id = auth.uid()) then
    raise exception 'That briefing is not yours';
  end if;
  select n.response into v_response from public.briefing_notices n where n.id = a.notice_id;

  update public.assignments set read_at = coalesce(read_at, now()) where id = a.id;
  if a.status = 'assigned' and v_response = 'read' then
    update public.assignments set status = 'completed', completed_at = now() where id = a.id and status = 'assigned';
    return 'completed';
  end if;
  return a.status;
end;
$$;

-- The person presses "I have read this".
create or replace function public.confirm_briefing_notice(p_assignment_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  a public.assignments%rowtype;
  v_response text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into a from public.assignments where id = p_assignment_id;
  if a.id is null or a.kind <> 'notice' then raise exception 'That briefing could not be found'; end if;
  if not exists (select 1 from public.people pe where pe.id = a.person_id and pe.profile_id = auth.uid()) then
    raise exception 'That briefing is not yours';
  end if;
  if a.status <> 'assigned' then raise exception 'That briefing is already done'; end if;
  select n.response into v_response from public.briefing_notices n where n.id = a.notice_id;
  if v_response = 'sign' then raise exception 'This one needs your signature'; end if;
  update public.assignments
  set status = 'completed', completed_at = now(), read_at = coalesce(read_at, now())
  where id = a.id and status = 'assigned';
end;
$$;

revoke all on function public.open_briefing_notice(uuid) from public, anon;
revoke all on function public.confirm_briefing_notice(uuid) from public, anon;
grant execute on function public.open_briefing_notice(uuid) to authenticated;
grant execute on function public.confirm_briefing_notice(uuid) to authenticated;

grant select, insert on public.briefing_notices to authenticated;
