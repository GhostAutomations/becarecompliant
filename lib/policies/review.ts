/**
 * Be Care Compliant: a policy's review status (2026-10-06). Pure and importless.
 * Red once the review date has passed, amber in the 30 days before it, green otherwise, the same
 * reading as a check. No date at all is amber: "kept up to date" cannot be shown without one.
 */

export const POLICY_REVIEW_AMBER_DAYS = 30;

export type PolicyReviewRag = "red" | "amber" | "green";

export function policyReviewRag(dueIso: string | null, todayIso: string): PolicyReviewRag {
  if (!dueIso) return "amber";
  if (dueIso < todayIso) return "red";
  const days = (Date.parse(`${dueIso}T00:00:00Z`) - Date.parse(`${todayIso}T00:00:00Z`)) / 86_400_000;
  return days <= POLICY_REVIEW_AMBER_DAYS ? "amber" : "green";
}

/** Which regulator's checklist a company sees. Unknown shows both. */
export function checklistFor(regulator: string | null): Array<"ciw" | "cqc"> {
  if (regulator === "ciw") return ["ciw"];
  if (regulator === "cqc") return ["cqc"];
  return ["ciw", "cqc"];
}
