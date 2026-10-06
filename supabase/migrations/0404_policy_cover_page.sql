-- 0404: an ISO 9001 style cover page on every policy written in Be Care Compliant (Phil,
-- 2026-10-06, from Thistle's Responsible Individual). ISO 9001 clause 7.5 asks for controlled
-- documents to be identified (title, date, reference number), reviewed and approved, and
-- controlled for version, distribution and retention.

alter table public.company_policies
  add column if not exists reference text,
  add column if not exists approver_id uuid references public.profiles(id) on delete set null,
  add column if not exists applies_to text,
  add column if not exists read_by text,
  add column if not exists retention text,
  add column if not exists classification text;

create unique index if not exists company_policies_reference_uniq
  on public.company_policies (company_id, reference) where reference is not null;

-- The change history on the cover, kept with each version as it was approved.
alter table public.company_policy_versions
  add column if not exists change_summary text,
  add column if not exists approved_by_name text,
  add column if not exists approved_by_role text;

-- What the Write page asked, carried to the draft page.
alter table public.policy_drafts add column if not exists cover jsonb;

-- Reference numbers per company and area (POL-HR-004), never reused even after a delete.
create table if not exists public.policy_reference_counters (
  company_id uuid not null references public.companies(id) on delete cascade,
  prefix text not null check (prefix ~ '^[A-Z]{2,6}$'),
  last integer not null default 0,
  primary key (company_id, prefix)
);
alter table public.policy_reference_counters enable row level security;

create or replace function public.next_policy_reference(cid uuid, p_prefix text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n integer;
begin
  if not public.can_write_policies(cid) then
    raise exception 'not allowed to number policies for this company';
  end if;
  if p_prefix !~ '^[A-Z]{2,6}$' then
    raise exception 'bad prefix';
  end if;
  insert into public.policy_reference_counters as c (company_id, prefix, last)
  values (cid, p_prefix, 1)
  on conflict (company_id, prefix) do update set last = c.last + 1
  returning c.last into n;
  return 'POL-' || p_prefix || '-' || lpad(n::text, 3, '0');
end;
$$;
revoke all on function public.next_policy_reference(uuid, text) from public, anon;
grant execute on function public.next_policy_reference(uuid, text) to authenticated;
