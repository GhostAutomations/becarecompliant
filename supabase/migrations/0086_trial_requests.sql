-- 0086_trial_requests
-- Public "start free trial" lead capture from the marketing site. Rows are inserted
-- ONLY via the service-role server action (no anon RLS insert), read by the founder.
-- Applied to the becarecompliant project ONLY (ref bgrtcvyjuwopunpnudeu).
create table if not exists public.trial_requests (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  contact_name text not null,
  email text not null,
  phone text,
  tier_interest text,
  team_size text,
  message text,
  source text not null default 'website',
  status text not null default 'new' check (status in ('new','contacted','converted','declined')),
  created_at timestamptz not null default now()
);

alter table public.trial_requests enable row level security;

-- Founder-only visibility/management. Inserts happen through the service-role client
-- in the public server action, which bypasses RLS, so there is intentionally no
-- anonymous insert policy (keeps the public endpoint controlled + spam-resistant).
create policy trial_requests_admin on public.trial_requests
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());
