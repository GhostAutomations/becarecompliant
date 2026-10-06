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

/**
 * The area a reference number is filed under: HR for an HR policy, CARE for every other standard
 * policy, GEN only for a policy that is not one of the standard ones. Phil, 2026-10-06: the new
 * register policies (Statement of Purpose, Notifications to CIW and so on) carry no regulator tag
 * but are care policies, so "and care".
 */
export function referencePrefix(requiredBy: readonly string[] | null | undefined, isStandard = (requiredBy?.length ?? 0) > 0): string {
  const r = requiredBy ?? [];
  if (r.includes("hr")) return "HR";
  if (isStandard || r.includes("ciw") || r.includes("cqc")) return "CARE";
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
  /** Front page, laid out like Thistle's own policies (0410): the logo, and the two colours. */
  logoDataUrl?: string | null;
  colours?: DocumentColours;
  /** The "Audit Checklist and Report" table on page 2. */
  review?: CoverReview;
};

/* ---------- Thistle style front page and review table (Phil, 2026-10-06) ---------- */

/** Be Care Compliant's own colours, used until a company sets its own in Branding. */
export const DEFAULT_COLOURS = { primary: "#081231", secondary: "#f59e0b" } as const;
export type DocumentColours = { primary: string; secondary: string };

/** A colour from the picker, or null when it is not a six digit hex colour. */
export function cleanHexColour(v: unknown): string | null {
  const s = String(v ?? "").trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(s) ? s : null;
}

/** The company's colours with Be Care Compliant's filling any gap. */
export function documentColours(primary: string | null | undefined, secondary: string | null | undefined): DocumentColours {
  return {
    primary: cleanHexColour(primary) ?? DEFAULT_COLOURS.primary,
    secondary: cleanHexColour(secondary) ?? DEFAULT_COLOURS.secondary,
  };
}

/** Why a version was reviewed, asked when it is approved. */
export const REVIEW_REASONS = [
  "New policy",
  "Annual review",
  "Change in law or guidance",
  "Change in how we work",
  "After an incident, complaint or concern",
  "Inspection or audit finding",
] as const;

/** The reason from a form: one on the list, else New policy for a first version, Annual review after. */
export function reviewReasonFrom(v: unknown, firstVersion: boolean): string {
  const s = String(v ?? "").trim();
  if ((REVIEW_REASONS as readonly string[]).includes(s)) return s;
  return firstVersion ? "New policy" : "Annual review";
}

export type CoverReview = {
  reviewedOn: string;
  lastReviewOn: string;
  reviewedBy: string;
  reason: string;
  changes: string;
  nextReview: string;
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "16th February 2026", the way Thistle's policies write a date. Europe/London. */
export function ordinalDate(d: Date): string {
  const [y, m, day] = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(d).split("-").map(Number);
  const teen = day % 100 >= 11 && day % 100 <= 13;
  const suffix = teen ? "th" : day % 10 === 1 ? "st" : day % 10 === 2 ? "nd" : day % 10 === 3 ? "rd" : "th";
  return `${day}${suffix} ${MONTHS[m - 1]} ${y}`;
}

/** Name with role, "Rebecca Long, Responsible Individual". */
export function nameWithRole(name: string | null | undefined, role: string | null | undefined): string | null {
  if (!name) return null;
  return role ? `${name}, ${role}` : name;
}

export type VersionFact = {
  version: number;
  at: Date;
  changeSummary: string | null;
  reviewReason: string | null;
  approvedByName: string | null;
  approvedByRole: string | null;
};

/**
 * The review table for one version. A later "Reviewed, no changes needed" on the current version
 * counts as the latest review: dated that day, by whoever pressed it, Annual review, None.
 */
export function coverReview(opts: {
  version: number;
  versions: VersionFact[];
  nextReview: Date;
  laterReview?: { on: Date; byName: string | null; byRole: string | null } | null;
}): CoverReview {
  const sorted = [...opts.versions].sort((a, b) => a.version - b.version);
  const mine = sorted.find((v) => v.version === opts.version);
  const before = sorted.filter((v) => v.version < opts.version).pop();
  const mineAt = mine?.at ?? new Date();
  /* A "Reviewed, no changes needed" counts only on a later DAY than the approval and only when
     somebody pressed it (a new version also stamps the review date, with nobody named). */
  const later =
    opts.laterReview && opts.laterReview.byName && londonIso(opts.laterReview.on) > londonIso(mineAt)
      ? opts.laterReview
      : null;
  if (later) {
    return {
      reviewedOn: ordinalDate(later.on),
      lastReviewOn: ordinalDate(mineAt),
      reviewedBy: nameWithRole(later.byName, later.byRole) ?? "Not recorded",
      reason: "Annual review",
      changes: "None",
      nextReview: ordinalDate(opts.nextReview),
    };
  }
  return {
    reviewedOn: ordinalDate(mineAt),
    lastReviewOn: before ? ordinalDate(before.at) : "None, this is the first issue",
    reviewedBy: nameWithRole(mine?.approvedByName, mine?.approvedByRole) ?? "Not recorded",
    reason: mine?.reviewReason ?? (opts.version === 1 ? "New policy" : "Annual review"),
    changes: mine?.changeSummary ?? (opts.version === 1 ? "First issue" : "Not recorded"),
    nextReview: ordinalDate(opts.nextReview),
  };
}


/* ---------- dates and the frozen cover (review fixes, 2026-10-07) ---------- */

/** The Europe/London calendar day of an instant, yyyy-mm-dd. */
export function londonIso(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(d);
}

/** yyyy-mm-dd plus whole months, clamped to the end of a short month (31 Jan + 1 = 28 or 29 Feb;
 *  29 Feb + 12 = 28 Feb), the same rule as the database review dates, so the PDF and the review
 *  register always agree. */
export function addMonthsClamped(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = total % 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${ny}-${String(nm + 1).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

/** A yyyy-mm-dd as a Date at London midday, for ordinalDate. */
export function middayOf(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

/**
 * The cover as it stood when a version was approved (Phil, 2026-10-07: "As it was at that
 * version"). Stored on the version row, so a signed copy opened years later shows who approved and
 * owned it, who it applied to and the branding of the day, not today's settings.
 */
export type FrozenCover = {
  reference: string | null;
  approvedBy: string | null;
  owner: string | null;
  appliesTo: string;
  readBy: string;
  retention: string;
  classification: string;
  nextReviewIso: string;
  colours: DocumentColours;
  /** A copy of the logo kept with the version (the company logo file is overwritten in place). */
  logoPath: string | null;
};

/** A change summary as stored: trimmed, at most 200 characters. */
export function cleanChangeSummary(v: unknown, fallback: string): string {
  const s = String(v ?? "").trim().replace(/\s+/g, " ");
  return (s || fallback).slice(0, 200);
}
