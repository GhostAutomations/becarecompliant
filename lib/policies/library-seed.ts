/**
 * Be Care Compliant: the founder curated starting library for Policies (Phil, 2026-10-06).
 *
 * Every source the AI may write from, and the standard policies. Regulation numbers for Wales
 * were checked against legislation.gov.uk (SI 2017/1264 contents) on 2026-10-06. The server
 * fetches each source itself (lib/policies/sources.ts), so a link that is wrong shows as an
 * error on the Founder library page rather than being trusted.
 *
 * Upserted by the library sync (lib/policies/library-sync.ts) and mirrored in migration 0400.
 */

export type SeedSource = { key: string; publisher: string; title: string; url: string; regions: string[] };
export type SeedQuestion = { key: string; label: string; type: "text" | "yesno" };
export type SeedTopic = {
  key: string;
  title: string;
  summary: string;
  requiredBy: string[];
  questions: SeedQuestion[];
  sourceKeys: string[];
};

export const SEED_SOURCES: SeedSource[] = [
  {
    "key": "w_reg12",
    "publisher": "legislation.gov.uk",
    "title": "Regulated Services (Service Providers and Responsible Individuals) (Wales) Regulations 2017, regulation 12: Policies and procedures",
    "url": "https://www.legislation.gov.uk/wsi/2017/1264/regulation/12",
    "regions": [
      "wales"
    ]
  },
  {
    "key": "w_reg13",
    "publisher": "legislation.gov.uk",
    "title": "Regulated Services (Service Providers and Responsible Individuals) (Wales) Regulations 2017, regulation 13: Duty of candour",
    "url": "https://www.legislation.gov.uk/wsi/2017/1264/regulation/13",
    "regions": [
      "wales"
    ]
  },
  {
    "key": "w_reg14",
    "publisher": "legislation.gov.uk",
    "title": "Regulated Services (Service Providers and Responsible Individuals) (Wales) Regulations 2017, regulation 14: Suitability of the service",
    "url": "https://www.legislation.gov.uk/wsi/2017/1264/regulation/14",
    "regions": [
      "wales"
    ]
  },
  {
    "key": "w_reg15",
    "publisher": "legislation.gov.uk",
    "title": "Regulated Services (Service Providers and Responsible Individuals) (Wales) Regulations 2017, regulation 15: Personal plan",
    "url": "https://www.legislation.gov.uk/wsi/2017/1264/regulation/15",
    "regions": [
      "wales"
    ]
  },
  {
    "key": "w_reg16",
    "publisher": "legislation.gov.uk",
    "title": "Regulated Services (Service Providers and Responsible Individuals) (Wales) Regulations 2017, regulation 16: Review of personal plan",
    "url": "https://www.legislation.gov.uk/wsi/2017/1264/regulation/16",
    "regions": [
      "wales"
    ]
  },
  {
    "key": "w_reg18",
    "publisher": "legislation.gov.uk",
    "title": "Regulated Services (Service Providers and Responsible Individuals) (Wales) Regulations 2017, regulation 18: Provider assessment",
    "url": "https://www.legislation.gov.uk/wsi/2017/1264/regulation/18",
    "regions": [
      "wales"
    ]
  },
  {
    "key": "w_reg19",
    "publisher": "legislation.gov.uk",
    "title": "Regulated Services (Service Providers and Responsible Individuals) (Wales) Regulations 2017, regulation 19: Information about the service",
    "url": "https://www.legislation.gov.uk/wsi/2017/1264/regulation/19",
    "regions": [
      "wales"
    ]
  },
  {
    "key": "w_reg20",
    "publisher": "legislation.gov.uk",
    "title": "Regulated Services (Service Providers and Responsible Individuals) (Wales) Regulations 2017, regulation 20: Service agreement",
    "url": "https://www.legislation.gov.uk/wsi/2017/1264/regulation/20",
    "regions": [
      "wales"
    ]
  },
  {
    "key": "w_reg25",
    "publisher": "legislation.gov.uk",
    "title": "Regulated Services (Service Providers and Responsible Individuals) (Wales) Regulations 2017, regulation 25: Respect and sensitivity",
    "url": "https://www.legislation.gov.uk/wsi/2017/1264/regulation/25",
    "regions": [
      "wales"
    ]
  },
  {
    "key": "w_reg26",
    "publisher": "legislation.gov.uk",
    "title": "Regulated Services (Service Providers and Responsible Individuals) (Wales) Regulations 2017, regulation 26: Safeguarding, overarching requirement",
    "url": "https://www.legislation.gov.uk/wsi/2017/1264/regulation/26",
    "regions": [
      "wales"
    ]
  },
  {
    "key": "w_reg27",
    "publisher": "legislation.gov.uk",
    "title": "Regulated Services (Service Providers and Responsible Individuals) (Wales) Regulations 2017, regulation 27: Safeguarding policies and procedures",
    "url": "https://www.legislation.gov.uk/wsi/2017/1264/regulation/27",
    "regions": [
      "wales"
    ]
  },
  {
    "key": "w_reg28",
    "publisher": "legislation.gov.uk",
    "title": "Regulated Services (Service Providers and Responsible Individuals) (Wales) Regulations 2017, regulation 28: Supporting individuals to manage their money",
    "url": "https://www.legislation.gov.uk/wsi/2017/1264/regulation/28",
    "regions": [
      "wales"
    ]
  },
  {
    "key": "w_reg29",
    "publisher": "legislation.gov.uk",
    "title": "Regulated Services (Service Providers and Responsible Individuals) (Wales) Regulations 2017, regulation 29: The appropriate use of control and restraint",
    "url": "https://www.legislation.gov.uk/wsi/2017/1264/regulation/29",
    "regions": [
      "wales"
    ]
  },
  {
    "key": "w_reg31",
    "publisher": "legislation.gov.uk",
    "title": "Regulated Services (Service Providers and Responsible Individuals) (Wales) Regulations 2017, regulation 31: Deprivation of liberty",
    "url": "https://www.legislation.gov.uk/wsi/2017/1264/regulation/31",
    "regions": [
      "wales"
    ]
  },
  {
    "key": "w_reg35",
    "publisher": "legislation.gov.uk",
    "title": "Regulated Services (Service Providers and Responsible Individuals) (Wales) Regulations 2017, regulation 35: Fitness of staff",
    "url": "https://www.legislation.gov.uk/wsi/2017/1264/regulation/35",
    "regions": [
      "wales"
    ]
  },
  {
    "key": "w_reg36",
    "publisher": "legislation.gov.uk",
    "title": "Regulated Services (Service Providers and Responsible Individuals) (Wales) Regulations 2017, regulation 36: Supporting and developing staff",
    "url": "https://www.legislation.gov.uk/wsi/2017/1264/regulation/36",
    "regions": [
      "wales"
    ]
  },
  {
    "key": "w_reg37",
    "publisher": "legislation.gov.uk",
    "title": "Regulated Services (Service Providers and Responsible Individuals) (Wales) Regulations 2017, regulation 37: Compliance with employer's code of practice",
    "url": "https://www.legislation.gov.uk/wsi/2017/1264/regulation/37",
    "regions": [
      "wales"
    ]
  },
  {
    "key": "w_reg39",
    "publisher": "legislation.gov.uk",
    "title": "Regulated Services (Service Providers and Responsible Individuals) (Wales) Regulations 2017, regulation 39: Disciplinary procedures",
    "url": "https://www.legislation.gov.uk/wsi/2017/1264/regulation/39",
    "regions": [
      "wales"
    ]
  },
  {
    "key": "w_reg56",
    "publisher": "legislation.gov.uk",
    "title": "Regulated Services (Service Providers and Responsible Individuals) (Wales) Regulations 2017, regulation 56: Hygiene and infection control",
    "url": "https://www.legislation.gov.uk/wsi/2017/1264/regulation/56",
    "regions": [
      "wales"
    ]
  },
  {
    "key": "w_reg57",
    "publisher": "legislation.gov.uk",
    "title": "Regulated Services (Service Providers and Responsible Individuals) (Wales) Regulations 2017, regulation 57: Health and safety",
    "url": "https://www.legislation.gov.uk/wsi/2017/1264/regulation/57",
    "regions": [
      "wales"
    ]
  },
  {
    "key": "w_reg58",
    "publisher": "legislation.gov.uk",
    "title": "Regulated Services (Service Providers and Responsible Individuals) (Wales) Regulations 2017, regulation 58: Medicines",
    "url": "https://www.legislation.gov.uk/wsi/2017/1264/regulation/58",
    "regions": [
      "wales"
    ]
  },
  {
    "key": "w_reg59",
    "publisher": "legislation.gov.uk",
    "title": "Regulated Services (Service Providers and Responsible Individuals) (Wales) Regulations 2017, regulation 59: Records",
    "url": "https://www.legislation.gov.uk/wsi/2017/1264/regulation/59",
    "regions": [
      "wales"
    ]
  },
  {
    "key": "w_reg64",
    "publisher": "legislation.gov.uk",
    "title": "Regulated Services (Service Providers and Responsible Individuals) (Wales) Regulations 2017, regulation 64: Complaints policy and procedure",
    "url": "https://www.legislation.gov.uk/wsi/2017/1264/regulation/64",
    "regions": [
      "wales"
    ]
  },
  {
    "key": "w_reg65",
    "publisher": "legislation.gov.uk",
    "title": "Regulated Services (Service Providers and Responsible Individuals) (Wales) Regulations 2017, regulation 65: Whistleblowing",
    "url": "https://www.legislation.gov.uk/wsi/2017/1264/regulation/65",
    "regions": [
      "wales"
    ]
  },
  {
    "key": "w_reg79",
    "publisher": "legislation.gov.uk",
    "title": "Regulated Services (Service Providers and Responsible Individuals) (Wales) Regulations 2017, regulation 79: Duty to ensure policies and procedures are up to date",
    "url": "https://www.legislation.gov.uk/wsi/2017/1264/regulation/79",
    "regions": [
      "wales"
    ]
  },
  {
    "key": "w_reg82",
    "publisher": "legislation.gov.uk",
    "title": "Regulated Services (Service Providers and Responsible Individuals) (Wales) Regulations 2017, regulation 82: Support for staff raising concerns",
    "url": "https://www.legislation.gov.uk/wsi/2017/1264/regulation/82",
    "regions": [
      "wales"
    ]
  },
  {
    "key": "w_reg83",
    "publisher": "legislation.gov.uk",
    "title": "Regulated Services (Service Providers and Responsible Individuals) (Wales) Regulations 2017, regulation 83: Duty of candour (responsible individual)",
    "url": "https://www.legislation.gov.uk/wsi/2017/1264/regulation/83",
    "regions": [
      "wales"
    ]
  },
  {
    "key": "e_reg9",
    "publisher": "legislation.gov.uk",
    "title": "Health and Social Care Act 2008 (Regulated Activities) Regulations 2014, regulation 9: Person-centred care",
    "url": "https://www.legislation.gov.uk/uksi/2014/2936/regulation/9",
    "regions": [
      "england"
    ]
  },
  {
    "key": "e_reg10",
    "publisher": "legislation.gov.uk",
    "title": "Health and Social Care Act 2008 (Regulated Activities) Regulations 2014, regulation 10: Dignity and respect",
    "url": "https://www.legislation.gov.uk/uksi/2014/2936/regulation/10",
    "regions": [
      "england"
    ]
  },
  {
    "key": "e_reg11",
    "publisher": "legislation.gov.uk",
    "title": "Health and Social Care Act 2008 (Regulated Activities) Regulations 2014, regulation 11: Need for consent",
    "url": "https://www.legislation.gov.uk/uksi/2014/2936/regulation/11",
    "regions": [
      "england"
    ]
  },
  {
    "key": "e_reg12",
    "publisher": "legislation.gov.uk",
    "title": "Health and Social Care Act 2008 (Regulated Activities) Regulations 2014, regulation 12: Safe care and treatment",
    "url": "https://www.legislation.gov.uk/uksi/2014/2936/regulation/12",
    "regions": [
      "england"
    ]
  },
  {
    "key": "e_reg13",
    "publisher": "legislation.gov.uk",
    "title": "Health and Social Care Act 2008 (Regulated Activities) Regulations 2014, regulation 13: Safeguarding service users from abuse and improper treatment",
    "url": "https://www.legislation.gov.uk/uksi/2014/2936/regulation/13",
    "regions": [
      "england"
    ]
  },
  {
    "key": "e_reg16",
    "publisher": "legislation.gov.uk",
    "title": "Health and Social Care Act 2008 (Regulated Activities) Regulations 2014, regulation 16: Receiving and acting on complaints",
    "url": "https://www.legislation.gov.uk/uksi/2014/2936/regulation/16",
    "regions": [
      "england"
    ]
  },
  {
    "key": "e_reg17",
    "publisher": "legislation.gov.uk",
    "title": "Health and Social Care Act 2008 (Regulated Activities) Regulations 2014, regulation 17: Good governance",
    "url": "https://www.legislation.gov.uk/uksi/2014/2936/regulation/17",
    "regions": [
      "england"
    ]
  },
  {
    "key": "e_reg18",
    "publisher": "legislation.gov.uk",
    "title": "Health and Social Care Act 2008 (Regulated Activities) Regulations 2014, regulation 18: Staffing",
    "url": "https://www.legislation.gov.uk/uksi/2014/2936/regulation/18",
    "regions": [
      "england"
    ]
  },
  {
    "key": "e_reg19",
    "publisher": "legislation.gov.uk",
    "title": "Health and Social Care Act 2008 (Regulated Activities) Regulations 2014, regulation 19: Fit and proper persons employed",
    "url": "https://www.legislation.gov.uk/uksi/2014/2936/regulation/19",
    "regions": [
      "england"
    ]
  },
  {
    "key": "e_reg20",
    "publisher": "legislation.gov.uk",
    "title": "Health and Social Care Act 2008 (Regulated Activities) Regulations 2014, regulation 20: Duty of candour",
    "url": "https://www.legislation.gov.uk/uksi/2014/2936/regulation/20",
    "regions": [
      "england"
    ]
  },
  {
    "key": "cqc_reg9",
    "publisher": "Care Quality Commission",
    "title": "CQC guidance: Regulation 9, Person-centred care",
    "url": "https://www.cqc.org.uk/guidance-regulation/providers/regulations-service-providers-and-managers/health-social-care-act/regulation-9",
    "regions": [
      "england"
    ]
  },
  {
    "key": "cqc_reg11",
    "publisher": "Care Quality Commission",
    "title": "CQC guidance: Regulation 11, Need for consent",
    "url": "https://www.cqc.org.uk/guidance-regulation/providers/regulations-service-providers-and-managers/health-social-care-act/regulation-11",
    "regions": [
      "england"
    ]
  },
  {
    "key": "cqc_reg12",
    "publisher": "Care Quality Commission",
    "title": "CQC guidance: Regulation 12, Safe care and treatment",
    "url": "https://www.cqc.org.uk/guidance-regulation/providers/regulations-service-providers-and-managers/health-social-care-act/regulation-12",
    "regions": [
      "england"
    ]
  },
  {
    "key": "cqc_reg13",
    "publisher": "Care Quality Commission",
    "title": "CQC guidance: Regulation 13, Safeguarding service users from abuse and improper treatment",
    "url": "https://www.cqc.org.uk/guidance-regulation/providers/regulations-service-providers-and-managers/health-social-care-act/regulation-13",
    "regions": [
      "england"
    ]
  },
  {
    "key": "cqc_reg16",
    "publisher": "Care Quality Commission",
    "title": "CQC guidance: Regulation 16, Receiving and acting on complaints",
    "url": "https://www.cqc.org.uk/guidance-regulation/providers/regulations-service-providers-and-managers/health-social-care-act/regulation-16",
    "regions": [
      "england"
    ]
  },
  {
    "key": "cqc_reg17",
    "publisher": "Care Quality Commission",
    "title": "CQC guidance: Regulation 17, Good governance",
    "url": "https://www.cqc.org.uk/guidance-regulation/providers/regulations-service-providers-and-managers/health-social-care-act/regulation-17",
    "regions": [
      "england"
    ]
  },
  {
    "key": "cqc_reg18",
    "publisher": "Care Quality Commission",
    "title": "CQC guidance: Regulation 18, Staffing",
    "url": "https://www.cqc.org.uk/guidance-regulation/providers/regulations-service-providers-and-managers/health-social-care-act/regulation-18",
    "regions": [
      "england"
    ]
  },
  {
    "key": "cqc_reg19",
    "publisher": "Care Quality Commission",
    "title": "CQC guidance: Regulation 19, Fit and proper persons employed",
    "url": "https://www.cqc.org.uk/guidance-regulation/providers/regulations-service-providers-and-managers/health-social-care-act/regulation-19",
    "regions": [
      "england"
    ]
  },
  {
    "key": "cqc_reg20",
    "publisher": "Care Quality Commission",
    "title": "CQC guidance: Regulation 20, Duty of candour",
    "url": "https://www.cqc.org.uk/guidance-regulation/providers/regulations-service-providers-and-managers/health-social-care-act/regulation-20",
    "regions": [
      "england"
    ]
  },
  {
    "key": "w_sswa128",
    "publisher": "legislation.gov.uk",
    "title": "Social Services and Well-being (Wales) Act 2014, section 128: Duty to report adults at risk",
    "url": "https://www.legislation.gov.uk/anaw/2014/4/section/128",
    "regions": [
      "wales"
    ]
  },
  {
    "key": "e_care_act42",
    "publisher": "legislation.gov.uk",
    "title": "Care Act 2014, section 42: Enquiry by local authority",
    "url": "https://www.legislation.gov.uk/ukpga/2014/23/section/42",
    "regions": [
      "england"
    ]
  },
  {
    "key": "mca_s1",
    "publisher": "legislation.gov.uk",
    "title": "Mental Capacity Act 2005, section 1: The principles",
    "url": "https://www.legislation.gov.uk/ukpga/2005/9/section/1",
    "regions": [
      "wales",
      "england"
    ]
  },
  {
    "key": "mca_s4",
    "publisher": "legislation.gov.uk",
    "title": "Mental Capacity Act 2005, section 4: Best interests",
    "url": "https://www.legislation.gov.uk/ukpga/2005/9/section/4",
    "regions": [
      "wales",
      "england"
    ]
  },
  {
    "key": "mca_s6",
    "publisher": "legislation.gov.uk",
    "title": "Mental Capacity Act 2005, section 6: Section 5 acts: limitations (restraint)",
    "url": "https://www.legislation.gov.uk/ukpga/2005/9/section/6",
    "regions": [
      "wales",
      "england"
    ]
  },
  {
    "key": "w_rrp",
    "publisher": "Welsh Government",
    "title": "Reducing Restrictive Practices Framework",
    "url": "https://www.gov.wales/reducing-restrictive-practices-framework",
    "regions": [
      "wales"
    ]
  },
  {
    "key": "era_43b",
    "publisher": "legislation.gov.uk",
    "title": "Employment Rights Act 1996, section 43B: Disclosures qualifying for protection",
    "url": "https://www.legislation.gov.uk/ukpga/1996/18/section/43B",
    "regions": [
      "wales",
      "england"
    ]
  },
  {
    "key": "prescribed",
    "publisher": "GOV.UK",
    "title": "Whistleblowing: list of prescribed people and bodies",
    "url": "https://www.gov.uk/government/publications/blowing-the-whistle-list-of-prescribed-people-and-bodies--2",
    "regions": [
      "wales",
      "england"
    ]
  },
  {
    "key": "govuk_whistle",
    "publisher": "GOV.UK",
    "title": "Whistleblowing for employees",
    "url": "https://www.gov.uk/whistleblowing",
    "regions": [
      "wales",
      "england"
    ]
  },
  {
    "key": "acas_code",
    "publisher": "Acas",
    "title": "Acas Code of Practice on disciplinary and grievance procedures",
    "url": "https://www.acas.org.uk/acas-code-of-practice-on-disciplinary-and-grievance-procedures/html",
    "regions": [
      "wales",
      "england"
    ]
  },
  {
    "key": "era1999_s10",
    "publisher": "legislation.gov.uk",
    "title": "Employment Relations Act 1999, section 10: Right to be accompanied",
    "url": "https://www.legislation.gov.uk/ukpga/1999/26/section/10",
    "regions": [
      "wales",
      "england"
    ]
  },
  {
    "key": "dbs_referral",
    "publisher": "GOV.UK",
    "title": "Making barring referrals to the DBS",
    "url": "https://www.gov.uk/guidance/making-barring-referrals-to-the-dbs",
    "regions": [
      "wales",
      "england"
    ]
  },
  {
    "key": "dbs_checks",
    "publisher": "GOV.UK",
    "title": "DBS checking service guidance",
    "url": "https://www.gov.uk/government/collections/dbs-checking-service-guidance--2",
    "regions": [
      "wales",
      "england"
    ]
  },
  {
    "key": "scw_awif",
    "publisher": "Social Care Wales",
    "title": "All Wales Induction Framework for Health and Social Care",
    "url": "https://socialcare.wales/qualifications-funding/induction-frameworks/induction-for-health-and-social-care-awif",
    "regions": [
      "wales"
    ]
  },
  {
    "key": "scw_code",
    "publisher": "Social Care Wales",
    "title": "Code of Professional Practice for Social Care",
    "url": "https://socialcare.wales/dealing-with-concerns/codes-of-practice-and-guidance/code-of-professional-practice-for-social-care-workers",
    "regions": [
      "wales"
    ]
  },
  {
    "key": "nice_ng67",
    "publisher": "NICE",
    "title": "NG67 Managing medicines for adults receiving social care in the community: recommendations",
    "url": "https://www.nice.org.uk/guidance/ng67/chapter/Recommendations",
    "regions": [
      "wales",
      "england"
    ]
  },
  {
    "key": "cqc_medicines",
    "publisher": "Care Quality Commission",
    "title": "Medicines information for adult social care services",
    "url": "https://www.cqc.org.uk/guidance-providers/adult-social-care/medicines-information-adult-social-care-services",
    "regions": [
      "england"
    ]
  },
  {
    "key": "ipc_code",
    "publisher": "GOV.UK",
    "title": "The Health and Social Care Act 2008: code of practice on the prevention and control of infections and related guidance",
    "url": "https://www.gov.uk/government/publications/the-health-and-social-care-act-2008-code-of-practice-on-the-prevention-and-control-of-infections-and-related-guidance/health-and-social-care-act-2008-code-of-practice-on-the-prevention-and-control-of-infections-and-related-guidance",
    "regions": [
      "england"
    ]
  },
  {
    "key": "nice_qs61",
    "publisher": "NICE",
    "title": "QS61 Infection prevention and control",
    "url": "https://www.nice.org.uk/guidance/qs61/chapter/Quality-statements",
    "regions": [
      "wales",
      "england"
    ]
  },
  {
    "key": "lgsco",
    "publisher": "Local Government and Social Care Ombudsman",
    "title": "Adult social care complaints",
    "url": "https://www.lgo.org.uk/information-centre/information-for-organisations-we-investigate/independent-care-providers/resources-for-care-providers",
    "regions": [
      "england"
    ]
  },
  {
    "key": "psow",
    "publisher": "Public Services Ombudsman for Wales",
    "title": "Complaining about a care provider",
    "url": "https://www.ombudsman.wales/",
    "regions": [
      "wales"
    ]
  },
  {
    "key": "hse_lone",
    "publisher": "Health and Safety Executive",
    "title": "Protect lone workers",
    "url": "https://www.hse.gov.uk/lone-working/employer/index.htm",
    "regions": [
      "wales",
      "england"
    ]
  },
  {
    "key": "hse_risk",
    "publisher": "Health and Safety Executive",
    "title": "Managing risks and risk assessment at work",
    "url": "https://www.hse.gov.uk/simple-health-safety/risk/index.htm",
    "regions": [
      "wales",
      "england"
    ]
  },
  {
    "key": "ico_gdpr",
    "publisher": "Information Commissioner's Office",
    "title": "A guide to the data protection principles (UK GDPR)",
    "url": "https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/data-protection-principles/a-guide-to-the-data-protection-principles/",
    "regions": [
      "wales",
      "england"
    ]
  },
  {
    "key": "equality_s4",
    "publisher": "legislation.gov.uk",
    "title": "Equality Act 2010, section 4: The protected characteristics",
    "url": "https://www.legislation.gov.uk/ukpga/2010/15/section/4",
    "regions": [
      "wales",
      "england"
    ]
  },
  {
    "key": "acas_grievance",
    "publisher": "Acas",
    "title": "Grievance procedure: step by step",
    "url": "https://www.acas.org.uk/grievance-procedure-step-by-step",
    "regions": [
      "wales",
      "england"
    ]
  },
  {
    "key": "acas_absence",
    "publisher": "Acas",
    "title": "Managing staff sickness and absence",
    "url": "https://www.acas.org.uk/absence-from-work",
    "regions": [
      "wales",
      "england"
    ]
  },
  {
    "key": "gov_ssp",
    "publisher": "GOV.UK",
    "title": "Statutory Sick Pay: employer guide",
    "url": "https://www.gov.uk/employers-sick-pay",
    "regions": [
      "wales",
      "england"
    ]
  },
  {
    "key": "acas_ssp",
    "publisher": "Acas",
    "title": "Statutory Sick Pay (SSP)",
    "url": "https://www.acas.org.uk/checking-sick-pay/statutory-sick-pay-ssp",
    "regions": [
      "wales",
      "england"
    ]
  },
  {
    "key": "gov_holiday",
    "publisher": "GOV.UK",
    "title": "Holiday entitlement",
    "url": "https://www.gov.uk/holiday-entitlement-rights",
    "regions": [
      "wales",
      "england"
    ]
  },
  {
    "key": "acas_holiday",
    "publisher": "Acas",
    "title": "Checking holiday entitlement",
    "url": "https://www.acas.org.uk/checking-holiday-entitlement",
    "regions": [
      "wales",
      "england"
    ]
  },
  {
    "key": "gov_maternity",
    "publisher": "GOV.UK",
    "title": "Maternity pay and leave",
    "url": "https://www.gov.uk/maternity-pay-leave",
    "regions": [
      "wales",
      "england"
    ]
  },
  {
    "key": "gov_paternity",
    "publisher": "GOV.UK",
    "title": "Paternity pay and leave",
    "url": "https://www.gov.uk/paternity-pay-leave",
    "regions": [
      "wales",
      "england"
    ]
  },
  {
    "key": "gov_adoption",
    "publisher": "GOV.UK",
    "title": "Adoption pay and leave",
    "url": "https://www.gov.uk/adoption-pay-leave",
    "regions": [
      "wales",
      "england"
    ]
  },
  {
    "key": "gov_spl",
    "publisher": "GOV.UK",
    "title": "Shared Parental Leave and Pay",
    "url": "https://www.gov.uk/shared-parental-leave-and-pay",
    "regions": [
      "wales",
      "england"
    ]
  },
  {
    "key": "acas_parental",
    "publisher": "Acas",
    "title": "Parental leave",
    "url": "https://www.acas.org.uk/parental-leave",
    "regions": [
      "wales",
      "england"
    ]
  },
  {
    "key": "gov_flexible",
    "publisher": "GOV.UK",
    "title": "Flexible working",
    "url": "https://www.gov.uk/flexible-working",
    "regions": [
      "wales",
      "england"
    ]
  },
  {
    "key": "acas_flex_code",
    "publisher": "Acas",
    "title": "Code of Practice on handling requests for flexible working",
    "url": "https://www.acas.org.uk/acas-code-of-practice-on-flexible-working-requests",
    "regions": [
      "wales",
      "england"
    ]
  },
  {
    "key": "acas_sexual_harassment",
    "publisher": "Acas",
    "title": "Sexual harassment",
    "url": "https://www.acas.org.uk/sexual-harassment",
    "regions": [
      "wales",
      "england"
    ]
  },
  {
    "key": "acas_harassment_changes",
    "publisher": "Acas",
    "title": "Harassment law changes under the Employment Rights Act 2025",
    "url": "https://www.acas.org.uk/employment-rights-act-2025/harassment-law-changes",
    "regions": [
      "wales",
      "england"
    ]
  },
  {
    "key": "acas_bullying",
    "publisher": "Acas",
    "title": "Discrimination, bullying and harassment",
    "url": "https://www.acas.org.uk/discrimination-bullying-and-harassment",
    "regions": [
      "wales",
      "england"
    ]
  },
  {
    "key": "ehrc_harassment",
    "publisher": "Equality and Human Rights Commission",
    "title": "Sexual harassment and harassment at work: technical guidance",
    "url": "https://www.equalityhumanrights.com/guidance/sexual-harassment-and-harassment-work-technical-guidance",
    "regions": [
      "wales",
      "england"
    ]
  },
  {
    "key": "acas_performance",
    "publisher": "Acas",
    "title": "Managing performance",
    "url": "https://www.acas.org.uk/managing-performance",
    "regions": [
      "wales",
      "england"
    ]
  },
  {
    "key": "acas_probation",
    "publisher": "Acas",
    "title": "Probation periods",
    "url": "https://www.acas.org.uk/probation-periods",
    "regions": [
      "wales",
      "england"
    ]
  },
  {
    "key": "acas_dependants",
    "publisher": "Acas",
    "title": "Time off for dependants",
    "url": "https://www.acas.org.uk/time-off-for-dependants",
    "regions": [
      "wales",
      "england"
    ]
  },
  {
    "key": "gov_carers_leave",
    "publisher": "GOV.UK",
    "title": "Carer's Leave",
    "url": "https://www.gov.uk/carers-leave",
    "regions": [
      "wales",
      "england"
    ]
  },
  {
    "key": "acas_bereavement",
    "publisher": "Acas",
    "title": "Time off for bereavement",
    "url": "https://www.acas.org.uk/time-off-for-bereavement",
    "regions": [
      "wales",
      "england"
    ]
  },
  {
    "key": "gov_parental_bereavement",
    "publisher": "GOV.UK",
    "title": "Parental Bereavement Pay and Leave",
    "url": "https://www.gov.uk/parental-bereavement-pay-leave",
    "regions": [
      "wales",
      "england"
    ]
  },
  {
    "key": "gov_working_hours",
    "publisher": "GOV.UK",
    "title": "Maximum weekly working hours",
    "url": "https://www.gov.uk/maximum-weekly-working-hours",
    "regions": [
      "wales",
      "england"
    ]
  },
  {
    "key": "gov_rest_breaks",
    "publisher": "GOV.UK",
    "title": "Rest breaks at work",
    "url": "https://www.gov.uk/rest-breaks-work",
    "regions": [
      "wales",
      "england"
    ]
  },
  {
    "key": "hse_drugs_alcohol",
    "publisher": "Health and Safety Executive",
    "title": "Drug and alcohol abuse at work",
    "url": "https://www.hse.gov.uk/alcoholdrugs/",
    "regions": [
      "wales",
      "england"
    ]
  },
  {
    "key": "acas_social_media",
    "publisher": "Acas",
    "title": "Social media at work",
    "url": "https://www.acas.org.uk/social-media-use-and-employee-privacy",
    "regions": [
      "wales",
      "england"
    ]
  },
  {
    "key": "hse_stress",
    "publisher": "Health and Safety Executive",
    "title": "Work related stress",
    "url": "https://www.hse.gov.uk/stress/",
    "regions": [
      "wales",
      "england"
    ]
  },
  {
    "key": "acas_menopause",
    "publisher": "Acas",
    "title": "Menopause at work",
    "url": "https://www.acas.org.uk/menopause-at-work",
    "regions": [
      "wales",
      "england"
    ]
  },
  {
    "key": "acas_mental_health",
    "publisher": "Acas",
    "title": "Supporting mental health at work",
    "url": "https://www.acas.org.uk/supporting-mental-health-workplace",
    "regions": [
      "wales",
      "england"
    ]
  },
  {
    "key": "gov_mileage",
    "publisher": "GOV.UK",
    "title": "Business travel mileage for employees' own vehicles",
    "url": "https://www.gov.uk/expenses-and-benefits-business-travel-mileage",
    "regions": [
      "wales",
      "england"
    ]
  },
  {
    "key": "gov_nmw_calc",
    "publisher": "GOV.UK",
    "title": "Calculating the minimum wage (including travel time between visits)",
    "url": "https://www.gov.uk/government/publications/calculating-the-minimum-wage",
    "regions": [
      "wales",
      "england"
    ]
  }
];

export const SEED_TOPICS: SeedTopic[] = [
  {
    "key": "admissions_commencement",
    "title": "Admissions and commencement of service",
    "summary": "How a new service starts: checking the service can meet the person's needs, assessment, the personal plan, the service agreement and the information the person is given.",
    "requiredBy": [
      "ciw",
      "cqc"
    ],
    "questions": [
      {
        "key": "referral_routes",
        "label": "How do new referrals reach you (local authority, health, private, self referral)?",
        "type": "text"
      },
      {
        "key": "assessment_by",
        "label": "Who carries out the first assessment, and within how many days of referral?",
        "type": "text"
      },
      {
        "key": "plan_review",
        "label": "How often are personal plans reviewed as standard?",
        "type": "text"
      }
    ],
    "sourceKeys": [
      "w_reg12",
      "w_reg14",
      "w_reg15",
      "w_reg16",
      "w_reg18",
      "w_reg19",
      "w_reg20",
      "e_reg9",
      "cqc_reg9"
    ]
  },
  {
    "key": "safeguarding",
    "title": "Safeguarding adults at risk",
    "summary": "Recognising, responding to and reporting abuse or neglect of adults at risk, and children staff come across.",
    "requiredBy": [
      "ciw",
      "cqc"
    ],
    "questions": [
      {
        "key": "safeguarding_lead",
        "label": "Who is your designated safeguarding lead, and their deputy?",
        "type": "text"
      },
      {
        "key": "local_authorities",
        "label": "Which local authority areas do you deliver care in?",
        "type": "text"
      },
      {
        "key": "out_of_hours",
        "label": "How do staff report a safeguarding concern out of hours?",
        "type": "text"
      }
    ],
    "sourceKeys": [
      "w_reg26",
      "w_reg27",
      "w_sswa128",
      "e_reg13",
      "cqc_reg13",
      "e_care_act42"
    ]
  },
  {
    "key": "managing_money",
    "title": "Managing individuals' money",
    "summary": "Supporting people with their money and property safely: shopping, records and receipts, gifts, and preventing financial abuse.",
    "requiredBy": [
      "ciw",
      "cqc"
    ],
    "questions": [
      {
        "key": "handles_money",
        "label": "Do your care workers handle service users' cash or cards, for example shopping?",
        "type": "yesno"
      },
      {
        "key": "gifts_rule",
        "label": "What is your rule on staff accepting gifts?",
        "type": "text"
      },
      {
        "key": "records_how",
        "label": "How are money transactions recorded and checked, and by whom?",
        "type": "text"
      }
    ],
    "sourceKeys": [
      "w_reg28",
      "e_reg13",
      "mca_s1"
    ]
  },
  {
    "key": "restraint",
    "title": "Use of control and restraint",
    "summary": "The least restrictive approach, when any restrictive practice may be lawful, consent and best interests, deprivation of liberty, recording and notification.",
    "requiredBy": [
      "ciw",
      "cqc"
    ],
    "questions": [
      {
        "key": "restrictive_used",
        "label": "Do any service users currently have restrictive practices in their plans (for example bed rails, locked doors)?",
        "type": "yesno"
      },
      {
        "key": "training",
        "label": "What training do staff receive on positive behaviour support or restrictive practices?",
        "type": "text"
      }
    ],
    "sourceKeys": [
      "w_reg29",
      "w_reg31",
      "w_rrp",
      "mca_s1",
      "mca_s6",
      "e_reg13",
      "cqc_reg13"
    ]
  },
  {
    "key": "staff_support_development",
    "title": "Staff support and development",
    "summary": "Induction, supervision, appraisal, training, qualifications and professional registration.",
    "requiredBy": [
      "ciw",
      "cqc"
    ],
    "questions": [
      {
        "key": "supervision_frequency",
        "label": "How often do care workers have supervision and appraisal?",
        "type": "text"
      },
      {
        "key": "induction",
        "label": "How long is your induction and how is it signed off?",
        "type": "text"
      },
      {
        "key": "training_provider",
        "label": "Who provides your training (in house, external, e-learning)?",
        "type": "text"
      }
    ],
    "sourceKeys": [
      "w_reg36",
      "w_reg37",
      "scw_awif",
      "scw_code",
      "e_reg18",
      "cqc_reg18"
    ]
  },
  {
    "key": "staff_discipline",
    "title": "Staff discipline",
    "summary": "A fair disciplinary procedure: investigation, suspension, hearings, the right to be accompanied, appeals, and referrals to regulators and the DBS.",
    "requiredBy": [
      "ciw",
      "cqc"
    ],
    "questions": [
      {
        "key": "who_hears",
        "label": "Who usually chairs disciplinary hearings and who hears appeals?",
        "type": "text"
      },
      {
        "key": "hr_support",
        "label": "Do you use external HR support? If so, who?",
        "type": "text"
      }
    ],
    "sourceKeys": [
      "w_reg39",
      "acas_code",
      "era1999_s10",
      "dbs_referral",
      "scw_code",
      "e_reg19"
    ]
  },
  {
    "key": "infection_control",
    "title": "Infection prevention and control",
    "summary": "Hand hygiene, personal protective equipment, waste and sharps, outbreaks, staff illness, training and audits in people's homes.",
    "requiredBy": [
      "ciw",
      "cqc"
    ],
    "questions": [
      {
        "key": "ipc_lead",
        "label": "Who is your infection prevention and control lead?",
        "type": "text"
      },
      {
        "key": "ppe_supply",
        "label": "How do care workers get personal protective equipment?",
        "type": "text"
      }
    ],
    "sourceKeys": [
      "w_reg56",
      "e_reg12",
      "cqc_reg12",
      "ipc_code",
      "nice_qs61"
    ]
  },
  {
    "key": "medication",
    "title": "Medication",
    "summary": "Assessing the support each person needs with medicines, consent, records (MAR), administering and prompting, errors, controlled drugs, training and competency.",
    "requiredBy": [
      "ciw",
      "cqc"
    ],
    "questions": [
      {
        "key": "mar_system",
        "label": "Do you use paper MAR charts or an electronic system? Which one?",
        "type": "text"
      },
      {
        "key": "support_levels",
        "label": "What levels of medicines support do you provide (prompting, administering, specialist tasks)?",
        "type": "text"
      },
      {
        "key": "competency",
        "label": "How often are care workers' medicines competencies assessed?",
        "type": "text"
      }
    ],
    "sourceKeys": [
      "w_reg58",
      "e_reg12",
      "cqc_reg12",
      "nice_ng67",
      "cqc_medicines"
    ]
  },
  {
    "key": "complaints",
    "title": "Complaints",
    "summary": "How people complain, acknowledgement and response timescales, investigation, escalation to the Ombudsman, records and learning.",
    "requiredBy": [
      "ciw",
      "cqc"
    ],
    "questions": [
      {
        "key": "complaints_lead",
        "label": "Who handles complaints, and who reviews them if the person is unhappy with the answer?",
        "type": "text"
      },
      {
        "key": "timescales",
        "label": "What timescales do you work to for acknowledging and responding?",
        "type": "text"
      }
    ],
    "sourceKeys": [
      "w_reg64",
      "e_reg16",
      "cqc_reg16",
      "psow",
      "lgsco"
    ]
  },
  {
    "key": "whistleblowing",
    "title": "Whistleblowing",
    "summary": "How staff raise concerns safely, protection under the law, who they can go to outside the company, and how concerns are handled.",
    "requiredBy": [
      "ciw",
      "cqc"
    ],
    "questions": [
      {
        "key": "internal_contact",
        "label": "Who should staff raise a concern with first, and who if it is about that person?",
        "type": "text"
      }
    ],
    "sourceKeys": [
      "w_reg65",
      "w_reg82",
      "era_43b",
      "prescribed",
      "govuk_whistle",
      "e_reg17"
    ]
  },
  {
    "key": "duty_of_candour",
    "title": "Duty of candour",
    "summary": "Being open and honest when things go wrong: telling the person, apologising, and the steps that follow.",
    "requiredBy": [
      "ciw",
      "cqc"
    ],
    "questions": [
      {
        "key": "candour_lead",
        "label": "Who decides when the duty of candour applies, and who makes contact with the person?",
        "type": "text"
      }
    ],
    "sourceKeys": [
      "w_reg13",
      "w_reg83",
      "e_reg20",
      "cqc_reg20"
    ]
  },
  {
    "key": "consent_capacity",
    "title": "Consent and mental capacity",
    "summary": "Seeking consent, assessing capacity, best interests decisions and lasting powers of attorney.",
    "requiredBy": [
      "ciw",
      "cqc"
    ],
    "questions": [
      {
        "key": "capacity_who",
        "label": "Who carries out and records mental capacity assessments in your service?",
        "type": "text"
      }
    ],
    "sourceKeys": [
      "mca_s1",
      "mca_s4",
      "e_reg11",
      "cqc_reg11",
      "w_reg15"
    ]
  },
  {
    "key": "recruitment",
    "title": "Safer recruitment",
    "summary": "Checking staff are fit to work: references, DBS checks, right to work, gaps in employment and ongoing checks.",
    "requiredBy": [
      "ciw",
      "cqc"
    ],
    "questions": [
      {
        "key": "dbs_renewal",
        "label": "How often do you renew DBS checks, or do you use the update service?",
        "type": "text"
      },
      {
        "key": "references",
        "label": "How many references do you require, and from whom?",
        "type": "text"
      }
    ],
    "sourceKeys": [
      "w_reg35",
      "e_reg19",
      "cqc_reg19",
      "dbs_checks"
    ]
  },
  {
    "key": "health_safety",
    "title": "Health and safety",
    "summary": "Risk assessment of people's homes and tasks, reporting accidents, equipment and keeping staff and service users safe.",
    "requiredBy": [
      "ciw",
      "cqc"
    ],
    "questions": [
      {
        "key": "hs_lead",
        "label": "Who is responsible for health and safety in your service?",
        "type": "text"
      }
    ],
    "sourceKeys": [
      "w_reg57",
      "hse_risk",
      "e_reg12"
    ]
  },
  {
    "key": "lone_working",
    "title": "Lone working",
    "summary": "Keeping care workers safe when they work alone in the community: check ins, risk assessment and what to do in an emergency.",
    "requiredBy": [
      "hr"
    ],
    "questions": [
      {
        "key": "checkin",
        "label": "How do care workers check in and out of calls, and what happens if someone does not check in?",
        "type": "text"
      }
    ],
    "sourceKeys": [
      "hse_lone",
      "hse_risk"
    ]
  },
  {
    "key": "data_protection",
    "title": "Data protection and confidentiality",
    "summary": "Handling personal and health information lawfully, keeping records secure, sharing appropriately and responding to requests.",
    "requiredBy": [
      "ciw",
      "cqc"
    ],
    "questions": [
      {
        "key": "dpo",
        "label": "Who is responsible for data protection in your company?",
        "type": "text"
      },
      {
        "key": "systems",
        "label": "Which systems hold service user records (paper, Be Care Compliant, other software)?",
        "type": "text"
      }
    ],
    "sourceKeys": [
      "w_reg59",
      "ico_gdpr",
      "e_reg17"
    ]
  },
  {
    "key": "equality_diversity",
    "title": "Equality, diversity and inclusion",
    "summary": "Treating people fairly and with respect, protected characteristics, language and communication needs.",
    "requiredBy": [
      "hr"
    ],
    "questions": [
      {
        "key": "welsh_language",
        "label": "Do you offer care in Welsh (the Active Offer)?",
        "type": "yesno"
      }
    ],
    "sourceKeys": [
      "equality_s4",
      "w_reg25",
      "e_reg10"
    ]
  },
  {
    "key": "grievance",
    "title": "Grievance",
    "summary": "How a member of staff raises a concern or complaint about their work, who hears it, timescales, the right to be accompanied and appeal.",
    "requiredBy": [
      "hr"
    ],
    "questions": [
      {
        "key": "grievance_to",
        "label": "Who should staff raise a grievance with first, and who hears an appeal?",
        "type": "text"
      }
    ],
    "sourceKeys": [
      "acas_code",
      "acas_grievance"
    ]
  },
  {
    "key": "sickness_absence",
    "title": "Sickness absence",
    "summary": "Reporting sickness, fit notes, Statutory Sick Pay from the first day of illness, return to work meetings and managing frequent or long term absence.",
    "requiredBy": [
      "hr"
    ],
    "questions": [
      {
        "key": "report_to",
        "label": "Who do care workers phone when they are sick, and by what time before their first call?",
        "type": "text"
      },
      {
        "key": "company_sick_pay",
        "label": "Do you pay company sick pay on top of Statutory Sick Pay? If so, how much and for how long?",
        "type": "text"
      },
      {
        "key": "rtw_by",
        "label": "Who holds the return to work interview?",
        "type": "text"
      }
    ],
    "sourceKeys": [
      "acas_absence",
      "gov_ssp",
      "acas_ssp"
    ]
  },
  {
    "key": "holiday_leave",
    "title": "Holiday and annual leave",
    "summary": "Holiday entitlement, how leave is requested and approved, the holiday year, carry over and holiday pay for irregular hours workers.",
    "requiredBy": [
      "hr"
    ],
    "questions": [
      {
        "key": "entitlement",
        "label": "How many days of paid holiday a year does a full time member of staff get, and does that include bank holidays?",
        "type": "text"
      },
      {
        "key": "irregular_hours",
        "label": "How do you work out holiday for staff on zero or variable hours (for example accruing 12.07% of hours worked)?",
        "type": "text"
      },
      {
        "key": "holiday_year",
        "label": "When does your holiday year start?",
        "type": "text"
      },
      {
        "key": "notice",
        "label": "How much notice must staff give to book holiday?",
        "type": "text"
      },
      {
        "key": "carry_over",
        "label": "Can unused holiday be carried over to the next year? If so, how many days?",
        "type": "text"
      }
    ],
    "sourceKeys": [
      "gov_holiday",
      "acas_holiday"
    ]
  },
  {
    "key": "family_leave",
    "title": "Family leave",
    "summary": "Maternity, paternity, adoption, shared parental and unpaid parental leave and pay, and the protections that go with them.",
    "requiredBy": [
      "hr"
    ],
    "questions": [
      {
        "key": "enhanced",
        "label": "Do you pay anything above the statutory rates for maternity, paternity, adoption or shared parental leave? If so, what?",
        "type": "text"
      }
    ],
    "sourceKeys": [
      "gov_maternity",
      "gov_paternity",
      "gov_adoption",
      "gov_spl",
      "acas_parental"
    ]
  },
  {
    "key": "flexible_working",
    "title": "Flexible working",
    "summary": "How staff request flexible working from their first day, how requests are considered and the deadline for a decision.",
    "requiredBy": [
      "hr"
    ],
    "questions": [
      {
        "key": "decides",
        "label": "Who decides flexible working requests?",
        "type": "text"
      }
    ],
    "sourceKeys": [
      "gov_flexible",
      "acas_flex_code"
    ]
  },
  {
    "key": "bullying_harassment",
    "title": "Bullying and harassment",
    "summary": "Preventing and dealing with bullying and harassment, including the duty to take all reasonable steps to prevent sexual harassment and harassment by third parties such as service users or family members.",
    "requiredBy": [
      "hr"
    ],
    "questions": [
      {
        "key": "report_to",
        "label": "Who can staff report bullying or harassment to, other than their line manager?",
        "type": "text"
      }
    ],
    "sourceKeys": [
      "acas_bullying",
      "acas_sexual_harassment",
      "acas_harassment_changes",
      "ehrc_harassment",
      "equality_s4"
    ]
  },
  {
    "key": "capability",
    "title": "Capability and performance",
    "summary": "Supporting and managing staff whose work falls below the standard expected, including informal support, formal stages and dismissal on capability grounds.",
    "requiredBy": [
      "hr"
    ],
    "questions": [
      {
        "key": "stages",
        "label": "Who manages formal capability meetings?",
        "type": "text"
      }
    ],
    "sourceKeys": [
      "acas_performance",
      "acas_code"
    ]
  },
  {
    "key": "probation",
    "title": "Probation",
    "summary": "The probation period for new staff, reviews during it, extending it and what happens at the end.",
    "requiredBy": [
      "hr"
    ],
    "questions": [
      {
        "key": "reviewer",
        "label": "Who carries out probation reviews and signs probation off?",
        "type": "text"
      }
    ],
    "sourceKeys": [
      "acas_probation"
    ]
  },
  {
    "key": "code_of_conduct",
    "title": "Staff code of conduct",
    "summary": "The standards of behaviour expected of care workers: dignity, professional boundaries, gifts, confidentiality, dress, phones and conduct on calls.",
    "requiredBy": [
      "hr"
    ],
    "questions": [
      {
        "key": "gifts",
        "label": "What is your rule on staff accepting gifts or money from service users?",
        "type": "text"
      },
      {
        "key": "uniform",
        "label": "What uniform or dress code do staff follow?",
        "type": "text"
      }
    ],
    "sourceKeys": [
      "scw_code",
      "cqc_reg12",
      "cqc_reg13"
    ]
  },
  {
    "key": "dependants_carers_leave",
    "title": "Time off for dependants and carer's leave",
    "summary": "Emergency time off to care for a dependant, and the week of unpaid carer's leave each year for a dependant with a long term care need.",
    "requiredBy": [
      "hr"
    ],
    "questions": [
      {
        "key": "paid",
        "label": "Is any of this time off paid? If so, how much?",
        "type": "text"
      }
    ],
    "sourceKeys": [
      "acas_dependants",
      "gov_carers_leave"
    ]
  },
  {
    "key": "bereavement",
    "title": "Bereavement and compassionate leave",
    "summary": "Time off and support when a member of staff is bereaved, including statutory parental bereavement leave and pay.",
    "requiredBy": [
      "hr"
    ],
    "questions": [
      {
        "key": "days",
        "label": "How many days of compassionate leave do you give, and are they paid?",
        "type": "text"
      },
      {
        "key": "other",
        "label": "Do you give time off for a funeral or other support? Who should staff tell?",
        "type": "text"
      }
    ],
    "sourceKeys": [
      "acas_bereavement",
      "gov_parental_bereavement"
    ]
  },
  {
    "key": "working_time",
    "title": "Working time and rest breaks",
    "summary": "Maximum weekly hours, the opt out, daily and weekly rest, breaks between calls, night work and travel time between visits counting towards pay.",
    "requiredBy": [
      "hr"
    ],
    "questions": [
      {
        "key": "opt_out",
        "label": "Do you ask staff to opt out of the 48 hour week?",
        "type": "yesno"
      },
      {
        "key": "breaks",
        "label": "What break do staff get during a long run of calls?",
        "type": "text"
      }
    ],
    "sourceKeys": [
      "gov_working_hours",
      "gov_rest_breaks",
      "gov_nmw_calc"
    ]
  },
  {
    "key": "drugs_alcohol",
    "title": "Drugs and alcohol",
    "summary": "Being fit for work, what happens if a care worker is suspected of being under the influence, support for staff and testing if used.",
    "requiredBy": [
      "hr"
    ],
    "questions": [
      {
        "key": "testing",
        "label": "Do you carry out drug or alcohol testing?",
        "type": "yesno"
      }
    ],
    "sourceKeys": [
      "hse_drugs_alcohol"
    ]
  },
  {
    "key": "social_media",
    "title": "Social media and phones",
    "summary": "Using social media and personal phones safely: never sharing anything about service users, photographs, contact with service users and families, and phones while driving.",
    "requiredBy": [
      "hr"
    ],
    "questions": [
      {
        "key": "photos",
        "label": "Are staff ever allowed to take photographs on calls, and on which device?",
        "type": "text"
      }
    ],
    "sourceKeys": [
      "acas_social_media",
      "ico_gdpr",
      "scw_code"
    ]
  },
  {
    "key": "wellbeing",
    "title": "Stress, wellbeing and menopause",
    "summary": "Supporting staff mental health, preventing work related stress, and supporting staff through the menopause.",
    "requiredBy": [
      "hr"
    ],
    "questions": [
      {
        "key": "support",
        "label": "What support do you offer staff, for example an employee assistance line?",
        "type": "text"
      }
    ],
    "sourceKeys": [
      "hse_stress",
      "acas_mental_health",
      "acas_menopause"
    ]
  },
  {
    "key": "expenses_mileage",
    "title": "Expenses and mileage",
    "summary": "Mileage and expenses for travel between calls, approved rates, how to claim, and making sure pay never falls below the minimum wage once travel time is counted.",
    "requiredBy": [
      "hr"
    ],
    "questions": [
      {
        "key": "rate",
        "label": "What mileage rate do you pay per mile?",
        "type": "text"
      },
      {
        "key": "travel_time",
        "label": "Do you pay for travel time between calls? If so, at what rate?",
        "type": "text"
      }
    ],
    "sourceKeys": [
      "gov_mileage",
      "gov_nmw_calc"
    ]
  }
];

/** The ten policies Wales regulation 12 names (SI 2017/1264 reg 12, read 2026-10-06). */
export const WALES_REG12_TOPICS: ReadonlySet<string> = new Set([
  "admissions_commencement", "safeguarding", "managing_money", "restraint", "staff_support_development",
  "staff_discipline", "infection_control", "medication", "complaints", "whistleblowing",
]);
