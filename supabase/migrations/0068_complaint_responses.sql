-- 0068_complaint_responses
-- Store each Initial Response drafted for a complaint (AI generated, then reviewed).
-- An email response is sent via Resend and recorded here; a postal response is
-- recorded here for copying onto headed paper. Append-only (no update/delete), like
-- evidence. Access mirrors complaints (Admins, branch Managers, Founder).
-- Applied to ref bgrtcvyjuwopunpnudeu only.

create table if not exists public.complaint_responses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  complaint_id uuid not null references public.complaints(id) on delete cascade,
  method text not null check (method in ('email', 'post')),
  subject text,
  body text not null,
  recipient text,
  sent_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index complaint_responses_complaint_idx
  on public.complaint_responses (complaint_id, created_at desc);

alter table public.complaint_responses enable row level security;

create policy complaint_responses_select on public.complaint_responses
  for select to authenticated
  using (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or public.is_branch_manager(branch_id)
  );

create policy complaint_responses_insert on public.complaint_responses
  for insert to authenticated
  with check (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or public.is_branch_manager(branch_id)
  );
