/**
 * Be Care Compliant — the core care rules a policy is checked against when it is not one of the
 * standard policies (Phil, 2026-10-08). One list for both nations: promptSources keeps only the
 * ones for the company's nation, so Wales gets the 2017 Regulations, the Social Care Wales Code and
 * NICE home care, and England gets the Health and Social Care Act regulations and CQC guidance.
 * Shared basics (mental capacity, equality, data protection, risk) apply to both.
 */

import type { PolicyTopic } from "./data";

export const GENERAL_SOURCE_KEYS = [
  // Wales
  "w_reg12",
  "w_reg79",
  "w_reg21",
  "scw_code",
  // England
  "e_reg17",
  "cqc_reg17",
  "e_reg9",
  "e_reg12",
  // Both
  "nice_ng21",
  "mca_s1",
  "equality_s4",
  "ico_gdpr",
  "hse_risk",
] as const;

/** Stands in for a topic when the policy is not a standard one. Its key is never stored. */
export const GENERAL_TOPIC: PolicyTopic = {
  key: "",
  title: "Policy",
  summary: "A policy that is not one of the standard policies, checked against the core care rules.",
  required_by: [],
  questions: [],
  source_keys: [...GENERAL_SOURCE_KEYS],
};
