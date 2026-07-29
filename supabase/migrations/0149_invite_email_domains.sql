-- 0149_invite_email_domains
-- Phase 10 Additions (Phil, 2026-07-29). An OPTIONAL allowlist of email domains for the
-- invites an Admin types by hand on Settings > Users, and nothing else.
--
-- WHY. The invite box on that screen is a free text field that provisions a login into a
-- company account holding staff records and Service User records. One slipped character,
-- or a personal address typed in out of habit, and an invitation to that account lands in
-- somebody else's inbox. isSendableAddress already refuses demo and reserved domains at
-- the single door every invite goes through (lib/invites.ts), but it has no idea which
-- real domains a given company actually uses. Only the company does, so the company gets
-- to say.
--
-- OFF BY DEFAULT, AND THAT IS DELIBERATE. Empty array means the feature is off and every
-- address is accepted exactly as today, gmail, outlook and icloud included. Plenty of
-- small providers run their whole office on personal addresses and must not be broken by
-- a column appearing.
--
-- IT DOES NOT COVER TEAM MEMBER LOGINS, ALSO DELIBERATE. The automatic staff invite sent
-- when a person is added or bulk imported (lib/staff/invite.ts) never passes the list, so
-- it is never checked. Phil: "companies wont give work email address out to employee at
-- carer level." A carer's address on their Record IS a personal address by design, so
-- enforcing there would lock a company's entire care workforce out the moment an Admin
-- switched the feature on. The Founder invite path (app/(app)/founder/actions.ts) is
-- exempt for the same structural reason: it operates across companies.
--
-- WHY A COLUMN AND NOT A TABLE. This is a short list of strings owned by one company,
-- read once per invite, never joined and never queried on its own. companies already
-- carries per company settings the same way (people_column_labels, probation_period_days,
-- on_call_rota_scope) and its RLS is already exactly what this needs: companies_select
-- allows any company member, companies_update allows is_company_admin(id) only. So a
-- column inherits "readable by company members, writable by Company Admin" with no new
-- policy, which is also how invoicing_config behaves.
--
-- Values are stored normalised by the app (lowercase, no leading @, whitespace stripped,
-- validated in lib/invite-domains.ts). Matching is case insensitive on the part after the
-- @ and INCLUDES subdomains, so mail.sunrisecare.co.uk passes when sunrisecare.co.uk is
-- listed. No check constraint: the only writer is a Company Admin through the Settings
-- screen, and a malformed entry would only ever narrow that admin's own invites, which
-- they can undo by removing it.
--
-- Idempotent (add column if not exists). Applied to the becarecompliant Supabase project
-- ONLY (ref bgrtcvyjuwopunpnudeu).

alter table public.companies
  add column if not exists invite_email_domains text[] not null default '{}'::text[];

comment on column public.companies.invite_email_domains is
  'Optional allowlist of email domains for MANUAL invites sent from Settings > Users. Empty array means off: any address is accepted. Never applied to the automatic Team Member (staff) invite path or to Founder invites. Stored lowercase without the @; matching is case insensitive and includes subdomains.';
