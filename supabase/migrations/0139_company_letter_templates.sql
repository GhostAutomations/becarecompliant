-- 0139_company_letter_templates
-- Per company editable wording for the FORMAL LETTERS the app sends on a company's
-- behalf (Phil, 2026-07-27: "every letter absence sends"). Today the absence meeting
-- invitation, the conductor's chairing copy, the rearrangement note and the
-- cancellation notice are hard coded in lib/absence/actions.ts, which means a care
-- provider cannot use the wording their own HR adviser approved, even though the
-- letter goes out under their name and forms a formal step in a capability process.
--
-- Built as a GENERAL letters table keyed by a letter key, so probation, disciplinary
-- and return to work letters can be added later without another migration. Seeded
-- lazily in app code from the current wording, so nothing changes until an Admin edits.
--
-- Body is stored as PLAIN TEXT with {{placeholders}} and is escaped and rendered to
-- HTML at send time. Admins never author raw HTML: it would break the email shell and
-- open an injection path into mail we send on their behalf. The functional parts of a
-- letter (the Accept / I cannot attend buttons, the calendar attachment) stay system
-- rendered and are appended around the wording.

create table if not exists public.company_letter_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  key text not null,
  subject text not null default '',
  body text not null default '',
  version integer not null default 1,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, key)
);

-- Wording is kept forever. A letter already sent was sent under the wording live at
-- the time, and an employment process may be challenged months later, so the history
-- must survive an edit.
create table if not exists public.company_letter_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.company_letter_templates(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  version integer not null,
  subject text not null,
  body text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (template_id, version)
);

create index if not exists company_letter_templates_company_idx
  on public.company_letter_templates (company_id);
create index if not exists company_letter_template_versions_template_idx
  on public.company_letter_template_versions (template_id, version desc);

alter table public.company_letter_templates enable row level security;
alter table public.company_letter_template_versions enable row level security;

-- Read: any company member, because the sending code runs as the Manager who books
-- the meeting. Write: Company Admin only, matching every other Settings surface.
drop policy if exists company_letter_templates_select on public.company_letter_templates;
create policy company_letter_templates_select on public.company_letter_templates
  for select using (is_platform_admin() or is_company_member(company_id));

drop policy if exists company_letter_templates_insert on public.company_letter_templates;
create policy company_letter_templates_insert on public.company_letter_templates
  for insert with check (is_platform_admin() or is_company_admin(company_id));

drop policy if exists company_letter_templates_update on public.company_letter_templates;
create policy company_letter_templates_update on public.company_letter_templates
  for update using (is_platform_admin() or is_company_admin(company_id))
  with check (is_platform_admin() or is_company_admin(company_id));

drop policy if exists company_letter_template_versions_select on public.company_letter_template_versions;
create policy company_letter_template_versions_select on public.company_letter_template_versions
  for select using (is_platform_admin() or is_company_member(company_id));

drop policy if exists company_letter_template_versions_insert on public.company_letter_template_versions;
create policy company_letter_template_versions_insert on public.company_letter_template_versions
  for insert with check (is_platform_admin() or is_company_admin(company_id));

-- No delete policy on either table: wording is never removed, only superseded.
