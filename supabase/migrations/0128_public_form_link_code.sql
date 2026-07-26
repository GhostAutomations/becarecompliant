-- 0128_public_form_link_code.sql
-- Short links. The published URL becomes /f/<code> (one segment, six
-- characters) instead of /f/<company-slug>/<form-key>, so a company can put it
-- on a poster or a payslip without it wrapping onto two lines.
--
-- The code also keeps the company name out of the public URL. It is generated
-- app side from an unambiguous alphabet (no 0/O/1/l/I) and can be regenerated,
-- which instantly kills every copy of the old link.

alter table public.public_form_links add column if not exists code text;

-- Backfill anything created before this migration.
update public.public_form_links
set code = substr(replace(replace(encode(gen_random_bytes(8), 'base64'), '/', ''), '+', ''), 1, 6)
where code is null;

create unique index if not exists public_form_links_code_idx
  on public.public_form_links (lower(code));

alter table public.public_form_links alter column code set not null;
