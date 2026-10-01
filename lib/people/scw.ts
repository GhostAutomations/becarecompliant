/**
 * SOCIAL CARE WALES REGISTRATION NUMBER (DEF-097, Phil 2026-10-01).
 *
 * The number has been stored on the Person since 0060 (the PQS "registered with Social Care Wales"
 * measure reads it) but could only be set by the CSV import: no screen showed it or let anybody
 * change it. Thistle asked where their numbers were. Pure and unit tested.
 */

const MAX_LENGTH = 20;

/** Tidy what was typed. Blank means "no number". */
export function cleanScwNumber(raw: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
  const v = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (v === "") return { ok: true, value: null };
  if (v.length > MAX_LENGTH) return { ok: false, error: `A registration number is at most ${MAX_LENGTH} characters.` };
  if (!/^[A-Za-z0-9 /-]+$/.test(v)) return { ok: false, error: "A registration number can only have letters, numbers, spaces and the / sign, for example W/1234567." };
  return { ok: true, value: v };
}

export type ScwStatus = "registered" | "missing" | "not_yet";

/**
 * "missing" is what the PQS counts against the company: 6 or more months in post with no number
 * (lib/export/on-time.ts uses the same rule). Under 6 months it is "not_yet", not a gap.
 * todayIso and startIso are YYYY-MM-DD.
 */
export function scwStatus(number: string | null | undefined, startIso: string | null | undefined, todayIso: string): ScwStatus {
  if (number && number.trim() !== "") return "registered";
  if (!startIso) return "missing";
  const [y, m, d] = todayIso.split("-").map(Number);
  // Six calendar months back, the day clamped to the month's length (31 Oct goes to 30 Apr),
  // the same as addMonths in lib/recurrence, which the PQS report uses.
  const first = new Date(Date.UTC(y, m - 1 - 6, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(d, lastDay));
  const cutoff = first.toISOString().slice(0, 10);
  return startIso <= cutoff ? "missing" : "not_yet";
}
