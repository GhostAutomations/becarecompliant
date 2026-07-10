-- 0040_question_bank.sql
-- Phase 5: reusable question bank (founder curated) for the form builder.
--
-- A global library of pre-made questions an author can drop into any form. Reads
-- are open to any authenticated member (they insert copies into their own forms,
-- so nothing sensitive is exposed); writes are Platform Admin (Founder) only,
-- enforced by RLS. Inserting a bank question into a form happens client side in
-- the builder (it just adds a field to the working draft), so no RPC is needed.
--
-- Applies to becarecompliant (ref bgrtcvyjuwopunpnudeu) ONLY.

create table public.question_templates (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  field_type text not null,
  options jsonb,
  help_text text,
  category text,
  population text not null default 'any'
    check (population in ('any', 'people', 'service_users')),
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index question_templates_population_idx
  on public.question_templates (population, active, sort_order);

create trigger question_templates_set_updated_at
  before update on public.question_templates
  for each row execute function public.set_updated_at();

alter table public.question_templates enable row level security;

-- Any authenticated user may read the bank (used to build their own forms).
create policy question_templates_select on public.question_templates
  for select to authenticated using (true);

-- Only the Founder curates the bank.
create policy question_templates_insert on public.question_templates
  for insert to authenticated with check (public.is_platform_admin());

create policy question_templates_update on public.question_templates
  for update to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy question_templates_delete on public.question_templates
  for delete to authenticated using (public.is_platform_admin());
