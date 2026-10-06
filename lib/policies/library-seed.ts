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
    "key": "care_certificate",
    "publisher": "Skills for Care",
    "title": "Care Certificate standards",
    "url": "https://www.skillsforcare.org.uk/Developing-your-workforce/Care-Certificate/Care-Certificate-standards.aspx",
    "regions": [
      "england"
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
    "url": "https://www.lgo.org.uk/adult-social-care",
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
    "url": "https://www.hse.gov.uk/lone-working/",
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
      "cqc_reg18",
      "care_certificate"
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
    "requiredBy": [],
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
    "requiredBy": [],
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
  }
];

/** The ten policies Wales regulation 12 names (SI 2017/1264 reg 12, read 2026-10-06). */
export const WALES_REG12_TOPICS: ReadonlySet<string> = new Set([
  "admissions_commencement", "safeguarding", "managing_money", "restraint", "staff_support_development",
  "staff_discipline", "infection_control", "medication", "complaints", "whistleblowing",
]);
