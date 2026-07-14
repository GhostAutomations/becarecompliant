/**
 * Be Care Compliant — Complaints (Phase 10 Additions) shared types. Isomorphic
 * (no side effects), used by both server data code and client components.
 *
 * A complaint is a CASE with an Open / In Progress / Closed lifecycle plus a
 * per-complaint response-deadline RAG. It is NOT the recurring check/RAG engine.
 * Complaints can hold special-category service user data, so access mirrors the
 * Service User isolation model.
 */

import type { Rag } from "@/lib/recurrence";

export type ComplaintStatus = "open" | "in_progress" | "closed";

export const COMPLAINT_STATUS_LABELS: Record<ComplaintStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  closed: "Closed",
};

export const COMPLAINT_STATUS_ORDER: ComplaintStatus[] = ["open", "in_progress", "closed"];

export type ComplaintRelationship =
  | "service_user"
  | "relative"
  | "staff"
  | "professional"
  | "public"
  | "anonymous";

export const RELATIONSHIP_LABELS: Record<ComplaintRelationship, string> = {
  service_user: "Service user",
  relative: "Relative or representative",
  staff: "Staff member",
  professional: "Professional",
  public: "Member of the public",
  anonymous: "Anonymous",
};

/** RAG for a complaint's response deadline. "closed" = resolved, "none" = no due date. */
export type ComplaintRag = Rag | "closed" | "none";

export type ComplaintRecord = {
  id: string;
  company_id: string;
  branch_id: string;
  branch_name?: string | null;
  ref_number: number;
  subject: string;
  details: string | null;
  complainant_name: string | null;
  complainant_relationship: ComplaintRelationship | null;
  service_user_id: string | null;
  service_user_name?: string | null;
  status: ComplaintStatus;
  date_raised: string | null;
  date_occurred: string | null;
  date_acknowledged: string | null;
  acknowledgement_due: string | null;
  investigation_completed: string | null;
  response_due: string | null;
  date_closed: string | null;
  outcome: string | null;
  created_at: string;
};

export type ComplaintsConfig = {
  acknowledgement_days: number;
  response_days: number;
  amber_days: number;
  count_working_days: boolean;
};

/** Cited defaults: acknowledge 3 working days, respond 25 working days (England CQC
 *  Regulation 16 / LGSCO benchmarks; Wales Social Services Complaints Procedure
 *  (Wales) Regulations 2014). Amber window 5 days before the response is due. */
export const DEFAULT_COMPLAINTS_CONFIG: ComplaintsConfig = {
  acknowledgement_days: 3,
  response_days: 25,
  amber_days: 5,
  count_working_days: true,
};
