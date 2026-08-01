-- 0162_sms_inbound_and_opt_outs
--
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).
--
-- INBOUND SMS. Until now SMS was send only: a manager who replied to an escalation text was
-- talking to nobody. Their reply reached Twilio and stopped there. Phil ruled out an
-- alphanumeric Sender ID for exactly this reason (2026-08-01: "i dont want to go alphanumeric as
-- people cant reply then"), so the number we send from is a real UK mobile and replies must land
-- somewhere a Company Admin will see them.
--
-- TWO TABLES, TWO JOBS.
--
--   sms_inbound   every text we receive, matched to a profile and a company where we can.
--   sms_opt_outs  numbers that have texted STOP. The send path refuses these BEFORE it spends a
--                 credit, so an opted out person costs nothing and receives nothing.
--
-- WHY OPT OUT IS KEYED ON THE NUMBER, not the profile. The obligation is "do not text this
-- number". A number that matches no profile (a mistyped digit, an old staff mobile, a wrong
-- number) must still be honoured, and it must survive that person leaving and their profile row
-- being reassigned or archived.
--
-- NO WRITE POLICIES anywhere below, deliberately. Both tables are written by the Twilio webhook
-- through the service role. There is no user action that should create an inbound message, and a
-- Company Admin must not be able to un opt out somebody on their behalf: only the holder of the
-- phone can do that, by texting START.

create table if not exists public.sms_inbound (
  id uuid primary key default gen_random_uuid(),
  -- Twilio's MessageSid. UNIQUE is the idempotency spine: Twilio retries a webhook that did not
  -- answer 200, and a retry must not create a second copy of the same reply.
  twilio_sid text not null unique,
  -- Null when the number matches nobody we know. The message is still kept: an unmatched STOP
  -- still has to be obeyed, and an unmatched reply is a support question worth seeing.
  company_id uuid references public.companies(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  from_number text not null,
  to_number text not null,
  body text not null default '',
  -- 'stop', 'start' or 'help' when the whole message was one of those words, else null.
  keyword text check (keyword in ('stop', 'start', 'help')),
  received_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists sms_inbound_company_idx
  on public.sms_inbound (company_id, received_at desc);
create index if not exists sms_inbound_from_idx
  on public.sms_inbound (from_number, received_at desc);

create table if not exists public.sms_opt_outs (
  phone text primary key,
  -- Best effort context, for the Notifications page. Neither is required for the block to work.
  company_id uuid references public.companies(id) on delete set null,
  profile_id uuid references public.profiles(id) on delete set null,
  opted_out_at timestamptz not null default now(),
  source text not null default 'sms_stop'
);

create index if not exists sms_opt_outs_company_idx on public.sms_opt_outs (company_id);

-- The webhook looks a number up against every profile in the system on each inbound message.
-- Without this that is a sequential scan of profiles on the hot path of a third party retry.
create index if not exists profiles_phone_idx on public.profiles (phone) where phone is not null;

alter table public.sms_inbound enable row level security;
alter table public.sms_opt_outs enable row level security;

-- Replies can name a service user, an incident or a staff absence, so they are read by Company
-- Admins and the founder, not by every member. A row with a null company_id fails
-- is_company_admin and is therefore visible to the founder alone, which is right: an unmatched
-- number belongs to no tenant and must not be shown to a guessed one.
drop policy if exists sms_inbound_select on public.sms_inbound;
create policy sms_inbound_select on public.sms_inbound
  for select to authenticated
  using (public.is_company_admin(company_id) or public.is_platform_admin());

drop policy if exists sms_opt_outs_select on public.sms_opt_outs;
create policy sms_opt_outs_select on public.sms_opt_outs
  for select to authenticated
  using (public.is_company_admin(company_id) or public.is_platform_admin());
