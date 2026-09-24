-- 0326 — Subject access exports (Phil, 2026-09-24).
--
-- A Company Admin makes one ZIP of everything held about a Person or a Service User. The ZIP is
-- far bigger than a web response may carry, so it is written to a PRIVATE bucket, handed back as
-- a five minute signed link, and removed by the nightly retention run a day later. No storage
-- policies at all: nobody reads the bucket except through a link the server makes.
--
-- sar_exports is the list of what was made, by whom, for whom, and when its file was removed.
-- Admins of the company can read it; only the service role writes it.

insert into storage.buckets (id, name, public, file_size_limit)
values ('subject-access', 'subject-access', false, null)
on conflict (id) do update set public = false;

create table if not exists public.sar_exports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  person_id uuid references public.people(id) on delete set null,
  service_user_id uuid references public.service_users(id) on delete set null,
  record_name text not null,
  storage_path text,
  bytes bigint,
  file_count integer,
  created_by uuid references auth.users(id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now(),
  removed_at timestamptz
);
create index if not exists sar_exports_company_idx on public.sar_exports (company_id, created_at desc);
create index if not exists sar_exports_live_idx on public.sar_exports (created_at) where removed_at is null;

alter table public.sar_exports enable row level security;
drop policy if exists sar_exports_select on public.sar_exports;
create policy sar_exports_select on public.sar_exports for select to authenticated
  using (public.is_company_admin(company_id) or public.is_platform_admin());
