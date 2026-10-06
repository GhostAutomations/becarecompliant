-- Be Care Compliant: the policy guidance library, AI drafts and the required policies
-- checklist (Phil, 2026-10-06: "build all ... the guidance library ... Write a new policy with
-- AI ... Improve my policy ... the required policies checklist").
--
--   policy_sources  every official source the AI may write from: publisher, title, link, which
--                   nations it applies to, and the text as last APPROVED (current_text) with the
--                   day it was checked. Every 28 days the server fetches each source again; a
--                   changed page waits as pending_text with a plain English summary until the
--                   founder approves it (nothing reaches a customer unseen).
--   policy_topics   the standard policies: title, what it covers, which regulators expect it,
--                   the few questions asked about the company's own arrangements, and the
--                   sources it is written from.
--   policy_drafts   a company's AI draft (write) or review (improve), kept until approved,
--                   which turns it into a policy or a new version.
--
-- Library tables: everyone signed in may read, only the founder writes. Drafts: the people
-- who may write the company's policies (can_write_policies, 0399).

create table if not exists public.policy_sources (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  publisher text not null,
  title text not null,
  url text not null,
  regions text[] not null default '{wales,england}',
  licence text not null default 'Open Government Licence v3.0, unless the source states otherwise',
  active boolean not null default true,
  current_text text,
  current_hash text,
  checked_at timestamptz,
  approved_at timestamptz,
  pending_text text,
  pending_hash text,
  pending_summary text,
  pending_found_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

create table if not exists public.policy_topics (
  key text primary key,
  title text not null,
  summary text not null,
  required_by text[] not null default '{}',
  questions jsonb not null default '[]',
  source_keys text[] not null default '{}',
  sort int not null default 0,
  active boolean not null default true
);

create table if not exists public.policy_drafts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  topic_key text not null references public.policy_topics(key),
  kind text not null check (kind in ('write', 'improve')),
  policy_id uuid references public.company_policies(id) on delete set null,
  title text not null,
  answers jsonb not null default '{}',
  input_text text,
  draft_text text,
  review jsonb,
  sources jsonb not null default '[]',
  status text not null default 'draft' check (status in ('draft', 'approved', 'discarded')),
  approved_policy_id uuid references public.company_policies(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists policy_drafts_company_idx on public.policy_drafts (company_id, created_at desc);

-- A company policy can be told its guidance changed (founder approved a source change).
alter table public.company_policies
  add column if not exists guidance_changed_at timestamptz,
  add column if not exists guidance_change_note text;

alter table public.policy_sources enable row level security;
alter table public.policy_topics enable row level security;
alter table public.policy_drafts enable row level security;

drop policy if exists policy_sources_select on public.policy_sources;
create policy policy_sources_select on public.policy_sources for select to authenticated using (true);
drop policy if exists policy_sources_write on public.policy_sources;
create policy policy_sources_write on public.policy_sources for all
  using (public.is_platform_admin()) with check (public.is_platform_admin());

drop policy if exists policy_topics_select on public.policy_topics;
create policy policy_topics_select on public.policy_topics for select to authenticated using (true);
drop policy if exists policy_topics_write on public.policy_topics;
create policy policy_topics_write on public.policy_topics for all
  using (public.is_platform_admin()) with check (public.is_platform_admin());

drop policy if exists policy_drafts_all on public.policy_drafts;
create policy policy_drafts_all on public.policy_drafts for all
  using (public.can_write_policies(company_id)) with check (public.can_write_policies(company_id));

-- The starting library (72 sources, 17 topics) is NOT seeded here: it lives in
-- lib/policies/library-seed.ts and the founder's "Sync and check sources" (and the 28 day
-- cron) upsert it, so the list has one home and the repo stays the source of truth.
