-- Be Care Compliant — the standing policy set for new starters.
--
-- Phil, 2026-07-27: "New starters aren't auto-assigned the standing policies —
-- someone joining next week gets nothing until a manager remembers." That is the
-- gap that quietly ruins a compliance record: the policies go out on day one to
-- everybody who exists that day, and every carer hired afterwards is invisibly
-- exempt until somebody notices, usually an inspector.
--
-- A policy is either part of what everyone gets on joining, or it is not. Marked
-- on the policy itself, because it is a property of the document ("everyone must
-- read the safeguarding policy") and not of the person.
--
-- Deliberately DEFAULT FALSE, and false for everything that already exists: this
-- silently sends documents to people, so it is opted into per policy rather than
-- switched on under a customer who has not thought about it.

alter table public.company_policies
  add column if not exists assign_to_new_starters boolean not null default false;

comment on column public.company_policies.assign_to_new_starters is
  'When true, a newly added or imported Person is given this policy to sign automatically (0138).';

-- Only active policies can be handed out, so the lookup is on both.
create index if not exists company_policies_new_starters_idx
  on public.company_policies (company_id)
  where assign_to_new_starters and status = 'active';
