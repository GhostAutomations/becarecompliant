-- Be Care Compliant — signing rules belong to the POLICY, not the company.
--
-- Phil, 2026-07-26: "how signing works is a generic tile, it should be per policy
-- so when i click add policy it should be part of the settings for that policy,
-- not company generic, however, it should remember that last settings".
--
-- He is right, and it is not just tidiness: a safeguarding policy can reasonably
-- demand a drawn signature and force everyone to re-sign each version, while a
-- dress code can accept a typed name and never chase anybody. One company-wide
-- switch made the strictest policy set the rule for all of them.
--
-- Shape: the columns here are NULLABLE and mean "not set on this policy", in
-- which case policy_config supplies the value. policy_config therefore stops
-- being The Rule and becomes THE REMEMBERED DEFAULT for the next policy added,
-- which is exactly the "remember the last settings" Phil asked for.

alter table public.company_policies
  add column if not exists signature_mode text,
  add column if not exists reassign_on_new_version text;

alter table public.company_policies
  drop constraint if exists company_policies_signature_mode_check;
alter table public.company_policies
  add constraint company_policies_signature_mode_check
  check (signature_mode is null or signature_mode in ('draw', 'type', 'either'));

alter table public.company_policies
  drop constraint if exists company_policies_reassign_check;
alter table public.company_policies
  add constraint company_policies_reassign_check
  check (reassign_on_new_version is null or reassign_on_new_version in ('always', 'ask', 'never'));

-- Existing policies keep behaving exactly as they do today: stamp them with the
-- company's current setting rather than leaving them to follow a default that
-- somebody may later change underneath a signature they have already collected.
update public.company_policies p
set signature_mode = coalesce(p.signature_mode, c.signature_mode, 'either'),
    reassign_on_new_version = coalesce(p.reassign_on_new_version, c.reassign_on_new_version, 'always')
from public.policy_config c
where c.company_id = p.company_id
  and (p.signature_mode is null or p.reassign_on_new_version is null);

update public.company_policies
set signature_mode = coalesce(signature_mode, 'either'),
    reassign_on_new_version = coalesce(reassign_on_new_version, 'always')
where signature_mode is null or reassign_on_new_version is null;

comment on column public.company_policies.signature_mode is
  'How this policy is signed (draw/type/either). Null falls back to policy_config, which is the remembered default for new policies.';
comment on column public.company_policies.reassign_on_new_version is
  'Who signs again when this policy gets a new version (always/ask/never). Null falls back to policy_config.';
