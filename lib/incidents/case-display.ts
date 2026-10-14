/**
 * Be Care Compliant — how an incident case names things (Phil, 2026-10-14, from Thistle).
 *
 * Importless, so it is unit tested directly.
 *
 *  - THE REGULATOR. "Notify the regulator" used to name CQC and CIW together. A case now names
 *    only its branch's regulator (branches.regulator, 0467), else the company's.
 *  - OTHER. A kind of event of Other carries the words the reporter gave, and reads
 *    "Other: [words]" wherever the case is named. Grouping still uses the plain category, so
 *    reports keep counting it under Other.
 *  - RIDDOR. The date it went to the HSE cannot be in the future or before the incident.
 *  - NOT RECORDED. A question nobody answered says so, rather than being left out.
 */

export const NOT_RECORDED = "Not recorded";

export type RegulatorCode = "cqc" | "ciw";

/** The branch's regulator, else the company's, else null when neither is set. */
export function caseRegulator(
  branchRegulator: string | null | undefined,
  companyRegulator: string | null | undefined,
): RegulatorCode | null {
  for (const r of [branchRegulator, companyRegulator]) {
    const s = String(r ?? "").trim().toLowerCase();
    if (s === "cqc" || s === "ciw") return s;
  }
  return null;
}

/** "CIW", "CQC", or "the regulator" when none is set. */
export function regulatorShortName(code: RegulatorCode | null): string {
  return code ? code.toUpperCase() : "the regulator";
}

/** The rule each regulator notifies under, for the hint beside the Notifiable box. */
export function regulatorNotifyHint(code: RegulatorCode | null): string {
  if (code === "ciw") return "CIW Regulation 60.";
  if (code === "cqc") return "CQC Regulation 18.";
  return "Set the regulator for this branch in Settings, Branches.";
}

export const EVENT_TYPE_LABELS: Record<string, string> = {
  accident: "Accident",
  near_miss: "Near miss",
  incident: "Incident",
  dangerous_occurrence: "Dangerous occurrence",
};

/** The type of event in words, or Not recorded for a case filed before it was asked. */
export function eventTypeLabel(eventType: string | null | undefined): string {
  const s = String(eventType ?? "").trim();
  if (!s) return NOT_RECORDED;
  return EVENT_TYPE_LABELS[s] ?? s;
}

/** The kind of event as it is shown: "Other: [words]" when Other carries words. */
export function categoryLabel(category: string | null | undefined, other: string | null | undefined): string {
  const c = String(category ?? "").trim();
  const o = String(other ?? "").trim();
  if (c === "Other" && o) return `Other: ${o}`;
  return c || NOT_RECORDED;
}

/** Text, or Not recorded when blank. */
export function orNotRecorded(value: string | null | undefined): string {
  const s = String(value ?? "").trim();
  return s === "" ? NOT_RECORDED : s;
}

/** Yes, No, or Not recorded. */
export function yesNoLabel(value: boolean | null | undefined): string {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return NOT_RECORDED;
}

/**
 * Why a RIDDOR date is refused, or null when it is fine (or blank). Dates are YYYY-MM-DD, and
 * today is London's today, passed in.
 */
export function riddorDateError(
  reportedOn: string | null,
  occurredOn: string | null,
  todayIso: string,
): string | null {
  if (!reportedOn) return null;
  if (reportedOn > todayIso) return "The date reported to the HSE cannot be in the future.";
  if (occurredOn && reportedOn < occurredOn) {
    return "The date reported to the HSE cannot be before the date the incident happened.";
  }
  return null;
}
