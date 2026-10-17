/**
 * Be Care Compliant: the MAR, the pure half (Rota and Visits Stage 6, Phil's popups 2026-10-17;
 * docs/decisions/rota-visits.md, Stage 6 decisions). Importless apart from another pure module, so
 * node --test runs it. Record, never decide: nothing here works out a dose or gives advice.
 */

import { CALL_SLOTS } from "../service-users/care-package.ts";

export const MAR_SLOTS: readonly { value: string; label: string }[] = CALL_SLOTS.map((s) => ({ value: s.value, label: s.label }));
export const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export type Support = "prompt" | "assist" | "give";
export const SUPPORT_WORDS: Record<Support, string> = {
  prompt: "Prompt (remind them to take it)",
  assist: "Assist (help them take it)",
  give: "Give (the carer gives it)",
};
export const SUPPORT_SHORT: Record<Support, string> = { prompt: "Prompt", assist: "Assist", give: "Give" };

export type DoseOutcome = "given" | "refused" | "not_available" | "other";
export const OUTCOME_LABELS: Record<DoseOutcome, string> = { given: "Given", refused: "Refused", not_available: "Not available", other: "Other" };
/** The MAR chart's codes (Stage 6 decision 9). */
export const OUTCOME_CODES: Record<DoseOutcome, string> = { given: "G", refused: "R", not_available: "N", other: "O" };

/** The reasons the database accepts, by outcome (0501). Other is typed. */
export const REFUSED_REASONS = [
  { code: "asleep", label: "Asleep and did not want to be woken" },
  { code: "declined", label: "Declined" },
  { code: "spat_out", label: "Spat it out or would not swallow" },
  { code: "nil_by_mouth", label: "Told not to eat or drink (nil by mouth)" },
  { code: "unwell", label: "Unwell or being sick" },
  { code: "other", label: "Other" },
] as const;
export const NOT_AVAILABLE_REASONS = [
  { code: "given_by_professional", label: "Given by a nurse or another professional" },
  { code: "given_by_family", label: "Given by family or a friend" },
  { code: "in_hospital", label: "In hospital" },
  { code: "out_of_stock", label: "None left" },
  { code: "not_at_home", label: "Not at home" },
  { code: "not_delivered", label: "Not delivered by the pharmacy" },
  { code: "other", label: "Other" },
] as const;

export function doseReasonLabel(code: string | null | undefined, text?: string | null): string | null {
  if (!code) return null;
  if (code === "other") return text?.trim() || "Other";
  return [...REFUSED_REASONS, ...NOT_AVAILABLE_REASONS].find((r) => r.code === code)?.label ?? null;
}

/** Can this dose be saved? */
export function doseProblem(o: { outcome: DoseOutcome; reason: string | null; text: string; quantity: number | null; prn: boolean }): string | null {
  if (o.outcome === "given") {
    if (o.prn && !(o.quantity && o.quantity > 0)) return "Enter how many were given.";
    return null;
  }
  if (o.outcome === "other") return o.text.trim() ? null : "Type the reason.";
  if (!o.reason) return "Pick a reason.";
  const list: readonly { code: string }[] = o.outcome === "refused" ? REFUSED_REASONS : NOT_AVAILABLE_REASONS;
  if (!list.some((r) => r.code === o.reason)) return "Pick a reason.";
  if (o.reason === "other" && !o.text.trim()) return "Type the reason.";
  return null;
}

export type MarMedicine = {
  prn: boolean;
  slots: string[];
  days: number[] | null;
  start_date: string;
  stop_date: string | null;
  dose_quantity: number | null;
};

/** Is this medicine due at a visit on this date (YYYY-MM-DD) for this call? When required: never "due". */
export function dueAt(m: MarMedicine, dateIso: string, slot: string): boolean {
  if (m.prn) return false;
  if (dateIso < m.start_date) return false;
  if (m.stop_date && dateIso > m.stop_date) return false;
  if (!m.slots.includes(slot)) return false;
  if (!m.days) return true;
  const dow = (new Date(`${dateIso}T12:00:00Z`).getUTCDay() + 6) % 7;
  return m.days.includes(dow);
}

/**
 * Days of stock left at the regular doses, or null when it cannot be said (when required, no dose
 * quantity, or no stock recorded). Stock arithmetic only, never a dose decision.
 */
export function daysOfStock(m: MarMedicine, balance: number | null): number | null {
  if (balance == null || m.prn || !m.dose_quantity) return null;
  const perWeek = m.slots.length * (m.days ? m.days.length : 7) * m.dose_quantity;
  if (perWeek <= 0) return null;
  return Math.floor((balance / perWeek) * 7);
}

export const LOW_STOCK_DAYS = 7;

/** "Morning and Bed": the calls a medicine is given at, in the day's order. */
export function slotWords(slots: string[]): string {
  const names = MAR_SLOTS.filter((s) => slots.includes(s.value)).map((s) => s.label);
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** "Every day" or "Mon, Wed and Fri". */
export function dayWords(days: number[] | null): string {
  if (!days || days.length === 7) return "Every day";
  const names = [...days].sort((a, b) => a - b).map((d) => DAY_SHORT[d]);
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** NHS number: 10 digits with a valid Modulus 11 check digit (spaces ignored). */
export function nhsNumberValid(raw: string): boolean {
  const d = raw.replace(/\s+/g, "");
  if (!/^\d{10}$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(d[i]) * (10 - i);
  const check = 11 - (sum % 11);
  if (check === 10) return false;
  return (check === 11 ? 0 : check) === Number(d[9]);
}

export function nhsNumberClean(raw: string): string {
  return raw.replace(/\s+/g, "");
}

/** "485 777 3456", the way it is printed. */
export function nhsNumberShown(n: string | null | undefined): string {
  if (!n || n.length !== 10) return n ?? "";
  return `${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`;
}

/* ---------------------------------------------------------------------------------------------
 * The carer's phone (rota_my_visit_doses, rota_dose_submit).
 * ------------------------------------------------------------------------------------------- */

export type RecordedDose = { outcome: DoseOutcome; reason_code: string | null; reason_text: string | null; quantity: number | null; at: string };

export type PhoneMed = {
  med_uid: string;
  /** null while the medicine waits for its second check: not recordable. */
  medicine_id: string | null;
  name: string;
  form: string | null;
  route: string | null;
  dose_text: string;
  dose_quantity: number | null;
  dose_unit: string | null;
  support: Support;
  prn: boolean;
  time_sensitive: boolean;
  instructions: string | null;
  waiting: boolean;
  last_given: { at: string; quantity: number | null } | null;
  recorded: RecordedDose | null;
};

export type VisitDoses = { visit_id: string; competent: boolean; allergies: string | null; meds: PhoneMed[] };

/** One dose as it waits on the phone and is sent (offline design, as clock taps). */
export type DoseEvent = {
  event_id: string;
  owner: string;
  visit_id: string;
  med_uid: string;
  medicine_id: string;
  outcome: DoseOutcome;
  reason_code: string | null;
  reason_text: string | null;
  quantity: number | null;
  phone_time: string;
  device_id?: string | null;
  device_seq?: number | null;
  refused?: string | null;
};

/**
 * What each medicine shows on the visit card: the server's latest record unless this sign in has a
 * newer one waiting on the phone; for a when required medicine, "last given" also counts a dose
 * given and still waiting. Refused taps and other people's taps are left out.
 */
export function mergeDoses(server: VisitDoses | null, waiting: DoseEvent[], visitId: string, owner: string): (PhoneMed & { waitingSend: boolean })[] {
  const mine = waiting
    .filter((e) => e.owner === owner && !e.refused && e.visit_id === visitId)
    .sort((a, b) => Date.parse(a.phone_time) - Date.parse(b.phone_time) || (a.device_seq ?? 0) - (b.device_seq ?? 0));
  return (server?.meds ?? []).map((m) => {
    let recorded = m.recorded;
    let lastGiven = m.last_given;
    let waitingSend = false;
    for (const e of mine.filter((x) => x.med_uid === m.med_uid)) {
      if (!recorded || Date.parse(recorded.at) <= Date.parse(e.phone_time)) {
        recorded = { outcome: e.outcome, reason_code: e.reason_code, reason_text: e.reason_text, quantity: e.quantity, at: e.phone_time };
        waitingSend = true;
      }
      if (e.outcome === "given" && (!lastGiven || Date.parse(lastGiven.at) <= Date.parse(e.phone_time))) {
        lastGiven = { at: e.phone_time, quantity: e.quantity ?? m.dose_quantity };
      }
    }
    return { ...m, recorded, last_given: lastGiven, waitingSend };
  });
}

/**
 * Order NHS list matches so the closest comes first (Phil's test, 2026-10-17: "paracetamol 500mg
 * tablets" was the last of 13 because names with "/" sort first): the exact name, then names
 * starting with what was typed, then single ingredient before combinations, then shorter, then A to Z.
 */
export function rankDmdHits<T extends { name: string }>(hits: T[], term: string): T[] {
  const t = term.trim().toLowerCase().replace(/\s+/g, " ");
  const score = (n: string) => {
    const name = n.toLowerCase();
    if (name === t) return 0;
    if (name.startsWith(t)) return 1;
    return name.includes(" / ") ? 3 : 2;
  };
  return [...hits].sort((a, b) => score(a.name) - score(b.name) || a.name.length - b.name.length || a.name.localeCompare(b.name, "en-GB"));
}
