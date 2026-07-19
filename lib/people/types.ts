/**
 * Be Care Compliant — People (Phase 3) shared types. Isomorphic (no imports with
 * side effects), so both server data code and client components use one shape.
 */

import type { Rag } from "@/lib/recurrence";

export type EmploymentStatus = "active" | "mat_leave" | "lts" | "leaver";

export const WORKING_STATUS_LABELS: Record<EmploymentStatus, string> = {
  active: "Active",
  mat_leave: "Mat Leave",
  lts: "LTS",
  leaver: "Leaver",
};

export type PersonRecord = {
  id: string;
  company_id: string;
  branch_id: string;
  branch_name?: string | null;
  profile_id: string | null;
  full_name: string;
  job_title: string | null;
  manager_id: string | null;
  team_leader_id: string | null;
  team: string | null;
  employment_status: EmploymentStatus;
  start_date: string | null;
  leaver_date: string | null;
  work_email: string | null;
  mobile: string | null;
  archived_at: string | null;
};

/** A company's compliance requirement; drives one matrix column. */
export type CheckDefinition = {
  id: string;
  company_id: string;
  population: "people" | "service_users";
  key: string;
  name: string;
  description: string;
  form_id: string | null;
  recurring: boolean;
  frequency: "day" | "week" | "month" | "year" | null;
  interval: number | null;
  anchor: "completion" | "expiry";
  lead_days: number;
  expiry_field_key: string | null;
  amber_days: number | null;
  /** Regulatory deadline in days for the on time (PQS) report. Null = grade against
   *  the operational interval. Does not affect the register or scheduling. */
  reporting_interval_days: number | null;
  active: boolean;
  sort_order: number;
  /** 'interval' (own days) or 'after_sup3' (first due aligned to Supervision 3). */
  schedule_mode: "interval" | "after_sup3";
};

/** One check applied to one Record, with its computed RAG (from person_check_status). */
export type CheckStatus = {
  instance_id: string;
  person_id: string;
  definition_id: string;
  check_key: string;
  check_name: string;
  recurring: boolean;
  anchor: "completion" | "expiry";
  form_id: string | null;
  expiry_field_key: string | null;
  due_date: string | null;
  last_completed_on: string | null;
  expiry_date: string | null;
  last_evidence_id: string | null;
  effective_amber: number;
  rag: Rag | "none";
};

/** Record-level rollup (worst RAG across a Record's checks). */
export type PersonRollup = {
  person_id: string;
  company_id: string;
  branch_id: string;
  total_checks: number;
  red_count: number;
  amber_count: number;
  green_count: number;
  rag: Rag | "none";
};

export type RtwLimit = "none" | "20hrs_term" | "20hrs_2nd_job" | "visa_expires";
export type ProbationStatus = "passed" | "failed" | "extended" | "due";

/** Directly-recorded compliance fields for a carer (edited on the record, not a form). */
export type PersonTracker = {
  person_id: string;
  dbs_date: string | null;
  enhanced_dbs_date: string | null;
  rtw_expiry_date: string | null;
  rtw_limits: RtwLimit | null;
  probation_end_due: string | null;
  probation_end_actual: string | null;
  probation_status: ProbationStatus | null;
  probation_extension_date: string | null;
};

/** A derived Supervision slot (Sup 1/2/3): scheduled due + its completion, if done. */
export type SupervisionSlot = {
  n: number;
  due: string | null;
  comp: string | null;
  rag: import("@/lib/recurrence").Rag | "none";
};

/** One row of the register matrix: a Record plus its checks, trackers and supervision slots. */
export type RegisterRow = {
  person: PersonRecord;
  rollup: PersonRollup | null;
  statuses: Record<string, CheckStatus>;
  statusByKey: Record<string, CheckStatus>;
  tracker: PersonTracker | null;
  /** All supervision completion dates (ISO), from real evidence and migrated history.
   *  The cycle slots (Sup 1/2/3) are derived from these in date order. */
  supCompDates: string[];
  /** All appraisal completion dates (ISO). Their COUNT resets the supervision cycle
   *  (each completed appraisal ends a 3-supervision cycle). */
  appraisalCompDates: string[];
};

export const RTW_LIMIT_LABELS: Record<RtwLimit, string> = {
  none: "None",
  "20hrs_term": "20hrs Term",
  "20hrs_2nd_job": "20hrs 2nd Job",
  visa_expires: "Visa Expires",
};

export const PROBATION_STATUS_LABELS: Record<ProbationStatus, string> = {
  passed: "Passed",
  failed: "Failed",
  extended: "Extended",
  due: "Due",
};
