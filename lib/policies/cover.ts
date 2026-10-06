/**
 * The policy cover page (Phil, 2026-10-06, from Thistle's Responsible Individual, who wants
 * policies to meet ISO 9001). ISO 9001 clause 7.5 asks that a controlled document is identified
 * (title, date, reference number), reviewed and approved, and controlled for version,
 * distribution and retention. So every policy written in Be Care Compliant prints a cover with
 * those, most of them filled in from what the system already holds.
 *
 * Pure: the choices, their wording, and reading them from a form. No runtime imports.
 */

export const APPLIES_TO = ["All staff", "Care and support staff", "Office and management staff"] as const;
export const READ_BY = [
  "All staff must read and sign",
  "Care and support staff must read and sign",
  "Managers and office staff must read and sign",
  "Available to read, no signature needed",
] as const;
export const RETENTION = [
  "Kept for 8 years after it is replaced",
  "Kept for 6 years after it is replaced",
  "Kept for 10 years after it is replaced",
] as const;
export const CLASSIFICATION = ["Internal", "Public", "Confidential"] as const;

export type CoverChoices = {
  applies_to: string;
  read_by: string;
  retention: string;
  classification: string;
  approver_id: string | null;
};

export const DEFAULT_COVER: CoverChoices = {
  applies_to: APPLIES_TO[0],
  read_by: READ_BY[0],
  retention: RETENTION[0],
  classification: CLASSIFICATION[0],
  approver_id: null,
};

function pick(list: readonly string[], v: unknown, fallback: string): string {
  const s = String(v ?? "").trim();
  return list.includes(s) ? s : fallback;
}

/** The cover choices from a submitted form; anything not on the list falls back to the default. */
export function coverFromForm(get: (k: string) => unknown): CoverChoices {
  const approver = String(get("approver_id") ?? "").trim();
  return {
    applies_to: pick(APPLIES_TO, get("applies_to"), DEFAULT_COVER.applies_to),
    read_by: pick(READ_BY, get("read_by"), DEFAULT_COVER.read_by),
    retention: pick(RETENTION, get("retention"), DEFAULT_COVER.retention),
    classification: pick(CLASSIFICATION, get("classification"), DEFAULT_COVER.classification),
    approver_id: approver || null,
  };
}

/** The same, from a stored draft (anything unknown becomes the default). */
export function coverFromStored(v: unknown): CoverChoices {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return coverFromForm((k) => o[k]);
}

/** The area a reference number is filed under: HR, CARE (what the regulator expects) or GEN. */
export function referencePrefix(requiredBy: readonly string[] | null | undefined): string {
  const r = requiredBy ?? [];
  if (r.includes("hr")) return "HR";
  if (r.includes("ciw") || r.includes("cqc")) return "CARE";
  return "GEN";
}

/** A reference someone typed: letters, numbers, dashes and full stops, at most 30. */
export function cleanReference(v: unknown): string | null {
  const s = String(v ?? "").trim().toUpperCase().replace(/\s+/g, "-");
  if (!s) return null;
  return /^[A-Z0-9][A-Z0-9.\-/]{0,29}$/.test(s) ? s : null;
}

export type CoverPage = {
  reference: string | null;
  title: string;
  companyName: string;
  version: number;
  approvedOn: string;
  approvedBy: string | null;
  owner: string | null;
  nextReview: string | null;
  appliesTo: string;
  readBy: string;
  retention: string;
  classification: string;
  history: Array<{ version: number; date: string; change: string; approvedBy: string | null }>;
};
