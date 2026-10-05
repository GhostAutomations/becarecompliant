-- Be Care Compliant: complaints v2 for every company (Phil, popup 2026-10-05, after the Bevan run passed).
-- Updates on complaints, close with the Complaint Outcome, initial response by category, the
-- investigation form on informal complaints. On for every company, trial and the Demo, and on by
-- default for new companies.
alter table public.companies alter column complaints_v2 set default true;
update public.companies set complaints_v2 = true where complaints_v2 is distinct from true;

-- Open complaints in a category that needs no initial response, not yet acknowledged, lose the
-- initial response due date (same rule 0389a applied to Bevan). Uses each company's own list.
update public.complaints c
   set acknowledgement_due = null
  from public.complaints_config cc
 where cc.company_id = c.company_id
   and c.status <> 'closed'
   and c.date_acknowledged is null
   and c.acknowledgement_due is not null
   and c.concern_type = any (cc.no_initial_response);

-- Companies without a config row use the default list (Minor Complaint, Concern).
update public.complaints c
   set acknowledgement_due = null
 where c.status <> 'closed'
   and c.date_acknowledged is null
   and c.acknowledgement_due is not null
   and c.concern_type in ('Minor Complaint', 'Concern')
   and not exists (select 1 from public.complaints_config cc where cc.company_id = c.company_id);
