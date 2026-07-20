-- 0089_invoicing_on_service_user
-- Model change (Phil, 2026-07-20): a private invoicing client is ALWAYS a Service
-- User. Private invoicing details move onto the service_users record, set via a
-- "Private invoicing" checkbox on the Add/Edit Service User form. The invoice
-- bill-to may be the Service User themselves OR a third party (NHS, solicitor,
-- next of kin), with a delivery method (email or post). The standalone
-- private_clients record is dropped; invoices point at the service user and
-- snapshot the bill-to at creation. becarecompliant project ONLY.

-- 1. Private invoicing fields on the service user.
alter table public.service_users
  add column if not exists private_invoicing boolean not null default false,
  add column if not exists invoice_to text
    check (invoice_to is null or invoice_to in ('service_user','nhs','solicitor','next_of_kin','other')),
  add column if not exists invoice_contact_name text,
  add column if not exists invoice_address text,
  add column if not exists invoice_phone text,
  add column if not exists invoice_email text,
  add column if not exists invoice_delivery text
    check (invoice_delivery is null or invoice_delivery in ('email','post'));

-- 2. Invoices point at the service user, with the bill-to snapshotted at creation.
alter table public.invoices
  drop constraint if exists invoices_private_client_id_fkey,
  drop column if exists private_client_id,
  add column if not exists service_user_id uuid references public.service_users(id) on delete restrict,
  add column if not exists invoice_to text,
  add column if not exists bill_to_name text,
  add column if not exists bill_to_address text,
  add column if not exists bill_to_email text,
  add column if not exists bill_to_phone text,
  add column if not exists delivery_method text;

create index if not exists invoices_service_user_idx on public.invoices (service_user_id);

-- 3. Recurring schedules repoint the same way.
alter table public.invoice_schedules
  drop constraint if exists invoice_schedules_private_client_id_fkey,
  drop column if exists private_client_id,
  add column if not exists service_user_id uuid references public.service_users(id) on delete cascade;

-- 4. The standalone payer record is no longer used.
drop table if exists public.private_clients cascade;
