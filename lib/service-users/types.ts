/**
 * Be Care Compliant — Service Users (Phase 4) shared types. Isomorphic (no side
 * effects), so both server data code and client components use one shape. Service
 * User data is special-category health data: kept entirely distinct from People in
 * UI and data model.
 */

import type { Rag } from "@/lib/recurrence";

export type ServiceStatus = "active" | "hospital" | "respite" | "cancelled";

export const SERVICE_STATUS_LABELS: Record<ServiceStatus, string> = {
  active: "Active",
  hospital: "Hospital",
  respite: "Respite",
  cancelled: "Cancelled",
};

/** The auto-derived state of a Service User's Care Plan Review (never set by hand). */
export type ReviewStatus = "awaiting" | "booked" | "overdue";

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  awaiting: "Awaiting Review",
  booked: "Booked In",
  overdue: "Overdue",
};

export type ServiceUserRecord = {
  id: string;
  company_id: string;
  branch_id: string;
  branch_name?: string | null;
  full_name: string;
  ssid: string | null;
  package_start_date: string | null;
  service_status: ServiceStatus;
  discharge_date: string | null;
  archived_at: string | null;
};

/** Directly-recorded fields on a Service User Record (edited on the record, not a
 *  Form). Holds the Planned Review Date booking: the booked date for the next Care
 *  Plan Review plus the reviewer chosen to complete it. */
export type ServiceUserTracker = {
  service_user_id: string;
  planned_review_date: string | null;
  planned_reviewer_id: string | null;
  planned_reviewer_name?: string | null;
  planned_review_booked_at: string | null;
};

/** One SU check applied to one Record, with its computed RAG (service_user_check_status). */
export type SuCheckStatus = {
  instance_id: string;
  service_user_id: string;
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
export type ServiceUserRollup = {
  service_user_id: string;
  company_id: string;
  branch_id: string;
  total_checks: number;
  red_count: number;
  amber_count: number;
  green_count: number;
  rag: Rag | "none";
};

/** One row of the Service User register: a Record plus its checks and tracker. */
export type ServiceUserRow = {
  service_user: ServiceUserRecord;
  rollup: ServiceUserRollup | null;
  statusByKey: Record<string, SuCheckStatus>;
  tracker: ServiceUserTracker | null;
};

/** The Service User register columns that can be given a shorthand label in
 *  Settings. key is stable (used in the labels map + headers); name is the full
 *  default label. The sticky Service User column is intentionally excluded. */
export const SU_REGISTER_COLUMNS: Array<{ key: string; name: string }> = [
  { key: "ssid", name: "SSID" },
  { key: "status", name: "Status" },
  { key: "package_start_date", name: "Package Start Date" },
  { key: "setup_due", name: "Setup Due" },
  { key: "setup_completed", name: "Setup Completed" },
  { key: "most_recent_review", name: "Most Recent Review" },
  { key: "new_review_due", name: "New Review Due" },
  { key: "planned_review_date", name: "Planned Review Date" },
  { key: "review_status", name: "Review Status" },
];
