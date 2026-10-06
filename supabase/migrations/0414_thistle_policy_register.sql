-- Thistle gets the same 57 policy register as Bevan (Phil, 2026-10-07: "We need the full policy
-- register now on Thistle"). Copied from Bevan's rows, so the two stay identical. Safe to run twice.
insert into public.company_policy_register (company_id, sort, section, title, topic_key, legal_basis)
select 'eae26e83-1e41-472b-abc0-e2b39b907e49'::uuid, sort, section, title, topic_key, legal_basis
from public.company_policy_register
where company_id = '84172279-54e4-4d5b-94b4-c92dc05c6baa'
on conflict (company_id, topic_key) do nothing;
