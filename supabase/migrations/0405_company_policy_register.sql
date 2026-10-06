-- 0405: a company's own policy register (Phil, 2026-10-06): Bevan's Policies page shows the
-- register built from Thistle Care's policy list, in its sections, instead of the standard
-- regulator and HR checklists. Other companies have no rows and see the standard checklists.
-- Founder curated: companies read it, only the service role writes it.
create table if not exists public.company_policy_register (
  company_id uuid not null references public.companies(id) on delete cascade,
  sort integer not null,
  section text not null,
  title text not null,
  topic_key text not null references public.policy_topics(key),
  legal_basis text,
  primary key (company_id, topic_key)
);
alter table public.company_policy_register enable row level security;
drop policy if exists company_policy_register_read on public.company_policy_register;
create policy company_policy_register_read on public.company_policy_register
  for select to authenticated using (public.is_company_member(company_id) or public.is_platform_admin());

-- Bevan Care Ltd only.
insert into public.company_policy_register (sort, section, title, topic_key, legal_basis, company_id)
select v.sort, v.section, v.title, v.topic_key, v.legal_basis, '84172279-54e4-4d5b-94b4-c92dc05c6baa'::uuid
from (values
  (1,'Governance & quality','Statement of Purpose','statement_of_purpose','Required document: reg 7 (statement of purpose)'),
  (2,'Governance & quality','Governance, Quality Assurance & Improvement','governance_quality','Reg 12(4) and reg 79 (policies kept up to date); reg 80 (quality of care review)'),
  (3,'Governance & quality','Notifications to CIW','notifications_ciw','Reg 60 and Schedule 3 (notifications)'),
  (4,'Governance & quality','Records Management & Retention','records_management','Reg 59 (records)'),
  (5,'Governance & quality','Complaints, Compliments & Feedback','complaints','Reg 12(1) and reg 64 (complaints)'),
  (6,'Governance & quality','Whistleblowing & Speaking Up','whistleblowing','Reg 12(1) and reg 65; Employment Rights Act 1996 s43B'),
  (7,'Governance & quality','Duty of Candour','duty_of_candour','Reg 13 (duty of candour)'),
  (8,'Governance & quality','Business Continuity & Emergency Planning','business_continuity','Good practice (supports reg 12(3))'),
  (9,'Person centred care & rights','Person Centred Care, Rights & Dignity','person_centred_care','Reg 25 (respect and sensitivity); reg 15 (personal plan)'),
  (10,'Person centred care & rights','Equality, Diversity & Inclusion','equality_diversity','Equality Act 2010'),
  (11,'Person centred care & rights','Welsh Language & Communication Needs','welsh_language_communication','Active Offer (More Than Just Words); reg 25'),
  (12,'Person centred care & rights','Consent, Mental Capacity & Deprivation of Liberty','consent_capacity','Mental Capacity Act 2005; reg 31 (deprivation of liberty)'),
  (13,'Person centred care & rights','Use of Control or Restraint','restraint','Reg 12(1) and reg 29(3): ''must have a policy on the use of control or restraint'''),
  (14,'Person centred care & rights','End of Life Care & Death of a Service User','end_of_life','Good practice'),
  (15,'Safeguarding','Safeguarding Adults at Risk','safeguarding','Reg 12(1), regs 26 and 27; Social Services and Well-being (Wales) Act 2014 s128'),
  (16,'Safeguarding','Professional Boundaries, Gifts & Relationships','professional_boundaries','Social Care Wales Code of Professional Practice'),
  (17,'Safeguarding','No Reply at a Visit & Missing Person','no_reply_missing','Good practice'),
  (18,'Service user money','Supporting Individuals to Manage Their Money','managing_money','Reg 12(1) and reg 28'),
  (19,'Service user money','Financial Governance & Fraud Prevention','financial_governance_fraud','Good practice'),
  (20,'Health & clinical care','Medication','medication','Reg 12(1) and reg 58; NICE NG67'),
  (21,'Health & clinical care','Nutrition, Hydration & Food Safety','nutrition_hydration','Good practice'),
  (22,'Health & clinical care','Skin Integrity, Continence & Oral Health','skin_continence_oral','Good practice'),
  (23,'Health & clinical care','Specialist Health Tasks','specialist_health_tasks','Only if staff carry these out'),
  (24,'Health & clinical care','Infection Prevention & Control','infection_control','Reg 12(1) and reg 56'),
  (25,'Health & safety','Health & Safety','health_safety','Health and Safety at Work etc. Act 1974 s2(3) (written down with 5 or more employees); reg 57'),
  (26,'Health & safety','Lone Working & Personal Safety','lone_working','Good practice (HSE)'),
  (27,'Health & safety','Moving & Handling and Falls','moving_handling_falls','Good practice (HSE)'),
  (28,'Health & safety','Driving for Work','driving_for_work','Good practice'),
  (29,'Workforce','Safer Recruitment','recruitment','Reg 35 (fitness of staff)'),
  (30,'Workforce','Staff Support & Development','staff_support_development','Reg 12(1) and reg 36'),
  (31,'Workforce','Probation','probation','Good practice'),
  (32,'Workforce','Capability & Performance','capability','Acas guidance'),
  (33,'Workforce','Staff Discipline','staff_discipline','Reg 12(1) and reg 39; Employment Rights Act 1996 s3; Acas Code of Practice'),
  (34,'Workforce','Grievance','grievance','Employment Rights Act 1996 s3; Acas Code of Practice'),
  (35,'Workforce','Sickness & Attendance','sickness_absence','Statutory Sick Pay rules'),
  (36,'Workforce','Holiday & Annual Leave','holiday_leave','Working Time Regulations'),
  (37,'Workforce','Family Leave','family_leave','Statutory family leave rules'),
  (38,'Workforce','Flexible Working','flexible_working','Statutory right to request'),
  (39,'Workforce','Bullying & Harassment','bullying_harassment','Equality Act 2010; duty to prevent sexual harassment'),
  (40,'Workforce','Stress, Wellbeing & Menopause','wellbeing','Good practice (HSE, Acas)'),
  (41,'Workforce','Staff Code of Conduct','code_of_conduct','Social Care Wales Code of Professional Practice'),
  (42,'Workforce','Leaving Employment','leaving_employment','Good practice'),
  (43,'Workforce','Phones, Social Media & Photographs','social_media','UK GDPR; Social Care Wales Code'),
  (44,'Workforce','Time Off for Dependants & Carer''s Leave','dependants_carers_leave','Employment Rights Act 1996; Carer''s Leave Act 2023'),
  (45,'Workforce','Bereavement & Compassionate Leave','bereavement','Statutory parental bereavement leave'),
  (46,'Workforce','Working Time & Rest Breaks','working_time','Working Time Regulations 1998; minimum wage rules on travel time'),
  (47,'Workforce','Drugs & Alcohol','drugs_alcohol','Good practice (HSE)'),
  (48,'Workforce','Expenses & Mileage','expenses_mileage','HMRC mileage rules; minimum wage rules'),
  (49,'Care delivery','Admissions, Assessment & Personal Plans','admissions_commencement','Reg 12(1) and regs 14, 15 and 16'),
  (50,'Care delivery','Visit Scheduling, Late & Missed Visits','visit_scheduling','Reg 41 (travel time and care time); reg 22 (continuity of care)'),
  (51,'Care delivery','Care Records & Communication','care_records_communication','Reg 59 (records)'),
  (52,'Care delivery','Changes in Condition, Escalation & Hospital','changes_condition_escalation','Good practice'),
  (53,'Care delivery','Refusal of Care','refusal_of_care','Mental Capacity Act 2005'),
  (54,'Care delivery','Access to Homes & Key Holding','access_homes_keys','Good practice'),
  (55,'Care delivery','Personal Care, Domestic Tasks & Community Access','personal_care_tasks','Good practice'),
  (56,'Data & technology','Data Protection & Confidentiality','data_protection','UK GDPR Article 24(2): ''appropriate data protection policies'''),
  (57,'Data & technology','Cyber Security & IT Use','cyber_security_it','Good practice')
) as v(sort, section, title, topic_key, legal_basis)
on conflict (company_id, topic_key) do update
  set sort = excluded.sort, section = excluded.section, title = excluded.title, legal_basis = excluded.legal_basis;
