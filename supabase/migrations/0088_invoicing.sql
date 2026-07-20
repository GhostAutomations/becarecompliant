-- 0088_invoicing
-- Phase 10 Additions: the Invoicing department (Private Client invoicing).
-- A Pro-only top-level section. A Private Client is a PAYER record (a person or an
-- organisation) that can optionally link to a Service User. Invoices are branch
-- scoped lifecycle documents (Draft / Sent / Paid / Void; Overdue is DERIVED, not
-- stored). Visibility is Branch Manager and above, mirroring Complaints:
-- is_platform_admin() OR is_company_admin(company_id) OR is_branch_manager(branch_id).
-- Applied to the becarecompliant Supabase project ONLY (ref bgrtcvyjuwopunpnudeu).
--
-- Terminology (Phil, confirmed): Invoicing, Private Client, Invoice, Line (never
-- "item"), Rate list. VAT is off by default (regulated personal care is normally
-- VAT-exempt under the welfare exemption); ticking VAT requires a VAT number, and
-- no VAT number means no VAT charged (enforced by a CHECK). Invoice numbers are
-- gapless per company, allocated on Send by a SECURITY DEFINER RPC; the prefix is
-- editable but the starting number is system controlled.

-- ===========================================================================
-- 1. Per-company invoicing configuration (Admin-editable; app falls back to
--    these defaults when the row is absent).
-- ===========================================================================
create table if not exists public.invoicing_config (
  company_id uuid primary key references public.companies(id) on delete cascade,
  vat_enabled boolean not null default false,
  vat_number text,
  number_prefix text not null default 'INV-',
  number_start integer not null default 1 check (number_start >= 1),
  default_payment_terms_days integer not null default 14 check (default_payment_terms_days >= 0),
  payment_details text,            -- bank / BACS details, shown on every invoice
  invoice_footer text,             -- optional terms / notes, shown on every invoice
  overdue_reminders_enabled boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  -- Tick VAT => a VAT number is mandatory. No number => no VAT.
  constraint invoicing_config_vat_number_ck
    check (not vat_enabled or (vat_number is not null and length(btrim(vat_number)) > 0))
);

alter table public.invoicing_config enable row level security;

create policy invoicing_config_select on public.invoicing_config
  for select to authenticated
  using (public.is_platform_admin() or public.is_company_member(company_id));

create policy invoicing_config_insert on public.invoicing_config
  for insert to authenticated
  with check (public.is_platform_admin() or public.is_company_admin(company_id));

create policy invoicing_config_update on public.invoicing_config
  for update to authenticated
  using (public.is_platform_admin() or public.is_company_admin(company_id))
  with check (public.is_platform_admin() or public.is_company_admin(company_id));

-- ===========================================================================
-- 2. Rate list: reusable saved lines/rates, edited in Settings -> Invoicing.
-- ===========================================================================
create table if not exists public.rate_list (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  description text not null,
  unit_price_pence integer not null default 0 check (unit_price_pence >= 0),
  active boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index rate_list_company_idx on public.rate_list (company_id, active, position);

alter table public.rate_list enable row level security;

create policy rate_list_select on public.rate_list
  for select to authenticated
  using (public.is_platform_admin() or public.is_company_member(company_id));

create policy rate_list_insert on public.rate_list
  for insert to authenticated
  with check (public.is_platform_admin() or public.is_company_admin(company_id));

create policy rate_list_update on public.rate_list
  for update to authenticated
  using (public.is_platform_admin() or public.is_company_admin(company_id))
  with check (public.is_platform_admin() or public.is_company_admin(company_id));

create policy rate_list_delete on public.rate_list
  for delete to authenticated
  using (public.is_platform_admin() or public.is_company_admin(company_id));

-- ===========================================================================
-- 3. Private Clients (the payer records). Branch scoped, Manager+ visibility.
-- ===========================================================================
create table if not exists public.private_clients (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete restrict,
  client_type text not null default 'person' check (client_type in ('person', 'organisation')),
  name text not null,                 -- person full name or organisation name
  contact_name text,                  -- named contact (esp. organisations)
  email text,
  phone text,
  address_line1 text,
  address_line2 text,
  city text,
  postcode text,
  -- Optional link to the Service User receiving the care this client pays for.
  service_user_id uuid references public.service_users(id) on delete set null,
  payment_terms_days integer check (payment_terms_days is null or payment_terms_days >= 0),
  notes text,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index private_clients_company_idx on public.private_clients (company_id, status);
create index private_clients_branch_idx on public.private_clients (branch_id);
create index private_clients_service_user_idx on public.private_clients (service_user_id);

alter table public.private_clients enable row level security;

create policy private_clients_select on public.private_clients
  for select to authenticated
  using (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or public.is_branch_manager(branch_id)
  );

create policy private_clients_insert on public.private_clients
  for insert to authenticated
  with check (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or public.is_branch_manager(branch_id)
  );

create policy private_clients_update on public.private_clients
  for update to authenticated
  using (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or public.is_branch_manager(branch_id)
  )
  with check (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or public.is_branch_manager(branch_id)
  );

-- ===========================================================================
-- 4. Recurring invoice schedules (auto-draft the next invoice). Template lines
--    live in invoice_schedule_lines.
-- ===========================================================================
create table if not exists public.invoice_schedules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete restrict,
  private_client_id uuid not null references public.private_clients(id) on delete cascade,
  frequency text not null check (frequency in ('weekly', 'monthly')),
  interval_count integer not null default 1 check (interval_count >= 1),
  next_run_date date not null,
  active boolean not null default true,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index invoice_schedules_company_idx on public.invoice_schedules (company_id, active);
create index invoice_schedules_branch_idx on public.invoice_schedules (branch_id);
create index invoice_schedules_next_run_idx on public.invoice_schedules (next_run_date) where active;

alter table public.invoice_schedules enable row level security;

create policy invoice_schedules_select on public.invoice_schedules
  for select to authenticated
  using (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or public.is_branch_manager(branch_id)
  );

create policy invoice_schedules_insert on public.invoice_schedules
  for insert to authenticated
  with check (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or public.is_branch_manager(branch_id)
  );

create policy invoice_schedules_update on public.invoice_schedules
  for update to authenticated
  using (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or public.is_branch_manager(branch_id)
  )
  with check (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or public.is_branch_manager(branch_id)
  );

create policy invoice_schedules_delete on public.invoice_schedules
  for delete to authenticated
  using (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or public.is_branch_manager(branch_id)
  );

create table if not exists public.invoice_schedule_lines (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.invoice_schedules(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  description text not null,
  quantity numeric(12,2) not null default 1 check (quantity >= 0),
  unit_price_pence integer not null default 0,
  vat_rate numeric(5,2) not null default 0 check (vat_rate >= 0),
  position integer not null default 0
);

create index invoice_schedule_lines_schedule_idx on public.invoice_schedule_lines (schedule_id, position);

alter table public.invoice_schedule_lines enable row level security;

create policy invoice_schedule_lines_all on public.invoice_schedule_lines
  for all to authenticated
  using (
    exists (
      select 1 from public.invoice_schedules s
      where s.id = schedule_id
        and (public.is_platform_admin()
             or public.is_company_admin(s.company_id)
             or public.is_branch_manager(s.branch_id))
    )
  )
  with check (
    exists (
      select 1 from public.invoice_schedules s
      where s.id = schedule_id
        and (public.is_platform_admin()
             or public.is_company_admin(s.company_id)
             or public.is_branch_manager(s.branch_id))
    )
  );

-- ===========================================================================
-- 5. Invoices + their lines. Overdue is derived (sent + due_date < today +
--    unpaid), so status stores only draft / sent / paid / void.
-- ===========================================================================
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete restrict,
  private_client_id uuid not null references public.private_clients(id) on delete restrict,
  schedule_id uuid references public.invoice_schedules(id) on delete set null,
  number_seq integer,               -- gapless per company, allocated on Send
  number text,                      -- display number, e.g. INV-000123
  status text not null default 'draft' check (status in ('draft', 'sent', 'paid', 'void')),
  issue_date date,
  due_date date,
  supply_period_start date,
  supply_period_end date,
  subtotal_pence integer not null default 0,
  vat_pence integer not null default 0,
  total_pence integer not null default 0,
  vat_applied boolean not null default false,
  vat_number_snapshot text,         -- the supplier VAT number at time of send
  notes text,
  sent_at timestamptz,
  paid_at timestamptz,
  paid_date date,
  paid_method text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (company_id, number_seq)
);

create index invoices_company_idx on public.invoices (company_id, status);
create index invoices_branch_idx on public.invoices (branch_id);
create index invoices_client_idx on public.invoices (private_client_id);
create index invoices_due_idx on public.invoices (due_date);

alter table public.invoices enable row level security;

create policy invoices_select on public.invoices
  for select to authenticated
  using (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or public.is_branch_manager(branch_id)
  );

create policy invoices_insert on public.invoices
  for insert to authenticated
  with check (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or public.is_branch_manager(branch_id)
  );

create policy invoices_update on public.invoices
  for update to authenticated
  using (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or public.is_branch_manager(branch_id)
  )
  with check (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or public.is_branch_manager(branch_id)
  );

create policy invoices_delete on public.invoices
  for delete to authenticated
  using (
    public.is_platform_admin()
    or public.is_company_admin(company_id)
    or public.is_branch_manager(branch_id)
  );

create table if not exists public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  description text not null,
  quantity numeric(12,2) not null default 1 check (quantity >= 0),
  unit_price_pence integer not null default 0,
  line_total_pence integer not null default 0,
  vat_rate numeric(5,2) not null default 0 check (vat_rate >= 0),
  position integer not null default 0
);

create index invoice_lines_invoice_idx on public.invoice_lines (invoice_id, position);

alter table public.invoice_lines enable row level security;

create policy invoice_lines_all on public.invoice_lines
  for all to authenticated
  using (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_id
        and (public.is_platform_admin()
             or public.is_company_admin(i.company_id)
             or public.is_branch_manager(i.branch_id))
    )
  )
  with check (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_id
        and (public.is_platform_admin()
             or public.is_company_admin(i.company_id)
             or public.is_branch_manager(i.branch_id))
    )
  );

-- ===========================================================================
-- 6. Send an invoice: allocate the next gapless per-company number and stamp
--    issue/due dates. SECURITY DEFINER so numbering is race-safe under the
--    config row lock; guarded by Manager+ authorisation on THIS invoice's
--    company and branch (record scoped, not just company membership).
-- ===========================================================================
create or replace function public.invoicing_send_invoice(p_invoice_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company uuid;
  v_branch uuid;
  v_status text;
  v_issue date;
  v_due date;
  v_prefix text;
  v_start integer;
  v_terms integer;
  v_vat_enabled boolean;
  v_vat_number text;
  v_next integer;
  v_number text;
begin
  select company_id, branch_id, status, issue_date, due_date
    into v_company, v_branch, v_status, v_issue, v_due
    from public.invoices
    where id = p_invoice_id
    for update;

  if v_company is null then
    raise exception 'Invoice not found';
  end if;

  -- Record scoped authorisation: caller must be Manager+ for this invoice.
  if not (public.is_platform_admin()
          or public.is_company_admin(v_company)
          or public.is_branch_manager(v_branch)) then
    raise exception 'Not authorised to send this invoice';
  end if;

  if v_status <> 'draft' then
    raise exception 'Only a draft invoice can be sent';
  end if;

  -- Ensure a config row exists, then lock it so numbering is serialised.
  insert into public.invoicing_config (company_id)
    values (v_company)
    on conflict (company_id) do nothing;

  select number_prefix, number_start, default_payment_terms_days, vat_enabled, vat_number
    into v_prefix, v_start, v_terms, v_vat_enabled, v_vat_number
    from public.invoicing_config
    where company_id = v_company
    for update;

  select greatest(
           coalesce((select max(number_seq) from public.invoices where company_id = v_company), 0) + 1,
           v_start
         )
    into v_next;

  v_number := coalesce(v_prefix, 'INV-') || lpad(v_next::text, 5, '0');

  update public.invoices
    set number_seq = v_next,
        number = v_number,
        status = 'sent',
        issue_date = coalesce(v_issue, (now() at time zone 'Europe/London')::date),
        due_date = coalesce(
          v_due,
          (now() at time zone 'Europe/London')::date + coalesce(v_terms, 14)
        ),
        vat_applied = v_vat_enabled,
        vat_number_snapshot = case when v_vat_enabled then v_vat_number else null end,
        sent_at = now(),
        updated_at = now()
    where id = p_invoice_id;

  return v_number;
end;
$$;

revoke all on function public.invoicing_send_invoice(uuid) from public;
grant execute on function public.invoicing_send_invoice(uuid) to authenticated;
