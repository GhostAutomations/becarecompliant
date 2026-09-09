-- Be Care Compliant — the service user record gains a home address and a phone number.
--
-- Phil, 2026-09-09, asking the Individual Plan Review to prefill them: "dont need name
-- address should be prefilled from our reocrds. phone number unless the phone number has
-- changed and needs to be updated."
--
-- There was nothing to prefill from. The record held a name, an SSID, a branch and a
-- package start date, and the only address and phone anywhere near it were invoice_address
-- and invoice_phone — billing contacts, which for a council funded package is a council and
-- for a private one is often a daughter in another city. Both were empty on every row.
--
-- For a domiciliary agency that is a hole in the record rather than a missing form field:
-- the home address is where carers are sent, and CIW expects it on file. So it belongs on
-- the record, asked once when the person is added, and every form that wants it reads it
-- from here instead of asking again.
--
-- Structured, not one line of text, so it matches the form engine's `address` answer shape
-- (lib/form-schema.ts ADDRESS_PARTS) and can be prefilled into a review field field for
-- field. Nullable at the database, required at the point of asking: the 27 records that
-- exist were created before the question did, and a NOT NULL here would lock the office out
-- of its own register rather than prompting anyone to fill it in.

alter table service_users
  add column if not exists address jsonb,
  add column if not exists phone text;

comment on column service_users.address is
  'Home address, structured as {line1,line2,city,county,postcode} to match the form engine''s address answer. Where the care is delivered — NOT invoice_address, which is where the bill goes.';
comment on column service_users.phone is
  'The service user''s own contact number. NOT invoice_phone, which is the bill payer''s.';
