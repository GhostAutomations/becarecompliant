/**
 * Be Care Compliant — People (Phase 3) shared types. Isomorphic (no imports with
 * side effects), so both server data code and client components use one shape.
 */

import type { Rag } from "@/lib/recurrence";

export type EmploymentStatus = "active" | "leaver";

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
  active: boolean;
  sort_order: number;
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

/** One row of the register matrix: a Record plus its checks keyed by definition id. */
export type RegisterRow = {
  person: PersonRecord;
  rollup: PersonRollup | null;
  statuses: Record<string, CheckStatus>;
};
