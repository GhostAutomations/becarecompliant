-- 0212 — the product keeps its own correspondence
--
-- Until now Be Care Compliant could SEND but never RECEIVE. becarecompliant.com had no MX
-- record at all, and the trial acknowledgement told applicants "just reply to this email" from a
-- no-reply address into a domain with no inbox. Anyone who replied — and after asking for a
-- trial, replying is the natural thing to do — vanished.
--
-- Resend can receive, but it keeps received mail for THIRTY DAYS on every plan, Pro included.
-- That is a postbox, not a record. For a company whose product is about keeping records, and
-- whose correspondence will eventually include contracts and a DPA, thirty days is not a
-- retention policy. So the mail lands here, in our own database, permanently, and Resend is
-- reduced to the thing that carries it.
--
-- The other half of the point: a reply belongs to the LEAD, not to somebody's inbox. A trial
-- request and the conversation about it are the same thing, and the founder console should show
-- them together.

create table if not exists public.founder_emails (
  id uuid primary key default gen_random_uuid(),

  -- 'in' = received from a person. 'out' = sent by us from the console.
  direction text not null check (direction in ('in', 'out')),

  -- Resend's own id for a received email, used to fetch the body and to dedupe deliveries.
  -- Unique so a webhook retry can never store the same email twice.
  resend_email_id text,

  -- RFC message ids. in_reply_to and references are what make a reply land in the same thread
  -- in the recipient's mail client rather than starting a new one.
  message_id text,
  in_reply_to text,
  reference_ids text,

  from_address text not null,
  from_name text,
  to_addresses text[] not null default '{}',
  cc_addresses text[] not null default '{}',
  subject text,

  -- BOTH are stored, but only body_text is ever rendered. Inbound HTML is written by a stranger
  -- on the internet; it is kept for the record and for a future sanitising renderer, and it must
  -- never reach dangerouslySetInnerHTML.
  body_text text,
  body_html text,

  -- Metadata only in v1. No attachment files are downloaded or stored.
  attachments jsonb not null default '[]'::jsonb,

  -- What this message is about, when we can tell. Set by matching the address against a lead.
  trial_request_id uuid references public.trial_requests(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,

  -- Housekeeping the founder actually uses.
  is_read boolean not null default false,
  is_spam boolean not null default false,

  sent_by uuid references public.profiles(id) on delete set null,
  send_error text,

  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists founder_emails_resend_id_idx
  on public.founder_emails (resend_email_id)
  where resend_email_id is not null;

create index if not exists founder_emails_occurred_idx
  on public.founder_emails (occurred_at desc);

create index if not exists founder_emails_trial_request_idx
  on public.founder_emails (trial_request_id, occurred_at);

-- Matching a new message to a lead is a lookup by address, so index the address lowercased the
-- same way the matcher compares it.
create index if not exists founder_emails_from_idx
  on public.founder_emails (lower(from_address));

alter table public.founder_emails enable row level security;

-- The founder reads it. NOTHING has an insert or update policy: every write goes through the
-- service role inside the webhook and the reply action. A customer's email is not editable by
-- the customer, and no tenant can see another tenant's correspondence because no tenant can see
-- this table at all.
drop policy if exists founder_emails_select on public.founder_emails;
create policy founder_emails_select on public.founder_emails
  for select to authenticated
  using (public.is_platform_admin());

comment on table public.founder_emails is
  'Every email the platform receives or sends from the founder console. The permanent record: Resend keeps received mail for 30 days on every plan, so this table is the archive, not Resend.';
comment on column public.founder_emails.body_html is
  'Stored for the record only. NEVER rendered — inbound HTML is attacker-controlled. The console renders body_text.';
